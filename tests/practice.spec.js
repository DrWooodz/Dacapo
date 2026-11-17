// Practice: the core first, any key; scale, chords and arpeggios on your terms; one strict check.
import { test, expect } from './fixtures.js';

test.beforeEach(async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
});

test('the core: major and minor in every key; a key opens on its scale, right hand', async ({
  app,
  page,
}) => {
  await page.locator('#tabs [data-view="practice"]').click();
  await expect(page.locator('section.card').first().locator('.moodrow')).toHaveCount(3);
  await page.locator('.keydot[data-mood="harmonic"][data-pc="0"]').click();
  await expect(page.locator('#page h1')).toHaveText('C harmonic minor');
  expect(await app.plan()).toMatchObject({ mode: 'wait', hand: 'rh', hints: true, anyOctave: true });
  expect(await app.waitRep({ gap: 40 })).toBe('Clean.');
});

test('help is yours to switch; nothing moves on by itself', async ({ app, page }) => {
  await app.eval(() => window.DaCapo.go('practice', { mood: 'dorian', pc: 2 }));
  await page.locator('[data-help="keys"]').click();
  await page.locator('[data-help="fingers"]').click();
  expect(await app.plan()).toMatchObject({ hints: false, fingers: false });
  await expect(page.locator('#plStaff .fing')).toHaveCount(0);
  await page.locator('[data-seg="prHand"] [data-v="lh"]').click();
  expect(await app.plan()).toMatchObject({ hand: 'lh' });
  await page.locator('[data-help="tempo"]').click();
  expect(await app.plan()).toMatchObject({ mode: 'tempo', bpm: 60 });
  await page.locator('[data-bpm="5"]').click();
  expect(await app.plan()).toMatchObject({ bpm: 65 });
  await page.locator('[data-seg="prOct"] [data-v="2"]').click();
  expect((await app.eval(() => window.__t.steps())).length).toBe(29);
});

test('any octave counts, unless you ask for the exact one', async ({ app, page }) => {
  await app.eval(() => window.DaCapo.go('practice', { mood: 'major', pc: 0 }));
  expect(await app.eval(() => window.__t.waitPhase('ready', 6000))).toBe(true);
  // the C major scale an octave lower than written: still clean
  await app.eval(async () => {
    for (const s of window.__t.steps()) {
      window.__t.noteOn(s.midis[0] - 12);
      await window.__t.sleep(30);
      window.__t.noteOff(s.midis[0] - 12);
    }
  });
  expect(await app.eval(() => window.__t.waitPhaseNot('wait'))).toBe(true);
  expect(await app.message()).toBe('Clean.');
  await page.locator('[data-help="exactOctave"]').click();
  expect(await app.plan()).toMatchObject({ anyOctave: false });
  expect(await app.eval(() => window.__t.waitPhase('ready', 6000))).toBe(true);
  await app.eval(() => window.__t.noteOn(48));
  expect(await app.message()).toBe('That was C3. Start on C4 (1).');
});

test('a check is strict: both hands, two octaves, no help, the exact octave; one pass makes it known', async ({
  app,
  page,
}) => {
  await app.eval(() => window.DaCapo.go('practice', { mood: 'dorian', pc: 2 }));
  await page.locator('#prCheck').click();
  expect(await app.plan()).toMatchObject({
    mode: 'wait',
    hand: 'ht',
    hints: false,
    fingers: false,
    anyOctave: false,
  });
  expect((await app.eval(() => window.__t.steps())).length).toBe(29);
  expect(await app.waitRep({ wrongAt: 5, gap: 40 })).toMatch(/Not this time/);
  expect(await app.waitRep({ gap: 40 })).toBe('Check passed: D Dorian is known.');
  await page.locator('#prCancel').click();
  await expect(page.locator('#prStatus')).toContainText('known');
  await page.locator('#prBack').click();
  await page.locator('details.family summary', { hasText: 'Bittersweet' }).click();
  await expect(page.locator('.moodrow', { hasText: 'Dorian' })).toContainText('1 of 12 known');
});

test('chords: a progression, a chord in its inversions, a left-hand pattern; counted apart', async ({
  app,
  page,
}) => {
  await app.eval(() => window.DaCapo.go('practice', { mood: 'natural', pc: 9, step: 'chords' }));
  await page.locator('[data-prog="1"]').click();
  expect((await app.eval(() => window.__t.steps())).length).toBe(4);
  await app.waitRep({ gap: 40 });
  await page.locator('[data-seg="prChordWhat"] [data-v="inv"]').click();
  expect((await app.eval(() => window.__t.steps())).length).toBe(7);
  await app.waitRep({ gap: 40 });
  await page.locator('[data-seg="prChordWhat"] [data-v="lh"]').click();
  await page.locator('[data-lh="alberti"]').click();
  expect(await app.plan()).toMatchObject({ hand: 'lh' });
  await expect(page.locator('[data-seg="prHand"]')).toHaveCount(0);
  await app.waitRep({ gap: 30 });
  await page.locator('[data-seg="prStep"] [data-v="arps"]').click();
  expect((await app.eval(() => window.__t.steps())).length).toBe(7); // A C E A, up and back
  await app.waitRep({ gap: 40 });
  const k = await app.eval(() => window.DaCapo.Store.s.moods.keys['natural:9']);
  expect(k.extra).toEqual({ 'prog1:rh': 1, 'inv0.min:rh': 1, 'lhalberti.1:lh': 1, 'arp0.min:rh': 1 });
  expect(k.checks).toEqual([]);
});

test('around the circle of fifths: home chords a fifth apart, the left hand on the roots', async ({
  app,
  page,
}) => {
  await app.eval(() => window.DaCapo.go('practice', { circle: 1 }));
  expect((await app.eval(() => window.__t.steps())).length).toBe(13);
  await page.locator('[data-seg="prHand"] [data-v="ht"]').click();
  expect((await app.eval(() => window.__t.steps()))[0].midis).toHaveLength(4);
  expect(await app.waitRep({ gap: 40 })).toBe('Clean.');
});

test('a hand that lags in most runs brings advice and a short lesson', async ({ app, page }) => {
  await app.eval(() => {
    const D = window.DaCapo;
    const lag = { lag: { hand: 'lh', ms: 45 } };
    D.Store.s.moods.keys['major:0'] = { checks: [], extra: {}, tech: [lag, {}, lag, lag] };
    D.go('practice', { mood: 'major', pc: 0 });
  });
  await expect(page.locator('#plCue')).toContainText('The left hand is about 45 ms behind the other.');
  await page.locator('#plCue [data-lesson]').click();
  await expect(page.locator('.sheet')).toContainText(/together/i);
});

test('the technique report finds a lagging hand in MIDI timing', async ({ app, page }) => {
  await app.eval(() => window.DaCapo.go('practice', { mood: 'major', pc: 0 }));
  await page.locator('[data-seg="prHand"] [data-v="ht"]').click();
  await page.locator('[data-help="tempo"]').click();
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
  const tech = await app.eval(() => window.DaCapo.Store.s.moods.keys['major:0'].tech);
  expect(tech[tech.length - 1].lag).toMatchObject({ hand: 'lh' });
});
