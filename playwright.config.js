import { defineConfig } from '@playwright/test';

// Mobiltestene (docs/specs/mobil.md) kjører i egne prosjekter med telefon i Chromium og WebKit. Resten kjører i chromium.
const MOBIL = /acceptance\/mobil\.spec\.js$/;
const telefon = { isMobile: true, hasTouch: true, deviceScaleFactor: 3 };

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:4173' },
  projects: [
    { name: 'chromium', testIgnore: MOBIL, use: { browserName: 'chromium' } },
    { name: 'mobil-chromium', testMatch: MOBIL, use: { browserName: 'chromium', ...telefon } },
    { name: 'mobil-webkit', testMatch: MOBIL, use: { browserName: 'webkit', ...telefon } },
  ],
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
  },
});
