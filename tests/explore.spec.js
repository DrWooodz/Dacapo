// Explore: find a mood by feel, everything about a mood, the circle of fifths, the ear games, the map.
// Nothing here is recorded as practice.
import { test, expect } from './fixtures.js';
import { afterAnswer, ECHO_LEVELS, judge, makePhrase } from '../src/js/learn/echo.js';

test.beforeEach(async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
  await app.page.locator('#tabs [data-view="explore"]').click();
});

test('by feel: words you type, or tap, rank the moods that sound that way', async ({ page }) => {
  await expect(page.locator('.moodcard')).toHaveCount(17); // every mood, by family
  await page.locator('[data-vibe="brooding"]').click();
  await page.locator('[data-vibe="tragic"]').click();
  await expect(page.locator('#exQ')).toHaveValue('brooding tragic');
  await expect(page.locator('.moodcard').first()).toContainText('Harmonic minor');
  await page.locator('#exQ').fill('dreamy floating');
  await expect(page.locator('.moodcard').first()).toContainText('Whole tone');
  await page.locator('#exQ').fill('dostoevsky');
  await expect(page.locator('#exList')).toContainText('No mood matches those words');
  await page.locator('#exQ').fill('dark');
  await page.locator('.moodcard [data-hear]').first().click();
  await page.locator('.moodcard [data-open]').first().click();
  await expect(page.locator('#page h1')).toHaveText('A natural minor'); // a mood opens in its plainest key
});

test('a mood: its sound, scale, chords, progressions and neighbors; any key; then play or practice it', async ({
  app,
  page,
}) => {
  await app.eval(() => window.DaCapo.go('explore', { mood: 'harmonic', pc: 0 }));
  await expect(page.locator('#page h1')).toHaveText('C harmonic minor');
  await expect(page.locator('#page')).toContainText('Color note: B');
  await expect(page.locator('.chordtable tbody tr')).toHaveCount(7);
  await expect(page.locator('.chordtable tr.sig')).toContainText('G7');
  await page.locator('#mpHearMood').click();
  await page.locator('[data-hearc="4"]').click();
  await page.locator('[data-hearp="0"]').click();
  // neighbors: lower the 7th for natural minor, raise the 6th for melodic minor
  await expect(page.locator('[data-go="natural"]').locator('xpath=..')).toContainText('Lower the 7th');
  await page.locator('[data-go="melodic"]').click();
  await expect(page.locator('#page h1')).toHaveText('C melodic minor');
  await page.locator('.keychips [data-pc="9"]').click();
  await expect(page.locator('#page h1')).toHaveText('A melodic minor');
  await page.locator('#mpPractice').click();
  await expect(page.locator('#page h1')).toHaveText('A melodic minor');
  await expect(page.locator('#tabs [data-view="practice"]')).toHaveAttribute('aria-current', 'page');
  // nothing was recorded by looking
  expect(await app.eval(() => Object.keys(window.DaCapo.Store.s.moods.keys))).toEqual([]);
});

test('the circle of fifths: a key, its signature, its family; hear it, explore it, practice it', async ({
  page,
}) => {
  await page.locator('[data-seg="exTab"] [data-v="circle"]').click();
  await expect(page.locator('.cof .wedge')).toHaveCount(12);
  await expect(page.locator('#exBody h2').first()).toHaveText('C major · A minor');
  await page.locator('.cof [data-cpc="2"]').click();
  await expect(page.locator('#exBody h2').first()).toHaveText('D major · B minor');
  await expect(page.locator('#exBody')).toContainText('2 sharps (F♯ C♯)');
  await expect(page.locator('#exBody')).toContainText('G (IV) and A (V) beside it');
  await expect(page.locator('.wedge.near')).toHaveCount(2);
  await page.locator('[data-prog]').first().click();
  await page.locator('#cfAround').click();
  await page.locator('[data-go="natural"]').click();
  await expect(page.locator('#page h1')).toHaveText('B natural minor');
  await page.locator('#mpBack').click();
  await page.locator('[data-seg="exTab"] [data-v="circle"]').click();
  await page.locator('#cfPractice').click();
  await expect(page.locator('#page h1')).toHaveText('Around the circle of fifths');
});

test('Echo: phrases follow the level, any octave counts, and levels move both ways', () => {
  for (let level = 1; level <= ECHO_LEVELS.length; level++)
    for (let i = 0; i < 50; i++) {
      const p = makePhrase(level);
      expect(p.notes).toHaveLength(ECHO_LEVELS[level - 1].len);
      expect(judge(p, p.notes).ok).toBe(true);
      expect(
        judge(
          p,
          p.notes.map(m => m + 12),
        ).ok,
      ).toBe(true);
    }
  const p = { notes: [60, 62, 64] };
  expect(judge(p, [60, 62])).toMatchObject({ ok: false, wrongAt: -1, partial: true });
  expect(judge(p, [60, 63])).toMatchObject({ ok: false, wrongAt: 1 });
  let g = { level: 1 };
  for (let i = 0; i < 3; i++) g = afterAnswer(g, true);
  expect(g).toMatchObject({ level: 2, best: 2, streak: 0 });
  g = afterAnswer(afterAnswer(g, false), false);
  expect(g).toMatchObject({ level: 1, best: 2 });
});

test('ear: which mood (a phrase, four choices, the giveaway), and Echo (play back what you hear)', async ({
  app,
  page,
}) => {
  await page.locator('[data-seg="exTab"] [data-v="ear"]').click();
  await page.locator('#exEar').click();
  await expect(page.locator('[data-ear]')).toHaveCount(4);
  await page.locator('[data-ear]').first().click();
  await expect(page.locator('#earSay')).toContainText('The giveaway is');
  await expect(page.locator('[data-ear].ok')).toHaveCount(1);
  expect(await app.eval(() => window.DaCapo.Store.s.moods.ear.n)).toBe(1);
  await page.locator('#earNext').click();
  await expect(page.locator('#earSay')).toBeEmpty();
  await app.eval(() => window.DaCapo.closeSheet());
  // Echo: a wrong note shows the phrase and counts as a miss
  await page.locator('#ecGo').click();
  await expect(page.locator('#ecMsg')).toHaveText('Your turn.', { timeout: 5000 });
  await app.eval(() => {
    window.__t.noteOn(61); // C sharp: never the first note at level 1 (C pentatonic, from C)
    window.__t.noteOff(61);
  });
  await expect(page.locator('#ecMsg')).toContainText('It was C');
  expect(await app.eval(() => window.DaCapo.Store.s.games.echo)).toMatchObject({ level: 1, misses: 1 });
});

test('the map: what there is to learn, the core first, and where each part is', async ({ page }) => {
  await page.locator('[data-seg="exTab"] [data-v="map"]').click();
  await expect(page.locator('#exBody h2')).toHaveText(['The core', 'When you want more', 'Beyond DaCapo']);
  await page.locator('.maprow', { hasText: 'Keys and the circle of fifths' }).locator('button').click();
  await expect(page.locator('.cof')).toBeVisible();
});
