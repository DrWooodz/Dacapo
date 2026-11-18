/* A reader for the ABC files of the Open Hymnal Project (ABC 2.1 as they use it): header fields, one
   line per voice ([V: S1V1] …), notes with accidentals, octave marks and lengths, chords in brackets,
   rests, ties, broken rhythm (> <), tuplets ((3 and (p:q:r), bar lines; decorations, slurs, grace notes,
   annotations and lyrics are skipped. Returns the notes of every voice in quarter-note beats, the bar
   lines of the first voice, and what the header says. */

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARPS = 'FCGDAEB';
const MODE_SHIFT = {
  '': 0,
  maj: 0,
  ion: 0,
  m: -3,
  min: -3,
  aeo: -3,
  dor: -2,
  phr: -4,
  lyd: 1,
  mix: -1,
  loc: -5,
};

// K: field -> signature (sharps positive)
export function keySig(k) {
  const m = /^([A-G])([#b]?)\s*([A-Za-z]*)/.exec(k.trim());
  if (!m) return 0;
  const mode = MODE_SHIFT[m[3].toLowerCase().slice(0, 3)] ?? 0;
  // a minor or modal key: the signature of its relative major
  const tonic = m[1] + m[2];
  const order = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
  const i = order.indexOf(tonic);
  if (i < 0) return 0;
  return i - 7 + mode;
}
// the accidental each letter carries under a signature
function sigMap(sig) {
  const m = {};
  for (let i = 0; i < Math.abs(sig); i++) m[sig > 0 ? SHARPS[i] : SHARPS[6 - i]] = sig > 0 ? 1 : -1;
  return m;
}
const frac = s => {
  const [a, b] = s.split('/').map(Number);
  return b ? a / b : a;
};

export function parseAbc(text) {
  const lines = text.split(/\r?\n/);
  const head = {};
  let staves = null;
  const clefOf = {};
  const voices = new Map(); // id -> music text
  let inBody = false;
  for (const raw of lines) {
    if (raw.startsWith('%%staves')) staves = raw.slice(8);
    const line = raw.replace(/(^|[^\\])%.*$/, '$1').trimEnd();
    if (!line.trim()) continue;
    const field = /^([A-Za-z]):\s*(.*)$/.exec(line);
    if (field && !line.startsWith('[')) {
      const [, f, v] = field;
      if (f === 'w' || f === 'W') continue;
      if (f === 'V') {
        const [id, ...rest] = v.trim().split(/\s+/);
        if (/clef=bass/.test(rest.join(' '))) clefOf[id] = 'bass';
        else if (/clef=treble/.test(rest.join(' '))) clefOf[id] = 'treble';
        continue;
      }
      if (!head[f]) head[f] = v.trim();
      if (f === 'K') inBody = true;
      continue;
    }
    if (!inBody) continue;
    const v = /^\[V:\s*([^\]\s]+)\s*\]\s*(.*)$/.exec(line);
    if (v) voices.set(v[1], (voices.get(v[1]) || '') + ' ' + v[2]);
  }
  const L = head.L ? frac(head.L) : 1 / 8;
  const meter =
    head.M && head.M !== 'none'
      ? head.M === 'C'
        ? [4, 4]
        : head.M === 'C|'
          ? [2, 2]
          : head.M.split('/').map(Number)
      : null;
  const sig = keySig(head.K || 'C');
  let tempo = null;
  const qOf = q => {
    const m = /(\d+\/\d+)\s*=\s*(\d+)/.exec(q);
    return m ? Math.round(+m[2] * frac(m[1]) * 4) : null;
  };
  if (head.Q) tempo = qOf(head.Q);
  // the staff groups, top to bottom: (S1V1 S1V2) | (S2V1 S2V2)
  const groups = staves
    ? staves
        .split('|')
        .map(g => g.replace(/[()]/g, ' ').trim().split(/\s+/).filter(Boolean))
        .filter(g => g.length)
    : null;
  const staffOf = id => {
    if (groups) {
      const i = groups.findIndex(g => g.includes(id));
      return i === groups.length - 1 ? 1 : 0;
    }
    return clefOf[id] === 'bass' ? 1 : 0;
  };

  const out = { head, L, meter, sig, tempo, voices: [] };
  let first = true;
  for (const [id, music] of voices) {
    const r = parseVoice(music, { L, sig, onTempo: q => (tempo = tempo || qOf(q)) });
    out.voices.push({ id, staff: staffOf(id), notes: r.notes, bars: r.bars, end: r.t });
    if (first) {
      out.bars = r.bars;
      out.end = r.t;
      first = false;
    }
  }
  out.tempo = tempo;
  return out;
}

function parseVoice(s, { L, sig, onTempo }) {
  const keyAcc = sigMap(sig);
  let barAcc = {};
  const notes = [];
  const bars = [];
  let t = 0;
  let i = 0;
  let tuplet = null; // {left, factor}
  let broken = null; // the factor for the next note after > or <
  let tieFrom = null; // the notes a tie continues
  const readLen = () => {
    const m = /^(\d*)((?:\/\d*)*)/.exec(s.slice(i));
    i += m[0].length;
    let v = m[1] ? +m[1] : 1;
    const slashes = m[2].match(/\/\d*/g) || [];
    for (const sl of slashes) v /= sl.length > 1 ? +sl.slice(1) : 2;
    return v * L * 4;
  };
  const readNote = () => {
    let acc = null;
    const a = /^(\^\^|\^|__|_|=)/.exec(s.slice(i));
    if (a) {
      acc = { '^^': 2, '^': 1, __: -2, _: -1, '=': 0 }[a[1]];
      i += a[1].length;
    }
    const ch = s[i];
    if (!/[A-Ga-g]/.test(ch)) return null;
    i++;
    const up = ch.toUpperCase();
    let oct = ch === up ? 4 : 5;
    while (s[i] === ',' || s[i] === "'") {
      oct += s[i] === "'" ? 1 : -1;
      i++;
    }
    const key = up + oct;
    if (acc != null) barAcc[key] = acc;
    const alt = barAcc[key] ?? keyAcc[up] ?? 0;
    return { m: 12 * (oct + 1) + LETTER[up] + alt, acc: alt };
  };
  const place = (pitches, len) => {
    let d = len;
    if (broken) {
      d *= broken;
      broken = null;
    }
    if (tuplet) {
      d *= tuplet.factor;
      if (--tuplet.left <= 0) tuplet = null;
    }
    const tied = tieFrom;
    tieFrom = null;
    const placed = [];
    for (const p of pitches) {
      const prev = tied && tied.find(n => n.m === p.m);
      if (prev) {
        prev.d += d;
        placed.push(prev);
      } else {
        const n = { t, d, m: p.m, acc: p.acc };
        notes.push(n);
        placed.push(n);
      }
    }
    const start = t;
    t += d;
    return { placed, start, d };
  };
  let last = null;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c) || c === '\\') {
      i++;
      continue;
    }
    if (c === '!' || c === '+') {
      const j = s.indexOf(c, i + 1);
      i = j < 0 ? s.length : j + 1;
      continue;
    }
    if (c === '"') {
      const j = s.indexOf('"', i + 1);
      i = j < 0 ? s.length : j + 1;
      continue;
    }
    if (c === '{') {
      const j = s.indexOf('}', i);
      i = j < 0 ? s.length : j + 1;
      continue;
    }
    if (c === '[' && /^\[[A-Za-z]:/.test(s.slice(i))) {
      const j = s.indexOf(']', i);
      const f = s.slice(i + 1, j);
      if (f.startsWith('Q:')) onTempo(f.slice(2));
      i = j + 1;
      continue;
    }
    if (c === '[' && /^\[\d/.test(s.slice(i))) {
      i += 2; // a first or second ending: played straight through here
      continue;
    }
    if (c === '|' || c === ':' || (c === '[' && s[i + 1] === '|')) {
      const m = /^(\[\||:*\|+\]?:*|:+)/.exec(s.slice(i));
      i += m ? m[0].length : 1;
      if (!bars.length || Math.abs(bars[bars.length - 1] - t) > 1e-6) bars.push(t);
      barAcc = {};
      continue;
    }
    if (c === '(') {
      const m = /^\((\d)(?::(\d*))?(?::(\d*))?/.exec(s.slice(i));
      if (m) {
        const p = +m[1];
        const q = m[2] ? +m[2] : p === 3 || p === 6 ? 2 : p === 2 || p === 4 || p === 8 ? 3 : 2;
        const r = m[3] ? +m[3] : p;
        tuplet = { left: r, factor: q / p };
        i += m[0].length;
      } else i++;
      continue;
    }
    if (c === ')' || c === '.' || c === '~' || c === 'H' || c === 'T' || c === 'u' || c === 'v') {
      i++;
      continue;
    }
    if (c === '-') {
      if (last) tieFrom = last.placed;
      i++;
      continue;
    }
    if (c === '>' || c === '<') {
      let n = 0;
      while (s[i] === c) {
        n++;
        i++;
      }
      const f = 1 - Math.pow(0.5, n);
      // the previous note grows (>) or shrinks (<); the next one does the opposite
      if (last) {
        const grow = c === '>' ? 1 + f : 1 - f;
        const delta = last.d * (grow - 1);
        last.placed.forEach(n => n.d === last.d && (n.d = last.d * grow));
        last.d *= grow;
        t += delta;
      }
      broken = c === '>' ? 1 - f : 1 + f;
      continue;
    }
    if (c === 'z' || c === 'x' || c === 'Z') {
      i++;
      const len = readLen();
      last = null;
      place([], c === 'Z' ? len * 0 : len);
      continue;
    }
    if (c === '[') {
      i++;
      const ps = [];
      let inner = null;
      while (i < s.length && s[i] !== ']') {
        const p = readNote();
        if (!p) {
          i++;
          continue;
        }
        const l = readLen();
        inner = inner == null ? l : Math.min(inner, l);
        ps.push(p);
        if (s[i] === '-') i++;
      }
      i++;
      const outer = readLen() / (L * 4);
      last = place(ps, (inner || L * 4) * outer);
      continue;
    }
    const p = readNote();
    if (p) {
      last = place([p], readLen());
      continue;
    }
    i++; // anything else is skipped
  }
  if (!bars.length || bars[0] > 1e-6) bars.unshift(0);
  if (Math.abs(bars[bars.length - 1] - t) > 1e-6) bars.push(t);
  return { notes, bars, t };
}
