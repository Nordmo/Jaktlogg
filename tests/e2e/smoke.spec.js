import { test, expect, startLocal } from '../helpers/oppstart.js';

// Røyktest: appen starter, lokal modus viser eksempelturene, og en tur kan åpnes uten JavaScript-feil.
test('appen starter og viser en tur i lokal modus', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await startLocal(page);

  const trip = page.getByText('Rypejakt Tromsdalstinden (eksempel)').first();
  await expect(trip).toBeVisible({ timeout: 30_000 });
  await trip.click();
  await expect(page.locator('#playBtn')).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();

  expect(errors).toEqual([]);
});
