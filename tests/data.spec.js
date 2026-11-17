// Your data: problem reports, backups, erasing progress, and progress kept from older versions.
import { test, expect } from './fixtures.js';

test.beforeEach(async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
});

test('a problem report carries the description, environment and log', async ({ app, page }) => {
  await app.song('p:satie-gym-1:0');
  const report = await app.eval(() => window.DaCapo.Log.report('test problem', true));
  expect(report).toMatch(/^DACAPO PROBLEM REPORT/);
  expect(report).toContain('test problem');
  for (const field of ['"ua"', '"input"', '"state"', '"log"', 'view songs']) expect(report).toContain(field);

  await app.eval(() => window.DaCapo.reportSheet());
  const download = page.waitForEvent('download');
  await page.locator('#rpSave').click();
  expect((await download).suggestedFilename()).toMatch(/^dacapo-report-.*\.txt$/);
});

test('a backup file restores progress', async ({ app, page }) => {
  await app.song('p:satie-gym-1:0');
  await app.waitRep();
  await app.eval(() => window.DaCapo.settingsSheet());
  const download = page.waitForEvent('download');
  await page.locator('#sBackup').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^dacapo-backup-\d{4}-\d\d-\d\d\.json$/);

  await app.eval(() => {
    window.DaCapo.Store.s.items = {};
    window.DaCapo.Store.save();
  });
  await page.setInputFiles('#sRestore', await file.path());
  await expect.poll(() => app.eval(() => Object.keys(window.DaCapo.Store.s.items).length)).toBeGreaterThan(0);
  expect((await app.item('p:satie-gym-1:0')).pc).toBe(1);
});

test('erasing progress takes two taps and keeps settings', async ({ app, page }) => {
  await app.song('p:satie-gym-1:0');
  await app.waitRep();
  await app.eval(() => (window.DaCapo.Store.s.settings.volume = 0.42));
  await app.eval(() => window.DaCapo.settingsSheet());
  await page.locator('details summary', { hasText: 'Start over' }).click();
  await page.locator('#sReset').click();
  await expect(page.locator('#sReset')).toHaveText('Tap again to erase');
  expect(await app.item('p:satie-gym-1:0')).toBeTruthy();
  await page.locator('#sReset').click();
  expect(await app.eval(() => Object.keys(window.DaCapo.Store.s.items).length)).toBe(0);
  expect(await app.eval(() => window.DaCapo.Store.s.settings.volume)).toBe(0.42);
  await expect(page.locator('#plyWelcome')).toBeVisible();
});

test('progress from DaCapo 1.x: pieces and moods carry on, the course is kept in the archive', async ({
  app,
  page,
}) => {
  await app.eval(() => {
    const D = window.DaCapo;
    const y = D.addDays(D.todayKey(), -1);
    const v4 = {
      v: 4,
      savedAt: Date.now(),
      settings: { volume: 0.5 },
      profile: { favorites: ['satie'], onboarded: true, areas: { improv: false } },
      piece: { working: [{ pid: 'satie-gym-1', daily: true }] },
      items: {
        'r:r1': { stage: 'pace', reps: 30, log: [] },
        'p:satie-gym-1:0': { stage: 'check', phase: null, bpm: 60, target: 60, passes: [y], log: [] },
        'p:satie-gym-1:1': { stage: 'tempo', phase: null, bpm: 44, target: 60, log: [] },
      },
      session: { day: y, list: [], idx: 0 },
      days: { [y]: { min: 12, reps: 30, clean: 20 } },
      hist: [{ d: y, id: 'r:r1', e: 'done' }],
      path: 'moods',
      moods: {
        keys: { 'dorian:2': { met: y, clean: { rh: 3, lh: 3 }, checks: [y], last: y } },
        sittings: [{ d: y, mood: 'dorian', pc: 2 }],
        prefs: {
          keys: false,
          fingers: true,
          tempo: false,
          bpm: 70,
          octs: 2,
          browse: 'shape',
          mood: 'dorian',
        },
      },
    };
    localStorage.setItem('dacapo.v1', JSON.stringify(v4));
  });
  await page.reload();
  await page.waitForFunction(() => window.DaCapo && window.DaCapo.Store);
  const s = await app.eval(() => window.DaCapo.Store.s);
  expect(s.v).toBe(5);
  expect(s.settings.volume).toBe(0.5);
  expect(s.profile).toEqual({ favorites: ['satie'], onboarded: true });
  expect(s.piece.working).toEqual([{ pid: 'satie-gym-1' }]);
  expect(Object.keys(s.items).sort()).toEqual(['p:satie-gym-1:0', 'p:satie-gym-1:1']);
  expect(s.archive.items['r:r1']).toMatchObject({ stage: 'pace' });
  expect(s.hist).toEqual([]);
  expect(Object.values(s.days)[0].min).toBe(12);
  expect(s.moods.keys['dorian:2']).toMatchObject({ checks: [expect.any(String)] });
  expect(s.moods.prefs).toMatchObject({ keys: false, bpm: 70, octs: 2, exactOctave: false, mood: 'dorian' });
  for (const k of ['session', 'focus', 'path', 'skillHist']) expect(s[k]).toBeUndefined();
  // a cold check from the course is simply at tempo now
  await app.song('p:satie-gym-1:0');
  expect(await app.item('p:satie-gym-1:0')).toMatchObject({ stage: 'done' });
  // a key checked in Moods is known in Practice
  await app.eval(() => window.DaCapo.go('practice'));
  await page.locator('details.family summary', { hasText: 'Bittersweet' }).click();
  await expect(page.locator('.keydot.solid[data-mood="dorian"][data-pc="2"]')).toHaveCount(1);
});

test('damaged saved data does not stop the app: wrong shapes keep their defaults, items are repaired', async ({
  app,
  page,
}) => {
  await app.eval(() => {
    const broken = {
      v: 5,
      hist: {}, // should be a list
      days: [], // should be a map
      settings: { volume: 'loud' },
      profile: { onboarded: true },
      piece: { working: 'x' },
      moods: { keys: [], prefs: 'x', ear: null },
      items: {
        'p:satie-gym-1:0': { stage: 'banana' },
        'p:satie-gym-1:1': { stage: 'tempo', bpm: 'fast', recent: 'x' },
      },
    };
    localStorage.setItem('dacapo.v1', JSON.stringify(broken));
  });
  await page.reload();
  await page.waitForFunction(() => window.DaCapo && window.DaCapo.Store);
  await app.connectPiano();
  for (const view of ['play', 'explore', 'practice', 'songs']) {
    await app.eval(v => window.DaCapo.go(v), view);
    await expect(page.locator('#page')).not.toContainText('This screen hit a problem');
  }
  await app.eval(() => window.DaCapo.go('practice', { mood: 'dorian', pc: 2 }));
  await expect(page.locator('#page')).not.toContainText('This screen hit a problem');
  const s = await app.eval(() => window.DaCapo.Store.s);
  expect(Array.isArray(s.hist) && !Array.isArray(s.days)).toBe(true);
  expect(s.settings.volume).toBe(0.8);
  expect(s.piece.working).toEqual([]);
  expect(s.moods.prefs).toMatchObject({ keys: true, octs: 1 });
  await app.song('p:satie-gym-1:1');
  expect(await app.item('p:satie-gym-1:0')).toMatchObject({ stage: 'tempo' });
  expect(await app.item('p:satie-gym-1:1')).toMatchObject({ stage: 'tempo', recent: [] });
  expect((await app.item('p:satie-gym-1:1')).bpm).toBeGreaterThan(0);
});
