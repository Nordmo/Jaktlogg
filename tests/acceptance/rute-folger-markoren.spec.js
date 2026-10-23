import { test, expect, startLocal } from '../helpers/oppstart.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import config from '../../playwright.config.js';

// Akseptansetester for docs/specs/rute-folger-markoren.md.
// Et langt, oppdiktet spor (4000 punkter, ca. 5 m mellom punktene) lages i testen og åpnes i 3D (flatt terreng).
// AK1 og AK2 måler med kamera som står stille i oversikt (Martins beslutning i PR #10): med følgekamera står
// rutelinjen i kø bak terrengflisene i testmiljøet. Følgekamera i 3D sjekker Martin manuelt i Safari.
// Testene kjører med programvaregrafikk, så alt måles i sporpunkter og tegnede bilder (render-hendelser), aldri i ms.
// «Tegnet ende» er punktet lengst ut langs sporet blant endepunktene som map.querySourceFeatures gir for
// route-done og route-head rett etter et render. Den regnes fra geometrien, ikke fra egenskaper i kildene.
/* global camFor, overviewCam, state, map, Local, openTrip, setCamMode, setPlaying, setProgress, posMarker, posAt, doneGeoJSON, valuesAt, fmtKm, fmtDur, nf0, mapIdle, paintRoute, RP, window, document */

const N = 4000;
test.setTimeout(300_000);

/* ---------- oppstart: langt spor i 3D ---------- */
async function start(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await startLocal(page, { med3D: true });
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
  await page.waitForFunction(() => state.T && state.T.n > 3000 && !!map.getTerrain());
  await page.evaluate(() => mapIdle(30000));
  await installer(page);
  return errors;
}

/* ---------- måling i siden ---------- */
// window.__m: idx (nærmeste sporpunkt), deler (tegnede linjebiter), tall (avlesningen), s (ett målepunkt per render),
// n (setData-kall og querySourceFeatures-kall fra appen mens målingen er på).
async function installer(page) {
  await page.evaluate(() => {
    const T = state.T, k = Math.cos(T.pts[0].lat * Math.PI / 180), q = map.querySourceFeatures.bind(map);
    const idx = (lon, lat) => { let b = Infinity, bi = 0; for (let i = 0; i < T.n; i++) { const dx = (T.pts[i].lon - lon) * k, dy = T.pts[i].lat - lat, s = dx * dx + dy * dy; if (s < b) { b = s; bi = i; } } return bi; };
    const deler = (kilder = ['route-done', 'route-head']) => {
      const out = [];
      for (const id of kilder) for (const f of q(id)) {
        const g = f.geometry, ls = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
        for (const c of ls) if (c.length >= 2) out.push({ kilde: id, a: idx(c[0][0], c[0][1]), b: idx(c[c.length - 1][0], c[c.length - 1][1]), c: f.properties.c, coords: c });
      }
      return out;
    };
    const ende = d => d.length ? Math.max(...d.map(x => Math.max(x.a, x.b))) : -1;
    const tall = () => { const o = {}; for (const ro of document.querySelectorAll('#readout .ro')) { const b = ro.querySelector('b'); o[ro.querySelector('span').textContent] = b && b.firstChild ? b.firstChild.textContent : ''; } return o; };
    const mark = () => { const ll = posMarker.getLngLat(); return idx(ll.lng, ll.lat); };
    const ekte = () => { const p = posAt(T, state.progress * T.total); return idx(p.lon, p.lat); };
    const M = window.__m = { på: false, s: [], idx, deler, ende, tall, mark, ekte, n: { 'route-head': 0, 'route-done': 0, q: 0 } };
    map.on('render', () => { if (M.på) M.s.push({ ende: ende(deler()), mi: mark(), ri: ekte(), playing: state.playing, tall: tall() }); });
    for (const id of ['route-head', 'route-done']) { const s = map.getSource(id), o = s.setData.bind(s); s.setData = d => { if (M.på) M.n[id]++; return o(d); }; }
    const oq = map.querySourceFeatures; map.querySourceFeatures = function (...a) { if (M.på) M.n.q++; return oq.apply(this, a); };
    // Tallene i avlesningen for alle posisjoner mellom sporpunkt i-w og i+w.
    M.kandidater = (i, w = 1) => {
      const a = T.cum[Math.max(0, i - w)], b = T.cum[Math.min(T.n - 1, i + w)], o = { Distanse: new Set(), Høyde: new Set(), Tid: new Set(), Puls: new Set() };
      for (let s = 0; s <= 120; s++) { const v = valuesAt(a + (b - a) * s / 120); o.Distanse.add(fmtKm(v.d)); o.Høyde.add(nf0.format(v.ele)); o.Tid.add(fmtDur(v.elapsed)); o.Puls.add(nf0.format(v.hr)); }
      return o;
    };
    M.stemmer = (t, i, w) => { const k = M.kandidater(i, w); return Object.keys(k).filter(n => !k[n].has(t[n])); };
  });
}
const nesteRender = page => page.evaluate(() => new Promise(r => { map.once('render', r); map.triggerRepaint(); }));
const ro = page => page.evaluate(() => mapIdle(30000));
// Rutekildene er ferdig lastet og tegnet. Billigere enn ro (idle), som også venter på alle terrengfliser.
const rutenKlar = async page => { await page.waitForFunction(() => map.isSourceLoaded('route-done') && map.isSourceLoaded('route-head'), null, { polling: 100 }); await nesteRender(page); await nesteRender(page); };


// Følgekamera fra p0. Varighet v = 30 s gir ca. 13 sporpunkter (ca. 65 m) per bilde i programvaregrafikk, der hvert
// bilde teller som 0,1 s. Fortere enn det løper markøren fra flisene som er lastet, og da er det ingen linje å måle.
// Kameraet settes rett på plass i stedet for å gli dit, og testen venter bare på rutekildene, ikke på alle
// terrengflisene (det tar over 20 s i programvaregrafikk).
async function forbered(page, p0, v = 30) {
  await page.evaluate(([p, v]) => { state.duration = v; setCamMode('follow', { quiet: true }); setProgress(p, true); state.cam = camFor('follow', p); map.jumpTo(state.cam); state.camDirty = false; }, [p0, v]);
  await page.waitForFunction(() => map.isSourceLoaded('route-done') && map.isSourceLoaded('route-head'), null, { polling: 100 });
  await nesteRender(page);
}
// Spiller av til b bilder er målt eller turen er ferdig, og pauser. Kameraet stoppes ved pause, så kartet kommer i ro.
async function spill(page, { bilder = Infinity } = {}) {
  await page.evaluate(() => { window.__m.s = []; window.__m.på = true; setPlaying(true); });
  await page.waitForFunction(b => window.__m.s.length >= b || !state.playing, bilder, { timeout: 240_000, polling: 100 });
  await page.evaluate(() => { window.__m.på = false; setPlaying(false); state.camDirty = false; });
  return page.evaluate(() => window.__m.s);
}
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
// Kamera som står stille i oversikt over hele turen, fra p0, med flisene ferdig lastet. 'free' gjør at setPlaying
// ikke bytter til følgekamera.
async function stille(page, p0) {
  await page.evaluate(p => { setCamMode('free', { quiet: true }); setProgress(p, true); map.jumpTo(overviewCam()); state.camDirty = false; }, p0);
  await ro(page);
  await nesteRender(page);
}
// Varighet regnet ut fra målt bildefrekvens, så hvert tegnede bilde flytter markøren ca. 12 sporpunkter (tick bruker
// høyst 0,1 s per bilde). Spiller av noen bilder for å måle, og setter så turen tilbake til p0.
async function kalibrer(page, p0) {
  const v = await page.evaluate(() => new Promise(res => {
    const t = [], på = () => { t.push(performance.now()); if (t.length >= 10) { map.off('render', på); setPlaying(false); state.camDirty = false; res(t); } };
    state.duration = 1000; map.on('render', på); setPlaying(true);
  }).then(t => { const d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b), dt = Math.min(0.1, d[Math.floor(d.length / 2)] / 1000); return state.T.n * dt / 12; }));
  await stille(page, p0);
  await page.evaluate(v => { state.duration = v; }, v);
}
// Minst 8 sporpunkter per bilde, ellers måler testen ikke noe.
function sjekkFart(s) {
  const steg = s.slice(1).map((x, i) => x.ri - s[i].ri).filter(d => d > 0);
  expect(median(steg), 'avspillingen flytter for få sporpunkter per tegnet bilde').toBeGreaterThanOrEqual(8);
}

const kilde = readFileSync('index.html', 'utf8');
const fn = navn => { const s = kilde.search(new RegExp(`\\n(async )?function ${navn}\\(`)) + 1, r = kilde.slice(s + 1).search(/\n(async )?function |\n\/\* ---------- /); return kilde.slice(s, s + 1 + r); };
const sha = t => createHash('sha256').update(t).digest('hex');

// AK1, AK3, AK7 og AK8 deler én avspilling, fordi 3D koster ca. 1 s per bilde i programvaregrafikk.
test('AK1, AK3, AK7 og AK8: linjen følger markøren, gapet er 0 på pause, ikke mer arbeid per bilde, og tallene følger markøren', async ({ page }) => {
  const errors = await start(page);
  await stille(page, 0.1);
  await kalibrer(page, 0.1);
  const alle = await spill(page, { bilder: 50 });
  const r = await page.evaluate(() => ({ n: window.__m.n, S: RP.S }));
  const s = alle.slice(3).filter(x => x.playing && x.ende >= 0);

  await test.step('AK1: gapet er høyst 1 sporpunkt i 95 % av bildene og aldri over 2', () => {
    expect(s.length, `bilder med tegnet linje: ${s.length} av ${alle.length}`).toBeGreaterThanOrEqual(30);
    sjekkFart(s);
    const gap = s.map(x => Math.abs(x.mi - x.ende));
    expect(gap.filter(g => g <= 1).length / gap.length, `gap i sporpunkter: ${gap.join(',')}`).toBeGreaterThanOrEqual(0.95);
    expect(Math.max(...gap), `gap i sporpunkter: ${gap.join(',')}`).toBeLessThanOrEqual(2);
  });

  await test.step('AK7: ikke flere setData enn i dag, og markørlogikken høyst én gang per bilde', () => {
    const punkter = alle[alle.length - 1].ri - alle[0].ri;
    // I dag: én route-head per bilde, pluss én når en ny route-done er bekreftet tegnet (checkRouteShown).
    expect(r.n['route-done'], 'route-done setData').toBeLessThanOrEqual(Math.floor(punkter / r.S) + 2);
    expect(r.n['route-head'], 'route-head setData').toBeLessThanOrEqual(alle.length + r.n['route-done'] + 2);
    expect(r.n.q, 'querySourceFeatures per bilde (to kilder)').toBeLessThanOrEqual(2 * alle.length + 2);
  });

  await test.step('AK8: tallene i visningen viser markørens posisjon under avspilling, og videoen bruker samme p', async () => {
    expect(fn('drawFrame')).toContain('valuesAt(f.p*T.total)');
    const feil = await page.evaluate(s => {
      const M = window.__m, out = [];
      s.forEach((x, k) => {
        // ± 2 mot tegnet ende: både markøren og tegnet ende er avrundet til nærmeste sporpunkt (Martin, PR #10).
        const m = M.stemmer(x.tall, x.mi), e = M.stemmer(x.tall, x.ende, 2);
        if (m.length) out.push(`bilde ${k}: ${m.join(',')} viser ikke markørens posisjon (${x.mi})`);
        if (e.length) out.push(`bilde ${k}: ${e.join(',')} viser ikke tegnet ende (${x.ende})`);
      });
      return out;
    }, s);
    expect(feil).toEqual([]);
  });

  await ro(page);
  await nesteRender(page);
  await test.step('AK3: på pause er gapet 0 og markøren står på den egentlige posisjonen', async () => {
    const p = await page.evaluate(() => {
      const M = window.__m, T = state.T, ll = posMarker.getLngLat(), q = posAt(T, state.progress * T.total);
      return { ende: M.ende(M.deler()), mi: M.mark(), ri: M.ekte(), avstand: Math.hypot((ll.lng - q.lon) * Math.cos(q.lat * Math.PI / 180), ll.lat - q.lat) * 111320 };
    });
    expect(p.ende).toBe(p.mi);
    expect(p.mi).toBe(p.ri);
    expect(p.avstand).toBeLessThan(0.5);
  });

  await test.step('AK8: på pause viser tallene den egentlige posisjonen', async () => {
    const pause = await page.evaluate(() => {
      const M = window.__m, T = state.T, t = M.tall(), v = valuesAt(state.progress * T.total);
      const forventet = { Distanse: fmtKm(v.d), Høyde: nf0.format(v.ele), Tid: fmtDur(v.elapsed), Puls: nf0.format(v.hr) };
      return Object.keys(forventet).filter(k => t[k] !== forventet[k]).map(k => `${k}: ${t[k]} ≠ ${forventet[k]}`);
    });
    expect(pause).toEqual([]);
  });
  expect(errors).toEqual([]);
});

test('AK2: markøren ligger aldri mer enn 3 tegnede bilder bak og når siste punkt', async ({ page }) => {
  const errors = await start(page);
  await stille(page, 0.88);
  await kalibrer(page, 0.88);
  const s = await spill(page);
  expect(s.length).toBeGreaterThanOrEqual(30);
  sjekkFart(s.slice(3));
  const bak = [];
  for (let k = 3; k < s.length; k++) if (s[k].mi < s[k - 3].ri - 1) bak.push(`bilde ${k}: markør ${s[k].mi}, egentlig 3 bilder før ${s[k - 3].ri}`);
  expect(bak).toEqual([]);
  // markøren beveger seg (står ikke stille for å «bestå» AK1)
  expect(s[s.length - 1].mi - s[3].mi).toBeGreaterThan(N * 0.08);
  expect(await page.evaluate(() => state.progress)).toBe(1);
  await rutenKlar(page);
  expect(await page.evaluate(() => window.__m.mark())).toBe(N - 1);
  expect(errors).toEqual([]);
});

test('AK4: farging etter høyde, puls og fart har samme fargeinndeling i hode og hoveddel', async ({ page }) => {
  const errors = await start(page);
  for (const [k, modus] of ['ele', 'hr', 'speed'].entries()) {
    await test.step(`AK4: ${modus}`, async () => {
      await page.evaluate(m => { const el = document.querySelector('#colorMode'); el.value = m; el.dispatchEvent(new Event('change')); }, modus);
      expect(await page.evaluate(() => state.colorMode)).toBe(modus);
      // Stillestående kamera, som i AK1 og AK2: med følgekamera blir rutekildene i Chromium ikke ferdig lastet i tide.
      await stille(page, 0.2 + k * 0.2);
      await spill(page, { bilder: 8 });
      await rutenKlar(page);
      const r = await page.evaluate(() => {
        const M = window.__m, T = state.T, hel = doneGeoJSON(T, state.progress, 0);
        const feats = (hel.features || [hel]).map(f => { const c = f.geometry.coordinates; return { a: M.idx(c[0][0], c[0][1]), b: M.idx(c[c.length - 1][0], c[c.length - 1][1]), c: f.properties.c }; });
        const hode = M.deler(['route-head']), feil = [];
        for (const d of hode) {
          const j = Math.max(0, Math.floor(d.coords.length / 2) - 1), m = (M.idx(d.coords[j][0], d.coords[j][1]) + M.idx(d.coords[j + 1][0], d.coords[j + 1][1])) / 2;
          const f = feats.find(f => f.a <= m && m <= f.b && f.a !== f.b);
          if (!d.c || !f || f.c !== d.c) feil.push(`hode ${d.a}-${d.b} farge ${d.c}, hele ruten ${f && f.c}`);
        }
        return { hode: hode.length, feil };
      });
      expect(r.hode).toBeGreaterThan(0);
      expect(r.feil).toEqual([]);
    });
  }
  expect(errors).toEqual([]);
});

test('AK5: under eksport ender linjen ved p, markøren flyttes ikke, og eksportkoden er uendret', async ({ page }) => {
  expect(sha(fn('runExport')), 'runExport er endret').toBe('c1ab384faa9b11560be0f470aee8234321eca1ae8c4e0e1c69b1f7b868bc7047');
  expect(sha(fn('drawFrame')), 'drawFrame er endret').toBe('56c0ec18ff27113231350237444dd5e30a0ffc400a1781458db2cdf08b389823');
  const errors = await start(page);
  await forbered(page, 0.3);
  const r = await page.evaluate(async () => {
    const M = window.__m, T = state.T, før = posMarker.getLngLat(), p = 0.5, mål = posAt(T, p * T.total);
    state.exporting = true;
    map.jumpTo({ center: [mål.lon, mål.lat], zoom: T.followZoom, pitch: 60 });
    paintRoute(p, true);
    await mapIdle(30000);
    await new Promise(res => { map.once('render', res); map.triggerRepaint(); });
    const etter = posMarker.getLngLat(), out = { ende: M.ende(M.deler()), forventet: M.idx(mål.lon, mål.lat), flyttet: før.lng !== etter.lng || før.lat !== etter.lat };
    state.exporting = false;
    return out;
  });
  expect(Math.abs(r.ende - r.forventet)).toBeLessThanOrEqual(1);
  expect(r.flyttet).toBe(false);
  expect(errors).toEqual([]);
});

// AK10 sjekkes i alle testene (errors). Denne testen har flest overganger: avspilling, pause og spoling begge veier.
test('AK6 og AK10: spoling bakover og fremover gir ingen gamle eller manglende biter, og ingen JavaScript-feil', async ({ page }) => {
  const errors = await start(page);
  await forbered(page, 0.72);
  await spill(page, { bilder: 6 });
  await page.evaluate(() => setProgress(0.3, true));
  await rutenKlar(page);
  await forbered(page, 0.6);
  await rutenKlar(page);
  await test.step('AK6: nær markøren ender linjen ved markøren', async () => {
    const r = await page.evaluate(() => { const M = window.__m; return { mi: M.mark(), ri: M.ekte(), ende: M.ende(M.deler()) }; });
    expect(r.mi).toBe(r.ri);
    expect(Math.abs(r.ende - r.mi), 'tegnet ende er ikke ved markøren').toBeLessThanOrEqual(1);
  });
  // Oversikt, så hele den gåtte ruten er i kildenes fliser. Ved lav zoom er koordinatene grovere (± 2 punkter).
  await page.evaluate(() => { setCamMode('overview', { quiet: true }); map.jumpTo(overviewCam()); });
  await rutenKlar(page);
  await test.step('AK6: hele den gåtte ruten er tegnet, uten hull og uten biter etter markøren', async () => {
    const r = await page.evaluate(() => {
      const M = window.__m, d = M.deler(), mi = M.mark(), iv = d.map(x => [Math.min(x.a, x.b), Math.max(x.a, x.b)]).sort((x, y) => x[0] - y[0]);
      const hull = []; let til = 0;
      if (!iv.length || iv[0][0] > 2) hull.push(`starten mangler (første bit fra ${iv.length ? iv[0][0] : '-'})`);
      for (const [a, b] of iv) { if (a > til + 2) hull.push(`${til}-${a}`); til = Math.max(til, b); }
      return { mi, ende: M.ende(d), hull };
    });
    expect(r.ende, 'tegnet oransje bit etter markøren').toBeLessThanOrEqual(r.mi + 2);
    expect(r.ende, 'ruten er ikke tegnet helt fram til markøren').toBeGreaterThanOrEqual(r.mi - 2);
    expect(r.hull).toEqual([]);
  });
  expect(errors).toEqual([]);
});

test('AK9: egne prosjekter med workers: 1 for denne fila i Chromium og WebKit, hovedprosjektet kjører resten', () => {
  const p = config.projects || [], fil = /rute-folger-markoren/, liste = x => [].concat(x || []).map(String);
  const hoved = p.find(x => x.name === 'chromium');
  expect(hoved, 'mangler prosjektet chromium i playwright.config.js').toBeTruthy();
  expect((hoved.use || {}).browserName).toBe('chromium');
  expect(hoved.testMatch ?? null).toBeNull();
  expect(liste(hoved.testIgnore).some(t => fil.test(t)), 'chromium skal hoppe over denne fila').toBe(true);
  const rute = p.filter(x => liste(x.testMatch).some(t => fil.test(t)));
  expect(rute.map(x => (x.use || {}).browserName).sort()).toEqual(['chromium', 'webkit']);
  for (const r of rute) {
    expect(r.workers, `${r.name}: workers`).toBe(1);
    for (const t of liste(r.testMatch)) expect(t).toMatch(fil);
  }
});
