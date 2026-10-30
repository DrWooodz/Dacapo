// The skills graph and the placement check that sets your starting points.
import { test, expect } from './fixtures.js';

test.beforeEach(async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
});

test('levels come from integrated units, one point per tier', async ({ app, page }) => {
  await app.eval(() => {
    const D = window.DaCapo;
    for (const id of ['r:r1', 'r:r3', 'r:r5']) {
      D.ensureItem(id);
      Object.assign(D.Store.s.items[id], { stage: 'done', due: D.addDays(D.todayKey(), 7) });
    }
    D.Store.save();
  });
  expect(await app.eval(() => window.DaCapo.skillLevel('treble'))).toBeCloseTo(1);
  expect(await app.eval(() => window.DaCapo.skillLevel('bass'))).toBe(0);
  // reading is the weaker of the two clefs, so bass now leads the reading focus
  expect((await app.eval(() => window.DaCapo.rankAreas())).find(r => r.area === 'reading').reason).toBe(
    'Bass reading is behind treble, and it holds back both hands together.',
  );
  await page.locator('#tabs [data-view="skills"]').click();
  await expect(page.locator('[data-skill="treble"]')).toContainText('1.0 · Developing');
  await page.locator('[data-skill="treble"]').click();
  await expect(page.locator('.sheet')).toContainText('Tier 2 · Developing');
});

test('switching an area off shows it as off and keeps it out of the session', async ({ app, page }) => {
  await app.eval(() => {
    const S = window.DaCapo.Store;
    S.s.profile.areas.improv = false;
    S.s.profile.areas.technique = false;
    S.s.session = null;
    S.save();
    window.DaCapo.go('practice');
  });
  const ids = (await app.session()).map(e => e.split(' ')[1]);
  expect(ids.some(id => id.startsWith('t:') || id.startsWith('i:'))).toBe(false);
  await page.locator('#tabs [data-view="skills"]').click();
  await expect(page.locator('.skillrow.off', { hasText: 'Technique' })).toContainText('Off');
});

test('the placement check reads, plays a scale, and sets the starting points', async ({ app, page }) => {
  await app.eval(() => window.DaCapo.go('assess'));
  await page.locator('#asGo').click();
  // treble: every note right and quickly
  for (let n = 0; n < 12; n++) {
    const note = page.locator('.assess-note');
    await expect(note).toBeVisible();
    const m = +(await note.getAttribute('data-midi'));
    await app.eval(m => {
      window.__t.noteOn(m);
      window.__t.noteOff(m);
    }, m);
    await page.waitForTimeout(n < 11 ? 520 : 50);
  }
  await expect(page.locator('h1')).toContainText('Reading: bass clef');
  await page.locator('#asSkip').click();
  // C major, right hand, one octave up and down, evenly, after one stray note: it costs one note, not all
  await expect(page.locator('h1')).toContainText('Scale: right hand');
  await app.eval(async () => {
    for (const x of [1, 0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0]) {
      window.__t.noteOn(60 + x);
      await window.__t.sleep(200);
      window.__t.noteOff(60 + x);
    }
  });
  await expect(page.locator('#asMsg')).toContainText('14 of 15 notes right');
  await expect(page.locator('h1')).toContainText('Scale: hands together', { timeout: 4000 });
  await page.locator('#asSkip').click();
  await expect(page.locator('h1')).toContainText('Theory, by playing');
  await page.locator('#asSkip').click();
  await page.waitForTimeout(2600);
  await page.locator('#asSkip').click();
  await expect(page.locator('h1')).toContainText('A steady beat', { timeout: 4000 });
  await page.locator('#asSkip').click();

  await expect(page.locator('h1')).toContainText('Your starting points');
  await expect(page.locator('.assess')).toContainText('Treble reading: secure up to');
  await expect(page.locator('.assess')).toContainText('Scales: C major right hand.');
  for (const id of ['r:r1', 'r:r3', 'r:r5', 'r:r8t']) expect((await app.item(id)).stage, id).toBe('done');
  expect(await app.item('t:sc:major:C')).toMatchObject({ stage: 'learn', phase: 'lh' });
  expect(await app.eval(() => window.DaCapo.skillLevel('treble'))).toBeGreaterThan(1.3);
  await page.locator('#asDone').click();
  expect(await app.eval(() => window.DaCapo.Store.s.focus.confirmed)).toBe(true);
  await expect(page.locator('.offer')).toHaveCount(0); // no more placement offer
});

test('placement from theory answers marks units known up to the first miss', async ({ app }) => {
  const done = await app.eval(() =>
    window.DaCapo.applyPlacement({
      reading: {},
      theory: [
        { unit: 'h1', ok: true },
        { unit: 'h5', ok: true },
        { unit: 'h2', ok: false },
        { unit: 'h4', ok: true },
      ],
      pulse: { sd: 0.05 },
    }),
  );
  // h5 and h4 were right too, but h2 comes before them and was missed: only h1 counts as known
  expect(done).toEqual(['h:h1']);
  expect(await app.eval(() => window.DaCapo.skillLevel('steadiness'))).toBeCloseTo(2.5);
});
