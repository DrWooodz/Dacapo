/* The Jam's loop: a drum pattern and layers of recorded notes (playing it is in transport.js).
   Positions are in beats (quarter notes) from the start of the loop. A layer keeps its notes as you
   played them; the grid (quantize) and the swing are applied when it plays, so both can be changed
   afterwards without losing anything. */
import { clamp } from '../core/util.js';
import { DRUM_BY_GM, DRUMS, SOUND_BY } from './instruments.js';
import { writeMidi } from './midiwrite.js';

// note grids, in beats
export const GRIDS = [
  ['off', 'Off', 0],
  ['8', '1/8', 0.5],
  ['16', '1/16', 0.25],
  ['8t', 'Triplets', 1 / 3],
];
const GRID = Object.fromEntries(GRIDS.map(([id, , g]) => [id, g]));

/* ---------- the loop ---------- */
export const loopBeats = L => L.bars * L.beats;
export const stepsPerBar = L => L.beats * 4; // the drum grid is in sixteenths
export const MAX_LAYERS = 8;

const emptyRow = n => new Array(n).fill(0);
function emptyPattern(beats) {
  return Object.fromEntries(DRUMS.map(d => [d.id, emptyRow(beats * 4)]));
}

// one bar of drums, written as x (hit), o (soft) and . (rest), one character per sixteenth
const pat = rows =>
  Object.fromEntries(
    DRUMS.map(d => [
      d.id,
      [...(rows[d.id] || '').padEnd(rows.len, '.')].map(c => ({ x: 0.9, o: 0.45 })[c] || 0),
    ]),
  );
export const BEATS = [
  { id: 'none', n: 'No drums', beats: 4, swing: 0.5, rows: { len: 16 } },
  {
    id: 'rock',
    n: 'Rock',
    beats: 4,
    swing: 0.5,
    rows: { len: 16, kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
  },
  {
    id: 'boombap',
    n: 'Boom bap',
    beats: 4,
    swing: 0.6,
    rows: { len: 16, kick: 'x......x.x......', snare: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.' },
  },
  {
    id: 'house',
    n: 'Four on the floor',
    beats: 4,
    swing: 0.5,
    rows: { len: 16, kick: 'x...x...x...x...', clap: '....x.......x...', open: '..x...x...x...x.' },
  },
  {
    id: 'bossa',
    n: 'Bossa nova',
    beats: 4,
    swing: 0.5,
    rows: { len: 16, kick: 'x..xx..xx..xx..x', rim: 'x..x..x...x..x..', hat: 'oooooooooooooooo' },
  },
  {
    id: 'waltz',
    n: 'Waltz',
    beats: 3,
    swing: 0.5,
    rows: { len: 12, kick: 'x...........', rim: '....x...x...', hat: 'o...o...o...' },
  },
];
export const BEAT_BY = Object.fromEntries(BEATS.map(b => [b.id, b]));
export const beatPattern = id => pat(BEAT_BY[id].rows);

export function newLoop() {
  return {
    v: 1,
    id: 'j' + Date.now().toString(36),
    name: '',
    bpm: 90,
    beats: 4,
    bars: 2,
    swing: 0.5, // where the off-beat eighth falls: 0.5 straight, 0.67 a triplet feel
    click: true,
    beat: 'none',
    drums: emptyPattern(4),
    layers: [], // [{id, sound ('piano'... or 'drums'), grid, mute, notes: [{b, m, d, v}]}]
  };
}

// a loop read from storage or a file: fill in anything missing, drop anything malformed
export function cleanLoop(o) {
  const L = Object.assign(newLoop(), o && typeof o === 'object' ? o : {});
  L.id = String(L.id || newLoop().id);
  L.name = String(L.name || '').slice(0, 40);
  L.click = L.click !== false;
  L.beat = BEAT_BY[L.beat] ? L.beat : 'custom';
  L.beats = L.beats === 3 ? 3 : 4;
  L.bars = [1, 2, 4, 8].includes(L.bars) ? L.bars : 2;
  L.bpm = clamp(Math.round(+L.bpm || 90), 40, 200);
  L.swing = clamp(+L.swing || 0.5, 0.5, 0.75);
  const n = L.beats * 4;
  const drums = emptyPattern(L.beats);
  for (const d of DRUMS) {
    const row = (o && o.drums && o.drums[d.id]) || [];
    for (let i = 0; i < n; i++) drums[d.id][i] = clamp(+row[i] || 0, 0, 1);
  }
  L.drums = drums;
  L.layers = (Array.isArray(L.layers) ? L.layers : [])
    .filter(l => l && Array.isArray(l.notes))
    .slice(0, MAX_LAYERS)
    .map(l => ({
      id: l.id || 'l' + Math.random().toString(36).slice(2, 7),
      sound: l.sound === 'drums' || SOUND_BY[l.sound] ? l.sound : 'piano',
      grid: GRID[l.grid] != null ? l.grid : '16',
      mute: !!l.mute,
      notes: l.notes
        .filter(x => x && x.b >= 0 && x.m >= 0 && x.m < 128)
        .map(x => ({ b: +x.b, m: x.m | 0, d: Math.max(0.05, +x.d || 0.25), v: clamp(+x.v || 0.7, 0.05, 1) })),
    }));
  return L;
}

// change the meter: the drum pattern keeps its first beats; layer notes beyond the new length go silent
export function setMeter(L, beats) {
  if (L.beats === beats) return;
  const old = L.drums;
  L.beats = beats;
  L.drums = emptyPattern(beats);
  for (const d of DRUMS) old[d.id].slice(0, beats * 4).forEach((v, i) => (L.drums[d.id][i] = v));
}

/* ---------- timing: grid and swing ---------- */
// swing moves the off-beat eighth to `swing` of the beat, and the sixteenths around it in proportion
export function swingAt(b, swing) {
  const beat = Math.floor(b);
  const f = b - beat;
  return beat + (f < 0.5 ? f * (swing / 0.5) : swing + (f - 0.5) * ((1 - swing) / 0.5));
}

// a note at the very end of the loop that rounds up to its length belongs to the top of the loop
function snap(b, grid, len) {
  if (!grid) return b;
  const q = Math.round(b / grid) * grid;
  return b < len && q >= len - 1e-6 ? 0 : q;
}
// swing shapes the eighth and sixteenth grids; triplets and unsnapped playing keep their own timing
const SWUNG = new Set(['8', '16']);

// everything the loop plays in one pass, in order: [{b, d, v, drum?, sound?, m}]
export function loopEvents(L) {
  const len = loopBeats(L);
  const out = [];
  for (let bar = 0; bar < L.bars; bar++)
    for (const d of DRUMS)
      L.drums[d.id].forEach((v, i) => {
        if (v) out.push({ b: swingAt(bar * L.beats + i / 4, L.swing), d: 0.1, v, drum: d.id, m: d.gm });
      });
  for (const layer of L.layers) {
    if (layer.mute) continue;
    const grid = GRID[layer.grid] || 0;
    for (const x of layer.notes) {
      const b = snap(x.b, grid, len);
      if (b >= len - 1e-6) continue; // beyond the loop after it was shortened: kept, silent until it grows
      const at = SWUNG.has(layer.grid) ? swingAt(b, L.swing) : b;
      const d = grid ? Math.max(grid * 0.9, Math.round(x.d / grid) * grid) : x.d;
      if (layer.sound === 'drums') {
        const dr = DRUM_BY_GM[x.m];
        if (dr) out.push({ b: at, d: 0.1, v: x.v, drum: dr.id, m: x.m });
      } else out.push({ b: at, d: Math.min(d, len), v: x.v, sound: layer.sound, m: x.m });
    }
  }
  return out.sort((a, b) => a.b - b.b);
}

/* ---------- saving as a MIDI file ---------- */
// the loop played `passes` times, one track per layer and one for the drums
export function loopToMidi(L, passes = 4) {
  const len = loopBeats(L);
  const repeat = list => {
    const out = [];
    for (let p = 0; p < passes; p++)
      list.forEach(e => out.push({ b: e.b + p * len, m: e.m, d: e.d, v: e.v }));
    return out;
  };
  const tracks = [];
  const drums = loopEvents({ ...L, layers: L.layers.filter(l => l.sound === 'drums' && !l.mute) }).filter(
    e => e.drum,
  );
  if (drums.length) tracks.push({ name: 'Drums', ch: 9, program: 0, notes: repeat(drums) });
  // each layer on its own channel, skipping 10 (drums)
  const channels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  L.layers
    .filter(l => l.sound !== 'drums' && !l.mute)
    .forEach((layer, k) => {
      const own = loopEvents({ ...L, drums: emptyPattern(L.beats), layers: [layer] });
      const s = SOUND_BY[layer.sound];
      tracks.push({ name: s.n, ch: channels[k], program: s.gm, notes: repeat(own) });
    });
  return writeMidi({ bpm: L.bpm, beats: L.beats, name: L.name || 'DaCapo sketch', tracks });
}
