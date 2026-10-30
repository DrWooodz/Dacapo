/* Importing your own MIDI files into the library. */
import { clamp, meanOf } from '../core/util.js';
import { spellerFor } from './theory.js';
import { detectKey } from './analysis.js';
import { parseMidiFile } from './midiread.js';

export function importMidi(buf, fileName, split = 'auto') {
  const { div, tracks } = parseMidiFile(buf);
  const notes = [];
  const meta = { time: [], key: null, tempo: null };
  tracks.forEach((tr, ti) => {
    const open = new Map();
    tr.ev.forEach(e => {
      if (e.k === 'time') meta.time.push([e.tick, e.n, e.d]);
      else if (e.k === 'key' && !meta.key) meta.key = e;
      else if (e.k === 'tempo' && !meta.tempo) meta.tempo = e.us;
      if (e.ch === 9) return; // drums
      const key = e.ch * 128 + e.m;
      if (e.k === 'on') {
        if (open.has(key)) {
          const o = open.get(key);
          o.d = e.tick - o.t;
        }
        const n = { t: e.tick, d: 0, m: e.m, ti, ch: e.ch, vel: e.vel };
        open.set(key, n);
        notes.push(n);
      } else if (e.k === 'off' && open.has(key)) {
        const o = open.get(key);
        o.d = e.tick - o.t;
        open.delete(key);
      }
    });
  });
  if (notes.length < 4) throw new Error('No notes found in this file.');
  if (notes.length > 6000)
    throw new Error('This file is very long (over 6,000 notes). Split it into shorter files.');
  // hands: by track when there are two or more note tracks, otherwise split at middle C
  const byTrack = {};
  notes.forEach(n => (byTrack[n.ti] = byTrack[n.ti] || []).push(n.m));
  const tks = Object.keys(byTrack);
  const useTracks = split === 'tracks' || (split === 'auto' && tks.length >= 2);
  if (useTracks && tks.length >= 2) {
    const avg = Object.fromEntries(tks.map(k => [k, meanOf(byTrack[k])]));
    const hi = tks.slice().sort((a, b) => avg[b] - avg[a])[0];
    notes.forEach(n => (n.h = String(n.ti) === hi ? 0 : avg[n.ti] >= 60 && tks.length > 2 ? 0 : 1));
  } else notes.forEach(n => (n.h = n.m >= 60 ? 0 : 1));
  // snap onsets to a fine grid so chords line up even in hand-played files
  const grid = div / 24;
  notes.forEach(n => {
    n.t = Math.round(n.t / grid) * grid;
    n.d = Math.max(grid, Math.round(n.d / grid) * grid);
  });
  notes.sort((a, b) => a.t - b.t || a.h - b.h || a.m - b.m);
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
  const ts = meta.time.length ? meta.time.sort((a, b) => a[0] - b[0]) : [[0, 4, 4]];
  const endTick = Math.max(...notes.map(n => n.t + n.d));
  const bars = [0];
  let tk = 0,
    ti2 = 0;
  while (tk < endTick && bars.length < 2000) {
    while (ti2 + 1 < ts.length && ts[ti2 + 1][0] - t0 <= tk) ti2++;
    const [, n, d] = ts[ti2];
    tk += (div * 4 * n) / d;
    bars.push(tk);
  }
  const qbpm = meta.tempo ? Math.round(60e6 / meta.tempo) : 80;
  // pack like the built-in library (tpq = 24)
  const tpq = 24;
  const toTicks = x => Math.round((x / div) * tpq);
  const bytes = [];
  const vi = n => {
    do {
      let b = n & 0x7f;
      n = Math.floor(n / 128);
      if (n) b |= 0x80;
      bytes.push(b);
    } while (n);
  };
  let pt = 0;
  const prev = [60, 48];
  notes.forEach(n => {
    const t = toTicks(n.t);
    vi(t - pt);
    pt = t;
    vi(toTicks(n.d));
    const dz = n.m - prev[n.h];
    prev[n.h] = n.m;
    vi(dz >= 0 ? dz * 2 : -dz * 2 - 1);
    const s = sp(n.m);
    bytes.push(s.a + 2 + 5 * n.h + 10 * n.h);
  });
  const bb = [];
  let pb = 0;
  bars.forEach(b => {
    const t = toTicks(b);
    let x = t - pb;
    pb = t;
    do {
      let c = x & 0x7f;
      x = Math.floor(x / 128);
      if (x) c |= 0x80;
      bb.push(c);
    } while (x);
  });
  const b64 = arr => btoa(String.fromCharCode(...arr));
  const b64big = arr => {
    let s = '';
    for (let i = 0; i < arr.length; i += 8192) s += String.fromCharCode(...arr.slice(i, i + 8192));
    return btoa(s);
  };
  const nb = bars.length - 1;
  // sections of four bars; one in which no note starts (a long rest or a held chord) joins the one before
  const secs = [];
  const starts = (a, z) => notes.some(n => n.t >= bars[a] && n.t < bars[z]);
  for (let a = 0; a < nb; a += 4) {
    const z = Math.min(nb, a + 4);
    if (secs.length && !starts(a, z)) secs[secs.length - 1][1] = z;
    else secs.push([a, z, -1]);
  }
  const title =
    fileName
      .replace(/\.(mid|midi)$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim() || 'My piece';
  return {
    id: 'mine-' + Date.now().toString(36),
    t: title,
    sub: '',
    c: 'mine',
    y: '',
    lvl: 3,
    bpm: clamp(qbpm, 30, 220),
    tip:
      'Imported from your MIDI file. Hands were assigned ' +
      (useTracks ? 'by track' : 'by splitting at middle C') +
      '.',
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
    bars: b64(bb),
    notes: b64big(bytes),
    fing: '',
    n: notes.length,
    secs,
    lic: 'Your file',
    by: '',
    mut: '',
    src: fileName,
    imported: Date.now(),
  };
}
