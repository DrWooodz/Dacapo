// Rhythm reading (any key or a screen tap) and improvisation over a backing.
import { test, expect } from './fixtures.js';

test.beforeEach(async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
});

test('steady rhythm is clean; badly uneven rhythm is not', async ({ app }) => {
  await app.practice('r:ry2');
  expect((await app.tempoRep({ jitter: 10 })).message).toBe('Clean at ♩ 60. One more moves the tempo up.');
  const sloppy = await app.tempoRep({ jitter: 260 });
  expect(sloppy.message).not.toMatch(/^Clean|Two clean/);
});

test('taps on the screen count for rhythm', async ({ app }) => {
  await app.practice('r:ry1');
  expect(await app.eval(() => window.__t.waitPhase('countin', 10000))).toBe(true);
  await app.eval(async () => {
    const { T } = window.DaCapo.Player.debug;
    for (const s of window.__t.steps()) {
      const t = T.t0 + s.beat * T.msBeat;
      const w = t - performance.now();
      if (w > 0) await window.__t.sleep(w);
      window.DaCapo.Input.emit({ m: 60, vel: 0.7, t, src: 'touch-tap' });
    }
  });
  await app.page.waitForTimeout(900);
  expect(await app.message()).toBe('Clean at ♩ 60. One more moves the tempo up.');
  expect(await app.item('r:ry1')).toMatchObject({ stage: 'tempo', recent: ['c'], reps: 1 });
});

test('improvising counts minutes and chord tones on strong beats', async ({ app, page }) => {
  await app.practice('i:imp:satie');
  await page.locator('#plGo').click();
  // 14 s of notes every 100 ms: more than the four bars the app needs, and some note always
  // falls within the 150 ms window around each strong beat
  await app.eval(async () => {
    const tones = [74, 78, 81, 79];
    for (let i = 0; i < 140; i++) {
      window.__t.noteOn(tones[i % 4], 70);
      await window.__t.sleep(100);
      window.__t.noteOff(tones[i % 4]);
    }
  });
  await expect(page.locator('#plInfo')).toContainText(/played · \d+% on chord tones/);
  await page.locator('#plGo').click();
  expect(await app.message()).toMatch(/^Saved\./);
  const it = await app.item('i:imp:satie');
  expect(it.mins).toBeGreaterThan(0);
  expect(it.land).toBeGreaterThanOrEqual(0);
  expect(it.land).toBeLessThanOrEqual(100);
});

test('improvising on the screen keys is practice only: the minutes do not count', async ({ app, page }) => {
  await app.practice('i:imp:satie');
  await page.locator('#plGo').click();
  await app.eval(async () => {
    for (let i = 0; i < 20; i++) {
      window.DaCapo.Input.emit({ m: 74, vel: 0.6, t: performance.now(), src: 'touch' });
      await window.__t.sleep(100);
      window.DaCapo.Input.emitOff({ m: 74, t: performance.now(), src: 'touch' });
    }
  });
  await page.locator('#plGo').click();
  expect(await app.message()).toBe('Practice only: connect your piano to count the time.');
  expect(((await app.item('i:imp:satie')) || {}).mins || 0).toBe(0);
});
