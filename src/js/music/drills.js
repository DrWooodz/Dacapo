/* Drill material: scales, arpeggios, reading lines, rhythms and the improvisation patterns. */
import { clamp, pick, rnd } from '../core/util.js';
import { Store } from '../core/store.js';
import {
  buildScale,
  fromDia,
  keyInfo,
  midiOf,
  N,
  parseNote,
  pcOf,
  scaleFingers,
  sigAccidentalFor,
  spellChord,
  spellerFor,
  tonicOct,
} from './theory.js';
import { COMPOSERS, Library } from './library.js';

/* ---------- drill material ----------
   A step is one moment where keys go down together: {midis, notes:[{n, st, f, fcls}], beat}
   beat = position in beats from the start, so even drills and real music share one timing model. */
const stepOf = (arr, beat) => ({ midis: arr.map(x => midiOf(x.n)), notes: arr, beat });

function scaleData(type, k, hand, octs) {
  const ki = keyInfo(type, k);
  const t0 = parseNote(ki.t + '4');
  const pc = pcOf(t0);
  const mk = h => {
    const t = N(t0.l, t0.a, tonicOct(h, pc, octs));
    return { notes: buildScale(t, type, octs), fingers: scaleFingers(k, type, h, octs) };
  };
  return { ki, rh: mk('rh'), lh: mk('lh') };
}

export function scaleSteps(type, key, hand, octs, npb = 2) {
  const sd = scaleData(type, key, hand, octs);
  const steps =
    hand === 'ht'
      ? sd.rh.notes.map((n, i) =>
          stepOf(
            [
              { n, st: 't', f: sd.rh.fingers[i], fcls: 'rh' },
              { n: sd.lh.notes[i], st: 'b', f: sd.lh.fingers[i], fcls: 'lh' },
            ],
            i / npb,
          ),
        )
      : sd[hand].notes.map((n, i) =>
          stepOf([{ n, st: hand === 'rh' ? 't' : 'b', f: sd[hand].fingers[i], fcls: hand }], i / npb),
        );
  return { steps, sig: sd.ki.sig, clef: hand === 'ht' ? 'grand' : hand === 'rh' ? 'treble' : 'bass' };
}

export function arpSteps(fam, key, hand, npb = 2) {
  const ki = keyInfo(fam === 'major' ? 'major' : 'natural', key);
  const t = parseNote(ki.t + '4');
  const pc = pcOf(t);
  const mk = h => {
    const root = N(t.l, t.a, h === 'lh' ? 2 + (pc <= 4 ? 1 : 0) : pc >= 8 ? 3 : 4);
    const tri = spellChord(root, fam === 'major' ? 'maj' : 'min');
    const up = [];
    for (let o = 0; o < 2; o++) tri.forEach(n => up.push(N(n.l, n.a, n.o + o)));
    up.push(N(root.l, root.a, root.o + 2));
    return up.concat(up.slice(0, -1).reverse());
  };
  // standard fingering for root-position arpeggios starting on a white key (the left hand takes 3 on the
  // major third of D, A, E and B major, which lies on a black key); black-key roots: thumb on the first
  // white key, shown without numbers
  const white = t.a === 0;
  const wideLeft = fam === 'major' && ['D', 'A', 'E', 'B'].includes(key);
  const fR = [1, 2, 3, 1, 2, 3, 5],
    fL = wideLeft ? [5, 3, 2, 1, 3, 2, 1] : [5, 4, 2, 1, 4, 2, 1];
  const fing = (h, i, len) => (white ? (h === 'lh' ? fL : fR)[i < 7 ? i : len - 1 - i] : '');
  const R = mk('rh'),
    L = mk('lh');
  const steps =
    hand === 'ht'
      ? R.map((n, i) =>
          stepOf(
            [
              { n, st: 't', f: fing('rh', i, R.length), fcls: 'rh' },
              { n: L[i], st: 'b', f: fing('lh', i, L.length), fcls: 'lh' },
            ],
            i / npb,
          ),
        )
      : (hand === 'lh' ? L : R).map((n, i, a) =>
          stepOf([{ n, st: hand === 'rh' ? 't' : 'b', f: fing(hand, i, a.length), fcls: hand }], i / npb),
        );
  return { steps, sig: ki.sig, clef: hand === 'ht' ? 'grand' : hand === 'rh' ? 'treble' : 'bass' };
}

/* ---------- reading lines ---------- */
// dia: C4 = 28. Treble staff lines E4(30)..F5(38); bass G2(18)..A3(26).
export const READ_UNITS = {
  r1: {
    t: 'Treble: middle C to G',
    d: 'Five notes up from middle C, right hand. Read by step and skip from middle C.',
    staves: { t: [28, 32] },
    max: 3,
    len: 8,
  },
  r2: {
    t: 'Bass: C to G',
    d: 'Five notes up from bass C (second space), left hand.',
    staves: { b: [21, 25] },
    max: 3,
    len: 8,
  },
  r3: {
    t: 'Treble: a full octave',
    d: 'Middle C to treble C, steps, skips and leaps up to a fifth.',
    staves: { t: [28, 35] },
    max: 4,
    len: 8,
  },
  r4: { t: 'Bass: a full octave', d: 'Bass C to middle C.', staves: { b: [21, 28] }, max: 4, len: 8 },
  r5: {
    t: 'Treble: the whole staff',
    d: 'Middle C up to top-line G, leaps up to an octave.',
    staves: { t: [28, 39] },
    max: 7,
    len: 8,
  },
  r6: {
    t: 'Bass: the whole staff',
    d: 'Bottom-line G (and low F) up to middle C.',
    staves: { b: [17, 28] },
    max: 7,
    len: 8,
  },
  r7: {
    t: 'Both staves',
    d: 'Notes jump between the hands: read the staff first, then the note.',
    staves: { t: [28, 37], b: [19, 28] },
    max: 7,
    len: 8,
  },
  r8t: {
    t: 'Treble: ledger lines',
    d: 'Above and below the treble staff, counted from the nearest landmark (middle C, high C, high G).',
    staves: { t: [25, 43] },
    max: 5,
    len: 8,
    ledger: true,
  },
  r8b: {
    t: 'Bass: ledger lines',
    d: 'Above and below the bass staff, counted from the nearest landmark (low C, middle C, low F).',
    staves: { b: [14, 31] },
    max: 5,
    len: 8,
    ledger: true,
  },
  r9t: {
    t: 'Treble: key signatures',
    d: 'Lines in G, F, D and B♭ major. The key signature applies to every note on its line or space.',
    staves: { t: [29, 38] },
    max: 4,
    len: 8,
    keys: [1, -1, 2, -2],
  },
  r9b: {
    t: 'Bass: key signatures',
    d: 'Lines in G, F, D and B♭ major, in the bass clef.',
    staves: { b: [18, 27] },
    max: 4,
    len: 8,
    keys: [1, -1, 2, -2],
  },
  r10t: {
    t: 'Treble: sharps, flats and naturals',
    d: 'Accidentals written in the line. An accidental lasts to the end of the bar.',
    staves: { t: [29, 38] },
    max: 3,
    len: 8,
    acc: true,
  },
  r10b: {
    t: 'Bass: sharps, flats and naturals',
    d: 'Accidentals written in the line, in the bass clef.',
    staves: { b: [18, 27] },
    max: 3,
    len: 8,
    acc: true,
  },
  r11: {
    t: 'Treble: intervals',
    d: 'Two notes at once in the right hand: recognize the shape (3rd, 5th, 6th, octave) instead of naming both notes.',
    staves: { t: [28, 38] },
    max: 4,
    len: 8,
    dyads: true,
  },
  r11b: {
    t: 'Bass: intervals',
    d: 'Two notes at once in the left hand: recognize the shape (3rd, 5th, 6th, octave).',
    staves: { b: [16, 26] },
    max: 4,
    len: 8,
    dyads: true,
  },
  r12: {
    t: 'Hands together',
    d: 'A right-hand melody over long left-hand notes.',
    staves: { t: [30, 37], b: [19, 25] },
    max: 3,
    len: 8,
    ht: true,
  },
  r13: {
    t: 'Chords',
    d: 'Triads in either hand. Read the bottom note, then the shape.',
    staves: { t: [28, 35], b: [19, 25] },
    max: 4,
    len: 6,
    triads: true,
  },
  r14: {
    t: 'Real music: right hand',
    d: 'Two bars at a time from the easier pieces in the library, right hand only: real rhythms and real phrases.',
    real: 'rh',
  },
  r15: {
    t: 'Real music: both hands',
    d: 'Two bars at a time from the easier pieces, hands together. Read the bass note first, then the melody.',
    real: 'ht',
  },
};

// two bars of real music you have not been practicing, for sight-reading
export function realExcerpt(hand) {
  // never a piece you are learning: reading it would be recall, not reading
  const working = new Set((Store.s.piece.working || []).map(w => w.pid));
  const pool = Library.all().filter(p => p.c !== 'mine' && p.lvl <= 2 && !working.has(p.id));
  for (let tries = 0; tries < 25 && pool.length; tries++) {
    const p = pick(pool);
    const nb = p.nb;
    if (nb < 4) continue;
    const a = (p.pickup ? 1 : 0) + rnd(Math.max(1, nb - 2 - (p.pickup ? 1 : 0)));
    const z = Math.min(nb, a + 2);
    const r = Library.steps(p.id, a, z, hand);
    const n = r.steps.length;
    if (n < 4 || n > 22 || r.steps.some(s => s.grace)) continue;
    if (hand === 'ht' && !r.steps.some(s => s.notes.some(x => x.fcls === 'lh'))) continue;
    const m = Library.meter(p.id, a);
    return {
      ...r,
      piece: true,
      pid: p.id,
      a,
      z,
      beats: r.total,
      meter: [m.n, m.d],
      unit: m.unit,
      clicks: m.clicks > 8 ? m.clicks / 2 : m.clicks,
      src: `${(COMPOSERS[p.c] || {}).short}: ${p.t}, bars ${a + (p.pickup ? 0 : 1)}–${z - (p.pickup ? 1 : 0)}`,
    };
  }
  return null;
}

function walkPool(lo, hi, max, len, start) {
  let d = start ?? lo + rnd(hi - lo + 1);
  const out = [d];
  for (let k = 1; k < len; k++) {
    const r = Math.random();
    const iv = r < 0.45 ? 1 : r < 0.75 ? 2 : 2 + rnd(Math.max(1, max - 1)) + 1;
    let dir = Math.random() < 0.5 ? -1 : 1;
    if (d + dir * iv > hi || d + dir * iv < lo) dir = -dir;
    d = clamp(d + dir * Math.min(iv, max), lo, hi);
    if (d === out[out.length - 1]) d = clamp(d + (d < hi ? 1 : -1), lo, hi);
    out.push(d);
  }
  return out;
}

export function readingLine(uid) {
  const U = READ_UNITS[uid] || READ_UNITS.r1;
  const sts = Object.keys(U.staves);
  let sig = 0,
    steps = [];
  const noteAt = (d, st, alt = 0) => ({ n: fromDia(d, alt), st, fcls: st === 't' ? 'rh' : 'lh' });
  if (U.keys) {
    sig = pick(U.keys);
    const st = pick(sts);
    const [lo, hi] = U.staves[st];
    steps = walkPool(lo, hi, U.max, U.len).map((d, i) => {
      const n = fromDia(d);
      return stepOf([{ n: N(n.l, sigAccidentalFor(sig, n.l), n.o), st, fcls: st === 't' ? 'rh' : 'lh' }], i);
    });
  } else if (U.dyads) {
    const st = sts[0];
    const [lo, hi] = U.staves[st];
    const ivs = [2, 4, 5, 7];
    let d = lo + 2;
    for (let i = 0; i < U.len; i++) {
      const iv = pick(ivs);
      d = clamp(d + pick([-2, -1, 1, 2]), lo, hi - iv);
      steps.push(stepOf([noteAt(d, st), noteAt(d + iv, st)], i));
    }
  } else if (U.triads) {
    for (let i = 0; i < U.len; i++) {
      const st = i % 2 ? 'b' : 't';
      const [lo, hi] = U.staves[st];
      const d = lo + rnd(hi - lo - 3);
      const inv = rnd(3);
      const sh = inv === 0 ? [0, 2, 4] : inv === 1 ? [0, 2, 5] : [0, 3, 5];
      steps.push(
        stepOf(
          sh.map(x => noteAt(d + x, st)),
          i,
        ),
      );
    }
  } else if (U.ht) {
    const mel = walkPool(U.staves.t[0], U.staves.t[1], U.max, U.len);
    const bass = walkPool(U.staves.b[0], U.staves.b[1], 2, U.len / 2);
    mel.forEach((d, i) => {
      const arr = [noteAt(d, 't')];
      if (i % 2 === 0) arr.push(noteAt(bass[i / 2], 'b'));
      steps.push(stepOf(arr, i));
    });
  } else if (sts.length === 2 && !U.ledger) {
    let st = pick(sts);
    let d = null;
    for (let i = 0; i < U.len; i++) {
      if (i && Math.random() < 0.45) st = st === 't' ? 'b' : 't';
      const [lo, hi] = U.staves[st];
      d = lo + rnd(hi - lo + 1);
      steps.push(stepOf([noteAt(d, st)], i));
    }
  } else {
    const st = pick(sts);
    const [lo, hi] = U.staves[st];
    let line = walkPool(lo, hi, U.max, U.len);
    if (U.ledger) {
      const inStaff = st === 't' ? [30, 38] : [18, 26];
      let tries = 0;
      while (line.filter(d => d < inStaff[0] || d > inStaff[1]).length < 3 && tries++ < 30)
        line = walkPool(lo, hi, U.max, U.len, Math.random() < 0.5 ? lo + 1 : hi - 1);
    }
    steps = line.map((d, i) => {
      let alt = 0;
      if (U.acc && Math.random() < 0.35) {
        const n = fromDia(d);
        alt = pick([-1, 1]);
        if ((n.l === 2 || n.l === 6) && alt === 1) alt = -1;
        if ((n.l === 3 || n.l === 0) && alt === -1) alt = 1;
      }
      return stepOf([noteAt(d, st, alt)], i);
    });
  }
  const used = new Set(steps.flatMap(s => s.notes.map(x => x.st)));
  const clef = used.size === 2 ? 'grand' : used.has('b') ? 'bass' : 'treble';
  return { steps, sig, clef };
}

/* ---------- rhythm bars ---------- */
export const RHY_UNITS = {
  ry1: {
    t: 'Rhythm: quarters, halves, wholes',
    d: 'Count "1 2 3 4" out loud and tap on the notes.',
    level: 1,
    meters: [4],
  },
  ry2: {
    t: 'Rhythm: eighths and 3/4',
    d: 'Eighth notes split the beat: count "1 and 2 and".',
    level: 2,
    meters: [4, 3],
  },
  ry3: {
    t: 'Rhythm: dotted notes and syncopation',
    d: 'A dotted quarter lasts a beat and a half; feel the "and" it lands on.',
    level: 3,
    meters: [4, 3],
  },
  ry4: {
    t: 'Rhythm: sixteenths and triplets',
    d: 'Sixteenths: "1 e and a". Triplets: "1 trip-let".',
    level: 4,
    meters: [4],
  },
};

export function rhythmBar(level, meter) {
  const c1 = [[{ d: 1 }], [{ d: 2 }], [{ d: 1, rest: true }]],
    c1b = [[{ d: 4 }]];
  const c2 = [
    [
      { d: 0.5, beam: 'start' },
      { d: 0.5, beam: 'end' },
    ],
    [{ d: 3, dot: true }],
    [{ d: 2, rest: true }],
  ];
  const c3 = [
    [{ d: 1.5, dot: true }, { d: 0.5 }],
    [{ d: 0.5, rest: true }, { d: 0.5 }],
    [{ d: 0.5 }, { d: 1 }, { d: 0.5 }],
  ];
  const c4 = [
    [
      { d: 0.25, beam: 'start', b2: 1 },
      { d: 0.25, beam: 'mid', b2: 1 },
      { d: 0.25, beam: 'mid', b2: 1 },
      { d: 0.25, beam: 'end', b2: 1 },
    ],
    [
      { d: 0.5, beam: 'start' },
      { d: 0.25, beam: 'mid', b2: 1 },
      { d: 0.25, beam: 'end', b2: 1 },
    ],
    [
      { d: 0.25, beam: 'start', b2: 1 },
      { d: 0.25, beam: 'mid', b2: 1 },
      { d: 0.5, beam: 'end' },
    ],
    [
      { d: 1 / 3, beam: 'start', tup: 3 },
      { d: 1 / 3, beam: 'mid' },
      { d: 1 / 3, beam: 'end' },
    ],
  ];
  let pool = c1.slice();
  if (meter === 4 && level === 1) pool = pool.concat(c1b);
  if (level >= 2) pool = pool.concat(c2, c2);
  if (level >= 3) pool = pool.concat(c3, c3);
  if (level >= 4) pool = pool.concat(c4, c4, c4);
  for (let tries = 0; tries < 300; tries++) {
    let t = 0;
    const ev = [];
    let guard = 0;
    while (t < meter - 1e-6 && guard++ < 60) {
      const c = pick(pool);
      const len = c.reduce((a, e) => a + e.d, 0);
      if (t + len > meter + 1e-6) continue;
      // keep dotted quarters on the beat (simpler to read)
      if (len === 1.5 && Math.abs(t % 1) > 1e-6) continue;
      c.forEach(e => ev.push({ ...e }));
      t += len;
    }
    const notes = ev.filter(e => !e.rest).length;
    if (notes >= 3 && !ev[0].rest && Math.abs(t - meter) < 1e-6) return ev;
  }
  return Array.from({ length: meter }, () => ({ d: 1 }));
}

export function rhythmSteps(events) {
  const out = [];
  let t = 0;
  events.forEach((e, i) => {
    if (!e.rest) out.push({ midis: [], notes: [], beat: t, ev: i, any: true });
    t += e.d;
  });
  return out;
}

/* ---------- improvisation palettes (style studies on the masters' harmony) ---------- */
const mm = s => midiOf(parseNote(s));

export const mms = s => s.split(' ').map(mm);

export const PALETTES = [
  {
    id: 'satie',
    t: 'Satie: Gymnopédie colors',
    meter: 3,
    bpm: 66,
    key: 'D major',
    sig: 2,
    scale: 'D4 E4 F#4 G4 A4 B4 C#5',
    pat: 'oompah',
    chords: [
      ['Gmaj7', 'G2', 'B3 D4 F#4'],
      ['Dmaj7', 'D2', 'A3 C#4 F#4'],
    ],
    how: 'The left hand plays the bass on beat 1 and leaps to the chord on beat 2. Then improvise a slow right-hand melody in D major: long notes, mostly steps, lots of space.',
  },
  {
    id: 'chopin',
    t: 'Chopin: nocturne left hand',
    meter: 4,
    bpm: 56,
    key: 'D♭ major',
    sig: -5,
    scale: 'Db4 Eb4 F4 Gb4 Ab4 Bb4 C5',
    pat: 'arp',
    chords: [
      ['D♭', 'Db2', 'Ab2 F3 Ab3'],
      ['B♭m', 'Bb1', 'F2 Db3 F3'],
      ['E♭m7', 'Eb2', 'Bb2 Gb3 Db4'],
      ['A♭7', 'Ab1', 'Eb2 C3 Gb3'],
    ],
    how: 'Wide broken chords in the left hand, the bass deepest. Over it, sing a long right-hand line: chord tones on beats 1 and 3, neighbor notes and turns between.',
  },
  {
    id: 'debussy',
    t: 'Debussy: whole-tone haze',
    meter: 4,
    bpm: 52,
    key: 'whole-tone',
    sig: 0,
    scale: 'C4 D4 E4 F#4 G#4 A#4',
    pat: 'pad',
    chords: [
      ['C+7', 'C2', 'E3 G#3 A#3'],
      ['D+7', 'D2', 'F#3 A#3 C4'],
    ],
    how: 'Hold soft chords in the left hand. Every note of the whole-tone scale fits: play parallel thirds, let phrases rise and dissolve. Color and touch, not direction.',
  },
  {
    id: 'penta',
    t: 'Pentatonic on the black keys',
    meter: 4,
    bpm: 66,
    key: 'G♭ pentatonic',
    sig: -6,
    scale: 'Gb4 Ab4 Bb4 Db5 Eb5',
    pat: 'pad',
    chords: [
      ['G♭', 'Gb2', 'Db3 Gb3 Bb3'],
      ['E♭m7', 'Eb2', 'Bb2 Db3 Gb3'],
    ],
    how: 'Only black keys, so there are no wrong notes: work on phrasing. Shape each phrase to a peak, vary the dynamics, echo a phrase an octave higher.',
  },
  {
    id: 'rach',
    t: 'Rachmaninoff: bells and octaves',
    meter: 4,
    bpm: 54,
    key: 'C♯ minor',
    sig: 4,
    scale: 'C#4 D#4 E4 F#4 G#4 A4 B#4',
    pat: 'bells',
    chords: [
      ['C♯m', 'C#2', 'G#3 C#4 E4'],
      ['A', 'A1', 'A3 C#4 E4'],
      ['F♯m', 'F#2', 'A3 C#4 F#4'],
      ['G♯7', 'G#1', 'G#3 B#3 F#4'],
    ],
    how: 'Bass octaves and full chords in the left hand, played with arm weight. Improvise a slow right-hand melody in octaves, landing on chord tones.',
  },
];

export const PAL_BY_ID = Object.fromEntries(PALETTES.map(p => [p.id, p]));

export function palChords(P) {
  return P.chords.map(([n, b, t]) => ({
    n,
    bass: mm(b),
    tones: mms(t),
    pcs: new Set([mm(b), ...mms(t)].map(x => x % 12)),
  }));
}

// the left-hand pattern of a palette as a drill: two passes through the progression
export function patternSteps(P) {
  const sp = spellerFor(P.sig);
  const chords = palChords(P);
  const steps = [];
  let beat = 0;
  const note = m => ({ n: sp(m), st: m >= 60 ? 't' : 'b', fcls: 'lh' });
  for (let pass = 0; pass < 2; pass++)
    chords.forEach(ch => {
      if (P.pat === 'oompah') {
        steps.push(stepOf([note(ch.bass)], beat));
        steps.push(stepOf(ch.tones.map(note), beat + 1));
        beat += 3;
      } else if (P.pat === 'arp') {
        const seq = [ch.bass, ...ch.tones, ch.tones[1], ch.tones[0], ch.tones[2], ch.tones[1]].slice(0, 8);
        seq.forEach((m, i) => steps.push(stepOf([note(m)], beat + i / 2)));
        beat += 4;
      } else if (P.pat === 'bells') {
        steps.push(stepOf([note(ch.bass), note(ch.bass + 12)], beat));
        steps.push(stepOf(ch.tones.map(note), beat + 2));
        beat += 4;
      } else {
        steps.push(stepOf([note(ch.bass), ...ch.tones.map(note)], beat));
        beat += 4;
      }
    });
  const all = steps.flatMap(s => s.midis);
  return {
    steps,
    sig: P.sig,
    clef: Math.max(...all) >= 60 && Math.min(...all) < 60 ? 'grand' : 'bass',
    beats: beat,
  };
}
