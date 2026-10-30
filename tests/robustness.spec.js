// Things that go wrong at the piano: errors, the microphone, sound that needs a tap, and Free play.
import { test, expect } from './fixtures.js';

test('an error in a handler is logged and offered for a report, and the app carries on', async ({
  app,
  page,
}) => {
  app.allowErrors(/boom test/);
  await app.connectPiano();
  await app.onboard();
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
  expect(await app.waitRep()).toMatch(/^Clean line \(1 of 3\)/);
});

test('with the microphone, chord drills are practice only', async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
  await app.eval(() => (window.DaCapo.Input.mode = 'mic'));
  await app.practice('p:satie-gym-1:0');
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
    D.ensureItem('t:sc:major:A');
    Object.assign(D.Store.s.items['t:sc:major:A'], { stage: 'tempo', phase: null });
    D.go('practice', { item: 't:sc:major:A' });
  });
  await expect.poll(() => app.phase()).toBe('needsound');
  expect(await app.message()).toMatch(/^Tap the screen once to switch on the metronome/);
  await app.eval(() => window.__t.noteOn(60));
  await page.waitForTimeout(300);
  expect(await app.phase()).toBe('needsound');
  await page.locator('#page').click({ position: { x: 100, y: 40 } });
  await expect.poll(() => app.phase()).toBe('countin');
});

test('Free play names chords and shows every tab', async ({ app, page }) => {
  await app.connectPiano();
  await app.onboard();
  await app.eval(() => window.DaCapo.go('free', { tab: 'live' }));
  await app.eval(() => [60, 64, 67].forEach(m => window.__t.noteOn(m)));
  await expect(page.locator('#lvChord')).toHaveText('C');
  await app.eval(() => [60, 64, 67].forEach(m => window.__t.noteOff(m)));
  for (const tab of ['Improvise', 'Record', 'Metronome', 'Listen']) {
    await page.locator('[data-seg="ftab"] button', { hasText: tab }).click();
    await expect(page.locator('#fBody')).not.toBeEmpty();
  }
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
