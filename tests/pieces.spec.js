// Songs: learning a piece a section at a time, hand by hand, then up to tempo, then the whole piece.
import { test, expect } from './fixtures.js';

test.beforeEach(async ({ app }) => {
  await app.connectPiano();
  await app.onboard();
});

test('learning a piece from the shelf: its page opens on the first section', async ({ app, page }) => {
  await page.locator('#tabs [data-view="songs"]').click();
  await page.locator('[data-seg="sgShelf"] [data-v="chopin"]').click();
  await page.locator('[data-open="chopin-p4"]').click();
  await page.locator('#psHear').click();
  await page.locator('#psGo').click();
  await expect(page.locator('#page h1')).toContainText('Prelude');
  expect(await app.eval(() => window.DaCapo.Store.s.piece.working)).toEqual([{ pid: 'chopin-p4' }]);
  expect(await app.eval(() => window.DaCapo.Player.debug.P.id)).toBe('p:chopin-p4:0');
  // Songs lists it, with its sections
  await page.locator('#tabs [data-view="songs"]').click();
  await expect(page.locator('.workrow')).toHaveCount(1);
  await expect(page.locator('.workrow')).toContainText('0 of');
});

test('a section is learned hand by hand, then together', async ({ app }) => {
  const id = 'p:satie-gym-1:1';
  await app.song(id);
  expect(await app.eval(id => window.DaCapo.itemDef(id).phases, id)).toEqual(['rh', 'lh', 'ht']);
  expect(await app.plan()).toMatchObject({ hand: 'rh', mode: 'wait', hints: true });
  expect(await app.waitRep()).toBe('Clean. Once more, without the key hints.');
  expect(await app.waitRep()).toBe('Two clean. Now left hand.');

  await app.setItem(id, { phase: 'ht', pc: 0 });
  const steps = await app.eval(() => window.__t.steps());
  expect(steps.some(s => s.midis.length > 1)).toBe(true);
  expect(await app.waitRep()).toBe('Clean. Once more, without the key hints.');
  expect(await app.waitRep()).toBe('Notes learned. Now with the metronome at ♩ 36.');
});

test('tempo practice starts one bar early, to practice the join; two clean of three raise it', async ({
  app,
}) => {
  await app.setItem('p:satie-gym-1:1', { stage: 'tempo', phase: null });
  const drill = await app.eval(() => {
    const { a, z, lead, meter } = window.DaCapo.Player.debug.P.drill;
    return { a, z, lead, meter };
  });
  expect(drill).toEqual({ a: 3, z: 8, lead: 3, meter: [3, 4] });
  expect((await app.tempoRep({ jitter: 15 })).message).toBe('Clean at ♩ 36. One more moves the tempo up.');
  expect((await app.tempoRep({ jitter: 15 })).message).toBe('Two clean runs. Tempo up to ♩ 39.');
});

test('wrong notes lower the tempo; uneven timing alone does not', async ({ app }) => {
  const id = 'p:satie-gym-1:1';
  await app.setItem(id, { stage: 'tempo', phase: null, bpm: 52 });
  expect((await app.tempoRep({ jitter: 8, skip: [1, 3, 5, 7] })).message).toMatch(/Down to ♩ 47/);
  expect(await app.item(id)).toMatchObject({ bpm: 47, mess: 1 });
  const uneven = await app.tempoRep({ offsets: [0, 380, -320, 360] });
  expect(uneven.message).toMatch(/^Right notes; the timing was uneven\./);
  expect(await app.item(id)).toMatchObject({ bpm: 47, mess: 0 });
});

test('playing an octave off is named, and does not count as wrong notes', async ({ app }) => {
  const id = 'p:satie-gym-1:1';
  await app.setItem(id, { stage: 'tempo', phase: null, bpm: 52 });
  const run = await app.tempoRep({ jitter: 8, shift: 12 });
  expect(run.message).toMatch(/an octave higher than written/);
  expect(await app.item(id)).toMatchObject({ bpm: 52 });
});

test('at the target tempo, two clean runs and a section is at tempo; then the whole piece', async ({
  app,
  page,
}) => {
  const id = 'p:satie-gym-1:1';
  const target = await app.eval(id => window.DaCapo.itemDef(id).target, id);
  await app.setItem(id, { stage: 'tempo', phase: null, bpm: target });
  await app.tempoRep({ jitter: 10 });
  expect((await app.tempoRep({ jitter: 10 })).message).toBe(
    'Two clean runs at the target tempo: this one is at tempo.',
  );
  expect(await app.item(id)).toMatchObject({ stage: 'done' });
  await expect(page.locator('.secbtn.done')).toHaveCount(1);
  // every section at tempo: the whole piece is next
  await app.eval(() => {
    const D = window.DaCapo;
    for (const k of Object.keys(D.Library.sections('satie-gym-1'))) {
      const id = `p:satie-gym-1:${k}`;
      if (D.itemDef(id)) {
        D.ensureItem(id);
        D.Store.s.items[id].stage = 'done';
      }
    }
    D.Store.save();
    D.go('songs', { pid: 'satie-gym-1' });
  });
  expect(await app.eval(() => window.DaCapo.Player.debug.P.id)).toBe('p:satie-gym-1:full');
  expect(await app.plan()).toMatchObject({ kind: 'full', mode: 'tempo', hand: 'ht' });
});

test('when nothing moves for a while, the approach changes', async ({ app }) => {
  const id = 'p:satie-gym-1:1';
  await app.setItem(id, { stage: 'tempo', phase: null, bpm: 40, since: 9, recent: ['m', 'm', 's', 'm'] });
  expect((await app.tempoRep({ jitter: 8, skip: [1, 3, 5, 7] })).message).toMatch(/change the approach/);
  expect(await app.item(id)).toMatchObject({ stage: 'learn', phase: 'ht', reentry: true });
});

test('a long piece is drawn a few bars at a time and follows the playing', async ({ app, page }) => {
  await app.eval(() => window.DaCapo.go('songs', { pid: 'rach-op23-5', item: 'p:rach-op23-5:full' }));
  await page.waitForTimeout(800);
  const start = await app.eval(() => ({
    steps: window.DaCapo.Player.debug.P.drill.steps.length,
    w0: window.DaCapo.Player.debug.P.win.w0,
  }));
  expect(start.steps).toBeGreaterThan(1000);
  expect(start.w0).toBe(0);
  expect(await app.eval(() => window.__t.waitPhase('countin', 10000))).toBe(true);
  await app.eval(() => {
    const { T } = window.DaCapo.Player.debug;
    return window.__t.playTempo(window.__t.steps().slice(0, 90), T.msBeat, T.t0, { jitter: 5 });
  });
  expect(await app.eval(() => window.DaCapo.Player.debug.P.win.w0)).toBeGreaterThan(40);
  await page.locator('#plGo').click();
  expect(await app.phase()).toBe('stopped');
  expect(await app.message()).toMatch(/^Stopped\./);
});

test('a section can start over from wait mode, with two taps', async ({ app, page }) => {
  const id = 'p:satie-gym-1:1';
  await app.setItem(id, { stage: 'tempo', phase: null, bpm: 40 });
  await page.locator('#sgReset').click();
  await expect(page.locator('#sgReset')).toHaveText('Tap again to start over');
  expect(await app.item(id)).toMatchObject({ stage: 'tempo' });
  await page.locator('#sgReset').click();
  expect(await app.plan()).toMatchObject({ hand: 'rh', mode: 'wait' });
  expect((await app.item(id)) || { stage: 'learn' }).toMatchObject({ stage: 'learn' });
});
