/* Reading a MusicXML score (score-partwise, as MuseScore, Finale, Sibelius and Dorico export it) into a
   piece: the notes of every part (a piano part's two staves, or a melody part and a bass part), ties
   joined, bars, time and key signatures, clefs, the tempo, fingerings and chord symbols when the file has
   them. Repeats are played as written once; grace notes are left out. Pure except for DOMParser. */
import { chordSymbols, packNotes, sectionsOf } from './pack.js';
import { guessMood } from './moodtools.js';

const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// MusicXML's chord kinds, as the chord types the app names
const KIND = {
  major: 'maj',
  minor: 'min',
  diminished: 'dim',
  augmented: 'aug',
  dominant: 'dom7',
  'major-seventh': 'maj7',
  'minor-seventh': 'min7',
  'half-diminished': 'hdim7',
  'diminished-seventh': 'dim7',
  'major-minor': 'minmaj7',
  'suspended-second': 'sus2',
  'suspended-fourth': 'sus4',
  // (6ths, 9ths and the rest are named by their triad)
  'major-sixth': 'maj',
  'minor-sixth': 'min',
  'dominant-ninth': 'dom7',
  'major-ninth': 'maj7',
  'minor-ninth': 'min7',
  'dominant-11th': 'dom7',
  'dominant-13th': 'dom7',
  power: 'maj',
};
const SYM = {
  maj: '',
  min: 'm',
  dim: '°',
  aug: '+',
  dom7: '7',
  maj7: 'maj7',
  min7: 'm7',
  hdim7: 'ø7',
  dim7: '°7',
  minmaj7: 'm(maj7)',
  sus2: 'sus2',
  sus4: 'sus4',
};

const kids = (el, name) => (el ? [...el.children].filter(c => c.localName === name) : []);
const kid = (el, name) => kids(el, name)[0] || null;
const num = (el, name, def = 0) => {
  const k = kid(el, name);
  return k ? +k.textContent.trim() : def;
};
const text = (el, name) => {
  const k = kid(el, name);
  return k ? k.textContent.trim() : '';
};

export function parseMusicXML(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('This file is not readable MusicXML.');
  const root = doc.documentElement;
  if (root.localName === 'score-timewise')
    throw new Error('This MusicXML is “timewise”; export it again as a normal (partwise) score.');
  if (root.localName !== 'score-partwise') throw new Error('This is not a MusicXML score.');
  const title =
    text(kid(root, 'work'), 'work-title') ||
    text(root, 'movement-title') ||
    [...root.querySelectorAll('credit-words')].map(c => c.textContent.trim()).find(Boolean) ||
    '';
  const composer = [...root.querySelectorAll('identification > creator')].find(
    c => c.getAttribute('type') === 'composer',
  );
  const parts = kids(root, 'part');
  if (!parts.length) throw new Error('The score has no parts.');

  const notes = [];
  const harmony = [];
  const measureLen = []; // the longest each measure runs, over all parts (beats)
  const ts = [];
  const keys = [];
  const clefs = [];
  let bpm = null;
  let pickup = false;
  // which staff a part's staff goes on: a two-staff part is the piano; otherwise a bass-clef part is the
  // lower staff
  const partStaves = parts.map(p => {
    const attrs = p.querySelector('measure > attributes');
    const staves = attrs ? num(attrs, 'staves', 1) : 1;
    const clef = attrs && kid(attrs, 'clef');
    return { staves, low: staves === 1 && clef && text(clef, 'sign') === 'F' };
  });
  parts.forEach((part, pi) => {
    const { staves, low } = partStaves[pi];
    const staffOf = n => (staves > 1 ? Math.min(1, num(n, 'staff', 1) - 1) : low ? 1 : 0);
    let div = 1;
    let start = 0; // the measure's start, in beats
    const open = new Map(); // tied notes waiting for their continuation: "staff:midi" -> note
    kids(part, 'measure').forEach((meas, mi) => {
      if (mi === 0 && meas.getAttribute('implicit') === 'yes') pickup = true;
      let pos = 0; // in divisions, from the measure's start
      let maxPos = 0;
      let lastStart = 0;
      for (const el of meas.children) {
        const tag = el.localName;
        if (tag === 'attributes') {
          div = num(el, 'divisions', div) || div;
          if (pi === 0) {
            const time = kid(el, 'time');
            if (time && kid(time, 'beats')) ts.push([mi, num(time, 'beats', 4), num(time, 'beat-type', 4)]);
            const key = kid(el, 'key');
            if (key && kid(key, 'fifths')) keys.push([mi, num(key, 'fifths', 0)]);
          }
          kids(el, 'clef').forEach(c => {
            const s = staves > 1 ? Math.min(1, +(c.getAttribute('number') || 1) - 1) : low ? 1 : 0;
            const k = text(c, 'sign') === 'F' ? 'b' : 't';
            // (only changes from what the staff has: treble on top, bass below to begin with)
            const prev = clefs.filter(x => x[1] === s).pop();
            if ((prev ? prev[2] : s ? 'b' : 't') !== k) clefs.push([mi, s, k]);
          });
        } else if (tag === 'backup') pos -= num(el, 'duration');
        else if (tag === 'forward') {
          pos += num(el, 'duration');
          maxPos = Math.max(maxPos, pos);
        } else if (tag === 'direction' || tag === 'sound') {
          const snd = tag === 'sound' ? el : el.querySelector('sound');
          if (bpm == null && snd && snd.getAttribute('tempo')) bpm = Math.round(+snd.getAttribute('tempo'));
          const per = el.querySelector('metronome > per-minute');
          const unit = el.querySelector('metronome > beat-unit');
          if (bpm == null && per && +per.textContent) {
            const f = { half: 2, quarter: 1, eighth: 0.5 }[unit ? unit.textContent.trim() : 'quarter'] || 1;
            bpm = Math.round(
              +per.textContent * f * (el.querySelector('metronome > beat-unit-dot') ? 1.5 : 1),
            );
          }
        } else if (tag === 'harmony') {
          const r = kid(el, 'root');
          if (!r) continue;
          const pc = (STEP[text(r, 'root-step')] + num(r, 'root-alter', 0) + 12) % 12;
          const k = KIND[text(el, 'kind')] || 'maj';
          const step = text(r, 'root-step');
          const alt = num(r, 'root-alter', 0);
          const t = start + (pos + num(el, 'offset', 0)) / div;
          harmony.push({ t, sym: step + (alt > 0 ? '♯' : alt < 0 ? '♭' : '') + SYM[k], pc, k });
        } else if (tag === 'note') {
          if (kid(el, 'grace')) continue;
          const dur = num(el, 'duration', 0);
          const chord = !!kid(el, 'chord');
          const at = chord ? lastStart : pos;
          if (!chord) {
            lastStart = pos;
            pos += dur;
            maxPos = Math.max(maxPos, pos);
          }
          const p = kid(el, 'pitch');
          if (!p || kid(el, 'rest')) continue;
          const alter = num(p, 'alter', 0);
          const m = 12 * (num(p, 'octave', 4) + 1) + STEP[text(p, 'step')] + alter;
          const s = staffOf(el);
          const ties = kids(el, 'tie').map(x => x.getAttribute('type'));
          const key = s + ':' + m;
          const t = start + at / div;
          const d = dur / div;
          if (ties.includes('stop') && open.has(key)) {
            const n = open.get(key);
            n.d = t + d - n.t;
            if (!ties.includes('start')) open.delete(key);
            continue;
          }
          const f = +(el.querySelector('notations > technical > fingering') || {}).textContent || 0;
          const n = { t, d, m, acc: Math.round(alter), h: s, s, f: f >= 1 && f <= 5 ? f : 0 };
          notes.push(n);
          if (ties.includes('start')) open.set(key, n);
        }
      }
      measureLen[mi] = Math.max(measureLen[mi] || 0, maxPos / div);
      start += maxPos / div;
    });
  });
  if (!notes.length) throw new Error('The score has no notes.');
  // bar lines from the longest measure in each place (parts agree in a well-made score)
  const bars = [0];
  measureLen.forEach(l => bars.push(bars[bars.length - 1] + (l || 0)));
  const clean = bars.filter((b, i) => i === 0 || b > bars[i - 1] + 1e-6);
  return {
    title,
    composer: composer ? composer.textContent.trim() : '',
    notes,
    bars: clean,
    ts: ts.length ? ts : [[0, 4, 4]],
    keys: keys.length ? keys : [[0, 0]],
    clefs,
    bpm,
    pickup,
    harmony: harmony.sort((a, b) => a.t - b.t),
  };
}

// how hard a piece looks: notes per beat and how many sound at once
function levelOf(notes, beats) {
  const perBeat = notes.length / Math.max(1, beats);
  const at = new Map();
  notes.forEach(n => at.set(n.t.toFixed(3), (at.get(n.t.toFixed(3)) || 0) + 1));
  const thick = Math.max(...at.values());
  return Math.max(1, Math.min(5, Math.round(perBeat / 1.2 + (thick > 4 ? 1 : 0))));
}

/* a parsed score as a piece in Songs (your own: c 'mine'). Chord symbols written in the file are shown on
   the score; without them DaCapo names the chords itself for noodling, and does not print its guesses. */
export function pieceFromScore(sc, { file = '', id = '' } = {}) {
  const notes = sc.notes.slice().sort((a, b) => a.t - b.t || a.h - b.h || a.m - b.m);
  const bars = sc.bars;
  const nb = bars.length - 1;
  const sig = sc.keys[0][1];
  const [n0, d0] = sc.ts[0].slice(1);
  const barBeats = (n0 * 4) / d0;
  const written = sc.harmony.map(h => [+h.t.toFixed(4), h.sym]);
  const syms = written.length ? written : chordSymbols(notes, bars, { sig });
  // the mood and key, for noodling over its chords (the signature's major if the notes say little)
  const g = guessMood(notes);
  const majPc = (((sig * 7) % 12) + 12) % 12;
  const t = sc.title || file.replace(/\.(musicxml|xml|mxl)$/i, '') || 'Untitled';
  return {
    id: id || 'mine-' + Date.now().toString(36),
    t,
    sub: sc.composer || '',
    c: 'mine',
    y: '',
    lvl: levelOf(notes, bars[nb]),
    bpm: Math.max(30, Math.min(200, sc.bpm || 80)),
    tempos: [],
    shift: 0,
    pickup: sc.pickup,
    nb,
    ts: sc.ts,
    keys: sc.keys,
    clefs: sc.clefs,
    syms,
    showSyms: written.length > 0,
    mood: g ? g.mood : 'major',
    pc: g ? g.pc : majPc,
    lic: '',
    by: '',
    mut: '',
    src: file,
    tip: '',
    ...packNotes(notes, bars),
    secs: sectionsOf(notes, bars, { len: barBeats >= 6 ? 2 : 4, pickup: sc.pickup }),
  };
}
