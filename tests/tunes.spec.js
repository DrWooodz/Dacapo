// Tunes: public-domain melodies with their chords. Listed once, in two arrangements; chord symbols on the
// score; and a way to noodle over the chords in Play.
import { test, expect } from './fixtures.js';

test.beforeEach(async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
});

test('a tune is listed once, with a switch to its four-part setting', async ({ page }) => {
  await page.locator('#tabs [data-view="songs"]').click();
  await page.locator('[data-seg="sgShelf"] [data-v="tunes"]').click();
  await expect(page.locator('[data-open="tune-greensleeves"]')).toHaveCount(1);
  await expect(page.locator('[data-open="tune-greensleeves-4"]')).toHaveCount(0);
  await page.locator('[data-open="tune-greensleeves"]').click();
  await expect(page.locator('.sheet')).toContainText('Open Hymnal Project');
  await page.locator('[data-arr="tune-greensleeves-4"]').click();
  await expect(page.locator('[data-arr="tune-greensleeves-4"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#psGo').click();
  await expect(page.locator('#page h1')).toContainText('Greensleeves');
  await expect(page.locator('.pagetitle + .small')).toContainText('Four-part setting');
});

test('the score shows the chord symbols over the melody', async ({ app, page }) => {
  await app.song('p:tune-greensleeves:0');
  const syms = await page.locator('svg.staff .csym').allTextContents();
  expect(syms.slice(0, 2)).toEqual(['Em', 'D']);
  // the steps of a later section carry the chord already sounding when it starts
  const first = await app.eval(() => {
    const L = window.DaCapo.Library;
    const s = L.sections('tune-greensleeves')[1];
    return L.steps('tune-greensleeves', s.a, s.z, 'rh').syms[0];
  });
  expect(first.t).toBe(0);
});

test('noodling over a tune: its mood and key, its chords looping with their numerals', async ({ page }) => {
  await page.locator('#tabs [data-view="songs"]').click();
  await page.locator('[data-seg="sgShelf"] [data-v="tunes"]').click();
  await page.locator('[data-open="tune-greensleeves"]').click();
  await page.locator('#psNoodle').click();
  await expect(page.locator('#plyMood')).toContainText('E');
  await expect(page.locator('#plyBacking')).toContainText('Greensleeves');
  const chips = await page.locator('#plyChords .chip').allTextContents();
  expect(chips[0]).toMatch(/^Em\s+i$/);
  expect(chips[1]).toMatch(/^D\s+♭?VII$/);
  await page.locator('#plySongOff').click();
  await expect(page.locator('#plyBacking')).not.toContainText('Greensleeves');
});
