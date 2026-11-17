// Moods: every scale spelled and fingered right in every key, practice on your terms, strict checks only
// when you ask, and suggestions from what you actually played.
import { test, expect } from './fixtures.js';
import {
  arpeggioRun,
  CHORD_TONES,
  CIRCLE,
  handShapes,
  MOOD_BY,
  moodChords,
  moodFingering,
  moodName,
  moodRun,
  moodScale,
  MOODS,
  PCS,
  progressionRun,
  scaleMidis,
  voiceProgression,
} from '../src/js/music/moods.js';
import {
  callPhrase,
  earRound,
  LH_PATTERNS,
  lhKind,
  lhVoicing,
  motifEcho,
  patternBar,
} from '../src/js/music/moodtools.js';
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

test('the chords of a scale: numerals from the major scale, the signature chord, parents and blues', () => {
  const am = moodChords('natural', 9);
  expect(am.map(c => c.name)).toEqual(['Am', 'B°', 'C', 'Dm', 'Em', 'F', 'G']);
  expect(am.map(c => c.num)).toEqual(['i', 'ii°', '♭III', 'iv', 'v', '♭VI', '♭VII']);
  expect(am.filter(c => c.signature).map(c => c.name)).toEqual(['F']);
  const ch = moodChords('harmonic', 0);
  expect(ch[4]).toMatchObject({ name: 'G', num: 'V' });
  expect(ch[4].seventh.name).toBe('G7');
  expect(ch[0].notes.map(n => 'CDEFGAB'[n.l] + (n.a < 0 ? '♭' : ''))).toEqual(['C', 'E♭', 'G']);
  // numerals count letters from home: Locrian's chord on the low 5th is ♭V, Lydian's raised 4th ♯iv°,
  // the same in every key
  for (const pc of PCS) {
    expect(moodChords('locrian', pc)[4].num).toBe('♭V');
    expect(moodChords('lydian', pc)[3].num).toBe('♯iv°');
  }
  // harmonic and melodic minor: their natural minor's tonic and key signature
  expect(moodName('harmonic', 8)).toBe('G♯ harmonic minor');
  expect(moodRun('melodic', 0, 'rh', 1).sig).toBe(-3);
  // a pentatonic uses the chords of the scale it comes from; the blues, its three 7ths
  expect(moodChords('minpent', 9).map(c => c.name)).toEqual(am.map(c => c.name));
  expect(moodChords('blues', 0).map(c => c.name)).toEqual(['C7', 'F7', 'G7']);
  // every chord of every mood lies in its scale (the blues's 7ths are the exception: that is the blues)
  for (const M of MOODS.filter(x => x.id !== 'blues' && !x.parent))
    for (const c of moodChords(M.id, 0))
      CHORD_TONES[c.type].forEach(x => expect(M.semis, `${M.id} ${c.name}`).toContain((c.semis + x) % 12));
});

test('progressions move by the nearest shape; left-hand patterns play their chord, voiced the same way', () => {
  const bad = [];
  for (const M of MOODS)
    for (const pc of PCS)
      M.progs.forEach((p, k) => {
        const V = voiceProgression(M.id, pc, p.chords);
        for (let i = 1; i < V.length; i++)
          if (V[i].right.some((m, j) => Math.abs(m - V[i - 1].right[j]) > 5)) bad.push(`${M.id} ${pc} leap`);
        if (progressionRun(M.id, pc, k, 'ht').steps.length !== p.chords.length) bad.push(`${M.id} steps`);
        const L = lhVoicing(M.id, pc, p.chords);
        const tonic = midiOf(moodScale(M.id, pc)[0]);
        L.forEach((v, i) => {
          const tones = CHORD_TONES[v.info.type].map(x => (tonic + v.info.semis + x) % 12);
          for (const pat of LH_PATTERNS) {
            const bar = patternBar(pat.id, L, i, tonic);
            const where = `${M.id} ${pc} ${pat.id}`;
            if (bar.some(g => g.ms.length !== g.f.length || g.b + g.d > 4.001)) bad.push(where + ' shape');
            if (bar.some(g => g.ms.some(m => m < 28 || m >= 72))) bad.push(where + ' range');
            // the chord's own notes, apart from the walking bass's approach and the pedal's home note
            if (
              pat.id !== 'walking' &&
              pat.id !== 'pedal' &&
              bar.some(g => g.ms.some(m => !tones.includes(pc12(m))))
            )
              bad.push(where + ' tones');
          }
        });
      });
  expect(bad).toEqual([]);
  // what the left hand did
  expect(lhKind([45, 52], 9, 'min', 9)).toBe('rootFifth');
  expect(lhKind([45, 57], 9, 'min', 9)).toBe('octaves');
  expect(lhKind([45, 48, 52], 9, 'min', 9)).toBe('chords');
  expect(lhKind([48], 9, 'min', 9)).toBe('broken');
  expect(lhKind([45], 5, 'maj', 9)).toBe('pedal');
  expect(lhKind([44], 9, 'min', 9)).toBe('passing');
});

test('arpeggios: the standard fingering for white-key triads, a playable one for every chord', () => {
  const c = arpeggioRun('major', 0, [0, 'maj'], 'rh', 2).steps.map(s => s.notes[0].f);
  expect(c).toEqual([1, 2, 3, 1, 2, 3, 5, 3, 2, 1, 3, 2, 1]);
  expect(
    arpeggioRun('major', 0, [0, 'maj'], 'lh', 2)
      .steps.map(s => s.notes[0].f)
      .slice(0, 7),
  ).toEqual([5, 4, 2, 1, 4, 2, 1]);
  // black-key roots take the published patterns: D♭ major 4 1 2 4 (right), 2 1 4 2 (left), one octave too
  const fOf = (pc, hand, octs) =>
    arpeggioRun('major', pc, [0, 'maj'], hand, octs).steps.map(s => s.notes[0].f);
  expect(fOf(1, 'rh', 2).slice(0, 7)).toEqual([4, 1, 2, 4, 1, 2, 4]);
  expect(fOf(1, 'lh', 2).slice(0, 7)).toEqual([2, 1, 4, 2, 1, 4, 2]);
  expect(fOf(1, 'rh', 1).slice(0, 4)).toEqual([4, 1, 2, 4]);
  const bad = [];
  for (const M of MOODS)
    for (const pc of PCS)
      for (const ch of moodChords(M.id, pc))
        for (const hand of ['rh', 'lh']) {
          const st = arpeggioRun(M.id, pc, [ch.semis, ch.type], hand, 2).steps;
          const f = st.map(s => s.notes[0].f);
          const ms = st.map(s => s.midis[0]);
          const half = (ms.length - 1) / 2;
          // fingers 1 to 5, never one twice in a row; the notes rise, then fall
          if (
            f.some((x, i) => !(x >= 1 && x <= 5) || (i && x === f[i - 1])) ||
            ms.slice(1, half + 1).some((m, i) => m <= ms[i])
          )
            bad.push(`${M.id} ${ch.name} ${hand}`);
        }
  expect(bad).toEqual([]);
});

test('right-hand ideas: a call stays in the right hand and asks for an answer; motifs come back', () => {
  for (const M of MOODS)
    for (let k = 0; k < 30; k++) {
      const pc = k % 12;
      const call = callPhrase(M.id, pc);
      const tonic = midiOf(moodScale(M.id, pc)[0]);
      expect(Math.min(...call.map(n => n.m))).toBeGreaterThanOrEqual(60);
      expect(pc12(call[call.length - 1].m - tonic)).not.toBe(0);
    }
  expect(motifEcho([0, 2, 1, 5, 1, 3, 2])).toBe('sequence');
  expect(motifEcho([0, 2, 1, 0, 2, 1])).toBe('repeat');
  expect(motifEcho([0, 1, 2, 9, 9, 9])).toBeNull();
  expect(motifEcho([0, 1, 2, 3, 4, 5, 6])).toBeNull(); // a scale run is not a motif
  // an ear round: four different moods including the answer, from more than one family
  for (let k = 0; k < 50; k++) {
    const r = earRound({});
    expect(new Set(r.options).size).toBe(4);
    expect(r.options).toContain(r.mood);
    expect(new Set(r.options.map(id => MOOD_BY[id].fam)).size).toBeGreaterThan(1);
  }
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
    await page.locator('[data-seg="mdStep"] [data-v="scale"]').click();
    for (const hand of ['rh', 'lh']) {
      await page.locator(`[data-seg="mdHand"] [data-v="${hand}"]`).click();
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
        await T.sleep(40);
        T.noteOff([45, 52][i % 2]);
        T.noteOn([69, 71, 72, 74, 76][i % 5]);
        await T.sleep(40);
        T.noteOff([69, 71, 72, 74, 76][i % 5]);
      }
    });
    await expect(page.locator('#mpInfo')).toContainText('100% in the scale');
    await expect(page.locator('#mpLh')).toContainText('100% on the pattern · mostly roots and fifths');
    await page.locator('#mdBack').click();
    await expect(page.locator('.insight').first()).toContainText(
      'stayed on roots and fifths. Next time try octaves',
    );
    // the next sitting's pattern is a different one
    await app.eval(() => window.DaCapo.go('mood', { mood: 'natural', pc: 9, step: 'play' }));
    await expect(page.locator('[data-seg="mpPattern"] [aria-pressed="true"]')).toHaveText('Octaves');
  });

  test('backing: the drone holds until you change it; the chords follow the progression you pick', async ({
    app,
    page,
  }) => {
    await app.eval(() => window.DaCapo.go('mood', { mood: 'harmonic', pc: 0, step: 'play' }));
    const sounding = () => app.eval(() => window.DaCapo.Sounds.active.filter(v => v.end === Infinity).length);
    expect(await sounding()).toBe(0); // nothing until you ask
    await page.locator('[data-seg="mpBacking"] [data-v="drone"]').click();
    expect(await sounding()).toBe(3); // home, its fifth and the octave, held
    await page.locator('[data-seg="mpBacking"] [data-v="chords"]').click();
    expect(await sounding()).toBe(0);
    await expect(page.locator('#mpChords .chip')).toHaveText(['Cm', 'Fm', 'G', 'Cm']);
    await page.locator('[data-seg="mpProgs"] [data-v="1"]').click();
    await expect(page.locator('[data-seg="mpProgs"] [aria-pressed="true"]')).toHaveText('i – ♭VI – V – i');
    await expect(page.locator('#mpChords .chip')).toHaveText(['Cm', 'A♭', 'G', 'Cm']);
    // Targets marks the chord tones on the keyboard
    await page.locator('[data-seg="mpTools"] [data-v="targets"]').click();
    await expect(page.locator('#mpKb rect.color[data-m="72"]')).toHaveCount(1);
  });

  test('chords and arpeggios: the table, a progression to play, an arpeggio counted apart from the scale', async ({
    app,
    page,
  }) => {
    await app.eval(() => window.DaCapo.go('mood', { mood: 'natural', pc: 9, step: 'chords' }));
    await expect(page.locator('.chordtable tbody tr')).toHaveCount(7);
    await expect(page.locator('.chordtable tr.sig')).toContainText('F');
    await page.locator('[data-prog="1"]').click();
    expect((await app.eval(() => window.__t.steps())).length).toBe(4);
    await app.waitRep({ gap: 40 });
    await page.locator('[data-seg="mdStep"] [data-v="arps"]').click();
    expect((await app.eval(() => window.__t.steps())).length).toBe(7); // A C E A, up and back
    await app.waitRep({ gap: 40 });
    const k = await app.eval(() => window.DaCapo.Store.s.moods.keys['natural:9']);
    expect(k.extra).toEqual({ 'prog1:rh': 1, 'arp0.min:rh': 1 });
    expect(k.clean.rh).toBe(0);
  });

  test('which mood: a phrase, four choices, and the color note that gives it away', async ({ app, page }) => {
    await page.locator('#mhEar').click();
    const mood = await app.eval(() => {
      const opts = [...document.querySelectorAll('[data-ear]')].map(b => b.dataset.ear);
      return opts.length === 4 ? opts : null;
    });
    expect(mood).toHaveLength(4);
    await page.locator('[data-ear]').first().click();
    await expect(page.locator('#earSay')).toContainText('The giveaway is');
    await expect(page.locator('[data-ear].ok')).toHaveCount(1);
    expect(await app.eval(() => window.DaCapo.Store.s.moods.ear.n)).toBe(1);
    await page.locator('#earNext').click();
    await expect(page.locator('#earSay')).toBeEmpty();
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
