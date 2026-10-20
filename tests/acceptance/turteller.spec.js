import { test, expect } from '@playwright/test';

// Akseptansetester for docs/specs/turteller.md. Kjører i lokal modus med de tre eksempelturene:
// to i sesong 2025/26 og én i 2024/25.
/* global Local, loadLog, tripCountText -- globale i index.html, brukes inne i page.evaluate */

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#lLocal').click();
  await expect(page.locator('.trip')).toHaveCount(3, { timeout: 30_000 });
});

const count = page => page.locator('#tripCount');
const season = (page, s) => page.locator(`#seasons button[data-s="${s}"]`).click();
// Sletter eksempelturer direkte i IndexedDB til bare `keep` er igjen, og tegner loggen på nytt.
const keepTrips = (page, keep) => page.evaluate(async keep => {
  for (const t of (await Local.listTrips()).slice(keep)) await Local.deleteTrip(t.id);
  await loadLog(false);
}, keep);

// AK1: Med «Alle» står «3 turer», og linjen ligger over det første turkortet.
test('AK1: «3 turer» over første turkort når «Alle» er valgt', async ({ page }) => {
  await expect(count(page)).toHaveText('3 turer');
  const c = await count(page).boundingBox(), t = await page.locator('.trip').first().boundingBox();
  expect(c.y + c.height).toBeLessThanOrEqual(t.y);
});

// AK2: Velger man sesong 2025/26, viser linjen at to av tre turer er med.
test('AK2: «2 av 3 turer» for sesong 2025/26', async ({ page }) => {
  await season(page, '2025/26');
  await expect(count(page)).toHaveText('2 av 3 turer');
});

// AK3: Sesong 2024/25 har én tur, men totalen er tre, så substantivet står i flertall.
test('AK3: «1 av 3 turer» for sesong 2024/25', async ({ page }) => {
  await season(page, '2024/25');
  await expect(count(page)).toHaveText('1 av 3 turer');
});

// AK4: Går man tilbake til «Alle» etter et sesongvalg, blir teksten «3 turer» igjen.
test('AK4: tilbake til «Alle» gir «3 turer»', async ({ page }) => {
  await season(page, '2025/26');
  await expect(count(page)).toHaveText('2 av 3 turer');
  await season(page, 'all');
  await expect(count(page)).toHaveText('3 turer');
});

// AK5: Sletter man eksempelturene med knappen, forsvinner linjen og tom logg-meldingen vises.
test('AK5: ingen tellelinje når loggen er tom', async ({ page }) => {
  await expect(count(page)).toBeVisible();
  await page.locator('#delSamples').click();
  await page.locator('#delSamples').click();
  await expect(page.getByText('Ingen turer ennå')).toBeVisible();
  await expect(count(page)).toHaveCount(0);
});

// AK6: Med nøyaktig én tur i loggen står det «1 tur» i entall.
test('AK6: «1 tur» i entall når loggen har én tur', async ({ page }) => {
  await keepTrips(page, 1);
  await expect(page.locator('.trip')).toHaveCount(1);
  await expect(count(page)).toHaveText('1 tur');
});

// AK7: Tekstfunksjonen gir «0 av 12 turer» når sesongen er tom men loggen ikke er det (kan ikke nås i UI).
test('AK7: «0 av 12 turer» når valgt sesong er tom', async ({ page }) => {
  expect(await page.evaluate(() => tripCountText(0, 12))).toBe('0 av 12 turer');
});

// AK8: Ingen av stegene over gir JavaScript-feil.
test('AK8: ingen JavaScript-feil', async ({ page }) => {
  await expect(count(page)).toBeVisible();
  await season(page, '2025/26');
  await season(page, 'all');
  expect(errors).toEqual([]);
});
