// Technique: a probe, hands separately with fading key hints, then tempo; fair judging; advice from MIDI.
import { test, expect } from './fixtures.js';

const ID = 't:sc:major:D';

test.beforeEach(async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
  await app.practice(ID);
});

test('a failed probe builds the scale hand by hand, then moves to the metronome', async ({ app }) => {
  expect(await app.plan()).toMatchObject({ hand: 'ht', mode: 'wait', hints: false });
  expect(await app.waitRep({ gap: 60, wrongAt: 3 })).toMatch(/right hand first/);

  const seen = [];
  for (let k = 0; k < 8 && (await app.item(ID)).stage === 'learn'; k++) {
    expect(await app.eval(() => window.__t.waitPhase('ready', 8000))).toBe(true);
    const { hand, hints } = await app.plan();
    const message = await app.waitRep({ gap: 50 });
    seen.push(`${hand}${hints ? '+hints' : ''}: ${message}`);
  }
  expect(seen).toEqual([
    'rh+hints: Clean. Once more, without the key hints.',
    'rh: Two clean. Now left hand.',
    'lh+hints: Clean. Once more, without the key hints.',
    'lh: Two clean. Now hands together.',
    'ht+hints: Clean. Once more, without the key hints.',
    'ht: Notes learned. Now with the metronome at ♩ 52.',
  ]);
  expect((await app.item(ID)).stage).toBe('tempo');
  expect((await app.tempoRep({ jitter: 8 })).message).toBe('Clean at ♩ 52. One more moves the tempo up.');
});

test('two clean runs out of three raise the tempo', async ({ app }) => {
  await app.setItem(ID, { stage: 'tempo', phase: null, bpm: 52 });
  await app.tempoRep({ jitter: 8 });
  await app.tempoRep({ jitter: 8, wrong: true });
  expect((await app.tempoRep({ jitter: 8 })).message).toBe('Two clean runs. Tempo up to ♩ 55.');
  expect((await app.item(ID)).bpm).toBe(55);
});

test('wrong notes lower the tempo; uneven timing alone does not', async ({ app }) => {
  await app.setItem(ID, { stage: 'tempo', phase: null, bpm: 52 });
  const skip = [3, 5, 7, 9, 11, 13];
  expect((await app.tempoRep({ jitter: 8, skip })).message).toMatch(/Down to ♩ 47/);
  expect(await app.item(ID)).toMatchObject({ bpm: 47, mess: 1 });
  const uneven = await app.tempoRep({ jitter: 220 });
  expect(uneven.message).toMatch(/^Right notes; the timing was uneven\./);
  expect(await app.item(ID)).toMatchObject({ bpm: 47, mess: 0 });
});

test('playing an octave off is named, and does not count as wrong notes', async ({ app }) => {
  await app.setItem(ID, { stage: 'tempo', phase: null, bpm: 52 });
  const run = await app.tempoRep({ jitter: 8, shift: 12 });
  expect(run.message).toBe(
    'The right notes, but an octave higher than written. Check the clef, then play it there.',
  );
  expect((await app.item(ID)).bpm).toBe(52);
});

test('when nothing moves for a while, the approach changes', async ({ app }) => {
  await app.setItem(ID, {
    stage: 'tempo',
    phase: null,
    bpm: 40,
    since: 9,
    recent: ['m', 'm', 's', 'm', 'c', 'm', 'm'],
  });
  const run = await app.tempoRep({ jitter: 8, skip: [3, 5, 7, 9, 11, 13] });
  expect(run.message).toMatch(/^This has not moved for a while, so let's change the approach/);
  expect(await app.item(ID)).toMatchObject({ stage: 'learn', phase: 'ht', reentry: true, stalls: 1 });
  expect(await app.nextPlan(ID)).toMatchObject({ mode: 'wait', hints: true });
});

test('a hand that lags in most runs brings advice and a short lesson', async ({ app, page }) => {
  const lag = { lag: { hand: 'lh', ms: 45 } };
  await app.setItem(ID, { stage: 'tempo', phase: null, bpm: 52, tech: [lag, {}, lag, lag] });
  await expect(page.locator('#plCue')).toContainText('The left hand is about 45 ms behind the other.');
  await page.locator('#plCue [data-lesson]').click();
  await expect(page.locator('.sheet')).toContainText(/together/i);
});

test('the technique report finds a lagging hand in MIDI timing', async ({ app }) => {
  await app.setItem(ID, { stage: 'tempo', phase: null, bpm: 52 });
  expect(await app.eval(() => window.__t.waitPhase('countin', 10000))).toBe(true);
  // the left hand 50 ms after the right on every step
  await app.eval(async () => {
    const { T } = window.DaCapo.Player.debug;
    for (const s of window.__t.steps()) {
      const t = T.t0 + s.beat * T.msBeat;
      const w = t - performance.now();
      if (w > 0) await window.__t.sleep(w);
      const [rh, lh] = s.midis[0] > s.midis[1] ? s.midis : [s.midis[1], s.midis[0]];
      window.__t.send(0x90, rh, 80, t);
      setTimeout(() => window.__t.send(0x90, lh, 80, t + 50), 50);
      setTimeout(() => s.midis.forEach(m => window.__t.noteOff(m)), 120);
    }
  });
  expect(await app.eval(() => window.__t.waitPhaseNot('tempo'))).toBe(true);
  const tech = (await app.item(ID)).tech;
  expect(tech[tech.length - 1].lag).toMatchObject({ hand: 'lh' });
});

test('arpeggio fingering: the left hand takes 3 on the black-key third of D major', async ({ app }) => {
  await app.setItem('t:ar:major:D', { stage: 'learn', phase: 'lh', hintsOff: false });
  const left = await app.eval(() =>
    window.DaCapo.Player.debug.P.drill.steps.slice(0, 7).map(s => s.notes[0].f),
  );
  expect(left).toEqual([5, 3, 2, 1, 3, 2, 1]);
  await app.setItem('t:ar:major:C', { stage: 'learn', phase: 'lh', hintsOff: false });
  expect(
    await app.eval(() => window.DaCapo.Player.debug.P.drill.steps.slice(0, 4).map(s => s.notes[0].f)),
  ).toEqual([5, 4, 2, 1]);
});
