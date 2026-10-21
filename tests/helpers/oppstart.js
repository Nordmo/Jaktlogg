// Felles oppstart for alle nettlesertester (docs/specs/testoppstart.md). Ingen test skal trenge internett:
// bibliotekene serveres fra lokale kopier med samme versjon som index.html, kartfliser er tomme, terrenget er
// flatt på 500 moh., og alt annet utenfor 127.0.0.1 avvises. En ukjent ekstern adresse gjør testen rød.
import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

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
    await use(nett);
    sjekkNett(nett);
  }, { auto: true }],
});
export { expect };

// Åpner appen og venter til innloggingsskjermen med «Bruk uten innlogging» vises.
export async function visLogin(page) {
  await page.goto('/');
  await expect(page.locator('#lLocal')).toBeVisible({ timeout: 30_000 });
}
// Åpner appen i lokal modus og venter til jaktloggen er tegnet (med turer eller tom).
export async function startLocal(page) {
  await visLogin(page);
  await page.locator('#lLocal').click();
  await expect(page.locator('.trip').first().or(page.getByText('Ingen turer ennå'))).toBeVisible({ timeout: 30_000 });
}
