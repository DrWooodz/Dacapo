// Integration: cold checks on two different days, then spaced reviews.
import { test, expect } from './fixtures.js';

// make r:r1 ready for a cold check, as if the last session was yesterday
const yesterday = (app, passes) =>
  app.eval(passes => {
    const D = window.DaCapo;
    const y = D.addDays(D.todayKey(), -1);
    const it = D.Store.s.items['r:r1'] || (D.ensureItem('r:r1'), D.Store.s.items['r:r1']);
    Object.assign(it, { stage: 'check', phase: null, pace: 800, passes: passes ? [y] : [], lastCold: y });
    D.Store.s.session.day = y;
    D.Store.save();
    D.go('practice');
  }, passes);

test.beforeEach(async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
});

test('two clean cold checks on different days integrate an item', async ({ app }) => {
  await yesterday(app, false);
  expect((await app.session())[0]).toBe('check r:r1');
  expect(await app.plan()).toMatchObject({ cold: true, hints: false, mode: 'wait', paced: true });
  expect(await app.waitRep({ gap: 80 })).toBe(
    "Clean cold check. One more on another day and it's integrated.",
  );

  await yesterday(app, true);
  expect(await app.waitRep({ gap: 80 })).toMatch(/^Clean cold, on a second day: integrated\./);
  const it = await app.item('r:r1');
  expect(it).toMatchObject({ stage: 'done', ivl: 3 });
  expect(it.due).toBe(await app.eval(() => window.DaCapo.addDays(window.DaCapo.todayKey(), 3)));
  expect(await app.eval(() => window.DaCapo.skillStatus('treble').focus)).toBe('r:r3');
});

test('a failed cold check resets the count; a warm run afterwards does not count', async ({ app }) => {
  await yesterday(app, true);
  expect(await app.waitRep({ gap: 80, wrongAt: 2 })).toMatch(/^Not clean cold yet/);
  expect(await app.item('r:r1')).toMatchObject({ stage: 'check', passes: [] });
  expect(await app.waitRep({ gap: 80 })).toBe('Clean (warm). The cold check next session is what counts.');
  expect((await app.item('r:r1')).passes).toEqual([]);
});

test('a due review that holds doubles the interval', async ({ app }) => {
  await app.eval(() => {
    const D = window.DaCapo;
    D.ensureItem('r:r1');
    Object.assign(D.Store.s.items['r:r1'], {
      stage: 'done',
      phase: null,
      ivl: 3,
      due: D.todayKey(),
      lastCold: D.addDays(D.todayKey(), -3),
    });
    D.Store.s.session = null;
    D.Store.save();
    D.go('practice');
  });
  expect(await app.session()).toContain('review r:r1');
  await app.eval(() => {
    const s = window.DaCapo.Store.s.session;
    s.idx = s.list.findIndex(e => e.id === 'r:r1');
    window.DaCapo.go('practice');
  });
  expect(await app.waitRep({ gap: 80 })).toBe('Still clean cold. Next review in 7 days.');
});
