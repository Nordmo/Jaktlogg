import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:4173' },
  // WebKit dekker Safari, men bare for rutetegningen (docs/specs/rute-folger-markoren.md). Resten kjører i Chromium.
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' }, testMatch: /acceptance\/rute-folger-markoren\.spec\.js$/ },
  ],
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
  },
});
