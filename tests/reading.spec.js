// Note reading: wait mode, then speed per note (no metronome); fair judging of pauses and octaves.
import { test, expect } from './fixtures.js';

test.beforeEach(async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
});

test('three clean lines, then a speed goal per note instead of the metronome', async ({ app }) => {
  expect(await app.plan()).toMatchObject({ mode: 'wait', hints: false });
  expect(await app.waitRep({ gap: 120 })).toMatch(/^Clean line \(1 of 3\), 0\.\d s per note\.$/);
  expect(await app.waitRep({ gap: 120 })).toMatch(/^Clean line \(2 of 3\)/);
  // the goal starts from the speed you already read at, within the unit's range (0.8 to 1.8 s)
  expect(await app.waitRep({ gap: 120 })).toBe(
    'Three clean lines. Now for speed: aim for under 0.8 s per note.',
  );
  expect(await app.item('r:r1')).toMatchObject({ stage: 'pace', pace: 800 });
  expect(await app.nextPlan('r:r1')).toMatchObject({ mode: 'wait', paced: true, pace: 800 });
  await expect(app.page.locator('#plInfo')).toContainText('Goal 0.8 s per note');
});

test('two lines out of three on pace tighten the goal', async ({ app }) => {
  await app.setItem('r:r1', { stage: 'pace', pace: 1500, phase: null });
  expect(await app.waitRep({ gap: 80 })).toMatch(
    /^On pace: 0\.\d s per note\. One more and the goal tightens\.$/,
  );
  expect(await app.waitRep({ gap: 80 })).toBe('Two lines on pace. New goal: 1.3 s per note.');
  expect((await app.item('r:r1')).pace).toBe(1300);
});

test('at the goal, the item waits for its cold checks', async ({ app }) => {
  await app.setItem('r:r1', { stage: 'pace', pace: 800, phase: null });
  await app.waitRep({ gap: 80 });
  expect(await app.waitRep({ gap: 80 })).toMatch(
    /^Two lines on pace at the goal\. From tomorrow: cold checks/,
  );
  expect((await app.item('r:r1')).stage).toBe('check');
});

test('a long pause is fine in wait mode: the line is still clean', async ({ app }) => {
  expect(await app.eval(() => window.__t.waitPhase('ready', 8000))).toBe(true);
  const steps = await app.eval(() => window.__t.steps());
  await app.eval(([s]) => window.__t.playWait(s.slice(0, 3), 80), [steps]);
  await app.page.waitForTimeout(4600); // longer than the 4 s that counts as a long pause
  await app.eval(([s]) => window.__t.playWait(s.slice(3), 80), [steps]);
  expect(await app.eval(() => window.__t.waitPhaseNot('wait'))).toBe(true);
  expect(await app.message()).toMatch(/^Clean line \(1 of 3\)/);
});

test('the right note in the wrong octave is named, and two misses show the note', async ({ app }) => {
  expect(await app.eval(() => window.__t.waitPhase('ready', 8000))).toBe(true);
  const steps = await app.eval(() => window.__t.steps());
  await app.eval(m => window.__t.playWait([{ midis: [m] }], 80), steps[0].midis[0]);
  await app.eval(m => window.__t.playWait([{ midis: [m] }], 80), steps[1].midis[0] + 12);
  expect(await app.message()).toBe('Right note, an octave higher than written.');
  await app.eval(m => window.__t.playWait([{ midis: [m] }], 80), steps[1].midis[0] - 12);
  expect(await app.message()).toMatch(/^Hint: /);
  await app.eval(([s]) => window.__t.playWait(s.slice(1), 80), [steps]);
  expect(await app.eval(() => window.__t.waitPhaseNot('wait'))).toBe(true);
  expect(await app.message()).toBe('1 wrong note, 1 hint. Next line.');
});

test('bass reading has its own units, on the bass staff', async ({ app }) => {
  await app.practice('r:r2');
  const clefs = await app.eval(() => window.DaCapo.Player.debug.P.drill.steps.map(s => s.notes[0].st));
  expect(new Set(clefs)).toEqual(new Set(['b']));
  expect(await app.eval(() => window.DaCapo.skillStatus('bass').order.slice(0, 3))).toEqual([
    'r:r2',
    'r:r4',
    'r:r6',
  ]);
});
