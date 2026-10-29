import { test, expect, sjekkStartstil, visLogin } from '../helpers/oppstart.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Akseptansetester for docs/specs/mobil.md. Kjører i prosjektene mobil-chromium og mobil-webkit (playwright.config.js),
// med isMobile, hasTouch og deviceScaleFactor 3. Vinduet settes per test. Appen startes i 2D som i resten av testene.
// AK16 og AK17 gjør Martin på egen iPhone. Testene for mus (1280×720 uten berøring) passer på at PC-en er som i dag,
// og består derfor også på main.
/* global location, history, map, state, setTerrain, setProgress, setPlaying, mapIdle, openTrip, posMarker, openWizard:writable, window, document, devicePixelRatio, getComputedStyle, innerWidth, innerHeight, matchMedia, CSS, MouseEvent */

const STAAENDE = [[390, 844], [360, 800]], LIGGENDE = [[844, 390], [800, 360]], ALLE = [...STAAENDE, ...LIGGENDE];
const vp = ([width, height]) => ({ width, height });
const navn = ([w, h]) => `${w}×${h}`;
// Vinduene er delt mellom nettleserne (playwright.config.js, avgjort av Martin 28.10.2026). AK5 går gjennom vinduene til sin nettleser.
const NETTLESER = { '390×844': 'webkit', '844×390': 'webkit', '360×800': 'chromium', '800×360': 'chromium' };
const TUR = 'Rypejakt Tromsdalstinden (eksempel)';
const MUS = { viewport: { width: 1280, height: 720 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 };
const kilde = readFileSync('index.html', 'utf8');
test.setTimeout(180_000);

/* ---------- oppstart ---------- */
// Åpner appen (sok kan være ?fps) og venter på innloggingsskjermen. Hjelperne i siden ligger i window.__m.
async function start(page, sok = '') {
  const feil = [];
  page.on('pageerror', e => feil.push(e.message));
  // visLogin åpner alltid '/'. Søkedelen (?fps) settes før appen leser adressen.
  await page.addInitScript(s => { window.__test3D = false; if (location.search !== s) history.replaceState(null, '', location.pathname + s); }, sok);
  await visLogin(page);
  await page.evaluate(installer);
  return feil;
}
// «Bruk uten innlogging», som startLocal i tests/helpers/oppstart.js, men med trykk.
async function lokal(page) {
  await trykk(page.locator('#lLocal'));
  await expect(page.locator('.trip').first()).toBeAttached({ timeout: 30_000 });
  await etterInnlogging(page);
}
async function etterInnlogging(page) {
  sjekkStartstil(await page.evaluate(() => window.__oppstart));
  await page.evaluate(() => setTerrain(false));
  await page.waitForFunction(() => !map.getTerrain());
  await page.evaluate(() => mapIdle(30000));
}
const trykk = async loc => (await loc.page().evaluate(() => matchMedia('(pointer: coarse)').matches)) ? loc.tap({ timeout: 10_000 }) : loc.click({ timeout: 10_000 });
const forste = page => page.evaluate(() => { const t = document.querySelector('.trip'); return !!t && window.__m.innenfor(t) && window.__m.treffer(t); });
const skuffSynlig = page => page.evaluate(() => {
  const s = document.querySelector('#side'), r = s.getBoundingClientRect();
  const x0 = Math.max(r.left, 0), x1 = Math.min(r.right, innerWidth), y0 = Math.max(r.top, 0), y1 = Math.min(r.bottom, innerHeight);
  if (x1 - x0 < 40 || y1 - y0 < 40) return false;
  const h = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
  return !!h && s.contains(h);
});
// Åpner turen med trykk i lista, slik brukeren gjør.
async function aapneTur(page) {
  await trykk(page.locator('.trip', { hasText: TUR }));
  await page.waitForFunction(() => state.view === 'trip' && !!state.T);
  await page.evaluate(() => mapIdle(30000));
}
// Åpner turen uten lista, for testene som gjelder kartet. Står skuffen åpen etterpå, lukkes den med ☰.
async function aapneTurDirekte(page) {
  await page.evaluate(async n => { await openTrip(state.trips.find(t => t.name === n).id); await mapIdle(30000); }, TUR);
  if (await page.locator('#panelToggle').isVisible() && await skuffSynlig(page)) { await trykk(page.locator('#panelToggle')); await expect.poll(() => skuffSynlig(page)).toBe(false); }
}
const tilbake = page => trykk(page.locator('#crumbLog:visible, #brand:visible').first());

/* ---------- hjelpere i siden ---------- */
function installer() {
  const M = window.__m = { aleneOk: false };
  M.synlig = el => {
    if (!el || !el.isConnected || el.closest('[hidden]')) return false;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  M.innenfor = (el, t = 0.5) => { const r = el.getBoundingClientRect(); return r.left >= -t && r.top >= -t && r.right <= innerWidth + t && r.bottom <= innerHeight + t; };
  M.treffer = el => { const r = el.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === el || el.contains(h)); };
  M.navn = el => el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}${[...el.classList].map(c => '.' + c).join('')} «${(el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30)}»`;
  // Scroller nærmeste rulleflate (panel, dialog) så elementet står midt i den. Kartet og siden scrolles ikke.
  M.vis = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) {
        const r = el.getBoundingClientRect(), pr = p.getBoundingClientRect();
        p.scrollTop += (r.top + r.height / 2) - (pr.top + pr.height / 2);
      }
    }
  };
  const SEL = ['button', 'a[href]', 'input:not([type=hidden])', 'select', 'textarea', '[role=slider]', '[role=tab]', 'label.toggle', '.chips label', '.poi-mk', '.maplibregl-ctrl button'];
  const elementer = omr => [...new Set(document.querySelectorAll(omr.flatMap(o => SEL.map(s => `${o} ${s}`)).join(',')))];
  // AK6: ni punkter i en boks på 44×44 px midt på elementet skal treffe elementet selv. Observasjonsmerker som
  // treffer hverandre, teller ikke. Et merke som har alle ni på seg selv, setter aleneOk.
  M.trykkflater = omr => {
    const feil = [];
    for (const el of elementer(omr)) {
      if (!M.synlig(el) || getComputedStyle(el).pointerEvents === 'none') continue;
      if (el.matches('input') && el.closest('label.toggle, .chips label')) continue;
      M.vis(el);
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (el.matches('.poi-mk')) { const st = document.querySelector('#stage').getBoundingClientRect(); if (cx < st.left || cx > st.right || cy < st.top || cy > st.bottom) continue; }
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) { feil.push(`${M.navn(el)}: utenfor vinduet`); continue; }
      const poi = el.matches('.poi-mk');
      let egne = 0, bom = 0;
      for (const dx of [-22, 0, 22]) for (const dy of [-22, 0, 22]) {
        const x = Math.min(innerWidth - 1, Math.max(0, cx + dx)), y = Math.min(innerHeight - 1, Math.max(0, cy + dy)), h = document.elementFromPoint(x, y);
        if (h && (h === el || el.contains(h))) egne++;
        else if (!(poi && h && h.closest('.poi-mk'))) bom++;
      }
      if (bom) feil.push(`${M.navn(el)}: ${Math.round(r.width)}×${Math.round(r.height)} px, ${bom} av 9 punkter treffer noe annet`);
      if (poi && egne === 9) M.aleneOk = true;
    }
    return feil;
  };
  // AK7: tekst minst 12 px, skjemafelt minst 16 px.
  M.tekst = omr => {
    const feil = new Set();
    for (const root of omr.map(o => document.querySelector(o)).filter(Boolean)) for (const el of [root, ...root.querySelectorAll('*')]) {
      if (!M.synlig(el)) continue;
      const felt = el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea');
      if (!felt && ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize), min = felt ? 16 : 12;
      if (fs < min) feil.add(`${M.navn(el)}: ${fs} px (minst ${min})`);
    }
    return [...feil];
  };
  // AK18 og AK21: tekstbitene (hver linje i hver tekstnode) i områdene, klippet av foreldre med overflow, i skjermkoordinater.
  M.tekstbiter = omr => {
    const ut = [];
    for (const root of omr.map(o => document.querySelector(o)).filter(Boolean)) {
      const w = document.createTreeWalker(root, 4);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const el = n.parentElement;
        if (!n.textContent.trim() || !M.synlig(el) || el.closest('select, option')) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const r0 of rg.getClientRects()) {
          let r = { l: r0.left, t: r0.top, r: r0.right, b: r0.bottom };
          for (let p = el; p && p !== document.body; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const q = p.getBoundingClientRect(); r = { l: Math.max(r.l, q.left), t: Math.max(r.t, q.top), r: Math.min(r.r, q.right), b: Math.min(r.b, q.bottom) }; }
          }
          if (r.r - r.l >= 1 && r.b - r.t >= 1) ut.push({ n, el, ...r });
        }
      }
    }
    return ut;
  };
  M.tekstOverlapp = omr => {
    const b = M.tekstbiter(omr), feil = new Set();
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
      const x = b[i], y = b[j]; if (x.n === y.n) continue;
      if (Math.min(x.r, y.r) - Math.max(x.l, y.l) > 1 && Math.min(x.b, y.b) - Math.max(x.t, y.t) > 1) feil.add(`«${x.n.textContent.trim().slice(0, 24)}» overlapper «${y.n.textContent.trim().slice(0, 24)}»`);
    }
    return [...feil];
  };
  // Et punkt i kartet (skjermkoordinater) som treffer kartlerretet, ligger minst 40 px fra kanten og fra merkene.
  M.kartpunkt = () => {
    const T = state.T, r = map.getContainer().getBoundingClientRect(), merker = [...document.querySelectorAll('.poi-mk')].map(m => m.getBoundingClientRect());
    for (let k = 0; k < T.n; k += 7) {
      const i = (Math.floor(T.n / 2) + k) % T.n, q = map.project([T.pts[i].lon, T.pts[i].lat]), x = r.left + q.x, y = r.top + q.y;
      if (x < r.left + 40 || x > r.right - 40 || y < r.top + 40 || y > r.bottom - 40) continue;
      void merker;
      if ([-22, 0, 22].every(dx => [-22, 0, 22].every(dy => { const h = document.elementFromPoint(x + dx, y + dy); return h && h.classList.contains('maplibregl-canvas'); }))) return { x, y, i };
    }
    return null;
  };
}
async function kartpunkt(page) {
  const p = await page.evaluate(() => window.__m.kartpunkt());
  if (!p) throw new Error('Fant ikke et ledig punkt på ruten i kartet');
  return p;
}
// Sentrerer kartet ovenfra på det observasjonsmerket som ligger lengst fra de andre, og zoomer inn til det står alene.
async function sentrerPaaMerke(page) {
  await page.evaluate(async () => {
    const ps = state.pois.filter(p => p.lat != null), d = (a, b) => Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos(a.lat * Math.PI / 180));
    const p = ps.map(p => ({ p, nn: Math.min(...ps.filter(q => q !== p).map(q => d(p, q))) })).sort((a, b) => b.nn - a.nn)[0].p;
    for (let z = 16; z <= 19; z++) {
      map.jumpTo({ center: [p.lon, p.lat], zoom: z, pitch: 0, bearing: 0 }); await mapIdle(30000);
      const ms = [...document.querySelectorAll('.poi-mk')].map(m => m.getBoundingClientRect()), c = map.getContainer().getBoundingClientRect();
      const midt = ms.find(m => Math.abs((m.left + m.right) / 2 - (c.left + c.width / 2)) < 30 && Math.abs(m.bottom - (c.top + c.height / 2)) < 30);
      if (midt && !ms.some(m => m !== midt && m.left < midt.right + 44 && m.right > midt.left - 44 && m.top < midt.bottom + 44 && m.bottom > midt.top - 44)) return;
    }
  });
}

/* ---------- oppsett ---------- */
test('Oppsett: playwright.config.js har prosjektene mobil-chromium og mobil-webkit med telefon, og workers: 2', async () => {
  const { default: config } = await import('../../playwright.config.js');
  expect(config.workers).toBe(2);
  const p = navn => (config.projects || []).find(x => x.name === navn);
  for (const [n, b] of [['mobil-chromium', 'chromium'], ['mobil-webkit', 'webkit']]) {
    expect(p(n), `prosjektet ${n} mangler`).toBeTruthy();
    expect(p(n).use).toMatchObject({ browserName: b, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  }
  const andre = (config.projects || []).filter(x => !/^mobil-/.test(x.name));
  expect(andre.length, 'det vanlige prosjektet mangler').toBeGreaterThan(0);
  for (const x of andre) expect(x.use && x.use.isMobile, `${x.name} skal ikke være mobil`).toBeFalsy();
});

/* ---------- AK1 og AK2: skuffen, avspilling og liggende ---------- */
async function skuffFlyt(page) {
  await expect.poll(() => forste(page), { message: 'første tur synes ikke når jaktloggen vises' }).toBe(true);
  await aapneTur(page);
  await expect.poll(() => skuffSynlig(page), { message: 'skuffen lukkes ikke når turen åpnes' }).toBe(false);
  await trykk(page.locator('#playBtn'));
  await expect.poll(() => page.evaluate(() => state.playing)).toBe(true);
  await trykk(page.locator('#playBtn'));
  await trykk(page.locator('#panelToggle'));
  await expect.poll(() => skuffSynlig(page), { message: '☰ åpner ikke skuffen' }).toBe(true);
  await trykk(page.locator('#panelToggle'));
  await expect.poll(() => skuffSynlig(page), { message: '☰ lukker ikke skuffen' }).toBe(false);
  await tilbake(page);
  await page.waitForFunction(() => state.view === 'log');
  await expect.poll(() => skuffSynlig(page), { message: 'skuffen åpnes ikke igjen i jaktloggen' }).toBe(true);
  await expect.poll(() => forste(page)).toBe(true);
}
for (const v of STAAENDE) test.describe(navn(v), () => {
  test.use({ viewport: vp(v) });
  test(`AK1: ${navn(v)}: turene synes, en tur åpnes og spilles av med trykk, og ☰ åpner og lukker skuffen`, async ({ page }) => {
    const feil = await start(page); await lokal(page);
    await skuffFlyt(page);
    expect(feil).toEqual([]);
  });
});
for (const v of LIGGENDE) test.describe(navn(v), () => {
  test.use({ viewport: vp(v) });
  test(`AK2: ${navn(v)}: som AK1, høydeprofilen er skjult og kartet er minst halve høyden, og profilen kommer tilbake stående`, async ({ page }) => {
    const feil = await start(page); await lokal(page);
    await skuffFlyt(page);
    await aapneTur(page);
    await expect.poll(() => skuffSynlig(page)).toBe(false);
    const ligg = await page.evaluate(() => ({ charts: window.__m.synlig(document.querySelector('#charts')), stage: document.querySelector('#stage').getBoundingClientRect().height, h: innerHeight }));
    expect(ligg.charts, 'høydeprofilen vises når vinduet er under 500 px høyt').toBe(false);
    expect(ligg.stage, `kartet er ${ligg.stage} px av ${ligg.h}`).toBeGreaterThanOrEqual(ligg.h / 2);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => window.__m.synlig(document.querySelector('#charts'))), { message: 'høydeprofilen vises ikke stående' }).toBe(true);
    expect(feil).toEqual([]);
  });
});

/* ---------- AK3: pikseltetthet ---------- */
const fn = navn => { const s = kilde.search(new RegExp(`\\n(async )?function ${navn}\\(`)) + 1, r = kilde.slice(s + 1).search(/\n(async )?function |\n\/\* ---------- /); return kilde.slice(s, s + 1 + r); };
const sha = t => createHash('sha256').update(t).digest('hex');
for (const dsf of [3, 2, 1]) test.describe(`devicePixelRatio ${dsf}`, () => {
  test.use({ viewport: vp([390, 844]), deviceScaleFactor: dsf });
  test(`AK3: med devicePixelRatio ${dsf} tegnes kartet med pixelRatio ${Math.min(2, dsf)}${dsf === 3 ? ', og eksportkoden er uendret' : ''}`, async ({ page }) => {
    if (dsf === 3) {
      expect(sha(fn('runExport')), 'runExport er endret').toBe('c1ab384faa9b11560be0f470aee8234321eca1ae8c4e0e1c69b1f7b868bc7047');
      expect(sha(fn('drawFrame')), 'drawFrame er endret').toBe('56c0ec18ff27113231350237444dd5e30a0ffc400a1781458db2cdf08b389823');
    }
    const feil = await start(page); await lokal(page);
    const les = () => page.evaluate(() => { const c = map.getCanvas(); return { dpr: devicePixelRatio, pr: map.getPixelRatio(), w: c.width, cw: c.clientWidth }; });
    let r = await les();
    expect(r.dpr).toBe(dsf);
    expect(r.pr).toBe(Math.min(2, dsf));
    expect(Math.abs(r.w - r.cw * r.pr)).toBeLessThanOrEqual(1);
    await aapneTurDirekte(page);
    r = await les();
    expect(r.pr, 'i turvisningen').toBe(Math.min(2, dsf));
    expect(Math.abs(r.w - r.cw * r.pr)).toBeLessThanOrEqual(1);
    expect(feil).toEqual([]);
  });
});

/* ---------- AK4: teller for bilder per sekund ---------- */
test.describe('390×844', () => {
  test.use({ viewport: vp([390, 844]) });
  test('AK4: telleren finnes bare med ?fps, viser bilder/s og pikseltetthet, og dekker ingen knapper', async ({ page }) => {
    const lyttere = () => page.evaluate(() => ((map._listeners && map._listeners.render) || []).length + ((map._oneTimeListeners && map._oneTimeListeners.render) || []).length);
    const feil = await start(page); await lokal(page);
    expect(await page.locator('#fps').count(), '#fps finnes uten ?fps').toBe(0);
    const uten = await lyttere();

    feil.push(...await start(page, '?fps')); await lokal(page);
    const fps = page.locator('#fps'), tall = async () => { const m = (await fps.textContent()).match(/^(\d+) bilder\/s · (\d)×$/); return m ? +m[1] : NaN; };
    await expect(fps).toBeVisible();
    await expect(fps).toHaveText(/^\d+ bilder\/s · 2×$/);
    expect(await lyttere(), 'telleren lytter ikke på kartets render').toBeGreaterThan(uten);
    const plassering = () => page.evaluate(() => {
      const f = document.querySelector('#fps'), r = f.getBoundingClientRect(), s = document.querySelector('#stage').getBoundingClientRect();
      const knapper = [...document.querySelectorAll('button, select, a[href], input, [role=slider]')].filter(window.__m.synlig).filter(b => { const q = b.getBoundingClientRect(); return q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top; }).map(window.__m.navn);
      return { pe: getComputedStyle(f).pointerEvents, iKartet: r.left >= s.left && r.right <= s.right && r.top >= s.top && r.bottom <= s.bottom, oppeTilVenstre: r.left + r.width / 2 < s.left + s.width / 2 && r.top + r.height / 2 < s.top + s.height / 2, knapper };
    });
    expect(await plassering()).toEqual({ pe: 'none', iKartet: true, oppeTilVenstre: true, knapper: [] });
    await aapneTur(page);
    await expect.poll(() => skuffSynlig(page)).toBe(false);
    expect(await plassering(), 'i turvisningen').toEqual({ pe: 'none', iKartet: true, oppeTilVenstre: true, knapper: [] });
    await trykk(page.locator('#playBtn'));
    await expect.poll(tall, { timeout: 10_000, message: 'telleren viser 0 under avspilling' }).toBeGreaterThan(0);
    await trykk(page.locator('#playBtn'));
    await expect.poll(tall, { timeout: 15_000, message: 'telleren viser ikke 0 når turen står stille' }).toBe(0);
    expect(feil).toEqual([]);
  });
  // Delt ut av testen over så de kan kjøre samtidig (avgjort av Martin 29.10.2026).
  test('AK4: med ?fps&pr=3 tegnes kartet med pikseltetthet 3, og telleren viser 3×', async ({ page }) => {
    const feil = await start(page, '?fps&pr=3'); await lokal(page);
    await expect(page.locator('#fps')).toHaveText(/^\d+ bilder\/s · 3×$/);
    expect(await page.evaluate(() => map.getPixelRatio())).toBe(3);
    expect(feil).toEqual([]);
  });
});

/* ---------- AK5: ingen sidescrolling, ingenting utenfor ---------- */
test('AK5: i alle fire vinduene: ingen sidescrolling, og knappene i toppraden og tidslinja overlapper ikke og ligger innenfor vinduet', async ({ page, browserName }) => {
  const mine = ALLE.filter(v => NETTLESER[navn(v)] === browserName);
  const oppsett = (hvor, w) => page.evaluate(([hvor, w]) => {
    const M = window.__m, p = [], d = document.documentElement;
    if (d.scrollWidth > w) p.push(`${hvor}: siden er ${d.scrollWidth} px bred`);
    if (innerWidth > w) p.push(`${hvor}: innerWidth er ${innerWidth}`);
    const els = [...document.querySelectorAll('.top button, .top select, #tl button, #tl select, #scrub')].filter(M.synlig);
    for (const e of els) if (!M.innenfor(e)) p.push(`${hvor}: ${M.navn(e)} ligger utenfor vinduet`);
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j]; if (a.contains(b) || b.contains(a)) continue;
      const r = a.getBoundingClientRect(), q = b.getBoundingClientRect(), x = Math.min(r.right, q.right) - Math.max(r.left, q.left), y = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
      if (x > 1 && y > 1) p.push(`${hvor}: ${M.navn(a)} overlapper ${M.navn(b)}`);
    }
    if (!document.querySelector('#auth').hidden && !M.innenfor(document.querySelector('#loginForm'))) p.push(`${hvor}: innloggingen ligger utenfor vinduet`);
    return p;
  }, [hvor, w]);
  const rundt = async hvor => { const p = []; for (const v of mine) { await page.setViewportSize(vp(v)); await page.waitForTimeout(300); p.push(...await oppsett(`${hvor}, ${navn(v)}`, v[0])); } await page.setViewportSize(vp(mine[0])); await page.waitForTimeout(300); return p; };
  await page.setViewportSize(vp(mine[0]));
  const feil = await start(page), problemer = [];
  problemer.push(...await rundt('innloggingen'));
  await lokal(page);
  problemer.push(...await rundt('jaktloggen'));
  await trykk(page.locator('#panelToggle'));
  problemer.push(...await rundt('jaktloggen med skuffen byttet'));
  await trykk(page.locator('#panelToggle'));
  await aapneTur(page);
  problemer.push(...await rundt('turen'));
  await trykk(page.locator('#panelToggle'));
  problemer.push(...await rundt('turen med skuffen byttet'));
  expect(problemer).toEqual([]);
  expect(feil).toEqual([]);
});

/* ---------- AK6 og AK7: trykkflater og tekst ---------- */
for (const v of STAAENDE) test.describe(navn(v), () => {
  test.use({ viewport: vp(v) });
  test(`AK6 og AK7: ${navn(v)}: trykkflater på minst 44×44 px, tekst på minst 12 px og felt på minst 16 px i alle visningene`, async ({ page }) => {
    const flater = [], tekst = [];
    const sjekk = async (hvor, omr) => {
      flater.push(...(await page.evaluate(o => window.__m.trykkflater(o), omr)).map(f => `${hvor}: ${f}`));
      tekst.push(...(await page.evaluate(o => window.__m.tekst(o), omr)).map(f => `${hvor}: ${f}`));
    };
    const feil = await start(page);
    await sjekk('innloggingen', ['#auth']);
    await lokal(page);
    await sjekk('jaktloggen', ['.top', '#side']);
    await aapneTur(page);
    await expect.poll(() => skuffSynlig(page)).toBe(false);
    await sentrerPaaMerke(page);
    await sjekk('turen', ['.top', '#stage', '#tl']);
    expect(await page.evaluate(() => window.__m.aleneOk), 'ingen observasjonsmerker alene med trykkflate på 44×44 px').toBe(true);
    await trykk(page.locator('#panelToggle'));
    for (const fane of ['tur', 'obs', 'lag']) {
      await trykk(page.locator(`.tab[data-tab="${fane}"]`));
      await sjekk(`fanen ${fane}`, ['#side']);
    }
    await trykk(page.locator('.tab[data-tab="tur"]'));
    await trykk(page.locator('#editTripBtn'));
    await expect(page.locator('#tripModal')).toBeVisible();
    await sjekk('turdialogen', ['#tripModal']);
    await trykk(page.locator('#tripModal [data-close]').first());
    await trykk(page.locator('#panelToggle'));
    await expect.poll(() => skuffSynlig(page)).toBe(false);

    await trykk(page.locator('#addPoiBtn'));
    let p = await kartpunkt(page);
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.locator('#wizModal')).toBeVisible();
    for (const [steg, valg] of [['gruppe', 'Singelrype'], ['miljø', null], ['skudd', 'Bom'], ['art', 'Lirype']]) {
      await sjekk(`veiviseren, ${steg}`, ['#wizModal']);
      await trykk(valg ? page.locator('#wzBody .opt', { hasText: valg }) : page.locator('#wzBody .opt').first());
    }
    await sjekk('veiviseren, oppsummering', ['#wizModal']);
    await trykk(page.locator('#wizModal [data-close]').first());

    await page.waitForTimeout(600);
    await trykk(page.locator('#addOtherBtn'));
    p = await kartpunkt(page);
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.locator('#poiModal')).toBeVisible();
    await sjekk('observasjonsdialogen', ['#poiModal']);
    await trykk(page.locator('#poiModal [data-close]').first());

    expect(flater, 'trykkflater under 44×44 px (AK6)').toEqual([]);
    expect(tekst, 'tekst under 12 px eller felt under 16 px (AK7)').toEqual([]);
    expect(feil).toEqual([]);
  });
});

/* AK6: trykk i kartet. Testpunktene: 18 px under et observasjonspunkt, og 18 px fra ruten på tvers av den. */
async function obsPunkt(page, avstand) {
  return page.evaluate(async avstand => {
    const fs = map.querySourceFeatures('all-obs').sort((a, b) => (a.properties.count || 1) - (b.properties.count || 1));
    for (const f of fs) {
      const [lon, lat] = f.geometry.coordinates;
      map.jumpTo({ center: [lon, lat], zoom: 15, pitch: 0, bearing: 0 }); await mapIdle(30000);
      const r = map.getContainer().getBoundingClientRect(), q = map.project([lon, lat]), x = r.left + q.x, y = r.top + q.y + avstand, h = document.elementFromPoint(x, y);
      if (!h || !h.classList.contains('maplibregl-canvas')) continue;
      const naer = map.queryRenderedFeatures([[q.x - 40, q.y + avstand - 40], [q.x + 40, q.y + avstand + 40]], { layers: ['obs-circle'] });
      if (naer.length === 1) return { x, y, id: f.properties.id };
    }
    return null;
  }, avstand);
}
async function rutePunkt(page, avstand) {
  return page.evaluate(async avstand => {
    const T = state.T, i0 = Math.floor(T.n / 2), m = T.pts[i0];
    map.jumpTo({ center: [m.lon, m.lat], zoom: 15, pitch: 0, bearing: 0 }); await mapIdle(30000);
    setProgress(0, true);
    const r = map.getContainer().getBoundingClientRect(), pts = T.pts.map(p => { const q = map.project([p.lon, p.lat]); return { x: q.x + r.left, y: q.y + r.top }; });
    const avst = (x, y) => { let b = Infinity; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], c = pts[i], dx = c.x - a.x, dy = c.y - a.y, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l)) : 0; b = Math.min(b, Math.hypot(x - a.x - t * dx, y - a.y - t * dy)); } return b; };
    for (let k = 0; k < 600; k++) {
      const i = i0 + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 3; if (i < 2 || i > T.n - 3) continue;
      const a = pts[i - 2], c = pts[i + 2], dx = c.x - a.x, dy = c.y - a.y, l = Math.hypot(dx, dy); if (l < 4) continue;
      for (const s of [1, -1]) {
        const x = pts[i].x - s * dy / l * avstand, y = pts[i].y + s * dx / l * avstand;
        if (x < r.left + 60 || x > r.right - 60 || y < r.top + 60 || y > r.bottom - 60) continue;
        if (Math.abs(avst(x, y) - avstand) > 0.5) continue;
        const h = document.elementFromPoint(x, y); if (!h || !h.classList.contains('maplibregl-canvas')) continue;
        if (map.queryRenderedFeatures([[x - r.left - 40, y - r.top - 40], [x - r.left + 40, y - r.top + 40]], { layers: ['obs-circle'] }).length) continue;
        return { x, y, px: pts[i].x, py: pts[i].y };
      }
    }
    return null;
  }, avstand);
}
const markorAvstand = (page, p) => page.evaluate(p => { const r = map.getContainer().getBoundingClientRect(), q = map.project(posMarker.getLngLat()); return Math.hypot(r.left + q.x - p.px, r.top + q.y - p.py); }, p);
test.describe('390×844', () => {
  test.use({ viewport: vp([390, 844]) });
  test('AK6: 390×844: trykk 18 px fra et observasjonspunkt åpner det, og 18 px fra ruten flytter markøren dit', async ({ page }) => {
    const feil = await start(page); await lokal(page); await aapneTurDirekte(page);
    const o = await obsPunkt(page, 18);
    expect(o, 'fant ikke et observasjonspunkt alene i kartet').toBeTruthy();
    await page.touchscreen.tap(o.x, o.y);
    await expect(page.locator('#poiCard'), 'trykk 18 px fra observasjonspunktet åpnet det ikke').toBeVisible();
    await trykk(page.locator('#poiCard [data-act="close"]'));
    const r = await rutePunkt(page, 18);
    expect(r, 'fant ikke et punkt 18 px fra ruten').toBeTruthy();
    await page.touchscreen.tap(r.x, r.y);
    await expect.poll(() => page.evaluate(() => state.progress), { message: 'trykk 18 px fra ruten flyttet ikke markøren' }).toBeGreaterThan(0);
    expect(await markorAvstand(page, r)).toBeLessThan(25);
    expect(feil).toEqual([]);
  });
});

/* ---------- AK6, AK7 og AK12 med mus: som i dag ---------- */
test.describe('mus 1280×720', () => {
  test.use(MUS);
  test('AK6, AK7 og AK12 (mus): knappene, tallraden, trykk i kartet og filvelgeren er som i dag', async ({ page }) => {
    const feil = await start(page); await lokal(page);
    expect(await page.evaluate(() => document.querySelector('#gpxInput').getAttribute('accept'))).toBe('.gpx,.tcx,.fit,application/gpx+xml,application/vnd.garmin.tcx+xml,application/xml,text/xml');
    await aapneTurDirekte(page);
    const m = await page.evaluate(() => ({ btn: document.querySelector('#presentBtn').getBoundingClientRect().height, play: document.querySelector('#playBtn').getBoundingClientRect().height, ro: getComputedStyle(document.querySelector('.ro span')).fontSize, coarse: matchMedia('(pointer: coarse)').matches }));
    expect(m).toEqual({ btn: 34, play: 38, ro: '10px', coarse: false });
    let o = await obsPunkt(page, 22);
    expect(o).toBeTruthy();
    await page.mouse.click(o.x, o.y);
    await page.waitForTimeout(500);
    await expect(page.locator('#poiCard'), 'klikk 22 px fra observasjonspunktet åpnet det').toBeHidden();
    o = await obsPunkt(page, 3);
    await page.mouse.click(o.x, o.y);
    await expect(page.locator('#poiCard')).toBeVisible();
    await page.locator('#poiCard [data-act="close"]').click();
    let r = await rutePunkt(page, 22);
    expect(r).toBeTruthy();
    await page.mouse.click(r.x, r.y);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => state.progress), 'klikk 22 px fra ruten flyttet markøren').toBe(0);
    r = await rutePunkt(page, 4);
    await page.mouse.click(r.x, r.y);
    await expect.poll(() => page.evaluate(() => state.progress)).toBeGreaterThan(0);
    expect(feil).toEqual([]);
  });
});

/* ---------- AK7: zoom er ikke sperret ---------- */
test('AK7: viewport-taggen sperrer ikke zoom, og touch-action på html og body tillater klyping', async ({ page }) => {
  const meta = kilde.match(/<meta name="viewport" content="([^"]*)">/)[1];
  expect(meta).not.toMatch(/maximum-scale|minimum-scale|user-scalable/);
  await start(page);
  const ta = await page.evaluate(() => [getComputedStyle(document.documentElement).touchAction, getComputedStyle(document.body).touchAction]);
  for (const t of ta) expect(['auto', 'manipulation']).toContain(t);
  // Feltene på innloggingsskjermen er minst 16 px, så iPhone ikke zoomer inn i dem.
  expect(await page.evaluate(() => window.__m.tekst(['#auth']))).toEqual([]);
});

/* ---------- AK8: logge inn ---------- */
const SUPABASE = kilde.match(/supabaseUrl:'(https:\/\/[\w-]+\.supabase\.co)'/)[1];
const EIER = { id: '5b2d0c7e-6f1a-4c3b-9d8e-1a2b3c4d5e6f', email: 'jeger@example.com', aud: 'authenticated', role: 'authenticated' };
const SKYTUR = { id: '0f6e2a9c-3b4d-4e5f-8a7b-6c5d4e3f2a1b', owner: EIER.id, name: 'Skyturen (test)', area: null, started_at: '2025-09-21T08:00:00Z', distance_m: 4000, gain_m: 200, duration_s: 7200, participants: null, with_dog: false, dogs: null, bag: 0, notes: null, conditions: {}, weather: null, weather_summary: null, track_simple: null, effort: null, source_id: null };
function lagSky() {
  const kall = [], exp = Math.floor(Date.now() / 1000) + 3600;
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: EIER.id, email: EIER.email, role: 'authenticated', exp })}.falsk-signatur`;
  async function rute(route, req) {
    const url = new URL(req.url()), metode = req.method(), h = req.headers();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': h['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
    if (metode === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    kall.push(`${metode} ${url.pathname}`);
    const json = (status, body) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/token') return json(200, { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'falsk-refresh', user: EIER });
    if (url.pathname === '/auth/v1/user') return json(200, EIER);
    if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ status: 204, headers: cors });
    if (url.pathname.startsWith('/functions/v1/klokke')) return json(200, []);
    if (url.pathname === '/rest/v1/trips') return json(200, metode === 'GET' ? [SKYTUR] : []);
    if (url.pathname.startsWith('/rest/v1/')) return json(200, []);
    return json(404, { message: 'ukjent' });
  }
  return { kall, rute };
}

/* ---------- flytene: AK8–AK13 ---------- */
const GPX = `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Mobiltur (test)</name><trkseg>${
  Array.from({ length: 60 }, (_, i) => `<trkpt lat="${(69.6 + i * 0.0003).toFixed(6)}" lon="${(18.9 + i * 0.0004).toFixed(6)}"><ele>${300 + i}</ele><time>${new Date(Date.parse('2025-09-21T08:00:00Z') + i * 30_000).toISOString()}</time></trkpt>`).join('')}</trkseg></trk></gpx>`;
// Knappen ligger innenfor vinduet og tar imot trykk, eventuelt etter at dialogen er scrollet fram til den.
const naas = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!window.__m.synlig(e)) return 'skjult'; window.__m.vis(e); return window.__m.innenfor(e) && window.__m.treffer(e) ? 'ok' : `${s} ligger utenfor vinduet eller er dekket`; }, sel);

for (const v of STAAENDE) test.describe(navn(v), () => {
  test.use({ viewport: vp(v) });

  test(`AK8: ${navn(v)}: innlogging med trykk viser jaktloggen med skuffen åpen`, async ({ page }) => {
    const sky = lagSky();
    await page.route(url => url.href.startsWith(SUPABASE + '/'), sky.rute);
    const feil = await start(page);
    await trykk(page.locator('#lEmail')); await page.locator('#lEmail').fill(EIER.email);
    await trykk(page.locator('#lPw')); await page.locator('#lPw').fill('hemmelig-passord');
    await trykk(page.locator('#lBtn'));
    await expect(page.locator('#auth')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('.trip', { hasText: 'Skyturen' })).toBeAttached({ timeout: 30_000 });
    expect(sky.kall).toContain('POST /auth/v1/token');
    await etterInnlogging(page);
    await expect.poll(() => skuffSynlig(page), { message: 'skuffen er ikke åpen etter innlogging' }).toBe(true);
    await expect.poll(() => forste(page)).toBe(true);
    expect(feil).toEqual([]);
  });

  test(`AK9: ${navn(v)}: rypetreff med knappen og trykk på ruten, gjennom alle stegene, med knappene innenfor vinduet`, async ({ page }) => {
    const feil = await start(page); await lokal(page); await aapneTur(page);
    await expect.poll(() => skuffSynlig(page)).toBe(false);
    const for0 = await page.evaluate(() => state.pois.length);
    await trykk(page.locator('#addPoiBtn'));
    const p = await kartpunkt(page);
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.locator('#wizModal')).toBeVisible();
    const fot = async steg => { for (const s of ['#wzBack', '#wzNext', '#wzSave']) { const r = await naas(page, s); if (r !== 'skjult') expect(r, `${steg}: ${s}`).toBe('ok'); } };
    for (const [steg, valg] of [['gruppe', 'Singelrype'], ['miljø', null], ['skudd', 'Bom'], ['art', 'Lirype']]) {
      await fot(steg);
      await trykk(valg ? page.locator('#wzBody .opt', { hasText: valg }) : page.locator('#wzBody .opt').first());
    }
    await fot('oppsummering');
    await trykk(page.locator('#wzSave'));
    await expect(page.locator('#wizModal')).toBeHidden({ timeout: 15_000 });
    expect(await page.evaluate(() => state.pois.length)).toBe(for0 + 1);
    await trykk(page.locator('#panelToggle'));
    await trykk(page.locator('.tab[data-tab="obs"]'));
    await expect(page.locator('#pane-obs .poi-row')).toHaveCount(for0 + 1);
    expect(feil).toEqual([]);
  });

  test(`AK10: ${navn(v)}: langt trykk på kartet åpner veiviseren én gang, kort eller flyttet trykk gjør det ikke, og kartet markerer ikke tekst`, async ({ page, browserName }) => {
    expect(/-webkit-touch-callout:\s*none/.test(kilde), 'index.html setter ikke -webkit-touch-callout: none').toBe(true);
    const feil = await start(page); await lokal(page); await aapneTurDirekte(page);
    const css = await page.evaluate(() => Object.fromEntries(['#map', '#map .maplibregl-canvas'].map(s => {
      const cs = getComputedStyle(document.querySelector(s));
      return [s, { velg: cs.userSelect || cs.webkitUserSelect, meny: CSS.supports('-webkit-touch-callout', 'none') ? cs.webkitTouchCallout : 'none' }];
    })));
    for (const [s, c] of Object.entries(css)) expect(c, s).toEqual({ velg: 'none', meny: 'none' });
    if (browserName === 'chromium') {
      const cdp = await page.context().newCDPSession(page), p = await kartpunkt(page);
      await page.evaluate(() => { window.__aapnet = 0; const o = openWizard; openWizard = (...a) => { window.__aapnet++; return o(...a); }; });
      const hold = async (ms, { flytt = false, meny = false } = {}) => {
        const t0 = Date.now();
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
        if (flytt) { await page.waitForTimeout(100); for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x + i * 8, y: p.y }] }); }
        if (meny) {
          await page.waitForTimeout(Math.max(0, 500 - (Date.now() - t0)));
          await page.evaluate(([x, y]) => document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 })), [p.x, p.y]);
        }
        await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(600);
        const r = await page.evaluate(() => ({ aapnet: window.__aapnet, synlig: !document.querySelector('#wizModal').hidden }));
        await page.evaluate(() => { window.__aapnet = 0; document.querySelector('#wizModal').hidden = true; });
        return r;
      };
      expect(await hold(800), 'holdt i 800 ms').toEqual({ aapnet: 1, synlig: true });
      expect(await hold(800, { meny: true }), 'holdt i 800 ms med contextmenu underveis').toEqual({ aapnet: 1, synlig: true });
      expect(await hold(300), 'holdt i 300 ms').toEqual({ aapnet: 0, synlig: false });
      expect(await hold(800, { flytt: true }), 'flyttet under trykket').toEqual({ aapnet: 0, synlig: false });
    }
    expect(feil).toEqual([]);
  });

  test(`AK11: ${navn(v)}: fanene i skuffen åpnes med trykk, og det siste i hver fane kan scrolles fram`, async ({ page }) => {
    const feil = await start(page); await lokal(page); await aapneTur(page);
    await trykk(page.locator('#panelToggle'));
    await expect.poll(() => skuffSynlig(page)).toBe(true);
    for (const fane of ['obs', 'lag', 'tur']) {
      await trykk(page.locator(`.tab[data-tab="${fane}"]`));
      await expect(page.locator(`.tab[data-tab="${fane}"]`)).toHaveClass(/\bon\b/);
      for (const f of ['tur', 'obs', 'lag']) await (f === fane ? expect(page.locator(`#pane-${f}`)).toBeVisible() : expect(page.locator(`#pane-${f}`)).toBeHidden());
      await expect.poll(() => page.evaluate(f => {
        const p = document.querySelector(`#pane-${f}`); p.scrollTop = p.scrollHeight;
        const sist = [...p.children].filter(window.__m.synlig).pop();
        return !!sist && window.__m.innenfor(sist, 1) && window.__m.treffer(sist);
      }, fane), { message: `det siste i fanen ${fane} kan ikke scrolles fram` }).toBe(true);
    }
    expect(feil).toEqual([]);
  });

  test(`AK12: ${navn(v)}: «Ny tur» åpner filvelgeren uten filter, en GPX-fil lagres som tur, og en feil fil gir en melding`, async ({ page }) => {
    const feil = await start(page); await lokal(page);
    expect(await page.evaluate(() => document.querySelector('#gpxInput').getAttribute('accept')), 'filvelgeren har accept på berøringsskjerm').toBeNull();
    const velg = async fil => { const [v] = await Promise.all([page.waitForEvent('filechooser'), trykk(page.locator('#newTripBtn'))]); await v.setFiles(fil); };
    await velg({ name: 'mobiltur.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(GPX) });
    await expect(page.locator('#tripModal')).toBeVisible();
    expect(await naas(page, '#tSave')).toBe('ok');
    await trykk(page.locator('#tSave'));
    await expect(page.locator('#tripModal')).toBeHidden({ timeout: 30_000 });
    // Etter «Lagre tur» laster appen jaktloggen og åpner så turen. Testen går tilbake først når turen er åpnet
    // (lastingen er borte), ellers kan openTrip bli ferdig etter at testen har gått tilbake (avgjort av Martin 29.10.2026).
    await page.waitForFunction(() => state.view === 'trip' && !!state.trip && state.trip.name === 'Mobiltur (test)' && document.querySelector('#loading').hidden);
    await tilbake(page);
    await page.waitForFunction(() => state.view === 'log');
    await expect.poll(() => skuffSynlig(page)).toBe(true);
    await expect.poll(() => page.evaluate(() => {
      const t = [...document.querySelectorAll('.trip')].find(e => e.textContent.includes('Mobiltur (test)'));
      if (!t) return false;
      window.__m.vis(t); return window.__m.innenfor(t) && window.__m.treffer(t);
    }), { message: 'den nye turen står ikke i lista' }).toBe(true);
    await velg({ name: 'notat.txt', mimeType: 'text/plain', buffer: Buffer.from('Dette er ikke et spor') });
    await expect(page.locator('#toast')).toBeVisible();
    await expect(page.locator('#tripModal')).toBeHidden();
    expect(feil).toEqual([]);
  });

  test(`AK13: ${navn(v)}: «Presenter» og «Lag video» ligger øverst i Tur-fanen og virker, og står i toppraden fra 560 px`, async ({ page }) => {
    const feil = await start(page); await lokal(page); await aapneTur(page);
    const iTopp = () => page.evaluate(() => ['#presentBtn', '#exportBtn'].map(s => { const e = document.querySelector(s); return window.__m.synlig(e) && !!e.closest('.top') && window.__m.innenfor(e); }));
    expect(await iTopp(), 'Presenter og Lag video står fortsatt i toppraden').toEqual([false, false]);
    const iFanen = async tekst => {
      await trykk(page.locator('#panelToggle'));
      await expect.poll(() => skuffSynlig(page)).toBe(true);
      await trykk(page.locator('.tab[data-tab="tur"]'));
      const k = page.locator('#pane-tur button:visible', { hasText: tekst });
      await expect(k).toHaveCount(1);
      expect(await k.evaluate(e => { const h = document.querySelector('#pane-tur h2'); return !h || e.getBoundingClientRect().top < h.getBoundingClientRect().top; }), `«${tekst}» står ikke øverst i Tur-fanen`).toBe(true);
      await trykk(k);
    };
    await iFanen('Presenter');
    await expect(page.locator('body')).toHaveClass(/\bpresent\b/);
    await trykk(page.locator('#exitPresent'));
    await expect(page.locator('body')).not.toHaveClass(/\bpresent\b/);
    if (await skuffSynlig(page)) await trykk(page.locator('#panelToggle'));
    await iFanen('Lag video');
    await expect(page.locator('#exportModal')).toBeVisible();
    await trykk(page.locator('#expClose'));
    await page.setViewportSize({ width: 844, height: 390 });
    if (await skuffSynlig(page)) await trykk(page.locator('#panelToggle'));
    await expect.poll(iTopp, { message: 'Presenter og Lag video står ikke i toppraden fra 560 px' }).toEqual([true, true]);
    expect(feil).toEqual([]);
  });
});

/* ---------- AK14: iPhone-feller i CSS ---------- */
test('AK14: index.html bruker ikke 100vh uten dvh, og tidslinja og dialogene har safe-area-inset-bottom', () => {
  const css = kilde.match(/<style>([\s\S]*?)<\/style>/)[1];
  const regler = css.split('}').map(r => { const d = r.split('{'); return { sel: (d[d.length - 2] || '').split(',').map(s => s.trim()), body: d[d.length - 1] || '' }; });
  expect(regler.filter(r => /100vh/.test(r.body) && !/dvh/.test(r.body)).map(r => r.sel.join(',')), 'regler med 100vh uten dvh').toEqual([]);
  const har = sels => regler.some(r => r.sel.some(s => sels.includes(s)) && /safe-area-inset-bottom/.test(r.body));
  expect(har(['.tl']), '.tl mangler env(safe-area-inset-bottom)').toBe(true);
  expect(har(['.modal', '.dialog', '.dialog footer', '.dialog > footer']), 'dialogene mangler env(safe-area-inset-bottom)').toBe(true);
});

/* ---------- AK15: tapt WebGL-kontekst ---------- */
test.describe('390×844', () => {
  test.use({ viewport: vp([390, 844]) });
  test('AK15: etter tapt og gjenopprettet WebGL-kontekst tegnes kartet og ruten, route-tail tegner uten feil, og avspillingen virker', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'WEBGL_lose_context testes i Chromium');
    const feil = await start(page); await lokal(page); await aapneTurDirekte(page);
    await page.evaluate(async () => { setProgress(0.5, true); await mapIdle(30000); });
    const oransje = () => page.evaluate(async () => {
      await new Promise(r => { map.once('render', r); map.triggerRepaint(); });
      const c = map.getCanvas(), g = document.createElement('canvas'); g.width = c.width; g.height = c.height;
      const x = g.getContext('2d'); x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, g.width, g.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 16) if (d[i] > 200 && d[i + 1] > 135 && d[i + 1] < 215 && d[i + 2] < 120) n++;
      return n;
    });
    expect(await oransje(), 'ruten synes ikke før konteksten mistes').toBeGreaterThan(50);
    await page.evaluate(() => new Promise(res => { const c = map.getCanvas(), ext = map.painter.context.gl.getExtension('WEBGL_lose_context'); window.__ext = ext; c.addEventListener('webglcontextlost', () => res(), { once: true }); ext.loseContext(); }));
    await page.waitForTimeout(300);
    await page.evaluate(() => new Promise(res => { map.getCanvas().addEventListener('webglcontextrestored', () => res(), { once: true }); window.__ext.restoreContext(); }));
    await page.evaluate(() => mapIdle(30000));
    await page.evaluate(() => {
      const imp = map.getLayer('route-tail').implementation, r = imp.render.bind(imp);
      window.__gl = { kall: 0, feil: [] };
      imp.render = (gl, ...a) => { while (gl.getError()) { /* tøm gamle feil */ } const ut = r(gl, ...a); window.__gl.kall++; const e = gl.getError(); if (e) window.__gl.feil.push(e); return ut; };
    });
    await page.evaluate(() => setPlaying(true));
    await page.waitForTimeout(1500);
    await page.evaluate(() => setPlaying(false));
    const gl = await page.evaluate(() => ({ ...window.__gl, progress: state.progress }));
    expect(gl.kall, 'route-tail tegnet ikke etter at konteksten kom tilbake').toBeGreaterThan(0);
    expect(gl.feil, 'WebGL-feil fra route-tail').toEqual([]);
    expect(gl.progress, 'avspillingen gikk ikke framover').toBeGreaterThan(0.5);
    expect(await oransje(), 'ruten synes ikke etter at konteksten kom tilbake').toBeGreaterThan(50);
    expect(feil).toEqual([]);
  });
});

/* ---------- AK18–AK21 (lagt til av Martin 29.10.2026 etter testing på iPhone) ---------- */
test('AK18: ingen synlige tekster i tidslinja, toppraden eller dialogene overlapper hverandre, i alle fire vinduene', async ({ page, browserName }) => {
  const mine = ALLE.filter(v => NETTLESER[navn(v)] === browserName), feil = [];
  const rundt = async (hvor, omr) => {
    for (const v of mine) {
      await page.setViewportSize(vp(v)); await page.waitForTimeout(400);
      feil.push(...(await page.evaluate(o => window.__m.tekstOverlapp(o), omr)).map(f => `${hvor}, ${navn(v)}: ${f}`));
    }
    await page.setViewportSize(vp(mine[0])); await page.waitForTimeout(400);
  };
  await page.setViewportSize(vp(mine[0]));
  const err = await start(page); await lokal(page); await aapneTur(page);
  await expect.poll(() => skuffSynlig(page)).toBe(false);
  await page.evaluate(() => setProgress(0.4, true));
  await rundt('turen', ['#tl', '.top']);
  await trykk(page.locator('#panelToggle'));
  await trykk(page.locator('.tab[data-tab="tur"]'));
  await trykk(page.locator('#editTripBtn'));
  await expect(page.locator('#tripModal')).toBeVisible();
  await rundt('turdialogen', ['#tripModal']);
  await trykk(page.locator('#tripModal [data-close]').first());
  await trykk(page.locator('#panelToggle'));
  await expect.poll(() => skuffSynlig(page)).toBe(false);
  await trykk(page.locator('#addPoiBtn'));
  let p = await kartpunkt(page);
  await page.touchscreen.tap(p.x, p.y);
  await expect(page.locator('#wizModal')).toBeVisible();
  for (const valg of ['Singelrype', null, 'Bom', 'Lirype']) await trykk(valg ? page.locator('#wzBody .opt', { hasText: valg }) : page.locator('#wzBody .opt').first());
  await rundt('veiviseren', ['#wizModal']);
  await trykk(page.locator('#wizModal [data-close]').first());
  await page.waitForTimeout(600);
  await trykk(page.locator('#addOtherBtn'));
  p = await kartpunkt(page);
  await page.touchscreen.tap(p.x, p.y);
  await expect(page.locator('#poiModal')).toBeVisible();
  await rundt('observasjonsdialogen', ['#poiModal']);
  expect(feil).toEqual([]);
  expect(err).toEqual([]);
});

test('AK19: i Analyse starter den første valgknappen i hver rad på samme venstre kant, og den tomme ruta blant tallene har samme farge som de andre', async ({ page, browserName }) => {
  const v = ALLE.find(w => NETTLESER[navn(w)] === browserName && w[1] > w[0]);
  await page.setViewportSize(vp(v));
  const feil = await start(page); await lokal(page);
  await trykk(page.locator('#logMode button[data-m="ana"]'));
  await expect(page.locator('#ana')).toBeVisible();
  const r = await page.evaluate(() => ({
    venstre: [...document.querySelectorAll('#ana .ana-filters .chips')].map(c => Math.round(c.querySelector('button').getBoundingClientRect().left)),
    flate: getComputedStyle(document.querySelector('#ana .kpis')).backgroundColor,
    rute: getComputedStyle(document.querySelector('#ana .kpis > div')).backgroundColor,
  }));
  expect(r.venstre.length, 'fant ikke valgradene').toBe(3);
  expect(Math.max(...r.venstre) - Math.min(...r.venstre), `venstre kant: ${r.venstre.join(', ')}`).toBeLessThanOrEqual(1);
  expect(r.flate, 'tom rute har en annen farge enn rutene med tall').toBe(r.rute);
  expect(feil).toEqual([]);
});

test('AK20: trykk på «Analyse» lukker skuffen med turlista', async ({ page, browserName }) => {
  await page.setViewportSize(vp(ALLE.find(w => NETTLESER[navn(w)] === browserName)));
  const feil = await start(page); await lokal(page);
  await expect.poll(() => skuffSynlig(page)).toBe(true);
  await trykk(page.locator('#logMode button[data-m="ana"]'));
  await expect(page.locator('#ana')).toBeVisible();
  await expect.poll(() => skuffSynlig(page), { message: 'skuffen står åpen over analysen' }).toBe(false);
  expect(feil).toEqual([]);
});

test('AK21: rypetreff-banneret er tekst med tydelige knapper, ingen tekst går over mer enn to linjer, og det dekker ingen ikoner', async ({ page, browserName }) => {
  const v = ALLE.find(w => NETTLESER[navn(w)] === browserName && w[1] > w[0]);
  await page.setViewportSize(vp(v));
  const feil = await start(page); await lokal(page); await aapneTurDirekte(page);
  await trykk(page.locator('#addPoiBtn'));
  await expect(page.locator('#addHint')).toBeVisible();
  const r = await page.evaluate(() => {
    const M = window.__m, h = document.querySelector('#addHint'), hr = h.getBoundingClientRect(), tekst = document.querySelector('#addHintText');
    const linjer = {};
    for (const b of M.tekstbiter(['#addHint'])) { const k = b.n.textContent.trim(); (linjer[k] = linjer[k] || new Set()).add(Math.round(b.t)); }
    const mange = Object.entries(linjer).filter(([, s]) => s.size > 2).map(([k, s]) => `«${k}»: ${s.size} linjer`);
    const ikoner = [...document.querySelectorAll('#stage button, #stage .maplibregl-ctrl button, .top button')].filter(b => !h.contains(b) && M.synlig(b)).filter(b => { const q = b.getBoundingClientRect(); return q.left < hr.right && q.right > hr.left && q.top < hr.bottom && q.bottom > hr.top; }).map(M.navn);
    const knapp = id => { const cs = getComputedStyle(document.querySelector(id)); return cs.borderStyle !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)'; };
    const ts = getComputedStyle(tekst);
    return { mange, ikoner, tekstSomKnapp: ts.backgroundColor !== 'rgba(0, 0, 0, 0)' || ts.borderStyle !== 'none' || getComputedStyle(h).backgroundColor === 'rgb(244, 177, 62)', knapper: [knapp('#useTimeline'), knapp('#cancelAdd')] };
  });
  expect(r.mange, 'tekst over mer enn to linjer').toEqual([]);
  expect(r.ikoner, 'banneret dekker ikoner').toEqual([]);
  expect(r.tekstSomKnapp, 'instruksjonen ser ut som en knapp').toBe(false);
  expect(r.knapper, '«Bruk posisjonen på tidslinjen» og «Avbryt» ser ikke ut som knapper').toEqual([true, true]);
  expect(feil).toEqual([]);
});
