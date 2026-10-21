import { test, expect, startLocal, med3D } from '../helpers/oppstart.js';

// Røyktest: appen starter, lokal modus viser eksempelturene, og en tur kan åpnes i 3D uten JavaScript-feil.
test('appen starter og viser en tur i lokal modus', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await startLocal(page);
  await med3D(page);

  const trip = page.getByText('Rypejakt Tromsdalstinden (eksempel)').first();
  await expect(trip).toBeVisible({ timeout: 30_000 });
  await trip.click();
  await expect(page.locator('#playBtn')).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();

  expect(errors).toEqual([]);
});
