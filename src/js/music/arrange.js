/* Turning a MIDI file into something two hands can play.
   A file from a game or a sequencer has several instruments (parts). readParts() separates them and
   describes each; guessRoles() decides which part carries the melody, which the bass and which the
   harmony; pianoReduction() then writes a piano part from them:
     the melody            stays exactly as written (its top voice), in the right hand
     the bass line         goes to the left hand, moved by whole octaves into a comfortable range
     the harmony (Full)    keeps the rhythm of the accompanying parts, but only notes that really sound
                           there, placed between bass and melody within reach of each hand
   byHands() is the manual alternative: you say which parts each hand plays.
   Times are in ticks (the file's own unit). Pure functions: nothing here touches the page. */
import { median } from '../core/util.js';
import { gmFamily, gmName } from './gm.js';

const MAX_PER_HAND = 3; // notes struck together by one hand
const SPAN = 12; // the widest a hand stretches for notes struck together (an octave)
const LOW = 21;
const HIGH = 108;
const LH_TOP = 64; // the accompaniment stays at or below E above middle C

const inRange = m => {
  while (m < LOW) m += 12;
  while (m > HIGH) m -= 12;
  return m;
};

/* ---------- the parts of a file ---------- */
// parsed: from midiread.parseMidiFile. Notes are snapped to 1/24 of a beat, so chords line up.
export function readParts({ div, tracks }) {
  const grid = Math.max(1, div / 24);
  const snap = t => Math.round(t / grid) * grid;
  const meta = { time: [], key: null, tempo: null };
  const byKey = new Map();
  tracks.forEach((tr, ti) => {
    const program = {};
    const open = new Map();
    for (const e of tr.ev) {
      if (e.k === 'time') meta.time.push([e.tick, e.n, e.d]);
      else if (e.k === 'key' && !meta.key) meta.key = e;
      else if (e.k === 'tempo' && !meta.tempo) meta.tempo = e.us;
      else if (e.k === 'prog' && program[e.ch] == null) program[e.ch] = e.p;
      if (e.k !== 'on' && e.k !== 'off') continue;
      const id = `${ti}:${e.ch}`;
      if (!byKey.has(id))
        byKey.set(id, { id, track: ti, ch: e.ch, trackName: tr.name || '', notes: [], program });
      const part = byKey.get(id);
      const k = id + ':' + e.m;
      const close = end => {
        const n = open.get(k);
        n.d = Math.max(grid, snap(end) - n.t);
        open.delete(k);
      };
      if (e.k === 'on') {
        if (open.has(k)) close(e.tick);
        const n = { t: snap(e.tick), d: grid, m: e.m, vel: e.vel / 127 };
        part.notes.push(n);
        open.set(k, n);
      } else if (open.has(k)) close(e.tick);
    }
  });
  meta.time.sort((a, b) => a[0] - b[0]);
  const parts = [...byKey.values()]
    .filter(p => p.notes.length)
    .map(p => {
      const prog = p.program[p.ch] ?? 0;
      const ms = p.notes.map(n => n.m);
      const onsets = new Map();
      p.notes.forEach(n => onsets.set(n.t, (onsets.get(n.t) || 0) + 1));
      const chords = [...onsets.values()].filter(c => c > 1).length;
      return {
        id: p.id,
        track: p.track,
        ch: p.ch,
        trackName: p.trackName,
        program: prog,
        drums: p.ch === 9,
        name: gmName(prog, p.ch),
        family: p.ch === 9 ? 'fx' : gmFamily(prog),
        notes: p.notes.sort((a, b) => a.t - b.t || a.m - b.m),
        n: p.notes.length,
        lo: Math.min(...ms),
        hi: Math.max(...ms),
        avg: median(ms),
        poly: chords / onsets.size, // share of moments with more than one note
      };
    })
    .sort((a, b) => b.avg - a.avg);
  return { div, meta, parts };
}

/* ---------- who plays what ---------- */
// roles by part id: 'melody' | 'bass' | 'harmony' | 'skip'
export function guessRoles(parts) {
  const roles = {};
  const pitched = parts.filter(p => !p.drums && p.family !== 'fx' && p.n >= 4);
  parts.forEach(p => (roles[p.id] = 'skip'));
  if (!pitched.length) return roles;
  // the melody: the part that is on top most of the time, moves mostly by step (accompaniment
  // arpeggios leap through chords), plays single notes, and is ideally a solo instrument
  const tops = new Map(pitched.map(p => [p, line(p.notes, true)]));
  const onTop = p => {
    const mine = tops.get(p);
    let hits = 0;
    for (const n of mine) {
      const above = pitched.some(q => {
        if (q === p) return false;
        const o = soundingAt(tops.get(q), n.t);
        return o && o.m > n.m;
      });
      if (!above) hits++;
    }
    return hits / mine.length;
  };
  const stepwise = p => {
    const ns = tops.get(p);
    let steps = 0;
    let moves = 0;
    for (let i = 1; i < ns.length; i++) {
      moves++;
      if (Math.abs(ns[i].m - ns[i - 1].m) <= 2) steps++;
    }
    return moves ? steps / moves : 0;
  };
  const melodyScore = p =>
    (onTop(p) + 0.5) *
    (stepwise(p) + 0.2) *
    Math.sqrt(p.n) *
    (1 - 0.8 * p.poly) *
    (p.avg >= 60 ? 1 : p.avg >= 52 ? 0.5 : 0.1) *
    ({ lead: 1.5, keys: 1, perc: 1, pad: 0.35, bass: 0.05 }[p.family] ?? 1);
  const melody = pitched.slice().sort((a, b) => melodyScore(b) - melodyScore(a))[0];
  roles[melody.id] = 'melody';
  // the bass: the lowest remaining part, preferably a bass instrument
  const rest = pitched.filter(p => p !== melody);
  const bassScore = p => (p.family === 'bass' ? 30 : 0) - p.avg + (p.poly < 0.3 ? 5 : 0);
  const bass = rest
    .filter(p => p.avg < 55 || p.family === 'bass')
    .sort((a, b) => bassScore(b) - bassScore(a))[0];
  if (bass) roles[bass.id] = 'bass';
  rest.filter(p => p !== bass).forEach(p => (roles[p.id] = 'harmony'));
  return roles;
}

// a piano file (one or two piano parts) is already written for two hands: keep it as it is
export function isPianoFile(parts) {
  const pitched = parts.filter(p => !p.drums && p.n >= 4);
  return pitched.length >= 1 && pitched.length <= 2 && pitched.every(p => p.program <= 7);
}

/* ---------- lines ---------- */
// one note at each moment: the highest (melody) or the lowest (bass), each lasting until the next
function line(notes, top) {
  const at = new Map();
  for (const n of notes) {
    const cur = at.get(n.t);
    if (!cur || (top ? n.m > cur.m : n.m < cur.m)) at.set(n.t, n);
  }
  const out = [...at.values()].sort((a, b) => a.t - b.t).map(n => ({ ...n }));
  out.forEach((n, i) => {
    if (out[i + 1]) n.d = Math.min(n.d, out[i + 1].t - n.t);
  });
  return out;
}

// move a whole line by octaves so it sits in a comfortable range (its shape stays the same)
function settle(notes, lo, hi, target) {
  const mid = median(notes.map(n => n.m));
  if (!notes.length || (mid >= lo && mid <= hi)) return notes;
  const shift = 12 * Math.round((target - mid) / 12);
  return notes.map(n => ({ ...n, m: inRange(n.m + shift) }));
}

// the note of a line sounding at time t
function soundingAt(lineNotes, t) {
  let lo = 0;
  let hi = lineNotes.length - 1;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineNotes[mid].t <= t) {
      found = lineNotes[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found && found.t + found.d > t ? found : null;
}

const pc = m => ((m % 12) + 12) % 12;

/* ---------- the automatic piano reduction ---------- */
// style 'simple': melody and bass; 'full': with the harmony. beat: ticks per quarter note; bar: ticks
// per bar (the first time signature; four beats when the file has none).
// Returns [{t, d, m, h (0 right hand, 1 left), vel}].
export function pianoReduction(parts, roles, { style = 'full', beat = 480, bar = 0 } = {}) {
  const of = role => parts.filter(p => roles[p.id] === role);
  const melodyParts = of('melody');
  const harmonyParts = of('harmony');
  const bassParts = of('bass');
  const all = ps => ps.flatMap(p => p.notes);
  let melody = line(all(melodyParts), true);
  melody = settle(melody, 62, 84, 72);
  // the bass: its own part, or else the lowest notes of the harmony
  let bass = line(all(bassParts.length ? bassParts : harmonyParts), false);
  bass = settle(bass, 33, 52, 43);
  const out = [];
  const push = (n, h, m = n.m) => out.push({ t: n.t, d: n.d, m: inRange(m), h, vel: n.vel ?? 0.7 });
  melody.forEach(n => push(n, 0));
  bass.forEach(n => {
    // never above the melody that sounds with it
    const top = soundingAt(melody, n.t);
    let m = n.m;
    while (top && m > top.m - 3 && m - 12 >= LOW) m -= 12;
    push(n, 1, m);
  });
  if (style === 'full') addHarmony(out, melody, bass, harmonyParts, beat, bar || beat * 4);
  return tidy(out);
}

/* The accompaniment, the way an arranger writes it for piano:
   - its rhythm comes from one accompanying part (mixing the rhythms of several instruments gives a
     left hand that is neither pattern): a chordal part (strings on the off-beats) becomes chords, a
     part playing one note at a time (a harp arpeggio) becomes broken chords
   - its notes are the chord that really sounds at that moment in all the accompanying parts
   - the left hand plays it close above the bass; the right hand adds one or two chord notes under a
     melody note held for a beat or more, where the sound would otherwise thin out */
function addHarmony(out, melody, bass, parts, beat, bar) {
  const pattern = rhythmPart(parts, beat);
  if (!pattern) return;
  const source = parts.flatMap(p => p.notes);
  const melodyNotes = new Set(melody.map(n => n.t + ':' + n.m));
  // what sounds from t for a while, strongest first (pitch classes)
  const chordAt = (t, len) => {
    const w = new Map();
    for (const n of source) {
      if (melodyNotes.has(n.t + ':' + n.m)) continue;
      const e = Math.min(n.t + n.d, t + len);
      if (n.t > t || e <= t) continue;
      w.set(pc(n.m), (w.get(pc(n.m)) || 0) + e - t);
    }
    return [...w.entries()].sort((x, y) => y[1] - x[1]).map(([p]) => p);
  };
  // the right hand: chord notes under held melody notes
  const rhFill = [];
  for (const mel of melody) {
    // two notes under a long melody note, one under a note of a beat on the first beat of a bar
    const room = mel.d >= beat * 1.8 ? 2 : mel.d >= beat * 0.9 && mel.t % bar === 0 ? 1 : 0;
    if (!room) continue;
    const low = soundingAt(bass, mel.t);
    const add = [];
    for (const p of chordAt(mel.t, beat)) {
      if (add.length === room) break;
      if (p === pc(mel.m) || (low && p === pc(low.m) && add.length === 0 && chordAt(mel.t, beat).length > 2))
        continue;
      let m = mel.m - ((mel.m - p + 120) % 12 || 12); // the nearest one below the melody
      if (mel.m - m < 3) m -= 12;
      if (m < 55 || mel.m - m > 9 || add.some(x => Math.abs(x - m) < 2)) continue;
      add.push(m);
    }
    add.forEach(m => rhFill.push({ t: mel.t, d: mel.d, m, h: 0, vel: (mel.vel ?? 0.7) * 0.7 }));
  }
  rhFill.forEach(n => out.push(n));
  const rightHand = melody.concat(rhFill).sort((x, y) => x.t - y.t);
  const lowestRight = t => {
    let lo = null;
    for (const n of rightHand) {
      if (n.t > t) break;
      if (n.t + n.d > t && (lo == null || n.m < lo)) lo = n.m;
    }
    return lo;
  };
  // the left hand, at the moments the pattern part plays
  const chordal = pattern.poly >= 0.4;
  const times = onsets(pattern.notes, beat);
  let center = 52;
  times.forEach((t, i) => {
    const next = times[i + 1] ?? t + beat;
    const d = Math.min(next - t, Math.max(...pattern.notes.filter(n => n.t === t).map(n => n.d)));
    const low = soundingAt(bass, t);
    const struck = low && low.t === t;
    const rightLow = lowestRight(t);
    const hi = Math.min(LH_TOP, rightLow != null ? rightLow - 1 : LH_TOP, struck ? low.m + SPAN : LH_TOP);
    const lo = Math.max(low ? low.m + 3 : 40, 40);
    if (hi - lo < 2) return;
    // the nearest place for a pitch class inside the zone, around where the left hand is
    const place = p => {
      let m = center - ((center - p + 120) % 12);
      if (center - m > 6) m += 12;
      while (m > hi) m -= 12;
      while (m < lo) m += 12;
      return m <= hi ? m : null;
    };
    let ms;
    if (chordal) {
      const pcs = chordAt(t, d).filter(p => !(low && p === pc(low.m)));
      ms = pcs
        .map(place)
        .filter(m => m != null)
        .slice(0, MAX_PER_HAND - (struck ? 1 : 0));
      // a chord within one hand's reach
      ms = ms.filter(m => Math.max(...ms) - m <= SPAN - 2 || ms.length === 1);
    } else {
      const own = pattern.notes.find(n => n.t === t);
      const m = place(pc(own.m));
      ms = m == null || (struck && pc(own.m) === pc(low.m) && m - low.m === 12) ? [] : [m];
    }
    if (!ms.length) return;
    center = Math.round(ms.reduce((a, m) => a + m, 0) / ms.length);
    ms.forEach(m => out.push({ t, d, m, h: 1, vel: 0.5 }));
  });
}

// the accompanying part whose rhythm the left hand takes: the one that plays most often (up to eighth
// notes), chords preferred, sustained pads least
function rhythmPart(parts, beat) {
  const score = p =>
    onsets(p.notes, beat).length *
    (1 + p.poly) *
    ({ keys: 1.3, perc: 1.1, pad: 0.6, lead: 0.7 }[p.family] ?? 1);
  return parts.filter(p => p.n >= 4).sort((a, b) => score(b) - score(a))[0] || null;
}

// the moments a part plays, no closer together than an eighth note
function onsets(notes, beat) {
  const out = [];
  for (const n of notes) if (!out.length || n.t - out[out.length - 1] >= beat / 2) out.push(n.t);
  return out;
}

/* ---------- by hand: you choose ---------- */
// assign: part id -> 'rh' | 'lh' | 'skip'. Each hand keeps at most three notes at a time, within reach of
// its top (right) or bottom (left) note.
export function byHands(parts, assign) {
  const out = [];
  for (const [h, top] of [
    [0, true],
    [1, false],
  ]) {
    const want = h === 0 ? 'rh' : 'lh';
    const notes = parts.filter(p => assign[p.id] === want).flatMap(p => p.notes);
    const at = new Map();
    notes.forEach(n => (at.get(n.t) || at.set(n.t, []).get(n.t)).push(n));
    for (const group of at.values()) {
      group.sort((a, b) => (top ? b.m - a.m : a.m - b.m));
      const anchor = group[0].m;
      group
        .filter(n => Math.abs(n.m - anchor) <= SPAN)
        .slice(0, MAX_PER_HAND)
        .forEach(n => out.push({ t: n.t, d: n.d, m: inRange(n.m), h, vel: n.vel ?? 0.7 }));
    }
  }
  return tidy(out);
}

// the piano file as written: by part when there are two, otherwise split at middle C
export function pianoAsWritten(parts) {
  const pitched = parts.filter(p => !p.drums && p.n >= 4).sort((a, b) => b.avg - a.avg);
  if (pitched.length === 2) return byHands(parts, { [pitched[0].id]: 'rh', [pitched[1].id]: 'lh' });
  return tidy(
    pitched.flatMap(p => p.notes).map(n => ({ t: n.t, d: n.d, m: n.m, h: n.m >= 60 ? 0 : 1, vel: n.vel })),
  );
}

// in order, no note twice, the left hand never doubling the right hand's note
function tidy(notes) {
  const seen = new Set();
  return notes
    .sort((a, b) => a.t - b.t || a.h - b.h || b.m - a.m)
    .filter(n => {
      const k = n.t + ':' + n.m;
      if (seen.has(k)) return false;
      seen.add(k);
      return n.d > 0;
    })
    .sort((a, b) => a.t - b.t || a.h - b.h || a.m - b.m);
}
