import { defineConfig } from '@playwright/test';

// Mobiltestene (docs/specs/mobil.md) kjører i egne prosjekter med telefon i Chromium og WebKit. Resten kjører i chromium.
// Det som ikke er forskjellig mellom nettleserne, kjører bare i mobil-chromium (avgjort av Martin 28.10.2026).
const MOBIL = /acceptance\/mobil\.spec\.js$/;
// Testen med mus og AK7 om zoom kjører også bare i mobil-chromium (avgjort av Martin 29.10.2026).
const BARE_CHROMIUM = /\b(AK3|AK4|AK8|AK11|AK12|AK13|AK14|Oppsett):|\(mus\):|AK7: viewport-taggen/;
// Telefonvinduene er delt: 390×844 og 844×390 i mobil-webkit, 360×800 og 800×360 i mobil-chromium (avgjort av Martin
// 28.10.2026). Testene over og AK15 (WEBGL_lose_context) kjører i mobil-chromium uansett vindu. AK5 deler selv i testen.
const IKKE_WEBKIT = /360×800|800×360/;
const IKKE_CHROMIUM = /^(?!.*\b(AK3|AK4|AK8|AK11|AK12|AK13|AK14|AK15|Oppsett):).*(390×844|844×390)/;
const telefon = { isMobile: true, hasTouch: true, deviceScaleFactor: 3 };

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:4173' },
  projects: [
    { name: 'chromium', testIgnore: MOBIL, use: { browserName: 'chromium' } },
    { name: 'mobil-chromium', testMatch: MOBIL, grepInvert: IKKE_CHROMIUM, use: { browserName: 'chromium', ...telefon } },
    { name: 'mobil-webkit', testMatch: MOBIL, grepInvert: [BARE_CHROMIUM, IKKE_WEBKIT], use: { browserName: 'webkit', ...telefon } },
  ],
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
  },
});
