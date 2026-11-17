// Recording yourself: what was played, read back correctly whatever the sustain pedal does.
import { test, expect } from './fixtures.js';
import { readTake } from '../src/js/music/takeread.js';

// eight notes, each key held 150 ms, 400 ms apart
const run = (t0 = 0) =>
  [60, 64, 67, 72, 71, 67, 64, 60].flatMap((m, i) => [
    [t0 + i * 400, 'n', m, 80],
    [t0 + i * 400 + 150, 'f', m],
  ]);

test('without the pedal, each note lasts as long as its key is down', () => {
  const { notes, pedal } = readTake(run());
  expect(notes.map(n => [n.t, n.m, n.key, n.dur])).toEqual(
    [60, 64, 67, 72, 71, 67, 64, 60].map((m, i) => [i * 400, m, 150, 150]),
  );
  expect(pedal).toEqual([]);
});

test('with the pedal held all the way, every note is still there where it was played', () => {
  const ev = [[-250, 'p', 1], ...run()];
  const { notes, pedal, dur } = readTake(ev);
  expect(notes).toHaveLength(8);
  expect(notes.map(n => n.t)).toEqual([0, 400, 800, 1200, 1600, 2000, 2400, 2800]);
  // the key length is what you pressed; the ringing lasts to the end (the pedal never came up)
  notes.forEach(n => expect(n.key).toBe(150));
  // the same key struck again stops the earlier one (G and E are played twice)
  const gs = notes.filter(n => n.m === 67);
  expect(gs[0].dur).toBe(gs[1].t - gs[0].t);
  expect(notes.at(-1).t + notes.at(-1).dur).toBe(dur);
  // the pedal counts from the first note
  expect(pedal).toEqual([[0, run().at(-1)[0] + 400]]);
});

test('lifting the pedal stops the notes it was holding, but not a key still down', () => {
  const ev = [
    [0, 'p', 1],
    [0, 'n', 48, 80],
    [100, 'n', 60, 80],
    [200, 'f', 60],
    [500, 'p', 0],
    [800, 'f', 48],
  ];
  const { notes } = readTake(ev);
  const by = m => notes.find(n => n.m === m);
  expect(by(60)).toMatchObject({ key: 100, dur: 400 });
  expect(by(48)).toMatchObject({ key: 800, dur: 800 });
});

test('in the app: a take with the pedal held shows every note, and the pedal at most 100%', async ({
  app,
  page,
}) => {
  await app.connectPiano();
  await app.onboard();
  await page.locator('#plyTakesBox').evaluate(d => (d.open = true));
  await page.locator('#tkRec').click();
  await app.eval(async () => {
    const T = window.__t;
    T.send(0xb0, 64, 127);
    for (const m of [60, 64, 67, 72, 71, 67, 64, 60]) {
      await T.sleep(200);
      T.send(0x90, m, 80);
      await T.sleep(120);
      T.send(0x80, m, 0);
    }
    await T.sleep(200);
  });
  await page.locator('#tkRec').click();
  await expect(page.locator('.take .small').first()).toContainText('8 notes');
  await expect(page.locator('.take .small').first()).toContainText('pedal down 100%');
  // one solid block per key press, each with its faint pedal tail
  await expect(page.locator('svg.roll rect.key')).toHaveCount(8);
  expect(await page.locator('svg.roll rect.ring').count()).toBeGreaterThanOrEqual(6);
});
