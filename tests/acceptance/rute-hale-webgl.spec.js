import { test, expect, startLocal } from '../helpers/oppstart.js';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Akseptansetester for docs/specs/rute-hale-webgl.md.
// AK1–AK5 måles i ekte Safari med scripts/safari-maling.mjs (Martin kjører det før merge). Her sjekkes bare at skriptet
// finnes og måler det specen sier. AK6–AK14 testes i Chromium. Halen måles i piksler på kartlerretet
// (preserveDrawingBuffer), sett rett ovenfra med høy zoom, så sporpunktene ligger ca. 12 px fra hverandre.
// Et langt, oppdiktet spor (4000 punkter, ca. 5 m mellom punktene) lages i testen.
/* global locate, state, map, Local, openTrip, setCamMode, setPlaying, setProgress, posMarker, posAt, camFor, doneGeoJSON, mapIdle, paintRoute, RP, showLog, window, document */

const N = 4000, SPEC = 'docs/specs/rute-hale-webgl.md', SKRIPT = 'scripts/safari-maling.mjs';
test.setTimeout(180_000);

/* ---------- oppstart: langt spor ---------- */
async function start(page, { tre = false } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await startLocal(page, { med3D: tre });
  await page.evaluate(async n => {
    const t0 = Date.parse('2025-09-20T07:00:00Z'), pts = [];
    let time = t0;
    for (let i = 0; i < n; i++) {
      time += 3000 + (i % 5) * 400;
      const lat = 69.6 + i * 0.00004, lon = 18.9 + i * 0.00006 + Math.sin(i / 40) * 0.0003;
      pts.push(`<trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"><ele>${(300 + 250 * Math.sin(i / 500)).toFixed(1)}</ele><time>${new Date(time).toISOString()}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${Math.round(110 + 40 * Math.sin(i / 300))}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`);
    }
    const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><name>Langt spor</name><trkseg>${pts.join('')}</trkseg></trk></gpx>`;
    const id = crypto.randomUUID();
    await Local.saveTrip({ id, name: 'Langt spor (test)', started_at: new Date(t0).toISOString(), gpx, conditions: {} }, true);
    await openTrip(id);
  }, N);
  await page.waitForFunction(() => state.T && state.T.n > 3000);
  await page.evaluate(() => mapIdle(30000));
  await installer(page);
  return errors;
}

/* ---------- måling i siden ---------- */
// window.__h: lesing av kartlerretet, sporpunkter på skjermen, og et spion-lag rundt route-tail sin render.
async function installer(page) {
  await page.evaluate(() => {
    const T = state.T, H = window.__h = {};
    H.px = i => { const p = T.pts[i]; return map.project([p.lon, p.lat]); };
    H.les = () => {
      const c = map.getCanvas(), g = H.cv || (H.cv = document.createElement('canvas'));
      g.width = c.width; g.height = c.height;
      const x = g.getContext('2d', { willReadFrequently: true }); x.clearRect(0, 0, g.width, g.height); x.drawImage(c, 0, 0);
      H.img = x.getImageData(0, 0, g.width, g.height); H.dpr = c.width / c.clientWidth;
    };
    H.farge = pt => { const x = Math.round(pt.x * H.dpr), y = Math.round(pt.y * H.dpr), im = H.img; if (x < 0 || y < 0 || x >= im.width || y >= im.height) return null; const k = (y * im.width + x) * 4; return [im.data[k], im.data[k + 1], im.data[k + 2]]; };
    H.oransje = c => !!c && c[0] > 200 && c[1] > 135 && c[1] < 215 && c[2] < 120;
    H.naer = (pt, r = 2) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (H.oransje(H.farge({ x: pt.x + dx / H.dpr, y: pt.y + dy / H.dpr }))) return true; return false; };
    // Punkter langs sporet med 1 px mellomrom, fra markøren og bakover (retning -1) eller framover (+1), i lengde px.
    H.langs = (retning, lengde) => {
      const ll = posMarker.getLngLat(), d0 = state.progress * T.total, start = map.project(ll), out = [];
      let d = d0, prev = start, gaatt = 0;
      while (gaatt < lengde && d > 0 && d < T.total) {
        d += retning * 0.25; const p = posAt(T, d), q = map.project([p.lon, p.lat]);
        gaatt += Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; if (gaatt >= out.length + 1) out.push(q);
      }
      return { start, out };
    };
    // Avstand i px fra markøren bakover til første oransje piksel på linjen (0 = linjen går helt fram).
    H.gap = (maks = 120) => { H.les(); const { start, out } = H.langs(-1, maks); if (H.naer(start, 2)) return 0; for (let i = 0; i < out.length; i++) if (H.naer(out[i], 2)) return i + 1; return maks; };
    // Oransje piksler foran markøren, fra 6 px til 40 px foran.
    H.foran = () => { H.les(); const { out } = H.langs(1, 40); return out.slice(6).filter(p => H.naer(p, 1)).length; };
    // Spion: teller tegnekall mens route-tail tegner.
    H.spion = () => {
      const l = map.getLayer('route-tail'); if (!l || !l.implementation || H.spionPaa) return !!l;
      const imp = l.implementation, gl = map.painter.context.gl, r = imp.render.bind(imp); H.tegn = 0; H.iTail = false;
      for (const f of ['drawArrays', 'drawElements']) { const o = gl[f].bind(gl); gl[f] = (...a) => { if (H.iTail) H.tegn++; return o(...a); }; }
      imp.render = (...a) => { H.iTail = true; try { return r(...a); } finally { H.iTail = false; } };
      H.spionPaa = true; return true;
    };
  });
}
const nesteRender = page => page.evaluate(() => new Promise(r => { map.once('render', r); map.triggerRepaint(); }));
const ro = async page => { await page.evaluate(() => mapIdle(30000)); await nesteRender(page); await nesteRender(page); };
// Rett ovenfra (2D-kamera «top») med høy zoom: ca. 12 px mellom sporpunktene.
async function ovenfra(page, p) {
  await page.evaluate(p => { state.T.followZoom = 17.6; setCamMode('top', { quiet: true }); setProgress(p, true); state.cam = camFor('top', p); map.jumpTo(state.cam); state.camDirty = false; }, p);
  await ro(page);
}
// Varighet slik at hvert tegnede bilde flytter markøren ca. 2 sporpunkter (ca. 24 px).
async function kalibrer(page, p) {
  const v = await page.evaluate(() => new Promise(res => {
    const t = [], paa = () => { t.push(performance.now()); if (t.length >= 10) { map.off('render', paa); setPlaying(false); res(t); } };
    state.duration = 1000; map.on('render', paa); setPlaying(true);
  }).then(t => { const d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b), dt = Math.min(0.1, d[Math.floor(d.length / 2)] / 1000); return state.T.n * dt / 2; }));
  await ovenfra(page, p);
  await page.evaluate(v => { state.duration = v; }, v);
}
const harTail = page => page.evaluate(() => !!map.getLayer('route-tail'));

/* ---------- AK1–AK5: Safari-målingen finnes og måler det specen sier ---------- */
const skript = () => (existsSync(SKRIPT) ? readFileSync(SKRIPT, 'utf8') : '');
test('AK1 og AK2: scripts/safari-maling.mjs finnes, er gyldig og måler gapet langs sporet i 3D og 2D', () => {
  expect(existsSync(SKRIPT), `${SKRIPT} mangler`).toBe(true);
  execFileSync(process.execPath, ['--check', SKRIPT]);
  const s = skript();
  for (const k of ['AK1', 'AK2', 'safaridriver', 'querySourceFeatures', '3D', '2D', '0.99']) expect(s, `skriptet nevner ikke ${k}`).toContain(k);
  expect(s, 'GPX-fila skal gis som argument, ikke ligge fast i skriptet').not.toMatch(/Downloads|activity_\d+\.gpx/);
  expect(s).toMatch(/process\.argv/);
});
test('AK3: skriptet måler bildefrekvensen mot main i samme økt (minst 95 %)', () => {
  const s = skript();
  expect(s).toContain('AK3');
  expect(s).toMatch(/0\.95/);
  expect(s).toMatch(/main/);
});
test('AK4: skriptet tar skjermbilder av skjøten på tre steder og sammenligner bredde og farge', () => {
  const s = skript();
  expect(s).toContain('AK4');
  expect(s).toMatch(/screenshot|toDataURL/);
  expect(s).toMatch(/bredde/i);
});
test('AK5: skriptet tester de seks stedene bak terreng med grensene 90 % skjult og 15 % mangler', () => {
  const s = skript();
  expect(s).toContain('AK5');
  for (const p of ['0.23', '0.24', '0.77', '0.78', '0.82', '0.84']) expect(s, `stedet ${p} mangler`).toContain(p);
  expect(s).toMatch(/0\.9\b|90/);
  expect(s).toMatch(/0\.15|15/);
});

/* ---------- AK6–AK14 i Chromium ---------- */
test('AK6: route-head og lagene *-h finnes ikke, og ingen GeoJSON-kilde får setData hvert bilde', async ({ page }) => {
  const errors = await start(page);
  const r0 = await page.evaluate(() => ({ kilde: map.getSource('route-head') === undefined, glow: map.getLayer('route-glow-h') === undefined, done: map.getLayer('route-done-h') === undefined }));
  expect(r0).toEqual({ kilde: true, glow: true, done: true });
  await kalibrer(page, 0.2);
  const r = await page.evaluate(() => new Promise(res => {
    const n = {}, bilder = { n: 0 };
    for (const [id, s] of Object.entries(map.style.sourceCaches).map(([id, c]) => [id, c.getSource()])) if (s.type === 'geojson') { const o = s.setData.bind(s); n[id] = 0; s.setData = d => { n[id]++; return o(d); }; }
    const paa = () => { if (++bilder.n >= 40) { map.off('render', paa); setPlaying(false); res({ n, bilder: bilder.n, S: RP.S, a: state.progress }); } };
    window.__a0 = state.progress; map.on('render', paa); setPlaying(true);
  }));
  const punkter = (r.a - await page.evaluate(() => window.__a0)) * N;
  expect(r.n['route-done'], 'route-done setData').toBeLessThanOrEqual(Math.floor(punkter / r.S) + 2);
  for (const [id, k] of Object.entries(r.n)) if (id !== 'route-done') expect(k, `${id} fikk setData under avspilling`).toBe(0);
  expect(errors).toEqual([]);
});

test('AK7: halen slutter ved markøren og starter ved enden av route-done i hvert bilde', async ({ page }) => {
  const errors = await start(page);
  expect(await harTail(page), 'laget route-tail mangler').toBe(true);
  await kalibrer(page, 0.2);
  const r = await page.evaluate(() => new Promise(res => {
    const H = window.__h, gap = [], foran = [], hull = [];
    const paa = () => {
      gap.push(H.gap()); foran.push(H.foran());
      // Fra punkt RP.shown til markøren skal hvert punkt være oransje (ingen hull mellom route-done og halen).
      // Bare punkter innenfor lerretet teller (godkjent av Martin): ved denne zoomen er bare ca. 20 punkter bak markøren synlige.
      const a = locate(state.T, state.progress * state.T.total)[0], i0 = Math.max(RP.shown - 1, a - 25); let mangler = 0;
      for (let i = i0; i <= a; i++) { const q = H.px(i); if (H.farge(q) && !H.naer(q, 2)) mangler++; }
      hull.push(mangler);
      if (gap.length >= 30) { map.off('render', paa); setPlaying(false); res({ gap, foran, hull }); }
    };
    map.on('render', paa); setPlaying(true);
  }));
  const s = r.gap.slice(3);
  expect(s.filter(g => g <= 4).length / s.length, `gap i px: ${s.join(',')}`).toBeGreaterThanOrEqual(0.95);
  expect(Math.max(...r.foran.slice(3)), `oransje foran markøren: ${r.foran.join(',')}`).toBe(0);
  expect(Math.max(...r.hull.slice(3)), `punkter uten oransje mellom route-done og markøren: ${r.hull.join(',')}`).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('AK8: halen har samme farge som hele ruten for høyde, puls og fart, og samme bredde som route-done', async ({ page }) => {
  const errors = await start(page);
  expect(await harTail(page), 'laget route-tail mangler').toBe(true);
  for (const [k, modus] of ['ele', 'hr', 'speed'].entries()) {
    await test.step(`AK8: ${modus}`, async () => {
      await page.evaluate(m => { const el = document.querySelector('#colorMode'); el.value = m; el.dispatchEvent(new Event('change')); }, modus);
      await kalibrer(page, 0.2 + k * 0.2);
      await page.evaluate(() => new Promise(res => { let n = 0; const paa = () => { if (++n >= 12) { map.off('render', paa); setPlaying(false); res(); } }; map.on('render', paa); setPlaying(true); }));
      await page.evaluate(() => { state.camDirty = false; });
      await nesteRender(page);
      const feil = await page.evaluate(() => {
        const H = window.__h, T = state.T; H.les();
        const hel = doneGeoJSON(T, state.progress, 0), feats = hel.features || [hel], out = [];
        const fra = RP.shown, til = locate(T, state.progress * T.total)[0] - 1, starter = feats.map(f => { const c0 = f.geometry.coordinates[0]; return T.pts.findIndex(p => p.lon === c0[0] && p.lat === c0[1]); });
        let sjekket = 0;
        for (let i = fra + 1; i < til; i++) {
          const mid = { x: (H.px(i).x + H.px(i + 1).x) / 2, y: (H.px(i).y + H.px(i + 1).y) / 2 }, c = H.farge(mid);
          // Bare segmenter som ikke ligger inntil en fargegrense (kantutjevning blander nabofargene).
          const j = feats.findIndex((f, k) => starter[k] >= 0 && starter[k] + 1 <= i && i + 2 <= starter[k] + f.geometry.coordinates.length - 1), f = feats[j];
          if (!f || !c) continue;
          const e = f.properties.c.match(/\d+/g).map(Number); sjekket++;
          if (e.some((v, j) => Math.abs(v - c[j]) > 14)) out.push(`punkt ${i}: tegnet ${c}, forventet ${e}`);
        }
        if (!sjekket) out.push(`ingen punkter i halen å sjekke (RP.shown ${fra}, markør ${til})`);
        return out;
      });
      expect(feil).toEqual([]);
    });
  }
  await test.step('AK8: bredden på halen er lik bredden på route-done', async () => {
    await page.evaluate(() => { const el = document.querySelector('#colorMode'); el.value = 'progress'; el.dispatchEvent(new Event('change')); });
    await kalibrer(page, 0.5);
    await page.evaluate(() => new Promise(res => { let n = 0; const paa = () => { if (++n >= 12) { map.off('render', paa); setPlaying(false); res(); } }; map.on('render', paa); setPlaying(true); }));
    // Ett zoomtrinn ut, så både halen og route-done er i bildet (halen kan være opptil RP.S punkter lang).
    await page.evaluate(() => { state.camDirty = false; map.jumpTo({ zoom: map.getZoom() - 1 }); });
    await ro(page);
    const b = await page.evaluate(() => {
      const H = window.__h, T = state.T; H.les();
      const bredde = i => { const p = H.px(i), q = H.px(i + 1), L = Math.hypot(q.x - p.x, q.y - p.y) || 1, nx = -(q.y - p.y) / L, ny = (q.x - p.x) / L, m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; let n = 0; for (let s = -12; s <= 12; s += 0.25) if (H.oransje(H.farge({ x: m.x + nx * s, y: m.y + ny * s }))) n++; return n * 0.25; };
      // Median over seks segmenter i hvert område, så svinger og kantutjevning ikke avgjør.
      const med = v => { const x = [...v].sort((p, q) => p - q); return x[x.length >> 1]; }, a = locate(T, state.progress * T.total)[0];
      const synlig = i => { const p = H.px(i), c = map.getCanvas(); return p.x > 20 && p.y > 20 && p.x < c.clientWidth - 20 && p.y < c.clientHeight - 20; };
      const doneI = []; for (let i = RP.shown - 3; i > 0 && doneI.length < 6 && i > RP.shown - 200; i -= 2) if (synlig(i)) doneI.push(i);
      const hale = med([2, 3, 4, 5, 6, 7].map(k => bredde(Math.max(RP.shown + 1, a - k)))), done = doneI.length ? med(doneI.map(bredde)) : -1;
      return { hale, done };
    });
    expect(b.hale).toBeGreaterThan(0);
    expect(Math.abs(b.hale - b.done), `bredde i px: hale ${b.hale}, route-done ${b.done}`).toBeLessThanOrEqual(1);
  });
  expect(errors).toEqual([]);
});

test('AK9: på pause er gapet 0, og spoling gir ingen gamle eller manglende biter', async ({ page }) => {
  const errors = await start(page);
  expect(await harTail(page), 'laget route-tail mangler').toBe(true);
  await kalibrer(page, 0.6);
  await page.evaluate(() => new Promise(res => { let n = 0; const paa = () => { if (++n >= 10) { map.off('render', paa); setPlaying(false); res(); } }; map.on('render', paa); setPlaying(true); }));
  await page.evaluate(() => { state.camDirty = false; });
  await ro(page);
  await test.step('AK9: pause', async () => {
    const r = await page.evaluate(() => ({ gap: window.__h.gap(), foran: window.__h.foran() }));
    expect(r).toEqual({ gap: 0, foran: 0 });
  });
  for (const p of [0.3, 0.45]) {
    await test.step(`AK9: spol til ${p}`, async () => {
      await ovenfra(page, p);
      const r = await page.evaluate(() => {
        const H = window.__h, a = locate(state.T, state.progress * state.T.total)[0]; H.les();
        // Bare punkter innenfor lerretet teller (godkjent av Martin), og minst 8 av dem må være synlige (ca. 21 px loddrett mellom punktene, så bare 9–10 får plass bak markøren).
        let bak = 0, synlige = 0; for (let i = a - 30; i < a; i++) { const q = H.px(i); if (!H.farge(q)) continue; synlige++; if (!H.naer(q, 2)) bak++; }
        return { gap: H.gap(), foran: H.foran(), bak, nok: synlige >= 8 };
      });
      expect(r, `etter spoling til ${p}`).toEqual({ gap: 0, foran: 0, bak: 0, nok: true });
    });
  }
  expect(errors).toEqual([]);
});

const kilde = readFileSync('index.html', 'utf8');
const fn = navn => { const s = kilde.search(new RegExp(`\\n(async )?function ${navn}\\(`)) + 1, r = kilde.slice(s + 1).search(/\n(async )?function |\n\/\* ---------- /); return kilde.slice(s, s + 1 + r); };
const sha = t => createHash('sha256').update(t).digest('hex');

test('AK10: under eksport tegner route-tail ingenting, og eksportkoden er uendret', async ({ page }) => {
  expect(sha(fn('runExport')), 'runExport er endret').toBe('c1ab384faa9b11560be0f470aee8234321eca1ae8c4e0e1c69b1f7b868bc7047');
  expect(sha(fn('drawFrame')), 'drawFrame er endret').toBe('56c0ec18ff27113231350237444dd5e30a0ffc400a1781458db2cdf08b389823');
  const errors = await start(page);
  expect(await page.evaluate(() => window.__h.spion()), 'laget route-tail mangler').toBe(true);
  await ovenfra(page, 0.5);
  const r = await page.evaluate(async () => {
    const H = window.__h, T = state.T, p0 = T.cum[Math.floor(0.45 * (T.n - 1))] / T.total;
    state.exporting = true; paintRoute(p0, true); state.progress = 0.5; await mapIdle(30000);
    H.tegn = 0; await new Promise(res => { map.once('render', res); map.triggerRepaint(); });
    const ut = { tegn: H.tegn };
    state.exporting = false; paintRoute(state.progress, true);
    return ut;
  });
  expect(r.tegn, 'route-tail tegnet under eksport').toBe(0);
  expect(errors).toEqual([]);
});

test('AK11: route-tail er et custom layer i 3D, rett før obs-circle og etter alle draperte lag', async ({ page }) => {
  const errors = await start(page);
  const r = await page.evaluate(() => {
    const l = map.getLayer('route-tail'), o = map.style._order, i = o.indexOf('route-tail');
    const drapert = new Set(['line', 'fill', 'raster', 'hillshade', 'background']);
    return { finnes: !!l, type: l && l.type, modus: l && l.implementation && l.implementation.renderingMode, neste: o[i + 1], drapertEtter: o.slice(i + 1).filter(id => drapert.has(map.getLayer(id).type)) };
  });
  expect(r).toEqual({ finnes: true, type: 'custom', modus: '3d', neste: 'obs-circle', drapertEtter: [] });
  expect(errors).toEqual([]);
});

test('AK12: halen tegnes ikke når ruten er slått av, eller i jaktloggen', async ({ page }) => {
  const errors = await start(page);
  expect(await page.evaluate(() => window.__h.spion()), 'laget route-tail mangler').toBe(true);
  await kalibrer(page, 0.3);
  const spill = () => page.evaluate(() => new Promise(res => { window.__h.tegn = 0; let n = 0; const paa = () => { if (++n >= 6) { map.off('render', paa); setPlaying(false); res(window.__h.tegn); } }; map.on('render', paa); setPlaying(true); }));
  await test.step('AK12: ruten på (kontroll)', async () => { expect(await spill()).toBeGreaterThan(0); });
  await test.step('AK12: ruten av', async () => {
    await page.evaluate(() => { const el = document.querySelector('#routeToggle'); el.checked = false; el.dispatchEvent(new Event('change')); });
    expect(await spill()).toBe(0);
    await page.evaluate(() => { const el = document.querySelector('#routeToggle'); el.checked = true; el.dispatchEvent(new Event('change')); });
  });
  await test.step('AK12: jaktloggen', async () => {
    await page.evaluate(() => { showLog(); window.__h.tegn = 0; });
    for (let k = 0; k < 4; k++) await nesteRender(page);
    expect(await page.evaluate(() => window.__h.tegn)).toBe(0);
  });
  expect(errors).toEqual([]);
});

test('AK13: ingen JavaScript- eller WebGL-feil når route-tail tegner i 3D', async ({ page }) => {
  const errors = await start(page, { tre: true });
  expect(await page.evaluate(() => window.__h.spion()), 'laget route-tail mangler').toBe(true);
  const r = await page.evaluate(() => new Promise(res => {
    const gl = map.painter.context.gl, feil = []; let n = 0; gl.getError();
    state.duration = 200; setCamMode('follow', { quiet: true }); setProgress(0.3, true);
    const paa = () => { const e = gl.getError(); if (e) feil.push(e); if (++n >= 8) { map.off('render', paa); setPlaying(false); res({ feil, tegn: window.__h.tegn }); } };
    window.__h.tegn = 0; map.on('render', paa); setPlaying(true);
  }));
  expect(r.tegn, 'route-tail tegnet ikke i 3D').toBeGreaterThan(0);
  expect(r.feil, 'WebGL-feil').toEqual([]);
  expect(errors).toEqual([]);
});

test('AK14: Fallgruver i CLAUDE.md beskriver route-tail, de interne delene og Safari-målingen ved oppgradering', () => {
  const md = readFileSync('CLAUDE.md', 'utf8'), fall = md.slice(md.indexOf('## Fallgruver'), md.indexOf('\n## ', md.indexOf('## Fallgruver') + 5));
  for (const k of ['route-tail', 'modelViewProjectionMatrix', 'obs-circle', 'safari-maling.mjs']) expect(fall, `Fallgruver nevner ikke ${k}`).toContain(k);
  expect(fall, 'Fallgruver beskriver fortsatt route-head som kort hale hver frame').not.toMatch(/route-head`?\s*\(kort hale/);
  expect(fall).toMatch(/oppgrader/i);
  expect(readFileSync(SPEC, 'utf8')).toContain('Status: godkjent');
});
