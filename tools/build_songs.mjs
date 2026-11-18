/* Builds the tunes (src/data/songs.json) from the Open Hymnal Project's ABC files, which are in the public
   domain: https://github.com/mzealey/openhymnal (a copy of openhymnal.org).

     node tools/build_songs.mjs /path/to/openhymnal

   Each tune comes in two arrangements: melody and chords (the melody in the right hand, the chords as
   close triads in the left, each the shape nearest the last), and the four-part setting (soprano and alto
   in the right hand, tenor and bass in the left). Both carry the chord symbols, read from the harmony. */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseAbc } from './abc.mjs';
import { chordSymbols, packNotes, sectionsOf } from '../src/js/music/pack.js';
import { CHORDS } from '../src/js/music/theory.js';
import { MOOD_BY } from '../src/js/music/moods.js';

// id, file, title, origin, level (1 to 5), mood and its tonic (checked by ear and against the harmony), a tip
const TUNES = [
  [
    'greensleeves',
    'What_Child_Is_This-Greensleeves',
    'Greensleeves',
    'English, 16th century',
    2,
    'natural',
    4,
    'The raised 7th (D♯) and the borrowed C♮ give it its ache. Keep the dotted rhythm lilting, not stiff.',
  ],
  [
    'veni-emmanuel',
    'O_Come_O_Come_Emmanuel-Veni_Emmanuel',
    'Veni Emmanuel',
    'French, 15th century',
    2,
    'natural',
    4,
    'A plainchant-like minor tune: let each phrase breathe, and keep the left hand quiet under it.',
  ],
  [
    'picardy',
    'Let_All_Mortal_Flesh_Keep_Silence-Picardy',
    'Picardy',
    'French, 17th century',
    2,
    'natural',
    2,
    'Dark and processional. An even, heavy pulse; the melody rises and falls inside a fifth.',
  ],
  [
    'third-mode',
    'Have_Mercy_On_Me_O_My_God-Third_Mode_Melody',
    'Third Mode Melody',
    'Thomas Tallis, 1567',
    3,
    'phrygian',
    2,
    'The theme of Vaughan Williams’s Fantasia on a Theme by Thomas Tallis: Phrygian, the low 2nd pulling down to home. No fixed meter: follow the phrases.',
  ],
  [
    'passion-chorale',
    'O_Sacred_Head_Now_Wounded-Passion_Chorale-Herzlich_Tut_Mich_Verlangen',
    'Passion Chorale',
    'Hans Leo Hassler, 1601',
    3,
    'natural',
    9,
    'The chorale Bach set five times in the St Matthew Passion. It begins in A minor and ends on the major chord a third above: listen for each line moving on its own.',
  ],
  [
    'ebenezer',
    'O_The_Deep_Deep_Love_Of_Jesus-Ebenezer-Ton_Y_Botel',
    'Ebenezer',
    'Thomas J. Williams, 1890 (Welsh)',
    3,
    'natural',
    5,
    'A surging Welsh minor tune: the triplets push each phrase forward, like waves.',
  ],
  [
    'kingsfold',
    'O_Lord_My_God_I_Thirst_For_You-Kingsfold',
    'Kingsfold',
    'English folk tune',
    2,
    'natural',
    4,
    'An English folk melody (it is also "Dives and Lazarus"): minor, sturdy and open, built from one repeated phrase shape.',
  ],
  [
    'o-waly-waly',
    'When_I_Survey_The_Wondrous_Cross-O_Waly_Waly',
    'O Waly Waly',
    'English folk tune',
    2,
    'major',
    7,
    'The tune of "The Water Is Wide": hold the long notes their full length and let them sing.',
  ],
  [
    'god-rest-ye',
    'God_Rest_Ye_Merry_Gentlemen-God_Rest_Ye_Merry_Gentlemen',
    'God Rest Ye Merry',
    'English, 18th century',
    2,
    'natural',
    4,
    'Minor, but brisk: keep the quarter notes crisp and the phrase endings strong.',
  ],
  [
    'slane',
    'Be_Thou_My_Vision-Slane',
    'Slane',
    'Irish folk tune',
    2,
    'major',
    3,
    'An Irish folk melody, nearly pentatonic: let the 3/4 swing gently, one pulse per bar.',
  ],
  [
    'brother-james',
    'The_Lords_My_Shepherd-Marosa-Brother_James_Air',
    'Brother James’s Air',
    'James Leith Macbeth Bain, 1915',
    3,
    'major',
    2,
    'Long, arching phrases in 3/2: count in half notes and let the melody float.',
  ],
  [
    'ar-hyd-y-nos',
    'God_That_Madest_Earth_and_Heaven-Ar_Hyd_Y_Nos',
    'Ar Hyd y Nos',
    'Welsh folk tune',
    1,
    'major',
    7,
    '"All Through the Night": a lullaby. Smooth and quiet; the middle phrase climbs, then comes home.',
  ],
  [
    'ode-to-joy',
    'Joyful_Joyful_We_Adore_Thee-Ode_To_Joy',
    'Ode to Joy',
    'Ludwig van Beethoven, 1824',
    1,
    'major',
    7,
    'The theme from the Ninth Symphony: almost all steps. The syncopation in the third phrase is the moment.',
  ],
  [
    'stille-nacht',
    'Silent_Night-Stille_Nacht',
    'Stille Nacht',
    'Franz Xaver Gruber, 1818',
    1,
    'major',
    10,
    'Silent Night, in its original lilting 6/8 feel written in 3/4: gentle, and never rushed.',
  ],
  [
    'new-britain',
    'Amazing_Grace-New_Britain',
    'New Britain',
    'American, 1829',
    1,
    'majpent',
    7,
    'Amazing Grace: the melody is a major pentatonic. A good first tune for melody and chords.',
  ],
  [
    'es-ist-ein-ros',
    'Lo_How_A_Rose_Eer_Blooming-Es_Ist_Ein_Ros_Entsprungen',
    'Es ist ein Ros',
    'Michael Praetorius, 1609',
    3,
    'major',
    5,
    'Lo, How a Rose: a Renaissance setting in shifting meters. Sing the phrases; the bar lines come second.',
  ],
  [
    'finlandia',
    'Be_Still_My_Soul-Finlandia',
    'Finlandia',
    'Jean Sibelius, 1899',
    3,
    'major',
    5,
    'The hymn from Sibelius’s tone poem: broad and noble. Full chords, held their whole length.',
  ],
  [
    'cranham',
    'In_The_Bleak_MidWinter-Cranham',
    'Cranham',
    'Gustav Holst, 1906',
    2,
    'major',
    5,
    'In the Bleak Midwinter: simple and still. The right hand carries the tune over soft chords.',
  ],
];

const root = process.argv[2];
if (!root) {
  console.error('usage: node tools/build_songs.mjs /path/to/openhymnal');
  process.exit(1);
}
const findFile = name => {
  for (const dir of ['Complete', 'Choir']) {
    const base = join(root, dir, name.split('-')[0]);
    if (existsSync(join(base, name + '.abc'))) return join(base, name + '.abc');
  }
  throw new Error('not found: ' + name);
};

const TPQ = 48;
const r4 = x => Math.round(x * TPQ) / TPQ;
const pc12 = m => ((m % 12) + 12) % 12;
// the accidental a note is written with, from its key: sharps in sharp keys, flats in flat keys
const writtenAcc = (m, acc) => acc;

// the chord in root position, so the bass is its root (an inversion would change the harmony): the root
// from G2 to F♯3, nearest the previous one
function closeTriad(pcs, prev) {
  let best = null;
  for (let r = 43; r < 55; r++) {
    if (pc12(r) !== pcs[0]) continue;
    const v = [r, ...pcs.slice(1, 3).map(p => r + ((p - pcs[0] + 12) % 12))];
    const cost = Math.abs(r - (prev ? prev[0] : 48));
    if (!best || cost < best.cost) best = { v, cost };
  }
  return best.v;
}
// a chord symbol back to its notes: C, Am, G7, F♯°, B♭maj7, Eø7, C+
const SUFFIX = Object.fromEntries(Object.entries(CHORDS).map(([k, v]) => [v.sym, k]));
function symbolPcs(sym) {
  const m = /^([A-G])([♯♭]?)(.*)$/.exec(sym);
  const base =
    { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '♯' ? 1 : m[2] === '♭' ? -1 : 0);
  const k = SUFFIX[m[3]] || 'maj';
  const tones = CHORDS[k].s;
  // three notes for the left hand: a 7th chord drops its 5th
  const pick = tones.length > 3 ? [tones[0], tones[1], tones[3]] : tones;
  return pick.map(x => pc12(base + x));
}

const out = [];
for (const [id, file, title, origin, lvl, mood, pc, tip] of TUNES) {
  const path = findFile(file);
  const abc = parseAbc(readFileSync(path, 'latin1'));
  const bars = abc.bars.map(r4);
  const end = bars[bars.length - 1];
  const barBeats = abc.meter ? (abc.meter[0] * 4) / abc.meter[1] : null;
  const pickup = barBeats != null && bars[1] - bars[0] < barBeats - 1e-6;
  // the notes of each staff, a note shared by two voices kept once
  const all = new Map();
  for (const v of abc.voices)
    for (const n of v.notes) {
      const h = v.staff;
      const k = `${r4(n.t)}:${n.m}:${h}`;
      const prev = all.get(k);
      if (!prev || prev.d < n.d)
        all.set(k, {
          t: r4(n.t),
          d: r4(n.d),
          m: n.m,
          acc: writtenAcc(n.m, n.acc),
          h,
          s: h,
          f: 0,
          top: v === abc.voices[0],
        });
    }
  const full = [...all.values()];
  const melody = abc.voices[0].notes.map(n => ({
    t: r4(n.t),
    d: r4(n.d),
    m: n.m,
    acc: n.acc,
    h: 0,
    s: 0,
    f: 0,
  }));
  // (a pickup is the melody alone: the chords begin on the first downbeat)
  let syms = chordSymbols(full, bars, { sig: abc.sig });
  if (pickup) {
    const before = syms.filter(([t]) => t < bars[1] - 1e-6).pop();
    syms = syms.filter(([t]) => t >= bars[1] - 1e-6);
    if (before && !(syms[0] && Math.abs(syms[0][0] - bars[1]) < 1e-6)) syms.unshift([bars[1], before[1]]);
  }
  // melody and chords: a left-hand chord at each symbol, struck again at each bar line
  const lh = [];
  let prev = null;
  syms.forEach(([t, sym], i) => {
    const until = i + 1 < syms.length ? syms[i + 1][0] : end;
    const v = closeTriad(symbolPcs(sym), prev);
    prev = v;
    const cuts = [t, ...bars.filter(b => b > t + 1e-6 && b < until - 1e-6), until];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const fs = [5, 3, 1];
      v.forEach((m, j) =>
        lh.push({ t: r4(cuts[k]), d: r4(cuts[k + 1] - cuts[k]), m, acc: null, h: 1, s: 1, f: fs[j] }),
      );
    }
  });
  // left-hand chord notes are spelled by the key: sharps in sharp keys, flats in flat keys
  const spellAcc = m => {
    const black = [1, 3, 6, 8, 10].includes(pc12(m));
    return black ? (abc.sig >= 0 ? 1 : -1) : 0;
  };
  lh.forEach(n => (n.acc = spellAcc(n.m)));
  const nb = bars.length - 1;
  const ts = abc.meter
    ? [[0, abc.meter[0], abc.meter[1]]]
    : bars.slice(1).reduce((acc, b, i) => {
        const len = b - bars[i];
        const sigT = Number.isInteger(len) ? [len, 4] : [len * 2, 8];
        const last = acc[acc.length - 1];
        if (!last || last[1] !== sigT[0] || last[2] !== sigT[1]) acc.push([i, ...sigT]);
        return acc;
      }, []);
  const secLen = barBeats && barBeats >= 6 ? 2 : 4;
  const base = {
    c: 'tunes',
    y: origin,
    lvl,
    bpm: Math.min(abc.tempo || 80, 120),
    tempos: [],
    shift: 0,
    pickup,
    nb,
    ts,
    keys: [[0, abc.sig]],
    clefs: [
      [0, 0, 't'],
      [0, 1, 'b'],
    ],
    syms,
    mood,
    pc,
    lic: 'Public domain',
    by: 'Open Hymnal Project',
    mut: '',
    src: 'openhymnal.org',
  };
  const lead = [...melody, ...lh];
  const four = full.map(n => ({ ...n, top: undefined }));
  for (const [suffix, notes, sub, lv] of [
    ['', lead, 'Melody and chords', lvl],
    ['-4', four, 'Four-part setting', Math.min(5, lvl + 1)],
  ]) {
    const packed = packNotes(notes, bars, TPQ);
    out.push({
      id: `tune-${id}${suffix}`,
      t: title,
      sub,
      ...base,
      lvl: lv,
      tip,
      ...packed,
      secs: sectionsOf(notes, bars, { len: secLen, pickup }),
      pair: `tune-${id}${suffix ? '' : '-4'}`,
    });
  }
  const M = MOOD_BY[mood];
  const melodyPcs = [...new Set(melody.map(n => pc12(n.m - pc)))].sort((a, b) => a - b);
  const outside = melodyPcs.filter(x => !M.semis.includes(x));
  console.log(
    `${title.padEnd(22)} ${M.n} on ${pc} · final bass ${pc12(Math.min(...full.filter(n => n.h === 1 && n.t + n.d >= end - 1e-6).map(n => n.m)))} · melody outside: [${outside}] · ${syms.length} chords: ${syms
      .slice(0, 8)
      .map(s => s[1])
      .join(' ')}`,
  );
}
writeFileSync(new URL('../src/data/songs.json', import.meta.url), JSON.stringify(out));
console.log(`${out.length} arrangements written`);
