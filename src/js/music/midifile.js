/* Importing your own MIDI files into the library.
   readMidi() reads a file into its parts (instruments); importPlan() picks how to make a piano piece of it
   (a piano file as written, or an automatic piano reduction); buildPiece() writes the piece in the same
   packed form as the built-in library. The file itself is kept with the piece, so the arrangement can be
   changed later. */
import { clamp } from '../core/util.js';
import { spellerFor } from './theory.js';
import { byHands, guessRoles, isPianoFile, pianoAsWritten, pianoReduction, readParts } from './arrange.js';
import { parseMidiFile } from './midiread.js';
import { detectKey } from './harmony.js';

const MAX_NOTES = 6000;
const KEEP_FILE_BYTES = 256 * 1024; // larger files are imported, but cannot be re-arranged later

const toBase64 = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
};
export const fromBase64 = b64 => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

// the file's parts and facts; throws with a message for the person when the file cannot be used
export function readMidi(buf) {
  const read = readParts(parseMidiFile(buf));
  const count = read.parts.filter(p => !p.drums).reduce((a, p) => a + p.n, 0);
  if (count < 4) throw new Error('No notes found in this file.');
  if (count > MAX_NOTES * 3)
    throw new Error('This file is very long. Split it into shorter files (a few minutes of music each).');
  read.bytes = buf.byteLength <= KEEP_FILE_BYTES ? toBase64(new Uint8Array(buf)) : null;
  return read;
}

// the arrangement to start from: {style: 'written' | 'full' | 'simple' | 'hands', roles, assign}
export function importPlan(read) {
  const roles = guessRoles(read.parts);
  const assign = Object.fromEntries(
    read.parts.map(p => [p.id, roles[p.id] === 'melody' ? 'rh' : roles[p.id] === 'bass' ? 'lh' : 'skip']),
  );
  return { style: isPianoFile(read.parts) ? 'written' : 'full', roles, assign };
}

// the notes for an arrangement: [{t, d, m, h, vel}] in the file's ticks
function arrangeNotes(read, plan) {
  if (plan.style === 'written') return pianoAsWritten(read.parts);
  if (plan.style === 'hands') return byHands(read.parts, plan.assign);
  const [, n, d] = read.meta.time[0] || [0, 4, 4];
  return pianoReduction(read.parts, plan.roles, {
    style: plan.style,
    beat: read.div,
    bar: (read.div * 4 * n) / d,
  });
}

// the instruments of the original that the arrangement uses
function usedParts(read, plan) {
  const pitched = read.parts.filter(p => !p.drums);
  if (plan.style === 'written') return pitched;
  if (plan.style === 'hands') return pitched.filter(p => plan.assign[p.id] && plan.assign[p.id] !== 'skip');
  return pitched.filter(p => plan.roles[p.id] && plan.roles[p.id] !== 'skip');
}

const STYLE_WORDS = {
  written: 'kept as written for piano',
  full: 'arranged for piano: melody, harmony and bass',
  simple: 'arranged for piano: melody and bass',
  hands: 'with the parts you chose for each hand',
};

// a library piece made from the file and an arrangement (id, title, bpm: kept when re-arranging)
export function buildPiece(read, fileName, plan, { id, title, bpm } = {}) {
  const { div, meta } = read;
  const notes = arrangeNotes(read, plan).map(n => ({ ...n }));
  if (notes.length < 4) throw new Error('This arrangement has no notes to play. Choose other parts.');
  if (notes.length > MAX_NOTES)
    throw new Error('This file is very long (over 6,000 notes to play). Split it into shorter files.');
  const t0 = notes[0].t;
  notes.forEach(n => (n.t -= t0));
  // key and spelling
  let sig = meta.key ? clamp(meta.key.sf, -7, 7) : null;
  if (sig == null) {
    const k = detectKey(notes.map(n => n.m));
    sig = k ? k.best.sig : 0;
  }
  const sp = spellerFor(clamp(sig, -6, 6));
  // bars from the first time signature (later changes are applied too)
  const ts = meta.time.length ? meta.time : [[0, 4, 4]];
  const endTick = Math.max(...notes.map(n => n.t + n.d));
  const bars = [0];
  let tk = 0;
  let ti = 0;
  while (tk < endTick && bars.length < 2000) {
    while (ti + 1 < ts.length && ts[ti + 1][0] - t0 <= tk) ti++;
    const [, n, d] = ts[ti];
    tk += (div * 4 * n) / d;
    bars.push(tk);
  }
  const qbpm = meta.tempo ? Math.round(60e6 / meta.tempo) : 80;
  // packed like the built-in library: 24 ticks per beat, varints
  const tpq = 24;
  const toTicks = x => Math.round((x / div) * tpq);
  const varint = (out, n) => {
    do {
      let b = n & 0x7f;
      n = Math.floor(n / 128);
      if (n) b |= 0x80;
      out.push(b);
    } while (n);
  };
  const bytes = [];
  let pt = 0;
  const prev = [60, 48];
  notes.forEach(n => {
    const t = toTicks(n.t);
    varint(bytes, t - pt);
    pt = t;
    varint(bytes, toTicks(n.d));
    const dz = n.m - prev[n.h];
    prev[n.h] = n.m;
    varint(bytes, dz >= 0 ? dz * 2 : -dz * 2 - 1);
    bytes.push(sp(n.m).a + 2 + 5 * n.h + 10 * n.h); // accidental, hand, staff (each hand on its own)
  });
  const barBytes = [];
  let pb = 0;
  bars.forEach(b => {
    const t = toTicks(b);
    varint(barBytes, t - pb);
    pb = t;
  });
  const nb = bars.length - 1;
  // sections of four bars; one in which no note starts (a long rest or a held chord) joins the one before
  const secs = [];
  const starts = (a, z) => notes.some(n => n.t >= bars[a] && n.t < bars[z]);
  for (let a = 0; a < nb; a += 4) {
    const z = Math.min(nb, a + 4);
    if (secs.length && !starts(a, z)) secs[secs.length - 1][1] = z;
    else secs.push([a, z, -1]);
  }
  const name =
    fileName
      .replace(/\.(mid|midi)$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim() || 'My piece';
  return {
    id: id || 'mine-' + Date.now().toString(36),
    t: String(title || name).slice(0, 80),
    sub: '',
    c: 'mine',
    y: '',
    lvl: 3,
    bpm: clamp(bpm || qbpm, 30, 220),
    tip: `Imported from your MIDI file, ${STYLE_WORDS[plan.style]}.`,
    tempos: [],
    tpq,
    shift: 0,
    pickup: false,
    nb,
    // time signatures by bar (one after the last bar is dropped)
    ts: ts.map(([tick, n, d]) => [bars.findIndex(b => b >= tick - t0), n, d]).filter(x => x[0] >= 0),
    keys: [[0, sig]],
    clefs: [
      [0, 0, 't'],
      [0, 1, 'b'],
    ],
    bars: toBase64(Uint8Array.from(barBytes)),
    notes: toBase64(Uint8Array.from(bytes)),
    fing: '',
    n: notes.length,
    secs,
    lic: 'Your file',
    by: '',
    mut: '',
    src: fileName,
    imported: Date.now(),
    // to change the arrangement later: the file, and the choices made
    orig: read.bytes,
    arr: { style: plan.style, roles: plan.roles, assign: plan.assign },
    from: [...new Set(usedParts(read, plan).map(p => p.name))],
  };
}

// the whole import in one step, with the automatic arrangement
export function importMidi(buf, fileName) {
  const read = readMidi(buf);
  return buildPiece(read, fileName, importPlan(read));
}
