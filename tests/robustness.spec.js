// Things that go wrong at the piano: errors, the microphone, sound that needs a tap.
import { test, expect } from './fixtures.js';

test('an error in a handler is logged and offered for a report, and the app carries on', async ({
  app,
  page,
}) => {
  app.allowErrors(/boom test/);
  await app.connectPiano();
  await app.onboard();
  await app.song('p:satie-gym-1:0');
  await app.eval(() => {
    const off = window.DaCapo.Input.on(() => {
      throw new Error('boom test');
    });
    window.__t.noteOn(30); // a note that is in no drill, so the rep does not start
    window.__t.noteOff(30);
    off();
  });
  expect(await app.loggedErrors()).toEqual(['note listener: boom test']);
  await expect(page.locator('.toast')).toContainText('Something went wrong. It was logged.');
  expect(await app.waitRep()).toBe('Clean. Once more, without the key hints.');
});

test('with the microphone, chord drills are practice only', async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
  await app.eval(() => (window.DaCapo.Input.mode = 'mic'));
  await app.song('p:satie-gym-1:0');
  expect(await app.eval(() => window.__t.waitPhase('ready', 6000))).toBe(true);
  await app.eval(async () => {
    for (const s of window.__t.steps()) {
      window.DaCapo.Input.emit({ m: s.midis[0], vel: 0.6, t: performance.now(), src: 'mic' });
      await window.__t.sleep(80);
    }
  });
  await app.page.waitForTimeout(300);
  expect(await app.message()).toBe('Clean. (Practice only: connect your piano to count it.)');
});

test('when the browser blocks sound, the metronome waits for one tap', async ({ app, page }) => {
  await app.eval(async () => {
    const ctx = window.DaCapo.AudioEngine.ensure();
    await ctx.suspend();
    const resume = ctx.resume.bind(ctx);
    ctx.resume = () => (window.__allow ? resume() : Promise.resolve());
    window.addEventListener('pointerdown', () => (window.__allow = true), { capture: true });
  });
  await app.connectPiano();
  await app.eval(() => {
    const D = window.DaCapo;
    D.Store.s.profile.onboarded = true;
    D.ensureItem('p:satie-gym-1:1');
    Object.assign(D.Store.s.items['p:satie-gym-1:1'], { stage: 'tempo', phase: null });
    D.go('songs', { pid: 'satie-gym-1', item: 'p:satie-gym-1:1' });
  });
  await expect.poll(() => app.phase()).toBe('needsound');
  expect(await app.message()).toMatch(/^Tap the screen once to switch on the metronome/);
  await app.eval(() => window.__t.noteOn(60));
  await page.waitForTimeout(300);
  expect(await app.phase()).toBe('needsound');
  await page.locator('#page').click({ position: { x: 100, y: 40 } });
  await expect.poll(() => app.phase()).toBe('countin');
});

test('with the microphone chosen, notes from a connected keyboard are ignored', async ({ app }) => {
  await app.connectPiano();
  const heard = await app.eval(() => {
    const D = window.DaCapo;
    D.Input.mode = 'mic';
    let n = 0;
    const off = D.Input.on(() => n++);
    D.Input.onMidi({ data: [0x90, 60, 80], timeStamp: performance.now() });
    D.Input.mode = 'midi';
    D.Input.onMidi({ data: [0x90, 62, 80], timeStamp: performance.now() });
    off();
    return n;
  });
  expect(heard).toBe(1);
});
