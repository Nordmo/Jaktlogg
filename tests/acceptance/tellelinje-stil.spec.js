import { test, expect } from '@playwright/test';

// Akseptansetester for docs/specs/tellelinje-stil.md. Kjører i lokal modus med de tre eksempelturene
// og sesong «Alle».
/* global document, getComputedStyle -- nettleserglobaler, brukes inne i evaluate */

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#lLocal').click();
  await expect(page.locator('.trip')).toHaveCount(3, { timeout: 30_000 });
});

const count = page => page.locator('#tripCount');
const eyebrow = page => page.locator('#pane-log .eyebrow:not(#tripCount)').first();
const css = (loc, props) => loc.evaluate((el, props) => { const s = getComputedStyle(el); return Object.fromEntries(props.map(p => [p, s.getPropertyValue(p)])); }, props);
// Loddrett avstand fra bunnen av tellelinjen til toppen av første turkort.
const gapBelow = page => page.evaluate(() => document.querySelector('.trip').getBoundingClientRect().top - document.querySelector('#tripCount').getBoundingClientRect().bottom);

test('AK1: tellelinjen viser «3 turer» med små bokstaver', async ({ page }) => {
  expect(await count(page).evaluate(el => el.innerText)).toBe('3 turer');
  expect((await css(count(page), ['text-transform']))['text-transform']).toBe('none');
});

test('AK2: tellelinjen har normal bokstavavstand', async ({ page }) => {
  expect(['normal', '0px']).toContain((await css(count(page), ['letter-spacing']))['letter-spacing']);
});

test('AK3: samme skrift, størrelse og farge som «Jaktlogg»-linjen', async ({ page }) => {
  const props = ['font-family', 'font-size', 'color'];
  await expect(eyebrow(page)).toHaveText('Jaktlogg');
  expect(await css(count(page), props)).toEqual(await css(eyebrow(page), props));
});

test('AK4: 26 px fra tellelinjen til første turkort', async ({ page }) => {
  expect(Math.abs(await gapBelow(page) - 26)).toBeLessThanOrEqual(1);
});

// Elementet rett før tellelinjen er det synlige elementet som ligger nærmest over den, uansett rekkefølge i markupen.
test('AK5: 18 px over tellelinjen, som før', async ({ page }) => {
  const gap = await page.evaluate(() => {
    const c = document.querySelector('#tripCount'), top = c.getBoundingClientRect().top;
    const above = [...c.parentElement.children].map(e => e.getBoundingClientRect()).filter(r => r.height > 0 && r.bottom <= top + 1);
    return top - Math.max(...above.map(r => r.bottom));
  });
  expect(Math.abs(gap - 18)).toBeLessThanOrEqual(1);
});

test('AK6: «Jaktlogg»-linjen har fortsatt store bokstaver', async ({ page }) => {
  expect((await css(eyebrow(page), ['text-transform']))['text-transform']).toBe('uppercase');
});

test('AK7: sesong 2025 viser «2 av 3 turer» med samme luft under', async ({ page }) => {
  await page.locator('#seasons button[data-s="2025/26"]').click();
  await expect(count(page)).toHaveText('2 av 3 turer');
  expect(await count(page).evaluate(el => el.innerText)).toBe('2 av 3 turer');
  expect(Math.abs(await gapBelow(page) - 26)).toBeLessThanOrEqual(1);
});

test('AK8: ingen JavaScript-feil', async ({ page }) => {
  await page.locator('#seasons button[data-s="2025/26"]').click();
  await page.locator('#seasons button[data-s="all"]').click();
  await expect(count(page)).toHaveText('3 turer');
  expect(errors).toEqual([]);
});
