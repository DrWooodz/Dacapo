// Your data: problem reports, backups, erasing progress, and progress kept from older versions.
import { test, expect } from './fixtures.js';

test.beforeEach(async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
});

test('a problem report carries the description, environment and log', async ({ app, page }) => {
  const report = await app.eval(() => window.DaCapo.Log.report('test problem', true));
  expect(report).toMatch(/^DACAPO PROBLEM REPORT/);
  expect(report).toContain('test problem');
  for (const field of ['"ua"', '"input"', '"state"', '"log"', 'view practice'])
    expect(report).toContain(field);

  await app.eval(() => window.DaCapo.reportSheet());
  const download = page.waitForEvent('download');
  await page.locator('#rpSave').click();
  expect((await download).suggestedFilename()).toMatch(/^dacapo-report-.*\.txt$/);
});

test('a backup file restores progress', async ({ app, page }) => {
  await app.waitRep();
  await app.eval(() => window.DaCapo.settingsSheet());
  const download = page.waitForEvent('download');
  await page.locator('#sBackup').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^dacapo-backup-\d{4}-\d\d-\d\d\.json$/);
  const items = await app.eval(() => Object.keys(window.DaCapo.Store.s.items).length);

  await app.eval(() => {
    window.DaCapo.Store.s.items = {};
    window.DaCapo.Store.save();
  });
  await page.setInputFiles('#sRestore', await file.path());
  await expect
    .poll(() => app.eval(() => Object.keys(window.DaCapo.Store.s.items).length))
    .toBeGreaterThanOrEqual(items);
  expect((await app.item('r:r1')).pc).toBe(1);
});

test('erasing progress takes two taps and keeps settings', async ({ app, page }) => {
  await app.waitRep();
  await app.eval(() => (window.DaCapo.Store.s.settings.volume = 0.42));
  await app.eval(() => window.DaCapo.settingsSheet());
  await page.locator('details summary', { hasText: 'Start over' }).click();
  await page.locator('#sReset').click();
  await expect(page.locator('#sReset')).toHaveText('Tap again to erase');
  expect(await app.item('r:r1')).toBeTruthy();
  await page.locator('#sReset').click();
  expect(await app.eval(() => Object.keys(window.DaCapo.Store.s.items).length)).toBe(0);
  expect(await app.eval(() => window.DaCapo.Store.s.settings.volume)).toBe(0.42);
  await expect(page.locator('#page')).toContainText('Welcome');
});

test('progress from version 3 carries over: tracks become areas, the active piece is worked on', async ({
  app,
  page,
}) => {
  await app.eval(() => {
    const D = window.DaCapo;
    const y = D.addDays(D.todayKey(), -1);
    const v3 = {
      v: 3,
      savedAt: Date.now(),
      settings: { volume: 0.5, seenVersion: '0.9' },
      profile: { favorites: ['satie'], tracks: { improv: false }, onboarded: true },
      piece: { active: 'satie-gym-1' },
      items: {
        // note reading used to be played with the metronome; it now trains speed per note
        'r:r1': { stage: 'tempo', phase: null, bpm: 52, target: 60, reps: 30, clean: 20, log: [], last: y },
        'p:satie-gym-1:0': { stage: 'check', phase: null, bpm: 60, target: 60, passes: [y], log: [] },
      },
      session: { day: y, list: [], idx: 0 },
      days: { [y]: { min: 12, reps: 30, clean: 20 } },
      hist: [],
    };
    localStorage.setItem('dacapo.v1', JSON.stringify(v3));
  });
  await page.reload();
  await page.waitForFunction(() => window.DaCapo && window.DaCapo.Store);
  const s = await app.eval(() => window.DaCapo.Store.s);
  expect(s.v).toBe(4);
  expect(s.profile.areas).toMatchObject({ improv: false, reading: true, theory: true, pieces: true });
  expect(s.profile.tracks).toBeUndefined();
  expect(s.piece.working).toEqual([{ pid: 'satie-gym-1', daily: false }]);
  expect(s.settings.volume).toBe(0.5);
  expect(Object.values(s.days)[0].min).toBe(12);
  await app.connectPiano();
  await app.eval(() => window.DaCapo.go('practice'));
  expect(await app.item('r:r1')).toMatchObject({ stage: 'pace', pace: 1800 });
  expect(await app.session()).toContain('check p:satie-gym-1:0');
});

test('damaged saved data does not stop the app: wrong shapes keep their defaults, items are repaired', async ({
  app,
  page,
}) => {
  await app.eval(() => {
    const broken = {
      v: 4,
      hist: {}, // should be a list
      days: [], // should be a map
      settings: { volume: 'loud' },
      profile: { onboarded: true, areas: 'all' },
      piece: { working: 'x' },
      session: { day: 'x', list: 'y' },
      focus: 'nope',
      items: {
        'r:r1': { stage: 'banana' },
        't:sc:major:C': { stage: 'pace' }, // a scale never trains speed per note
        'h:h1': { stage: 'tempo', answers: 'x' }, // nor does theory use the metronome
        'i:imp:satie': { stage: 'learn' },
      },
    };
    localStorage.setItem('dacapo.v1', JSON.stringify(broken));
  });
  await page.reload();
  await page.waitForFunction(() => window.DaCapo && window.DaCapo.Store);
  await app.connectPiano();
  for (const view of ['practice', 'skills', 'library', 'free']) {
    await app.eval(v => window.DaCapo.go(v), view);
    await expect(page.locator('#page')).not.toContainText('This screen hit a problem');
  }
  const s = await app.eval(() => window.DaCapo.Store.s);
  expect(Array.isArray(s.hist) && !Array.isArray(s.days)).toBe(true);
  expect(s.settings.volume).toBe(0.8);
  expect(s.piece.working).toEqual([]);
  expect(s.items['r:r1'].stage).toBe('learn');
  expect(s.items['t:sc:major:C']).toMatchObject({ stage: 'tempo', bpm: 52 });
  expect(s.items['h:h1']).toMatchObject({ stage: 'pace', answers: [] });
  expect(s.items['i:imp:satie'].stage).toBe('create');
});
