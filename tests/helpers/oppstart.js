// Felles oppstart for alle nettlesertester (docs/specs/testoppstart.md). Ingen test skal trenge internett:
// bibliotekene serveres fra lokale kopier med samme versjon som index.html, kartfliser er tomme, terrenget er
// flatt på 500 moh., og alt annet utenfor 127.0.0.1 avvises. En ukjent ekstern adresse gjør testen rød.
import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
/* global map, setTerrain, window -- globale i index.html, brukes inne i page.evaluate */

/* ---------- versjoner fra index.html ---------- */
const html = readFileSync('index.html', 'utf8');
const ver = pkg => {
  const m = html.match(new RegExp(`${pkg.replace(/[/.]/g, c => '\\' + c)}@(\\d+\\.\\d+\\.\\d+)`));
  if (!m) throw new Error(`Fant ikke versjonen av ${pkg} i index.html`);
  return m[1].replace(/\./g, '\\.');
};

/* ---------- PNG uten bildefiler i repoet ---------- */
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); };
function solidPng([r, g, b, a], size = 256) {
  const row = Buffer.alloc(1 + size * 4);
  for (let x = 0; x < size; x++) row.set([r, g, b, a], 1 + x * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(size).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
const BLANK = solidPng([0, 0, 0, 0]);
// Terrarium: høyde = R·256 + G + B/256 − 32768. (129, 244, 0) gir 500 m. Ikke 0 m: appen tolker 0 som «mangler data».
const FLAT = solidPng([129, 244, 0, 255]);

/* ---------- ruting ---------- */
const file = (path, type) => ({ body: readFileSync(path), contentType: type });
const JS = 'application/javascript; charset=utf-8';
const ML = ver('maplibre-gl'), SB = ver('@supabase/supabase-js'), FIT = ver('@garmin/fitsdk');
// [mønster, svar]. Svaret får treffet fra mønsteret.
const SERVE = [
  [new RegExp(`^https://unpkg\\.com/maplibre-gl@${ML}/dist/maplibre-gl\\.js$`), () => file('tests/vendor/maplibre-gl.js', JS)],
  [new RegExp(`^https://unpkg\\.com/maplibre-gl@${ML}/dist/maplibre-gl\\.css$`), () => file('tests/vendor/maplibre-gl.css', 'text/css; charset=utf-8')],
  [new RegExp(`^https://cdn\\.jsdelivr\\.net/npm/@supabase/supabase-js@${SB}/dist/umd/supabase\\.js$`), () => file('node_modules/@supabase/supabase-js/dist/umd/supabase.js', JS)],
  // fitsdk importerer sine egne filer relativt (også «../src/…»), så +esm svarer med en modul som peker på src/,
  // og filene serveres fra src/ under samme versjon.
  [new RegExp(`^https://cdn\\.jsdelivr\\.net/npm/@garmin/fitsdk@${FIT}/\\+esm$`), () => ({ body: "export * from './src/index.js';\n", contentType: JS })],
  [new RegExp(`^https://cdn\\.jsdelivr\\.net/npm/@garmin/fitsdk@${FIT}/src/([\\w-]+\\.js)$`), m => file(`node_modules/@garmin/fitsdk/src/${m[1]}`, JS)],
  [/^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\//, () => ({ body: BLANK, contentType: 'image/png' })],
  [/^https:\/\/cache\.kartverket\.no\/v1\/wmts\//, () => ({ body: BLANK, contentType: 'image/png' })],
  [/^https:\/\/[abc]\.tile\.opentopomap\.org\//, () => ({ body: BLANK, contentType: 'image/png' })],
  [/^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium\//, () => ({ body: FLAT, contentType: 'image/png' })],
];
// Kjente adresser som avvises med vilje: fonter, vær, det ekte Supabase-prosjektet og videobibliotekene.
const REJECT = [/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, /^https:\/\/[\w-]+\.open-meteo\.com\//, /^https:\/\/[\w-]+\.supabase\.co\//, /^https:\/\/cdn\.jsdelivr\.net\/npm\/(mp4|webm)-muxer@/];
const external = url => /^https?:$/.test(url.protocol) && url.hostname !== '127.0.0.1';

export function sjekkNett(nett) {
  if (nett.ukjente.length) throw new Error(`Testen prøvde å nå ukjente adresser utenfor maskinen. Legg dem til i tests/helpers/oppstart.js eller fjern dem:\n${nett.ukjente.join('\n')}`);
}

export const test = base.extend({
  nett: [async ({ context }, use) => {
    const nett = { besvart: [], avvist: [], ukjente: [] };
    await context.route(external, async route => {
      const url = route.request().url();
      for (const [re, answer] of SERVE) { const m = url.match(re); if (m) { nett.besvart.push(url); return route.fulfill({ status: 200, ...answer(m) }); } }
      if (REJECT.some(re => re.test(url))) nett.avvist.push(url); else nett.ukjente.push(url);
      return route.abort();
    });
    // Start appen i 2D fra første bilde: pakk inn maplibregl.Map og fjern terrain fra startstilen, med mindre
    // testen har bedt om 3D (startLocal med med3D: true). Hva innpakningen fant, sjekkes av sjekkStartstil.
    await context.addInitScript(() => {
      window.__oppstart = { pakket: false, fant: false };
      let ml;
      Object.defineProperty(window, 'maplibregl', { configurable: true, get: () => ml, set: v => {
        const Orig = v.Map;
        v.Map = class extends Orig {
          constructor(o) {
            window.__oppstart.pakket = true;
            const s = o && o.style;
            window.__oppstart.fant = !!(s && typeof s === 'object' && s.terrain);
            if (window.__oppstart.fant && !window.__test3D) { const { terrain, ...rest } = s; void terrain; o = { ...o, style: rest }; }
            super(o);
          }
        };
        ml = v;
      } });
    });
    await use(nett);
    sjekkNett(nett);
  }, { auto: true }],
});

// Feiler testen hvis innpakningen av maplibregl.Map ikke virket, slik at 2D fra start aldri slutter å virke i det stille.
export function sjekkStartstil(info) {
  if (!info || !info.pakket) throw new Error('Oppstarten fikk ikke pakket inn maplibregl.Map. Kartet lages ikke lenger som før i index.html. Oppdater tests/helpers/oppstart.js.');
  if (!info.fant) throw new Error('Fant ikke terrain i startstilen til kartet (makeStyle i index.html). Oppstarten kan ikke starte i 2D. Oppdater tests/helpers/oppstart.js.');
}
// Feiler testen hvis startLocal({ med3D: true }) ikke har terreng rett etter start.
export function sjekk3D(harTerreng) {
  if (!harTerreng) throw new Error('startLocal({ med3D: true }): map.getTerrain() er tom etter start. 3D er ikke på fra første bilde.');
}
export { expect };

// Åpner appen og venter til innloggingsskjermen med «Bruk uten innlogging» vises.
export async function visLogin(page) {
  await page.goto('/');
  await expect(page.locator('#lLocal')).toBeVisible({ timeout: 30_000 });
}
// Åpner appen i lokal modus og venter til jaktloggen er tegnet (med turer eller tom). Appen starter i 2D, fordi
// 3D-terreng i programvaregrafikk uten skjermkort gjør hvert bilde svært dyrt (ca. 400 ms). Med med3D: true
// startes appen slik den er, med terreng fra første bilde, og testen feiler hvis terrenget ikke er på.
export async function startLocal(page, { med3D: tre = false } = {}) {
  await page.addInitScript(on => { window.__test3D = on; }, tre);
  await visLogin(page);
  await page.locator('#lLocal').click();
  await expect(page.locator('.trip').first().or(page.getByText('Ingen turer ennå'))).toBeVisible({ timeout: 30_000 });
  sjekkStartstil(await page.evaluate(() => window.__oppstart));
  if (tre) return sjekk3D(await page.evaluate(() => !!map.getTerrain()));
  await page.evaluate(() => setTerrain(false));
  await page.waitForFunction(() => !map.getTerrain());
}
// Åpner appen innlogget med en falsk økt og venter til jaktloggen er tegnet, i 2D som startLocal.
// svar.bruker er brukeren i økten ({ id, email }). svar.rute(route, request) svarer på alle kall til
// Supabase-prosjektet (/auth, /rest, /functions). page.route går foran rutingen i oppstarten.
const SUPABASE = html.match(/supabaseUrl:'(https:\/\/[\w-]+\.supabase\.co)'/)[1];
export async function startCloud(page, svar) {
  const ref = new URL(SUPABASE).hostname.split('.')[0], exp = Math.floor(Date.now() / 1000) + 10 * 365 * 86400;
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: svar.bruker.id, email: svar.bruker.email, role: 'authenticated', exp })}.falsk-signatur`;
  const okt = { access_token: token, refresh_token: 'falsk-refresh', token_type: 'bearer', expires_in: exp - Math.floor(Date.now() / 1000), expires_at: exp, user: { id: svar.bruker.id, email: svar.bruker.email, aud: 'authenticated', role: 'authenticated' } };
  await page.addInitScript(([key, okt]) => { window.__test3D = false; try { localStorage.setItem(key, okt); } catch (e) { void e; } }, [`sb-${ref}-auth-token`, JSON.stringify(okt)]);
  await page.route(url => url.href.startsWith(SUPABASE + '/'), svar.rute);
  await page.goto('/');
  await expect(page.locator('#pane-log .trips')).toBeVisible({ timeout: 30_000 });
  sjekkStartstil(await page.evaluate(() => window.__oppstart));
  await page.evaluate(() => setTerrain(false));
  await page.waitForFunction(() => !map.getTerrain());
}
// Slår 3D-terrenget på igjen, for testene som skal dekke 3D-modus.
export async function med3D(page) {
  await page.evaluate(() => setTerrain(true));
  await page.waitForFunction(() => !!map.getTerrain());
}
