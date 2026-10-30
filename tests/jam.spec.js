// Free play: the Jam loop station, its MIDI files, and the Echo ear game.
import fs from 'node:fs';
import { test, expect } from './fixtures.js';
import { beatPattern, cleanLoop, loopEvents, loopToMidi, newLoop, swingAt } from '../src/js/music/loop.js';
import { parseMidiFile } from '../src/js/music/midiread.js';
import { afterAnswer, ECHO_LEVELS, judge, makePhrase } from '../src/js/learn/echo.js';

const toBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

test('a layer plays on its grid, with swing on the off-beats', () => {
  const L = { ...newLoop(), bars: 1, swing: 0.6 };
  L.layers = [
    {
      id: 'a',
      sound: 'piano',
      grid: '8',
      mute: false,
      notes: [
        { b: 0.04, m: 60, d: 0.4, v: 0.8 },
        { b: 0.52, m: 62, d: 0.4, v: 0.8 },
        { b: 3.9, m: 64, d: 0.4, v: 0.8 }, // snaps to the next downbeat: the top of the loop
      ],
    },
  ];
  expect(loopEvents(L).map(e => [Math.round(e.b * 100) / 100, e.m])).toEqual([
    [0, 60],
    [0, 64],
    [0.6, 62],
  ]);
  expect(swingAt(1.25, 0.5)).toBe(1.25);
  expect(swingAt(2.5, 0.66)).toBeCloseTo(2.66);
});

test('a shorter loop silences the notes past its end (they come back when it grows); triplets do not swing', () => {
  const L = { ...newLoop(), bars: 2, swing: 0.66 };
  L.layers = [
    {
      id: 'a',
      sound: 'piano',
      grid: '16',
      mute: false,
      notes: [
        { b: 1, m: 60, d: 0.5, v: 0.8 },
        { b: 5, m: 62, d: 0.5, v: 0.8 }, // bar 2
      ],
    },
    { id: 'b', sound: 'piano', grid: '8t', mute: false, notes: [{ b: 1 / 3, m: 64, d: 0.3, v: 0.8 }] },
  ];
  expect(loopEvents(L).map(e => e.m)).toEqual([64, 60, 62]);
  expect(loopEvents({ ...L, bars: 1 }).map(e => e.m)).toEqual([64, 60]);
  expect(loopEvents(L)[0].b).toBeCloseTo(1 / 3);
});

test('a sketch read back from storage is cleaned up, never trusted', () => {
  const L = cleanLoop({
    name: 42,
    bars: 3,
    beats: 5,
    bpm: 'fast',
    swing: 9,
    beat: 'nope',
    layers: [{ notes: 'x' }, null],
  });
  expect(L).toMatchObject({
    name: '42',
    bars: 2,
    beats: 4,
    bpm: 90,
    swing: 0.75,
    beat: 'custom',
    layers: [],
  });
  expect(cleanLoop(null).layers).toEqual([]);
});

test('a sketch saves as a MIDI file: drums on channel 10, each layer on its own track', () => {
  const L = { ...newLoop(), bars: 1, bpm: 100, drums: beatPattern('rock') };
  L.layers = [
    { id: 'a', sound: 'bass', grid: '16', mute: false, notes: [{ b: 0, m: 36, d: 1, v: 0.8 }] },
    { id: 'b', sound: 'pad', grid: 'off', mute: true, notes: [{ b: 0, m: 60, d: 4, v: 0.8 }] },
  ];
  const { div, tracks } = parseMidiFile(toBuffer(loopToMidi(L, 4)));
  expect(div).toBe(480);
  const tempo = tracks[0].ev.find(e => e.k === 'tempo');
  expect(Math.round(60000000 / tempo.us)).toBe(100);
  const ons = tr => tr.ev.filter(e => e.k === 'on');
  // the rock beat: 3 kicks, 2 snares and 8 hats a bar, four times; the muted pad is left out
  expect(tracks.map(t => t.name)).toEqual(['DaCapo sketch', 'Drums', 'Bass']);
  expect(ons(tracks[1]).every(e => e.ch === 9)).toBe(true);
  expect(ons(tracks[1])).toHaveLength(13 * 4);
  expect(ons(tracks[2]).map(e => e.tick)).toEqual([0, 1920, 3840, 5760]);
});

test('Echo: phrases follow the level, any octave counts, and levels move both ways', () => {
  for (let level = 1; level <= ECHO_LEVELS.length; level++)
    for (let i = 0; i < 50; i++) {
      const p = makePhrase(level);
      expect(p.notes).toHaveLength(ECHO_LEVELS[level - 1].len);
      expect(judge(p, p.notes).ok).toBe(true);
      expect(
        judge(
          p,
          p.notes.map(m => m + 12),
        ).ok,
      ).toBe(true);
    }
  const p = { notes: [60, 62, 64] };
  expect(judge(p, [60, 62])).toMatchObject({ ok: false, wrongAt: -1, partial: true });
  expect(judge(p, [60, 63])).toMatchObject({ ok: false, wrongAt: 1 });
  let g = { level: 1 };
  for (let i = 0; i < 3; i++) g = afterAnswer(g, true);
  expect(g).toMatchObject({ level: 2, best: 2, streak: 0 });
  g = afterAnswer(afterAnswer(g, false), false);
  expect(g).toMatchObject({ level: 1, best: 2 });
});

test.describe('in the app', () => {
  test.beforeEach(async ({ app }) => {
    await app.connectPiano();
    await app.onboard();
    await app.eval(() => window.DaCapo.go('free', { tab: 'jam' }));
  });

  test('record a layer from the piano over a beat, then save it as a MIDI file', async ({ app, page }) => {
    await page.locator('[data-beat="rock"]').click();
    await expect(page.locator('#jGrid .cell.on')).toHaveCount(13);
    // a short, fast loop so the test is quick
    await app.eval(() => {
      const L = window.DaCapo.Transport.L;
      L.bars = 1;
      L.bpm = 160;
    });
    await page.locator('#jRec').click();
    await expect(page.locator('#jRec')).toHaveText('Recording', { timeout: 4000 });
    // four notes on the beats of the pass being recorded, a little off the grid
    await app.eval(async () => {
      const { Transport, AudioEngine } = window.DaCapo;
      const spb = 60 / Transport.L.bpm;
      const base = Transport.rec.pass * 4;
      for (const [b, m] of [
        [0.03, 60],
        [1.02, 64],
        [1.97, 67],
        [3.01, 72],
      ]) {
        const t = AudioEngine.toPerf(Transport.start + (base + b) * spb);
        while (performance.now() < t) await window.__t.sleep(4);
        window.__t.send(0x90, m, 90, t);
        setTimeout(() => window.__t.send(0x80, m, 0), 150);
      }
    });
    await expect(page.locator('.layer')).toHaveCount(1, { timeout: 4000 });
    const layer = await app.eval(() => window.DaCapo.Transport.L.layers[0]);
    expect(layer.sound).toBe('piano');
    expect(layer.notes.map(n => n.m)).toEqual([60, 64, 67, 72]);
    layer.notes.forEach((n, i) => expect(Math.abs(n.b - i)).toBeLessThan(0.1));
    await expect(page.locator('#jMsg')).toContainText('Layer 1 recorded');

    // stop, save as a sketch, and as a MIDI file
    await page.locator('#jPlay').click();
    await page.locator('#jName').fill('Test groove');
    await page.locator('#jSave').click();
    expect(await app.eval(() => JSON.parse(localStorage.getItem('dacapo.sketches'))[0].name)).toBe(
      'Test groove',
    );
    const download = page.waitForEvent('download');
    await page.locator('#jMidi').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('test-groove.mid');
    const { tracks } = parseMidiFile(toBuffer(fs.readFileSync(await file.path())));
    expect(tracks.map(t => t.name)).toEqual(['Test groove', 'Drums', 'Piano']);
    expect(tracks[2].ev.filter(e => e.k === 'on')).toHaveLength(16);
  });

  test('drum pads record a drum layer; layers can be muted and undone', async ({ app, page }) => {
    await app.eval(() => {
      const L = window.DaCapo.Transport.L;
      L.bars = 1;
      L.bpm = 160;
    });
    await page.locator('[data-sound="drums"]').click();
    await expect(page.locator('.pads .pad')).toHaveCount(6);
    await page.locator('#jRec').click();
    await expect(page.locator('#jRec')).toHaveText('Recording', { timeout: 4000 });
    await page.locator('[data-pad="36"]').dispatchEvent('pointerdown');
    await page.waitForTimeout(300);
    await page.locator('[data-pad="38"]').dispatchEvent('pointerdown');
    await expect(page.locator('.layer')).toHaveCount(1, { timeout: 4000 });
    expect(await app.eval(() => window.DaCapo.Transport.L.layers[0].notes.map(n => n.m))).toEqual([36, 38]);
    await page.locator('[data-lmute="0"]').click();
    expect(await app.eval(() => window.DaCapo.Transport.L.layers[0].mute)).toBe(true);
    await page.locator('#jUndo').click();
    await expect(page.locator('.layer')).toHaveCount(0);
  });

  test('stopping the loop silences everything already scheduled', async ({ app, page }) => {
    await app.eval(() => {
      const L = window.DaCapo.Transport.L;
      L.bpm = 120;
      L.layers = [
        { id: 'p', sound: 'pad', grid: 'off', mute: false, notes: [{ b: 0, m: 60, d: 8, v: 0.8 }] },
      ];
    });
    await page.locator('[data-beat="rock"]').click();
    await page.locator('#jPlay').click();
    await page.waitForTimeout(600);
    expect(await app.eval(() => window.DaCapo.Sounds.active.length)).toBeGreaterThan(0);
    await page.locator('#jPlay').click();
    expect(await app.eval(() => window.DaCapo.Sounds.active.length)).toBe(0);
    await expect(page.locator('#jPlay')).toHaveText('Play');
  });

  test('the sketch stays when you leave and come back', async ({ app, page }) => {
    await page.locator('[data-beat="bossa"]').click();
    await app.eval(() => window.DaCapo.go('practice'));
    await app.eval(() => window.DaCapo.go('free', { tab: 'jam' }));
    await expect(page.locator('[data-beat="bossa"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Echo: a wrong note shows the phrase and counts as a miss', async ({ app, page }) => {
    await page.locator('[data-seg="ftab"] button', { hasText: 'Echo' }).click();
    await page.locator('#ecGo').click();
    await expect(page.locator('#ecMsg')).toHaveText('Your turn.', { timeout: 5000 });
    await app.eval(() => {
      window.__t.noteOn(61); // C sharp: never the first note at level 1 (C pentatonic, from C)
      window.__t.noteOff(61);
    });
    await expect(page.locator('#ecMsg')).toContainText('It was C');
    expect(await app.eval(() => window.DaCapo.Store.s.games.echo)).toMatchObject({ level: 1, misses: 1 });
  });
});
