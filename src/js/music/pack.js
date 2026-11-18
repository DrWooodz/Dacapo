/* Making a piece from notes (pure): packing them the way the library stores them, cutting practice
   sections of about four bars (a repeat shares its first time's section), and naming the chords for a lead
   sheet. Used for the tunes (tools/build_songs.mjs) and for scores you import. */
import { CHORDS, spellerFor } from './theory.js';

// a varint, 7 bits at a time, as library.js reads them
function varint(n, out) {
  let v = Math.max(0, Math.round(n));
  do {
    let b = v % 128;
    v = Math.floor(v / 128);
    if (v) b += 128;
    out.push(b);
  } while (v);
}
const zz = n => (n < 0 ? -2 * n - 1 : 2 * n);
const b64 = bytes => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return typeof btoa === 'function' ? btoa(s) : globalThis.Buffer.from(s, 'binary').toString('base64');
};

/* notes: [{t, d, m, acc, h, s, f}] in quarter-note beats (h: 0 right hand, 1 left; s: 0 treble staff, 1
   bass; acc: the accidental as written, -2..2; f: finger or 0). bars: bar starts in beats, then the end.
   Returns the packed fields of a piece: notes, n, fing, bars, tpq. */
export function packNotes(notes, bars, tpq = 48) {
  const sorted = notes.slice().sort((a, b) => a.t - b.t || a.h - b.h || a.m - b.m);
  const bytes = [];
  const fing = [];
  const prev = [60, 48];
  let t = 0;
  let lastF = 0;
  sorted.forEach((n, i) => {
    const ticks = Math.round(n.t * tpq);
    varint(ticks - t, bytes);
    t = ticks;
    varint(Math.round(n.d * tpq), bytes);
    varint(zz(n.m - prev[n.h]), bytes);
    prev[n.h] = n.m;
    bytes.push(Math.max(-2, Math.min(2, n.acc || 0)) + 2 + 5 * n.h + 10 * (n.s || 0));
    if (n.f) {
      varint(i - lastF, fing);
      varint(n.f, fing);
      lastF = i;
    }
  });
  const barBytes = [];
  let b0 = 0;
  bars.forEach(b => {
    const ticks = Math.round(b * tpq);
    varint(ticks - b0, barBytes);
    b0 = ticks;
  });
  return { notes: b64(bytes), n: sorted.length, fing: b64(fing), bars: b64(barBytes), tpq };
}

/* practice sections: about four bars each (a pickup bar joins the first). A section with exactly the notes
   of an earlier one (same pitches, same rhythm) points at it: learned once. [[a, z, same]] */
export function sectionsOf(notes, bars, { len = 4, pickup = false } = {}) {
  const nb = bars.length - 1;
  const cuts = [0];
  let b = pickup ? 1 : 0;
  while (b + len < nb) {
    b += len;
    // (never leave a last section of a single bar)
    if (nb - b < 2) break;
    cuts.push(b);
  }
  cuts.push(nb);
  const sig = (a, z) =>
    notes
      .filter(n => n.t >= bars[a] - 1e-6 && n.t < bars[z] - 1e-6)
      .map(n => `${(n.t - bars[a]).toFixed(3)}:${n.m}:${n.d.toFixed(3)}:${n.h}`)
      .sort()
      .join(' ');
  const out = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const [a, z] = [cuts[k], cuts[k + 1]];
    const me = sig(a, z);
    const same = out.findIndex(
      (x, j) => x[2] < 0 && cuts[j + 1] - cuts[j] === z - a && sig(x[0], x[1]) === me,
    );
    out.push([a, z, me && same >= 0 ? same : -1]);
  }
  return out;
}

/* the chords of a passage, for a lead sheet: one per window (a half bar in 4/4, a bar in 3/4 or 6/8),
   joined where it repeats. A chord scores what sounds in the window that belongs to it, weighted by
   length and with the bass counting extra, minus what does not. A 7th is added only when it really sounds.
   Chords of the key are preferred on a tie. [[t, name]] */
const TRIADS = ['maj', 'min', 'dim', 'aug'];
// a triad's 7ths, the more usual first: a major triad with a minor 7th is a dominant 7th
const SEVENTHS = {
  maj: [
    [10, 'dom7'],
    [11, 'maj7'],
  ],
  min: [[10, 'min7']],
  dim: [[10, 'hdim7']],
  aug: [],
};
export function chordSymbols(notes, bars, { sig = 0, window = null } = {}) {
  const spell = spellerFor(sig);
  const scale = new Set(majorScalePcs(sig));
  const out = [];
  for (let b = 0; b + 1 < bars.length; b++) {
    const len = bars[b + 1] - bars[b];
    const w = window || (len >= 4 && len % 2 === 0 ? len / 2 : len);
    for (let t0 = bars[b]; t0 < bars[b + 1] - 1e-6; t0 += w) {
      const t1 = Math.min(bars[b + 1], t0 + w);
      const weight = new Array(12).fill(0);
      let bass = null;
      for (const n of notes) {
        const ov = Math.min(t1, n.t + Math.max(n.d, 0.25)) - Math.max(t0, n.t);
        if (ov <= 0) continue;
        weight[((n.m % 12) + 12) % 12] += ov * (n.t >= t0 - 1e-6 ? 1.2 : 1);
        if (!bass || n.m < bass.m) bass = n;
      }
      if (!bass) continue;
      const bassPc = ((bass.m % 12) + 12) % 12;
      weight[bassPc] += w * 0.6;
      const total = weight.reduce((a, b) => a + b, 0);
      // the best triad first; then its 7th only if the 7th really sounds (a good share of the window)
      let best = null;
      for (let root = 0; root < 12; root++) {
        if (!weight[root]) continue;
        for (const k of TRIADS) {
          const tones = CHORDS[k].s.map(x => (root + x) % 12);
          let sc = 0;
          for (let p = 0; p < 12; p++) sc += tones.includes(p) ? weight[p] : -weight[p] * 1.1;
          sc -= k === 'aug' ? w * 0.3 : 0;
          if (tones.every(p => scale.has(p))) sc += w * 0.05;
          if (root === bassPc) sc += w * 0.2;
          if (!best || sc > best.sc) best = { sc, root, k };
        }
      }
      // a diminished triad is usually a dominant 7th without its root (B D F in G7): name the dominant when
      // its root sounds at all
      if (best && best.k === 'dim' && weight[(best.root + 8) % 12] >= total * 0.08)
        best = { ...best, root: (best.root + 8) % 12, k: 'dom7' };
      if (best && best.k !== 'dom7') {
        const seventh = SEVENTHS[best.k].find(([x]) => weight[(best.root + x) % 12] >= total * 0.2);
        if (seventh) best.k = seventh[1];
      }
      if (!best) continue;
      const name = spell(60 + best.root);
      const sym = 'CDEFGAB'[name.l] + (name.a > 0 ? '♯' : name.a < 0 ? '♭' : '') + CHORDS[best.k].sym;
      if (!out.length || out[out.length - 1][1] !== sym) out.push([+t0.toFixed(4), sym]);
    }
  }
  return out;
}

// the pitch classes of the major scale with this signature (sharps positive, flats negative)
function majorScalePcs(sig) {
  const tonic = (((sig * 7) % 12) + 12) % 12;
  return [0, 2, 4, 5, 7, 9, 11].map(x => (tonic + x) % 12);
}

// a chord symbol back to its root and kind: 'E♭m7' -> {pc: 3, type: 'min7'} (null if it is not one)
function parseChordSymbol(text) {
  const m = /^([A-G])([♯♭#b]?)(.*)$/.exec(String(text).trim());
  if (!m) return null;
  const type = Object.keys(CHORDS).find(k => CHORDS[k].sym === m[3]);
  if (!type) return null;
  const pc =
    ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (/[♯#]/.test(m[2]) ? 1 : m[2] ? -1 : 0) + 12) % 12;
  return { pc, type };
}

/* a tune's chords as a backing: each with its length in beats and where in its bar it starts.
   syms [[t, name]], bars (starts, then the end). [{pc, type, name, beats, b0}] */
export function songChords(syms, bars) {
  const end = bars[bars.length - 1];
  const out = [];
  syms.forEach(([t, name], i) => {
    const c = parseChordSymbol(name);
    const until = i + 1 < syms.length ? syms[i + 1][0] : end;
    if (!c || until <= t) return;
    let b = 0;
    while (b + 1 < bars.length && bars[b + 1] <= t + 1e-6) b++;
    out.push({ ...c, name, beats: until - t, b0: t - bars[b] });
  });
  return out;
}
