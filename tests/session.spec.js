// Today's session: built around the week's focus, timeboxed, and picked up again after a reload.
import { test, expect } from './fixtures.js';

test.beforeEach(async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
});

test('the first session: the focus area, the daily piece, then a little upkeep', async ({ app }) => {
  // nothing measured yet, so every area ranks the same and the first (reading) is suggested
  expect(await app.session()).toEqual([
    'focus r:r1',
    'focus r:r2',
    'daily p:satie-gym-1:0',
    'warm t:sc:major:D', // technique starts in the key of the piece you work on
  ]);
});

test('a reload comes back to the same drill', async ({ app, page }) => {
  await app.waitRep({ gap: 120 });
  const before = await app.eval(() => window.DaCapo.Store.s.session);
  await page.reload();
  await page.waitForFunction(() => window.DaCapo && window.DaCapo.Player.debug);
  const after = await app.eval(() => ({
    view: window.DaCapo.UI.view,
    id: window.DaCapo.Player.debug.P.id,
    idx: window.DaCapo.Store.s.session.idx,
  }));
  expect(after).toEqual({ view: 'practice', id: before.list[before.idx].id, idx: before.idx });
  expect((await app.item('r:r1')).pc).toBe(1);
});

test('the time box ends an item; "Keep going" stays on it', async ({ app, page }) => {
  await app.eval(() => (window.DaCapo.Activity.recent += 9 * 60000));
  await app.waitRep({ gap: 80 });
  await expect(page.locator('.goalcard')).toBeVisible();
  await page.locator('#gcStay').click();
  await expect(page.locator('.goalcard')).toHaveCount(0);
  expect(await app.eval(() => window.DaCapo.Player.debug.P.id)).toBe('r:r1');
});

test('after the goal card, the next item starts by itself', async ({ app, page }) => {
  await app.eval(() => (window.DaCapo.Activity.recent += 9 * 60000));
  await app.waitRep({ gap: 80 });
  await expect(page.locator('.goalcard')).toBeVisible();
  await expect.poll(() => app.eval(() => window.DaCapo.Player.debug.P.id), { timeout: 9000 }).toBe('r:r2');
  expect(await app.eval(() => window.DaCapo.Store.s.session.list[0].state)).toBe('done');
});

test('a finished session shows a summary', async ({ app, page }) => {
  await app.eval(() => {
    window.DaCapo.Store.s.session.list.forEach(e => (e.state = 'done'));
    window.DaCapo.Store.save();
    window.DaCapo.go('practice');
  });
  await expect(page.locator('.summary h1')).toHaveText('Session done.');
  await expect(page.locator('#smPieces')).toBeVisible();
});

test('a suggested focus is confirmed with one tap', async ({ app, page }) => {
  await expect(page.locator('.focusbar')).toContainText('Reading');
  await page.locator('[data-focus="keep"]').click();
  await expect(page.locator('.focusbar.compact')).toContainText('Reading');
  expect(await app.eval(() => window.DaCapo.Store.s.focus)).toMatchObject({
    area: 'reading',
    confirmed: true,
  });
});

test('choosing another focus rebuilds the session and teaches the suggestions', async ({ app, page }) => {
  await page.locator('[data-focus="change"]').first().click();
  await expect(page.locator('.sheet [data-area="reading"]')).toContainText('suggested');
  await page.locator('.sheet [data-area="technique"]').click();
  const list = await app.session();
  expect(list.filter(e => e.startsWith('focus'))).toEqual(['focus t:sc:major:D']);
  expect(list).toContain('daily p:satie-gym-1:0');
  const weights = await app.eval(() => window.DaCapo.Store.s.profile.weights);
  expect(weights.technique).toBeCloseTo(1.1);
  expect(weights.reading).toBeCloseTo(0.95);
  expect(await app.eval(() => window.DaCapo.Player.debug.P.id)).toBe('t:sc:major:D');
});

test('what matters to you shapes the first suggestion', async ({ app, page }) => {
  await app.eval(() => {
    window.DaCapo.Store.s.profile.onboarded = false;
    window.DaCapo.go('practice');
  });
  await app.onboard(null, { matters: ['theory'] });
  expect(await app.eval(() => window.DaCapo.currentFocus().area)).toBe('theory');
  await expect(page.locator('.focusbar')).toContainText('Theory matters to you.');
  expect((await app.session())[0]).toBe('focus h:h1');
});

test('a practice day runs from 4 am to 4 am, so a session past midnight stays one day', async ({
  app,
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-02T23:50:00'));
  expect(await app.eval(() => window.DaCapo.todayKey())).toBe('2026-11-02');
  await page.clock.setFixedTime(new Date('2026-11-03T00:30:00'));
  expect(await app.eval(() => window.DaCapo.todayKey())).toBe('2026-11-02');
  await page.clock.setFixedTime(new Date('2026-11-03T04:30:00'));
  expect(await app.eval(() => window.DaCapo.todayKey())).toBe('2026-11-03');
});

test('with Pieces switched off, a daily piece stays out of the session', async ({ app }) => {
  await app.eval(() => {
    const S = window.DaCapo.Store;
    S.s.profile.areas.pieces = false;
    S.s.session = null;
    S.save();
    window.DaCapo.go('practice');
  });
  expect((await app.session()).some(e => e.includes('satie-gym-1'))).toBe(false);
});

test('the suggested focus is an area with something new to learn', async ({ app }) => {
  await app.eval(() => {
    const D = window.DaCapo;
    // in both clefs, two units wait for their cold checks, so nothing new opens in reading
    for (const id of ['r:r1', 'r:r3', 'r:r2', 'r:r4']) {
      D.ensureItem(id);
      Object.assign(D.Store.s.items[id], { stage: 'check', passes: [], lastCold: D.todayKey() });
    }
    D.Store.s.focus = null;
  });
  const ranked = await app.eval(() => window.DaCapo.rankAreas().map(r => r.area));
  expect(ranked).not.toContain('reading');
  expect(await app.eval(() => window.DaCapo.currentFocus().area)).not.toBe('reading');
});
