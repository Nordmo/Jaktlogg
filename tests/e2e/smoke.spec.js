import { test, expect } from '@playwright/test';

// Røyktest: appen starter, lokal modus viser eksempelturene, og en tur kan åpnes uten JavaScript-feil.
test('appen starter og viser en tur i lokal modus', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('/');
  await page.locator('#lLocal').click();

  const trip = page.getByText('Rypejakt Tromsdalstinden (eksempel)').first();
  await expect(trip).toBeVisible({ timeout: 30_000 });
  await trip.click();
  await expect(page.locator('#playBtn')).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();

  expect(errors).toEqual([]);
});
