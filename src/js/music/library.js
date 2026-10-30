/* The built-in music. Pieces come from public-domain and Creative Commons editions typeset by
 * volunteers of the Mutopia Project (tools/build_library.py reads their LilyPond sources and checks
 * every bar). Note data is packed as base64 varints: per note, onset delta and duration in ticks,
 * pitch change per hand, and one byte with accidental, hand and staff. */
import { LIBRARY_DATA } from '../data.js';
import { Log } from '../core/log.js';
import { spellAcc } from './theory.js';

export const COMPOSERS = {
  satie: { n: 'Erik Satie', short: 'Satie', life: '1866–1925' },
  chopin: { n: 'Frédéric Chopin', short: 'Chopin', life: '1810–1849' },
  debussy: { n: 'Claude Debussy', short: 'Debussy', life: '1862–1918' },
  rachmaninoff: { n: 'Sergei Rachmaninoff', short: 'Rachmaninoff', life: '1873–1943' },
  mine: { n: 'Your files', short: 'Imported', life: '' },
};

export const LEVEL_NAMES = [
  '',
  'Early intermediate',
  'Intermediate',
  'Late intermediate',
  'Advanced',
  'Very advanced',
];

export const listenUrl = p =>
  'https://www.youtube.com/results?search_query=' +
  encodeURIComponent(`${(COMPOSERS[p.c] || {}).short || ''} ${p.t} ${p.sub || ''} piano`);

export const scoreUrl = p =>
  'https://imslp.org/index.php?search=' +
  encodeURIComponent(`${(COMPOSERS[p.c] || {}).short || ''} ${p.t} ${p.sub || ''}`);

function b64bytes(s) {
  const bin = atob(s || '');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function readVarints(bytes) {
  const out = [];
  let v = 0,
    sh = 0;
  for (const b of bytes) {
    v += (b & 0x7f) * Math.pow(2, sh);
    if (b & 0x80) sh += 7;
    else {
      out.push(v);
      v = 0;
      sh = 0;
    }
  }
  return out;
}

const unzz = n => (n % 2 ? -(n + 1) / 2 : n / 2);

export const Library = {
  cache: new Map(),
  // your imported pieces, read from the device once and kept in memory (they are looked up constantly)
  mine: null,
  imports() {
    if (!this.mine)
      try {
        const list = JSON.parse(localStorage.getItem('dacapo.imports') || '[]');
        this.mine = Array.isArray(list) ? list : [];
      } catch (e) {
        this.mine = [];
      }
    return this.mine;
  },
  saveImports(list) {
    try {
      localStorage.setItem('dacapo.imports', JSON.stringify(list));
      this.mine = list;
      return true;
    } catch (e) {
      Log.err(e, 'save import');
      return false;
    }
  },
  // forget everything decoded for a piece (after it is removed or replaced)
  forget(id) {
    ['', 'bars:', 'secs:'].forEach(k => this.cache.delete(k + id));
  },
  all() {
    return (typeof LIBRARY_DATA !== 'undefined' ? LIBRARY_DATA : []).concat(this.imports());
  },
  get(id) {
    return this.all().find(p => p.id === id) || null;
  },
  // decoded notes: [{t, d, m, acc, h, s, f}] with t, d in quarter-note beats
  notes(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const p = this.get(id);
    if (!p) return [];
    const out = this.decode(p);
    this.cache.set(id, out);
    return out;
  },
  decode(p) {
    const id = p.id;
    const bytes = b64bytes(p.notes);
    let pos = 0;
    const rv = () => {
      let val = 0,
        sh = 0;
      while (pos < bytes.length) {
        const b = bytes[pos++];
        val += (b & 0x7f) * Math.pow(2, sh);
        if (!(b & 0x80)) break;
        sh += 7;
      }
      return val;
    };
    const out = [];
    let t = 0;
    const prev = [60, 48];
    const shift = p.shift || 0;
    while (pos < bytes.length && out.length < p.n) {
      t += rv();
      const d = rv();
      const dz = rv();
      const flags = bytes[pos++];
      const h = Math.floor(flags / 5) % 2;
      const m = prev[h] + unzz(dz);
      prev[h] = m;
      out.push({
        t: t / p.tpq - shift,
        d: d / p.tpq,
        m,
        acc: (flags % 5) - 2,
        h,
        s: Math.floor(flags / 10) % 2,
        f: 0,
      });
    }
    const fv = readVarints(b64bytes(p.fing));
    let fi = 0;
    for (let k = 0; k + 1 < fv.length; k += 2) {
      fi += fv[k];
      if (out[fi]) out[fi].f = fv[k + 1];
    }
    if (out.length !== p.n) Log.warn('library decode count mismatch', { id, got: out.length, want: p.n });
    return out;
  },
  bars(id) {
    const p = this.get(id);
    const key = 'bars:' + id;
    if (this.cache.has(key)) return this.cache.get(key);
    let acc = 0;
    const out = readVarints(b64bytes(p.bars)).map(x => (acc += x) / p.tpq - (p.shift || 0));
    this.cache.set(key, out);
    return out;
  },
  // the practice sections of a piece: bars a..z, the section it repeats (same, or -1), and how many notes
  // start in it (n; a section without any cannot be practiced on its own)
  sections(id) {
    const key = 'secs:' + id;
    if (this.cache.has(key)) return this.cache.get(key);
    const p = this.get(id);
    const out = ((p && p.secs) || []).map(([a, z, same], k) => ({
      k,
      a,
      z,
      same,
      n: this.range(id, a, z).length,
    }));
    this.cache.set(key, out);
    return out;
  },
  atBar(list, bar, def) {
    let v = def;
    (list || []).forEach(x => {
      if (x[0] <= bar) v = x;
    });
    return v;
  },
  timeAt(id, bar) {
    const p = this.get(id);
    const x = this.atBar(p.ts, bar, [0, 4, 4]);
    return [x[1], x[2]];
  },
  keyAt(id, bar) {
    const p = this.get(id);
    const x = this.atBar(p.keys, bar, [0, 0]);
    return x[1];
  },
  tempoAt(id, bar) {
    const p = this.get(id);
    let v = p.bpm;
    (p.tempos || []).forEach(([b, bpm]) => {
      if (b - 1 <= bar) v = bpm;
    });
    return v;
  },
  clefAt(id, staff, bar) {
    const p = this.get(id);
    let c = p.c === 'mine' && staff === 1 ? 'b' : 't';
    /* LilyPond's default clef is treble on every staff */ (p.clefs || []).forEach(([b, s, k]) => {
      if (s === staff && b <= bar) c = k;
    });
    return c;
  },
  // the notes of a bar range; grace notes just before the first bar belong to it
  range(id, a, z) {
    const bars = this.bars(id);
    const s0 = bars[a],
      s1 = bars[Math.min(z, bars.length - 1)];
    const eps = 0.2;
    return this.notes(id).filter(
      n =>
        n.t >= s0 - (n.d === 0 ? eps : 0) &&
        (n.t < s1 - (n.d === 0 ? eps : 0) || (z >= bars.length - 1 && n.t <= s1)),
    );
  },
  /* steps for practicing bars a..z with the given hands ('rh' | 'lh' | 'ht') */
  steps(id, a, z, hand) {
    const p = this.get(id);
    const bars = this.bars(id);
    const s0 = bars[a];
    const all = this.range(id, a, z);
    const want = hand === 'rh' ? [0] : hand === 'lh' ? [1] : [0, 1];
    const groups = new Map();
    all.forEach(n => {
      if (!want.includes(n.h)) return;
      const key = n.t.toFixed(4);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
    });
    const steps = [...groups.entries()]
      .sort((x, y) => +x[0] - +y[0])
      .map(([k, ns]) => {
        const beat = +k - s0;
        const grace = ns.every(n => n.d === 0);
        return {
          midis: [...new Set(ns.map(n => n.m))].sort((x, y) => x - y),
          beat,
          grace,
          dur: Math.max(...ns.map(n => n.d)),
          notes: ns.map(n => ({
            n: spellAcc(n.m, n.acc),
            st: n.s ? 'b' : 't',
            f: n.f || '',
            fcls: n.h ? 'lh' : 'rh',
            d: n.d,
            t: n.t - s0,
          })),
        };
      });
    const ghost =
      hand === 'ht'
        ? []
        : all
            .filter(n => !want.includes(n.h))
            .map(n => ({ n: spellAcc(n.m, n.acc), st: n.s ? 'b' : 't', d: n.d, t: n.t - s0, ghost: true }));
    return {
      steps,
      ghost,
      bars: bars.slice(a, z + 1).map(b => b - s0),
      total: bars[Math.min(z, bars.length - 1)] - s0,
      sig: this.keyAt(id, a),
      time: this.timeAt(id, a),
      clefs: [this.clefAt(id, 0, a), this.clefAt(id, 1, a)],
      clefChanges: (p.clefs || [])
        .filter(([b]) => b > a && b < z)
        .map(([b, s, k]) => ({ t: bars[b] - s0, s, k })),
    };
  },
  // how a piece is counted: click unit in quarter notes, clicks per bar
  meter(id, bar) {
    const [n, d] = this.timeAt(id, bar);
    const unit = d === 8 ? 0.5 : 1;
    const clicks = d === 8 ? n : d === 2 ? n * 2 : n;
    return { n, d, unit, clicks, barBeats: (n * 4) / d };
  },
};
