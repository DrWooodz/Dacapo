// Moods: every scale spelled and fingered right in every key, practice on your terms, strict checks only
// when you ask, and suggestions from what you actually played.
import { test, expect } from './fixtures.js';
import {
  CIRCLE,
  handShapes,
  MOOD_BY,
  moodFingering,
  moodName,
  moodRun,
  moodScale,
  MOODS,
  PCS,
  scaleMidis,
} from '../src/js/music/moods.js';
import { midiOf, scaleFingers } from '../src/js/music/theory.js';

const MAJ = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MIN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const black = m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
const pc12 = m => ((m % 12) + 12) % 12;

test('major and minor scales keep their published fingerings, in both hands, one or two octaves', () => {
  for (const [mood, names, fam] of [
    ['major', MAJ, 'major'],
    ['natural', MIN, 'minor'],
    ['harmonic', MIN, 'minor'],
  ])
    for (const pc of PCS)
      for (const hand of ['rh', 'lh'])
        for (const octs of [1, 2])
          expect(moodFingering(mood, pc, hand, octs), `${mood} ${names[pc]} ${hand} ${octs}`).toEqual(
            scaleFingers(names[pc], fam, hand, octs),
          );
});

test('a mode is fingered like its parent major scale: the same finger on the same key', () => {
  // D Dorian has C major's notes: each key gets the finger it has in C major
  const cMajor = { 0: 1, 2: 2, 4: 3, 5: 1, 7: 2, 9: 3, 11: 4 };
  const ms = scaleMidis('dorian', 2, 'rh', 1);
  const f = moodFingering('dorian', 2, 'rh', 1);
  ms.slice(0, -1).forEach((m, i) => expect(f[i]).toBe(cMajor[pc12(m)]));
});

test('every mood in every key: spelled right, and a fingering a hand can play', () => {
  for (const M of MOODS)
    for (const pc of PCS) {
      const notes = moodScale(M.id, pc);
      const ms = notes.map(midiOf);
      // the intervals are the mood's, no double sharps or flats, and 7-note scales use each letter once
      expect(ms.map(m => (m - ms[0] + 120) % 12)).toEqual(M.semis);
      // (a double sharp or flat only where every spelling needs one: G♯ double harmonic has F𝄪)
      expect(notes.filter(n => Math.abs(n.a) > 1).length, moodName(M.id, pc)).toBeLessThanOrEqual(1);
      if (M.semis.length === 7) expect(new Set(notes.map(n => n.l)).size).toBe(7);
      for (const hand of ['rh', 'lh']) {
        const run = scaleMidis(M.id, pc, hand, 2);
        const f = moodFingering(M.id, pc, hand, 2);
        expect(f).toHaveLength(run.length * 2 - 1);
        f.forEach(x => expect(x >= 1 && x <= 5).toBe(true));
        // never the same finger twice in a row, and the thumb on a black key only when the scale has
        // (nearly) no white keys to put it on
        for (let i = 1; i < run.length; i++) expect(f[i], `${moodName(M.id, pc)} ${hand}`).not.toBe(f[i - 1]);
        const whites = run.filter(m => !black(m)).length;
        const thumbsOnBlack = run.filter((m, i) => f[i] === 1 && black(m)).length;
        if (whites >= run.length / 2) expect(thumbsOnBlack, `${moodName(M.id, pc)} ${hand}`).toBe(0);
      }
    }
});

test('names: proper names keep their capital, the tonic takes the spelling with fewer accidentals', () => {
  expect(moodName('phrygian', 1)).toBe('C♯ Phrygian');
  expect(moodName('major', 1)).toBe('D♭ major');
  expect(moodName('harmonic', 0)).toBe('C harmonic minor');
  expect(moodScale('harmonic', 0).map(n => 'CDEFGAB'[n.l] + (n.a < 0 ? '♭' : n.a > 0 ? '♯' : ''))).toEqual([
    'C',
    'D',
    'E♭',
    'F',
    'G',
    'A♭',
    'B',
  ]);
});

test('grouping keys: hand shapes cover all twelve; neighbors around the circle differ by one note', () => {
  for (const M of MOODS)
    expect(
      handShapes(M.id)
        .flatMap(g => g.pcs)
        .sort((a, b) => a - b),
    ).toEqual(PCS);
  for (const id of ['major', 'natural', 'dorian', 'phrygian', 'lydian', 'mixolydian']) {
    const set = pc => new Set(moodScale(id, pc).map(n => pc12(midiOf(n))));
    for (let i = 1; i < 12; i++) {
      const a = set(CIRCLE[i - 1]);
      expect([...set(CIRCLE[i])].filter(p => !a.has(p))).toHaveLength(1);
    }
  }
});

test('a run for both hands: the same notes an octave apart, up and back down', () => {
  const r = moodRun('dorian', 2, 'ht', 1);
  expect(r.clef).toBe('grand');
  expect(r.steps).toHaveLength(15);
  r.steps.forEach(s => expect(s.midis[0] - s.midis[1]).toBe(12));
  expect(r.steps[7].midis[0]).toBe(r.steps[0].midis[0] + 12);
  expect(MOOD_BY.dorian.hear).toMatch(/Scarborough Fair/);
});

test.describe('in the app', () => {
  test.beforeEach(async ({ app }) => {
    await app.connectPiano();
    await app.onboard(null, { path: 'moods' });
  });

  test('Home suggests the plainest key to start; three clean runs a hand make it comfortable', async ({
    app,
    page,
  }) => {
    await expect(page.locator('.pickup h2')).toHaveText('A natural minor');
    await page.locator('.pickup button.big').click();
    await expect(page.locator('#page h1')).toHaveText('A natural minor');
    for (const hand of ['rh', 'lh']) {
      await page.locator(`[data-seg="mdStep"] [data-v="${hand}"]`).click();
      for (let k = 0; k < 3; k++) await app.waitRep({ gap: 40 });
    }
    expect(await app.message()).toMatch(/A natural minor is comfortable/);
    await expect(page.locator('#mdStatus')).toContainText('comfortable');
    // Home: picks up there next time
    await page.locator('#mdBack').click();
    await expect(page.locator('.lastline')).toContainText('A natural minor');
    await expect(page.locator('button.keydot.comfortable')).toHaveCount(1);
  });

  test('help is yours to switch; nothing moves on by itself', async ({ app, page }) => {
    await app.eval(() => window.DaCapo.go('mood', { mood: 'dorian', pc: 2, step: 'rh' }));
    expect(await app.plan()).toMatchObject({ mode: 'wait', hints: true, fingers: true, hand: 'rh' });
    await page.locator('[data-help="keys"]').click();
    await page.locator('[data-help="fingers"]').click();
    expect(await app.plan()).toMatchObject({ hints: false, fingers: false });
    await expect(page.locator('#plStaff .fn')).toHaveCount(0);
    await page.locator('[data-help="tempo"]').click();
    expect(await app.plan()).toMatchObject({ mode: 'tempo', bpm: 60 });
    await page.locator('[data-bpm="5"]').click();
    expect(await app.plan()).toMatchObject({ bpm: 65 });
    await page.locator('[data-seg="mdOct"] [data-v="2"]').click();
    expect((await app.eval(() => window.__t.steps())).length).toBe(29);
  });

  test('a check is strict: both hands, two octaves, no help; two days make a key solid', async ({
    app,
    page,
  }) => {
    await app.eval(() => window.DaCapo.go('mood', { mood: 'dorian', pc: 2, step: 'rh' }));
    await page.locator('#mdCheck').click();
    expect(await app.plan()).toMatchObject({ mode: 'wait', hand: 'ht', hints: false, fingers: false });
    expect((await app.eval(() => window.__t.steps())).length).toBe(29);
    expect(await app.waitRep({ wrongAt: 5, gap: 40 })).toMatch(/Not this time/);
    expect(await app.waitRep({ gap: 40 })).toMatch(/One more on another day makes it solid/);
    // a check passed on an earlier day too: solid
    await app.eval(() => {
      const k = window.DaCapo.Store.s.moods.keys['dorian:2'];
      k.checks.unshift(window.DaCapo.addDays(window.DaCapo.todayKey(), -2));
    });
    await page.locator('#mdCancel').click();
    await expect(page.locator('#mdStatus')).toContainText('solid');
  });

  test('a mood becomes yours with three solid keys, one of them black-key', async ({ app, page }) => {
    await app.eval(() => {
      const D = window.DaCapo;
      const days = [D.addDays(D.todayKey(), -3), D.addDays(D.todayKey(), -1)];
      for (const pc of [2, 9, 6])
        D.Store.s.moods.keys[`dorian:${pc}`] = {
          met: days[0],
          clean: { rh: 3, lh: 3, ht: 1 },
          checks: days,
          last: days[1],
        };
      D.go('home');
    });
    await expect(page.locator('.moodrow', { hasText: 'Dorian' }).locator('.pill')).toHaveText('yours');
    await expect(page.locator('.trajcard')).toContainText('1moods yours');
  });

  test('improvising: DaCapo notices what the left hand did, and Home suggests something else', async ({
    app,
    page,
  }) => {
    await app.eval(() => window.DaCapo.go('mood', { mood: 'natural', pc: 9, step: 'play' }));
    await expect(page.locator('[data-seg="mpPattern"] [aria-pressed="true"]')).toHaveText('Root and fifth');
    // forty notes: the right hand in the scale, the left hand only on A and E
    await app.eval(async () => {
      const T = window.__t;
      for (let i = 0; i < 20; i++) {
        T.noteOn([45, 52][i % 2]);
        await T.sleep(30);
        T.noteOff([45, 52][i % 2]);
        T.noteOn([69, 71, 72, 74, 76][i % 5]);
        await T.sleep(30);
        T.noteOff([69, 71, 72, 74, 76][i % 5]);
      }
    });
    await expect(page.locator('#mpInfo')).toContainText('100% in the scale');
    await expect(page.locator('#mpInfo')).toContainText('mostly roots and fifths');
    await page.locator('#mdBack').click();
    await expect(page.locator('.insight').first()).toContainText('try the broken chord');
    // the next sitting's pattern is a different one
    await app.eval(() => window.DaCapo.go('mood', { mood: 'natural', pc: 9, step: 'play' }));
    await expect(page.locator('[data-seg="mpPattern"] [aria-pressed="true"]')).toHaveText('Broken chord');
  });

  test('browsing by hand shape and by neighbor; switching to the full course and back', async ({
    app,
    page,
  }) => {
    await page.locator('[data-seg="mhWay"] [data-v="shape"]').click();
    await page.locator('#mhMood').selectOption('major');
    await expect(page.locator('.shape').first()).toContainText('Right hand 1 2 3 1 2 3 4 5');
    await expect(page.locator('.shape').first().locator('.keydot')).toHaveCount(6);
    await page.locator('[data-seg="mhWay"] [data-v="neighbor"]').click();
    await expect(page.locator('.cstep').nth(1)).toContainText('+F♯');
    await page.locator('#mhCourse').click();
    await expect(page.locator('.card.today')).toBeVisible();
    await page.locator('[data-act="moods"]').click();
    await expect(page.locator('.pickup')).toBeVisible();
    expect(await app.eval(() => window.DaCapo.Store.s.path)).toBe('moods');
  });
});
