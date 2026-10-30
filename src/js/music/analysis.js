/* Listening: key and chord detection for Free play, and the timing analysis of a played rep. */
import { meanOf, median } from '../core/util.js';
import { Input, sameNote } from '../core/input.js';
import { CHORDS, INTERVALS, MAJOR_KEYS, MINOR_KEYS, nameOf, pcOfName } from './theory.js';

/* ---------- key and chord detection ---------- */
const KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];

const KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(x, y) {
  const mx = meanOf(x),
    my = meanOf(y);
  let a = 0,
    b = 0,
    c = 0;
  for (let i = 0; i < x.length; i++) {
    a += (x[i] - mx) * (y[i] - my);
    b += (x[i] - mx) ** 2;
    c += (y[i] - my) ** 2;
  }
  return b && c ? a / Math.sqrt(b * c) : 0;
}

export function detectKey(ms) {
  if (ms.length < 8) return null;
  const h = new Array(12).fill(0);
  ms.forEach(m => h[((m % 12) + 12) % 12]++);
  const rot = (prof, pc) => prof.map((_, i) => prof[(i - pc + 12) % 12]);
  const all = [
    ...MAJOR_KEYS.map(k => ({ ...k, mode: 'major', r: pearson(h, rot(KK_MAJ, pcOfName(k.t))) })),
    ...MINOR_KEYS.map(k => ({ ...k, mode: 'minor', r: pearson(h, rot(KK_MIN, pcOfName(k.t))) })),
  ].sort((a, b) => b.r - a.r);
  return { best: all[0], second: all[1], conf: all[0].r - all[1].r, hist: h };
}

const CHORD_T = [
  ...Object.entries(CHORDS).map(([k, v]) => ({ k, s: v.s, sym: v.sym, n: v.n })),
  { k: 'sus2', s: [0, 2, 7], sym: 'sus2', n: 'Suspended 2nd' },
  { k: 'sus4', s: [0, 5, 7], sym: 'sus4', n: 'Suspended 4th' },
  { k: 'six', s: [0, 4, 7, 9], sym: '6', n: 'Major 6th' },
  { k: 'm6', s: [0, 3, 7, 9], sym: 'm6', n: 'Minor 6th' },
  { k: 'add9', s: [0, 2, 4, 7], sym: 'add9', n: 'Major add 9' },
  { k: 'maj9', s: [0, 2, 4, 7, 11], sym: 'maj9', n: 'Major 9th' },
  { k: 'm9', s: [0, 2, 3, 7, 10], sym: 'm9', n: 'Minor 9th' },
  { k: 'dom9', s: [0, 2, 4, 7, 10], sym: '9', n: 'Dominant 9th' },
];

export function detectChord(midis, spell) {
  const ms = [...new Set(midis)].sort((a, b) => a - b);
  if (!ms.length) return null;
  const pcs = [...new Set(ms.map(m => m % 12))];
  const bass = ms[0] % 12;
  const nm = m => nameOf(spell(m), false);
  if (pcs.length === 1) return { name: nm(ms[0]), long: ms.length > 1 ? 'Octave' : 'Single note' };
  if (pcs.length === 2) {
    const iv = INTERVALS.find(i => i.s === ((ms[ms.length - 1] - ms[0]) % 12 || 12));
    return {
      name: nm(ms[0]) + '–' + nm(ms[ms.length - 1]),
      long: iv.s === 7 ? 'Open 5th' : iv.long[0].toUpperCase() + iv.long.slice(1),
    };
  }
  let best = null;
  for (const r of pcs) {
    const iv = new Set(pcs.map(p => (p - r + 12) % 12));
    for (const T of CHORD_T) {
      const ts = new Set(T.s);
      const all = [...iv].every(x => ts.has(x));
      const exact = all && iv.size === ts.size;
      const no5 = !exact && all && T.s.length >= 4 && !iv.has(7) && iv.size === ts.size - 1;
      if (!exact && !no5) continue;
      const score = (exact ? 10 : 6) + (r === bass ? 3 : 0) - T.s.length * 0.1;
      if (!best || score > best.score) best = { r, T, score };
    }
  }
  if (!best) return { name: ms.map(nm).join(' '), long: 'Cluster or unusual voicing' };
  const rootM = ms.find(m => m % 12 === best.r);
  const rootName = nm(rootM);
  const bi = best.T.s.indexOf((bass - best.r + 12) % 12);
  const inv =
    bass === best.r
      ? 'root position'
      : ['root position', '1st inversion', '2nd inversion', '3rd inversion', '4th inversion'][bi] ||
        'inverted';
  return {
    name: rootName + best.T.sym + (bass !== best.r ? '/' + nm(ms[0]) : ''),
    long: `${rootName} ${best.T.n.toLowerCase()}, ${inv}`,
    root: best.r,
    type: best.T.k,
    rootName,
  };
}

export const dynName = v =>
  v < 0.25 ? 'pp' : v < 0.4 ? 'p' : v < 0.55 ? 'mp' : v < 0.7 ? 'mf' : v < 0.85 ? 'f' : 'ff';

/* ---------- a rolling record of what you played, for the live view ---------- */
// recent notes and what the pedal is holding, for Free play (started once at boot)
export const Live = { hist: [], sustained: new Set() };

export function startLive() {
  Input.on(ev => {
    Live.hist.push({ m: ev.m, t: ev.t, vel: ev.vel, src: ev.src });
    if (Live.hist.length > 400) Live.hist.shift();
    Live.sustained.delete(ev.m);
  });
  Input.onOff(ev => {
    if (ev.pedal === false) Live.sustained.clear();
    else if (ev.m != null && Input.pedal) Live.sustained.add(ev.m);
  });
}

export function groupSteps(evs, win = 70) {
  const out = [];
  evs.forEach(e => {
    const g = out[out.length - 1];
    if (g && e.t - g.t < win) {
      if (!g.ms.includes(e.m)) g.ms.push(e.m);
    } else out.push({ t: e.t, ms: [e.m], vel: e.vel });
  });
  return out;
}

/* ---------- timing analysis ----------
   Notes are matched to the steps in order (a missed or extra note is tolerated), then a straight line
   is fitted through the matched onset times against the written beat positions. Its slope is the tempo
   you actually played; the scatter around it is your timing error. When you started does not matter.
   Unmatched notes are wrong notes. */
export function analyzeSeq(onsets, steps, msPerBeat, { any = false, one = false } = {}) {
  const ons = onsets.slice().sort((a, b) => a.t - b.t);
  const used = new Array(ons.length).fill(false);
  const gaps = [];
  for (let k = 1; k < steps.length; k++) {
    const g = steps[k].beat - steps[k - 1].beat;
    if (g > 0.01) gaps.push(g);
  }
  const gapBeats = gaps.length ? median(gaps) : 1;
  const win = Math.max(90, Math.min(260, msPerBeat * gapBeats * 0.45)); // notes of one chord or of both hands
  const res = [];
  let ptr = 0;
  const fits = (o, m) => any || sameNote(o.m, m, o.src);
  for (let k = 0; k < steps.length; k++) {
    const want = any ? [null] : steps[k].midis;
    let first = -1;
    if (one && want.length > 1) {
      // microphone: one note of a chord is all it can hear
      let x0 = -1;
      for (let x = ptr; x < Math.min(ons.length, ptr + 6); x++)
        if (!used[x] && want.some(m => fits(ons[x], m))) {
          x0 = x;
          break;
        }
      if (x0 >= 0) {
        used[x0] = true;
        const o = ons[x0];
        res.push({
          i: k,
          ok: true,
          t: o.t,
          spread: 0,
          vel: o.vel || 0,
          notes: [{ m: o.m, t: o.t, vel: o.vel || 0 }],
        });
        ptr = x0 + 1;
      } else res.push({ i: k, ok: false });
      continue;
    }
    for (let x = ptr; x < Math.min(ons.length, ptr + 4 + want.length * 2); x++)
      if (!used[x] && want.some(m => fits(ons[x], m))) {
        first = x;
        break;
      }
    if (first < 0) {
      res.push({ i: k, ok: false });
      continue;
    }
    const t0 = ons[first].t;
    const hits = [];
    let maxIdx = first;
    for (const m of want) {
      let idx = -1;
      for (let x = Math.max(0, first - 3); x < ons.length && ons[x].t <= t0 + win; x++)
        if (!used[x] && !hits.some(h => h.x === x) && fits(ons[x], m) && Math.abs(ons[x].t - t0) <= win) {
          idx = x;
          break;
        }
      if (idx >= 0) {
        hits.push({ x: idx, o: ons[idx] });
        maxIdx = Math.max(maxIdx, idx);
      }
    }
    if (hits.length === want.length) {
      hits.forEach(h => (used[h.x] = true));
      const ts = hits.map(h => h.o.t);
      res.push({
        i: k,
        ok: true,
        t: Math.min(...ts),
        spread: Math.max(...ts) - Math.min(...ts),
        vel: meanOf(hits.map(h => h.o.vel || 0)),
        notes: hits.map(h => ({ m: h.o.m, t: h.o.t, vel: h.o.vel || 0 })), // each note: for hand and finger analysis
      });
      ptr = maxIdx + 1;
    } else {
      hits.forEach(h => (used[h.x] = true));
      ptr = maxIdx + 1;
      res.push({ i: k, ok: false, partial: hits.length });
    } // an incomplete chord still belongs here: later steps must not take its notes
  }
  const hit = res.filter(r => r.ok && !steps[r.i].grace);
  let a = hit.length ? hit[0].t - steps[hit[0].i].beat * msPerBeat : 0,
    b = msPerBeat;
  if (hit.length >= 3) {
    const xs = hit.map(r => steps[r.i].beat),
      ys = hit.map(r => r.t),
      mx = meanOf(xs),
      my = meanOf(ys);
    let num = 0,
      den = 0;
    xs.forEach((x, q) => {
      num += (x - mx) * (ys[q] - my);
      den += (x - mx) ** 2;
    });
    if (den && num > 0) {
      b = num / den;
      a = my - b * mx;
    }
  }
  hit.forEach(r => (r.dev = r.t - (a + b * steps[r.i].beat)));
  const sd = hit.length > 2 ? Math.sqrt(hit.reduce((s, r) => s + r.dev ** 2, 0) / (hit.length - 2)) : 0;
  const maxDev = hit.length ? Math.max(...hit.map(r => Math.abs(r.dev))) : 0;
  const vels = hit.map(r => r.vel);
  const vm = meanOf(vels);
  const vsd =
    vels.length > 1 ? Math.sqrt(vels.reduce((s, v) => s + (v - vm) ** 2, 0) / (vels.length - 1)) : 0;
  const spreads = hit.filter(r => steps[r.i].midis.length > 1).map(r => r.spread);
  // unmatched notes are wrong notes, except a barely-touched key
  const extras = ons.filter((o, x) => !used[x] && (o.src !== 'midi' || (o.vel || 0) >= 0.1));
  const okCount = res.filter(r => r.ok).length;
  return {
    res,
    accuracy: okCount / steps.length,
    sdMs: sd,
    gapBeats,
    sdBeat: b > 0 ? sd / b : 0,
    sdGap: b > 0 ? sd / (b * gapBeats) : 0,
    maxDevBeat: b > 0 ? maxDev / b : 0,
    tempoRatio: b > 0 ? msPerBeat / b : 1,
    start: a,
    msPerBeatPlayed: b,
    velSd: vsd,
    spread: spreads.length ? meanOf(spreads) : null,
    wrong: extras.length,
    wrongNotes: extras.slice(0, 6).map(o => o.m),
    complete: res.length > 0 && res[res.length - 1].ok,
    matched: okCount,
  };
}
