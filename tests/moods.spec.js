// Moods: every scale spelled and fingered right in every key, practice on your terms, strict checks only
// when you ask, and suggestions from what you actually played.
import { test, expect } from './fixtures.js';
import {
  arpeggioRun,
  CHORD_TONES,
  CIRCLE,
  circleRun,
  inversionRun,
  moodNeighbors,
  moodRelatives,
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
  lhPatternRun,
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

test('around the circle of fifths, each key is one note different from the last', () => {
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

test('inversions: root position, 1st, 2nd and back, each fingered by its shape', () => {
  const r = inversionRun('major', 0, [0, 'maj'], 'rh');
  expect(r.steps.map(s => s.midis)).toEqual([
    [60, 64, 67],
    [64, 67, 72],
    [67, 72, 76],
    [72, 76, 79],
    [67, 72, 76],
    [64, 67, 72],
    [60, 64, 67],
  ]);
  expect(r.steps.slice(0, 3).map(s => s.notes.map(n => n.f).join(''))).toEqual(['135', '125', '135']);
  const l = inversionRun('major', 0, [0, 'maj'], 'lh');
  expect(l.steps.slice(0, 3).map(s => s.notes.map(n => n.f).join(''))).toEqual(['531', '531', '521']);
  // a minor chord's inversions are its own notes, in every key
  for (const pc of PCS)
    for (const st of inversionRun('natural', pc, [0, 'min'], 'ht').steps)
      expect(new Set(st.midis.map(pc12))).toEqual(new Set([pc, (pc + 3) % 12, (pc + 7) % 12]));
});

test('the circle of fifths drill: every major key once, a fifth apart, each chord near the last', () => {
  const r = circleRun('ht');
  expect(r.steps.map(s => s.chord)).toEqual([
    'C',
    'G',
    'D',
    'A',
    'E',
    'B',
    'F♯',
    'D♭',
    'A♭',
    'E♭',
    'B♭',
    'F',
    'C',
  ]);
  r.steps.forEach((st, i) => {
    const root = st.midis[st.midis.length - 1];
    expect(pc12(root)).toBe(CIRCLE[i % 12]);
    if (i)
      st.midis
        .slice(0, 3)
        .forEach((m, j) => expect(Math.abs(m - r.steps[i - 1].midis[j])).toBeLessThanOrEqual(5));
  });
  // each chord spelled in its own key: D♭ major is D♭ F A♭, not C♯ E♯ G♯
  expect(r.steps[7].notes.map(n => n.n.a)).toEqual([-1, -1, 0, -1].slice(0, r.steps[7].notes.length));
});

test('a left-hand pattern as a drill: a bar per chord of the progression, in the left hand', () => {
  const r = lhPatternRun('natural', 9, 'broken', 0);
  expect(r.clef).toBe('bass');
  expect(r.steps).toHaveLength(MOOD_BY.natural.progs[0].chords.length * 4);
  expect(r.steps.slice(0, 4).map(s => s.midis[0])).toEqual([45, 52, 57, 52]);
  expect(r.steps.slice(0, 4).map(s => s.notes[0].f)).toEqual([5, 2, 1, 2]);
});

test('neighbors: one note different with the same home; relatives: the same notes from another home', () => {
  expect(moodNeighbors('natural')).toEqual([
    { id: 'harmonic', change: 'raise the 7th' },
    { id: 'phrygian', change: 'lower the 2nd' },
    { id: 'dorian', change: 'raise the 6th' },
  ]);
  expect(moodNeighbors('lydian')).toEqual([{ id: 'major', change: 'lower the 4th' }]);
  expect(moodNeighbors('locrian')).toEqual([{ id: 'phrygian', change: 'raise the 5th' }]);
  expect(moodNeighbors('blues')).toEqual([{ id: 'minpent', change: 'leave out the low 5th' }]);
  expect(moodRelatives('natural')).toContainEqual({ id: 'major', semis: 3 });
  expect(moodRelatives('minpent')).toEqual([{ id: 'majpent', semis: 3 }]);
});
