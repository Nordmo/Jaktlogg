import { defineConfig } from '@playwright/test';

const RUTE = /acceptance\/rute-folger-markoren\.spec\.js$/;

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:4173' },
  // Rutetegningen (docs/specs/rute-folger-markoren.md) kjører i egne prosjekter, også i WebKit for Safari, én test om
  // gangen (WebKit etter Chromium): to 3D-tester samtidig i programvaregrafikk tar tidsavbrudd. Resten kjører i Chromium.
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' }, testIgnore: RUTE },
    { name: 'rute-chromium', use: { browserName: 'chromium' }, testMatch: RUTE, workers: 1 },
    { name: 'rute-webkit', use: { browserName: 'webkit' }, testMatch: RUTE, workers: 1, dependencies: ['rute-chromium'] },
  ],
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
  },
});
