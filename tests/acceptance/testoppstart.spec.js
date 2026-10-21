import { readFileSync, readdirSync } from 'node:fs';
import { Encoder, Profile } from '@garmin/fitsdk';
import { test, expect, startLocal, visLogin, sjekkNett } from '../helpers/oppstart.js';

// Akseptansetester for docs/specs/testoppstart.md. Den felles oppstarten (tests/helpers/oppstart.js) skal
// gi fixturen `nett` med tre lister over forespørsler som ikke går til 127.0.0.1:
//   nett.besvart: besvart av oppstarten (lokale kopier eller tomme fliser)
//   nett.avvist:  kjent adresse som avvises med vilje (fonter, vær, Supabase, video)
//   nett.ukjente: ukjent adresse, avvist og registrert. Ikke tom liste gjør testen rød.
// `sjekkNett(nett)` kaster en feil som nevner de ukjente adressene. Fixturen kaller den etter hver test.
/* global document, state, posAt, terrainAt, mapIdle -- globale i nettleseren og index.html, brukes inne i page.evaluate */

const external = r => !/^https?:\/\/127\.0\.0\.1(:\d+)?\//.test(r);

// AK1: Innloggingsskjermen kommer hver gang, og «Bruk uten innlogging» gir de tre eksempelturene.
test('AK1: innloggingsskjermen vises hver gang, og lokal modus gir tre eksempelturer', async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    await visLogin(page);
    await expect(page.locator('#lLocal')).toBeVisible();
    await startLocal(page);
    await expect(page.locator('.trip')).toHaveCount(3);
  }
});

// AK2: Åpne tur, spill av, bytt kartlag: ingen forespørsel går ut av maskinen.
test('AK2: ingen forespørsel går til internett når en tur åpnes, spilles av og kartlag byttes', async ({ page, nett }) => {
  const sent = [];
  page.on('request', r => { if (external(r.url())) sent.push(r.url()); });
  page.on('requestfinished', r => { if (external(r.url()) && !nett.besvart.includes(r.url())) throw new Error(`Gikk ut på nettet: ${r.url()}`); });
  await startLocal(page);
  await page.getByText('Rypejakt Tromsdalstinden (eksempel)').first().click();
  await expect(page.locator('#playBtn')).toBeVisible({ timeout: 30_000 });
  await page.locator('#playBtn').click();
  await page.waitForTimeout(1000);
  await page.locator('#playBtn').click();
  for (const bm of ['topo', 'otm', 'sat']) {
    await page.evaluate(bm => document.querySelector(`[data-bm="${bm}"]`).click(), bm);
    await page.evaluate(() => mapIdle(10_000));
  }
  expect(sent.length).toBeGreaterThan(0);
  const handled = new Set([...nett.besvart, ...nett.avvist]);
  expect(sent.filter(u => !handled.has(u))).toEqual([]);
  expect(nett.ukjente).toEqual([]);
  // Kartflisene fra alle tre kartlag og terrenget er besvart lokalt.
  for (const host of ['server.arcgisonline.com', 'cache.kartverket.no', 'tile.opentopomap.org', 's3.amazonaws.com']) {
    expect(nett.besvart.some(u => u.includes(host))).toBe(true);
  }
});

// AK3: En ukjent adresse blir registrert, og sjekken feiler med adressen i meldingen.
test('AK3: ukjent ekstern adresse gjør testen rød og nevnes i feilmeldingen', async ({ page, nett }) => {
  await startLocal(page);
  const url = 'https://ukjent-adresse.example.invalid/noe.js';
  await page.evaluate(url => fetch(url).catch(() => null), url);
  await expect.poll(() => nett.ukjente).toContain(url);
  expect(() => sjekkNett(nett)).toThrow(/ukjent-adresse\.example\.invalid/);
  nett.ukjente.length = 0; // ellers feiler fixturen etter testen, som er riktig oppførsel
});

// AK4: Versjonene som serveres lokalt, er de samme som index.html peker på.
test('AK4: lokale kopier har samme versjon som index.html', async () => {
  const html = readFileSync('index.html', 'utf8');
  for (const pkg of ['maplibre-gl', '@supabase/supabase-js', '@garmin/fitsdk']) {
    const esc = pkg.replace(/[/.]/g, m => '\\' + m);
    const m = html.match(new RegExp(`${esc}@(\\d+\\.\\d+\\.\\d+)`));
    expect(m, `${pkg} finnes ikke i index.html`).not.toBeNull();
    const local = JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, 'utf8')).version;
    expect(local, pkg).toBe(m[1]);
  }
});

// AK5: Terrenget er flatt på 500 moh. og kommer fra oppstarten.
test('AK5: terrenget er flatt på 500 moh. midt på sporet', async ({ page, nett }) => {
  await startLocal(page);
  await page.getByText('Rypejakt Tromsdalstinden (eksempel)').first().click();
  await expect(page.locator('#playBtn')).toBeVisible({ timeout: 30_000 });
  const t = await page.evaluate(async () => {
    await mapIdle(15_000);
    const p = posAt(state.T, state.T.total / 2);
    return terrainAt(p.lon, p.lat);
  });
  expect(t).not.toBeNull();
  expect(Math.abs(t.ele - 500)).toBeLessThanOrEqual(1);
  expect(Math.abs(t.slope)).toBeLessThanOrEqual(0.5);
  expect(nett.besvart.some(u => u.includes('s3.amazonaws.com/elevation-tiles-prod/terrarium/'))).toBe(true);
});

// AK6: @garmin/fitsdk serveres lokalt når en FIT-fil velges.
test('AK6: FIT-biblioteket serveres lokalt og turdialogen åpnes', async ({ page, nett }) => {
  const sc = d => Math.round(d * 2 ** 31 / 180), t0 = Date.parse('2025-10-04T07:00:00Z'), e = new Encoder();
  e.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'development', product: 1, timeCreated: new Date(t0), type: 'activity' });
  for (let i = 0; i < 60; i++) e.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(t0 + i * 3000), positionLat: sc(69.62 + i * 0.0001), positionLong: sc(18.98 + i * 0.0001), enhancedAltitude: 120 + i, heartRate: 120 });
  await startLocal(page);
  expect(nett.besvart.some(u => /@garmin\/fitsdk/.test(u))).toBe(false);
  await page.locator('#gpxInput').setInputFiles({ name: 'tur.fit', mimeType: 'application/octet-stream', buffer: Buffer.from(e.close()) });
  await expect(page.locator('#tripModal')).toBeVisible({ timeout: 30_000 });
  expect(nett.besvart.some(u => /@garmin\/fitsdk@21\.218\.0\/\+esm/.test(u))).toBe(true);
});

// AK7: Alle nettlesertester bruker den felles oppstarten.
test('AK7: alle testfiler i tests/acceptance og tests/e2e bruker den felles oppstarten', async () => {
  const files = ['tests/acceptance', 'tests/e2e'].flatMap(d => readdirSync(d).filter(f => f.endsWith('.spec.js')).map(f => `${d}/${f}`));
  expect(files.length).toBeGreaterThanOrEqual(5);
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    expect(src, f).toMatch(/from '\.\.\/helpers\/oppstart\.js'/);
    expect(src, f).not.toMatch(/from '@playwright\/test'/);
    expect(src, f).not.toMatch(/page\.goto\(/);
    expect(src, f).not.toMatch(/#lLocal'\)\.click\(/);
  }
});

// AK8: To arbeidere, lokalt og i CI.
test('AK8: playwright.config.js har workers: 2', async () => {
  const src = readFileSync('playwright.config.js', 'utf8');
  expect(src).toMatch(/^\s*workers:\s*2,?\s*$/m);
  const { default: config } = await import('../../playwright.config.js');
  expect(config.workers).toBe(2);
});

// AK9: Eksisterende tester har like mange expect-er som før (tellet 2026-10-21 på main, 6932814).
test('AK9: eksisterende tester har uendret antall expect', async () => {
  const before = { 'tests/acceptance/turteller.spec.js': 15, 'tests/acceptance/tellelinje-stil.spec.js': 14, 'tests/acceptance/fit-filer.spec.js': 43, 'tests/e2e/smoke.spec.js': 4 };
  for (const [f, n] of Object.entries(before)) expect(readFileSync(f, 'utf8').match(/expect\(/g).length, f).toBe(n);
});
