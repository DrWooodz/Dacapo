/* Drawing music: staff notation for drills and real scores, rhythm lines and the keyboard. */
import { GLYPHS } from '../data.js';
import { esc } from '../core/util.js';
import { diaOf, keySigNotes, sigAccidentalFor } from './theory.js';

const SS = 10,
  GS = SS / 250; // staff space, glyph scale

function glyph(name, x, y, cls = 'gl', extra = '') {
  return `<path class="${cls}" d="${GLYPHS[name]}" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${GS},${-GS})" ${extra}/>`;
}

/* Staff geometry. Treble lines: dia 30..38 (E4..F5). Bass lines: dia 18..26 (G2..A3). */
function staffGeom(clef, opts = {}) {
  const top = opts.top ?? 40;
  const g = { clef, top };
  if (clef === 'treble') {
    g.yT = d => top + (38 - d) * 5;
    g.lines = [{ y: top }];
    g.h = top + 40 + (opts.bottom ?? 40);
  } else if (clef === 'bass') {
    g.yB = d => top + (26 - d) * 5;
    g.h = top + 40 + (opts.bottom ?? 40);
  } else {
    const yb = top + 90;
    g.yT = d => top + (38 - d) * 5;
    g.yB = d => yb + (26 - d) * 5;
    g.yb = yb;
    g.h = yb + 40 + (opts.bottom ?? 40);
  }
  g.y = (d, st) => ((st === 'b' ? g.yB : g.yT) || g.yT || g.yB)(d);
  return g;
}

function staffLines(g, x0, x1) {
  let s = '';
  const draw = ytop => {
    for (let i = 0; i < 5; i++)
      s += `<line class="ln" x1="${x0}" x2="${x1}" y1="${ytop + i * SS}" y2="${ytop + i * SS}"/>`;
  };
  if (g.clef === 'treble') draw(g.top);
  else if (g.clef === 'bass') draw(g.top);
  else {
    draw(g.top);
    draw(g.yb);
    s += `<line class="ln" x1="${x0}" x2="${x0}" y1="${g.top}" y2="${g.yb + 40}" style="stroke-width:1.4"/>`;
  }
  return s;
}

function clefsAndSig(g, sig, x = 6) {
  let s = '';
  const doClef = which => {
    if (which === 'treble') s += glyph('gClef', x, g.yT(32));
    else s += glyph('fClef', x, g.yB(24));
  };
  if (g.clef !== 'bass') doClef('treble');
  if (g.clef !== 'treble') doClef('bass');
  let xx = x + 34;
  const sigs = [];
  if (g.clef !== 'bass') sigs.push(['t', keySigNotes(sig, 'treble')]);
  if (g.clef !== 'treble') sigs.push(['b', keySigNotes(sig, 'bass')]);
  sigs.forEach(([st, arr]) =>
    arr.forEach((k, i) => {
      s += glyph(k.a > 0 ? 'sharp' : 'flat', xx + i * 9, g.y(k.d, st));
    }),
  );
  xx += Math.abs(sig) * 9 + (sig ? 8 : 0);
  return { s, x: xx };
}

function timeSig(g, top, bot, x) {
  let s = '';
  const put = (st, lineTop) => {
    s += glyph('t' + top, x, lineTop + 10) + glyph('t' + bot, x, lineTop + 30);
  };
  if (g.clef === 'bass') put('b', g.top);
  else {
    put('t', g.top);
    if (g.clef === 'grand') put('b', g.yb);
  }
  return s;
}

function ledgers(g, d, st, x) {
  let s = '';
  const L = yy =>
    (s += `<line class="ln" x1="${x - 4}" x2="${x + 16}" y1="${yy}" y2="${yy}" style="stroke-width:1.2"/>`);
  const lo = st === 'b' ? 18 : 30,
    hi = st === 'b' ? 26 : 38;
  for (let k = lo - 2; k >= d; k -= 2) L(g.y(k, st));
  for (let k = hi + 2; k <= d; k += 2) L(g.y(k, st));
  return s;
}

/* items: [{notes:[{n, st:'t'|'b', cls, f, fcls}], dur, x}] — notes in one item share an x (chord) */
export function staffSVG({
  clef = 'treble',
  sig = 0,
  items = [],
  spacing = 30,
  minW = 0,
  showAcc = 'auto',
  time = null,
  startX = null,
  bottom,
  top,
  barEvery = 0,
  labels = false,
} = {}) {
  const g = staffGeom(clef, { bottom, top });
  const head = clefsAndSig(g, sig);
  let x = startX ?? head.x + 8;
  let body = head.s;
  if (time) {
    body += timeSig(g, time[0], time[1], head.x);
    x += 22;
  }
  const xs = [];
  // With bar lines, accidentals last to the end of the bar: a note needs a sign when it differs from what
  // is in force on its line or space (the key signature, or an earlier accidental in the same bar).
  // Without bar lines (scales, chords), every note differing from the key signature shows its sign.
  let inForce = new Map();
  const place = nn => `${nn.st || ''}:${diaOf(nn.n)}`;
  const current = nn =>
    barEvery && inForce.has(place(nn)) ? inForce.get(place(nn)) : sigAccidentalFor(sig, nn.n.l);
  items.forEach((it, i) => {
    const needAcc = nn => (showAcc === 'all' ? nn.n.a !== 0 : nn.n.a !== current(nn) || !!nn.natural);
    const nAcc = (it.notes || []).filter(needAcc).length;
    if (it.x == null && nAcc) x += nAcc > 1 ? 18 : 9;
    const ix = it.x ?? x;
    xs.push(ix);
    const sorted = (it.notes || []).slice().sort((a, b) => diaOf(a.n) - diaOf(b.n));
    let prevD = -99,
      prevShift = false;
    // accidentals stagger in columns from the top note down
    const accOrder = sorted.filter(needAcc).reverse();
    const accX = new Map();
    accOrder.forEach((nn, k) => accX.set(nn, ix - 12 - (k % 2) * 9));
    sorted.forEach(nn => {
      const st = nn.st || (diaOf(nn.n) >= 28 && clef !== 'bass' ? 't' : clef === 'treble' ? 't' : 'b');
      const d = diaOf(nn.n);
      const y = g.y(d, st);
      const shift = d - prevD === 1 && !prevShift;
      prevShift = shift;
      prevD = d; // seconds: displace the upper note
      const hx = shift ? ix + 11.4 : ix;
      body += ledgers(g, d, st, ix) + (shift ? ledgers(g, d, st, ix + 11.4) : '');
      if (needAcc(nn)) {
        const nm = nn.n.a > 0 ? 'sharp' : nn.n.a < 0 ? 'flat' : 'natural';
        body += glyph(nm, accX.get(nn), y, 'gl note ' + (nn.cls || ''));
      }
      const head = it.dur === 'w' ? 'nhW' : it.dur === 'h' ? 'nhH' : 'nhB';
      body += glyph(head, hx, y, 'note ' + (nn.cls || ''));
      if (nn.f) {
        const isL = (nn.fcls || '') === 'lh' || (nn.fcls == null && st === 'b');
        const fy = isL
          ? Math.max(y + 18, (st === 'b' ? g.yB(18) : g.yT(30)) + 14)
          : Math.min(y - 12, (st === 'b' ? g.yB(26) : g.yT(38)) - 8);
        body += `<text class="fing ${nn.fcls || (isL ? 'lh' : 'rh')}" x="${ix + 6}" y="${fy}">${nn.f}</text>`;
      }
      if (labels && nn.lbl) body += `<text class="lbl" x="${ix + 6}" y="${g.h - 8}">${esc(nn.lbl)}</text>`;
    });
    if (it.fstack && sorted.length) {
      // chord fingering, low→high, stacked
      const isL = it.fcls === 'lh';
      const st = sorted[0].st || (clef === 'bass' ? 'b' : 't');
      const lowY = g.y(diaOf(sorted[0].n), st),
        highY = g.y(diaOf(sorted[sorted.length - 1].n), st);
      it.fstack.forEach((f, k) => {
        const fy = isL
          ? Math.max(lowY + 18, (st === 'b' ? g.yB(18) : g.yT(30)) + 14) + (it.fstack.length - 1 - k) * 10
          : Math.min(highY - 12, (st === 'b' ? g.yB(26) : g.yT(38)) - 8) - k * 10;
        body += `<text class="fing ${it.fcls || 'rh'}" x="${ix + 6}" y="${fy}">${f}</text>`;
      });
    }
    if (it.stem && sorted.length) {
      // stem up, single notes only
      const nn = sorted[sorted.length - 1];
      const st = nn.st || 't';
      const y = g.y(diaOf(nn.n), st);
      body += `<line class="stem" x1="${ix + 11.3}" x2="${ix + 11.3}" y1="${y - 1}" y2="${y - 34}"/>`;
    }
    (it.notes || []).forEach(nn => inForce.set(place(nn), nn.n.a));
    if (barEvery && (i + 1) % barEvery === 0) inForce = new Map();
    if (barEvery && (i + 1) % barEvery === 0 && i < items.length - 1) {
      const bx = ix + spacing / 2 + 4;
      body += `<line class="ln" x1="${bx}" x2="${bx}" y1="${g.top}" y2="${clef === 'grand' ? g.yb + 40 : g.top + 40}"/>`;
    }
    if (it.x == null) x += spacing;
  });
  const W = Math.max(minW, (xs.length ? Math.max(...xs) : x) + 30);
  const lines = staffLines(g, 2, W - 2);
  return {
    svg: `<svg class="staff" viewBox="0 0 ${W} ${g.h}" role="img" aria-label="Staff notation">${lines}${body}</svg>`,
    W,
    g,
    xs,
  };
}

/* ---------- rhythm notation on a single line ---------- */
// events: [{d: beats, rest:bool}] ; timing in quarter-beats
export function rhythmSVG(events, { beats = 4, marks = [], width = 420, cur = -1, total = 0 } = {}) {
  const H = 90,
    y = 52,
    x0 = 46,
    x1 = width - 16;
  const span = x1 - x0;
  const len = total || events.reduce((a, e) => a + e.d, 0) || beats; // time on the line, in beats
  let s = `<line class="ln" x1="8" x2="${width - 6}" y1="${y}" y2="${y}"/>`;
  s += `<line class="ln" x1="8" x2="8" y1="${y - 20}" y2="${y + 20}"/>`;
  s += `<line class="ln" x1="${width - 6}" x2="${width - 6}" y1="${y - 20}" y2="${y + 20}"/>`;
  s += glyph('t' + beats, 14, y - 10) + glyph('t4', 14, y + 10);
  let t = 0;
  const pos = [];
  events.forEach((e, i) => {
    pos.push({ x: x0 + 6 + (t / len) * span, t, e, i });
    t += e.d;
  });
  // beaming: consecutive eighths within same beat
  pos.forEach((p, k) => {
    const e = p.e;
    const cls = marks[k] || (k === cur ? 'cur' : '');
    if (e.rest) {
      const name = e.d >= 4 ? 'rW' : e.d >= 2 ? 'rH' : e.d >= 1 ? 'rQ' : 'r8';
      const ry = name === 'rW' ? y - 10 : name === 'rH' ? y : name === 'rQ' ? y : y;
      s += glyph(name, p.x, ry, 'note ' + cls);
      if (e.dot) s += glyph('dot', p.x + 14, y - 5, 'note ' + cls);
      return;
    }
    const head = e.d >= 4 ? 'nhW' : e.d >= 2 ? 'nhH' : 'nhB';
    s += glyph(head, p.x, y, 'note ' + cls);
    if (e.dot) s += glyph('dot', p.x + 16, y - 3, 'note ' + cls);
    if (e.d < 4)
      s += `<line class="stem" x1="${p.x + 11.3}" x2="${p.x + 11.3}" y1="${y - 1}" y2="${y - 32}"/>`;
    if (e.d <= 0.5 && !e.beam) s += glyph('flag8', p.x + 10.6, y - 32, 'gl');
  });
  // beams: a group runs from 'start' to 'end'; b2 marks notes that also take a second (16th) beam
  pos.forEach((p, k) => {
    if (p.e.beam !== 'start') return;
    let z = k;
    while (pos[z + 1] && pos[z].e.beam !== 'end') z++;
    const q = pos[z];
    s += `<rect x="${p.x + 10.6}" y="${y - 34}" width="${q.x - p.x + 0.8}" height="4.5" class="gl"/>`;
    for (let j = k; j < z; j++)
      if (pos[j].e.b2 && pos[j + 1].e.b2)
        s += `<rect x="${pos[j].x + 10.6}" y="${y - 27}" width="${pos[j + 1].x - pos[j].x + 0.8}" height="4" class="gl"/>`;
    if (p.e.tup)
      s += `<text x="${(p.x + q.x) / 2 + 11}" y="${y - 40}" text-anchor="middle" font-size="11" font-style="italic" font-weight="700" fill="var(--ink)">${p.e.tup}</text>`;
  });
  for (let b = 1; b < len; b++) {
    const bx = x0 + (b / len) * span;
    if (b % beats === 0) s += `<line x1="${bx}" x2="${bx}" y1="${y - 20}" y2="${y + 20}" class="ln"/>`;
    else s += `<line x1="${bx + 6}" x2="${bx + 6}" y1="${y + 26}" y2="${y + 30}" class="ln"/>`;
  }
  return `<svg class="staff" viewBox="0 0 ${width} ${H}" role="img" aria-label="Rhythm">${s}</svg>`;
}

/* ---------- keyboard ---------- */
export const isBlack = m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

export function kbSVG({ from = 48, to = 72, marks = {}, interactive = true, cLabels = true, h = 100 } = {}) {
  while (isBlack(from)) from--;
  while (isBlack(to)) to++;
  const WW = 24,
    BW = 14,
    BH = h * 0.62;
  let whites = '',
    blacks = '',
    labels = '',
    wi = 0;
  const wx = {};
  for (let m = from; m <= to; m++)
    if (!isBlack(m)) {
      wx[m] = wi * WW;
      wi++;
    }
  const W = wi * WW;
  for (let m = from; m <= to; m++) {
    const mk = marks[m] || {};
    const cls = mk.cls || '';
    if (!isBlack(m)) {
      const x = wx[m];
      whites += `<rect class="w ${cls}" data-m="${m}" x="${x + 0.5}" y="0.5" width="${WW - 1}" height="${h - 1}" rx="2"/>`;
      if (mk.f != null) labels += fingerLabel(x + WW / 2, h - 16, 8, mk.fc || cls, mk.f);
      else if (cLabels && m % 12 === 0)
        labels += `<text class="cl" x="${x + WW / 2}" y="${h - 7}">C${m / 12 - 1}</text>`;
    } else {
      const x = wx[m - 1] + WW - BW / 2;
      blacks += `<rect class="b ${cls}" data-m="${m}" x="${x}" y="0" width="${BW}" height="${BH}" rx="1.5"/>`;
      if (mk.f != null) labels += fingerLabel(x + BW / 2, BH - 12, 7, mk.fc || cls, mk.f, 'font-size:9px');
    }
  }
  const style = `max-width:${Math.round(W * 1.7)}px;margin:0 auto`;
  return `<svg class="kb" viewBox="0 0 ${W} ${h}" style="${style}" ${interactive ? 'data-play="1"' : ''}
    role="img" aria-label="Piano keyboard">${whites}${blacks}${labels}</svg>`;
}

// a finger number in a circle on a key
function fingerLabel(cx, cy, r, cls, finger, style = '') {
  return (
    `<circle class="fc ${cls}" cx="${cx}" cy="${cy}" r="${r}"/>` +
    `<text class="fn ${cls}" x="${cx}" y="${cy}"${style ? ` style="${style}"` : ''}>${esc(finger)}</text>`
  );
}

// fit a range around a list of midis, padded to whole octaves-ish
export function kbRange(midis, pad = 2, minSpan = 24) {
  let lo = Math.min(...midis) - pad,
    hi = Math.max(...midis) + pad;
  while (hi - lo < minSpan) {
    lo--;
    hi++;
  }
  return { from: lo, to: hi };
}

export function flashKey(svg, m, cls = 'down', ms = 260) {
  if (!svg) return;
  const el = svg.querySelector(`[data-m="${m}"]`);
  if (!el) return;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

/* ---------- real music on a grand staff ----------
   Horizontal position follows time (with a minimum gap), bar lines are drawn, note heads show long
   values (whole and half notes open), accidentals follow the bar rules, clefs follow the score. */
export function pieceStaffSVG({
  steps = [],
  ghost = [],
  bars = [],
  total = 0,
  sig = 0,
  time = null,
  clefs = ['t', 'b'],
  clefChanges = [],
  hl = {},
  ppb = 34,
} = {}) {
  const top0 = 44,
    gap = 52;
  const tops = [top0, top0 + 40 + gap];
  const H = tops[1] + 40 + 46;
  const clefAt = (s, t) => {
    let c = clefs[s];
    clefChanges.forEach(ch => {
      if (ch.s === s && ch.t <= t + 1e-6) c = ch.k;
    });
    return c;
  };
  const topLine = c => (c === 't' ? 38 : 26);
  const yOf = (s, d, t) => tops[s] + (topLine(clefAt(s, t)) - d) * 5;
  // header: clefs, key signature, time signature
  let body = '';
  let x = 8;
  [0, 1].forEach(s => {
    const c = clefs[s];
    body += c === 't' ? glyph('gClef', x, tops[s] + 30) : glyph('fClef', x, tops[s] + 10);
  });
  x += 34;
  [0, 1].forEach(s => {
    const c = clefs[s];
    keySigNotes(sig, c === 't' ? 'treble' : 'bass').forEach((k, i) => {
      body += glyph(k.a > 0 ? 'sharp' : 'flat', x + i * 9, tops[s] + (topLine(c) - k.d) * 5);
    });
  });
  x += Math.abs(sig) * 9 + (sig ? 8 : 0);
  if (time) {
    [0, 1].forEach(s => {
      const n = String(time[0]),
        d = String(time[1]);
      body +=
        [...n].map((ch, i) => glyph('t' + ch, x + i * 11, tops[s] + 10)).join('') +
        [...d].map((ch, i) => glyph('t' + ch, x + i * 11, tops[s] + 30)).join('');
    });
    x += 12 + 11 * Math.max(String(time[0]).length, String(time[1]).length);
  }
  const x0 = x + 10;
  // columns by time
  const cols = new Map();
  const key = t => (Math.round(t * 1000) / 1000).toFixed(3);
  const addCol = (t, n) => {
    const k = key(t);
    if (!cols.has(k)) cols.set(k, { t: +k, notes: [] });
    cols.get(k).notes.push(n);
  };
  steps.forEach((s, i) => s.notes.forEach(n => addCol(s.beat, { ...n, step: i })));
  ghost.forEach(n => addCol(n.t, { ...n, step: -1 }));
  const barSet = bars
    .slice(1)
    .filter(b => b < total - 1e-6)
    .map(b => +key(b));
  const times = [...new Set([...cols.keys()].map(Number).concat(barSet))].sort((a, b) => a - b);
  // accidentals: per bar and staff, the key signature first, then what was written
  const sigAcc = l => sigAccidentalFor(sig, l);
  let accState = new Map();
  const pos = new Map();
  let cx = x0;
  let lastT = null;
  const xBar = new Map();
  times.forEach(t => {
    const k = key(t);
    const isBar = barSet.includes(t) && !xBar.has(k);
    const col = cols.get(k);
    if (isBar) {
      cx = Math.max(cx + (lastT == null ? 0 : 8), x0 + t * ppb - 6);
      xBar.set(k, cx);
      cx += 12;
    }
    if (col) {
      // which notes need an accidental, given the bar so far
      if (isBar || bars.slice(1).some(b => Math.abs(b - t) < 1e-6)) accState = new Map();
      const needs = col.notes.map(n => {
        const sk = (n.st === 'b' ? 1 : 0) + ':' + diaOf(n.n);
        const cur = accState.has(sk) ? accState.get(sk) : sigAcc(n.n.l);
        const need = n.n.a !== cur || n.natural;
        return need;
      });
      col.notes.forEach((n, j) => {
        const sk = (n.st === 'b' ? 1 : 0) + ':' + diaOf(n.n);
        accState.set(sk, n.n.a);
        n.acc = needs[j];
      });
      const accW = col.notes.some(n => n.acc) ? 12 : 0;
      const want = x0 + t * ppb;
      cx = Math.max(want, lastT == null ? x0 : cx + 22) + accW;
      pos.set(k, cx);
      lastT = t;
      cx += 2;
    }
  });
  const W = Math.max(cx + 30, 300);
  // staff lines and the brace line
  let lines = '';
  [0, 1].forEach(s => {
    for (let i = 0; i < 5; i++)
      lines += `<line class="ln" x1="2" x2="${W - 2}" y1="${tops[s] + i * SS}" y2="${tops[s] + i * SS}"/>`;
  });
  // the system's opening and closing bar lines
  lines += `<line class="ln" x1="2" x2="2" y1="${tops[0]}" y2="${tops[1] + 40}" style="stroke-width:1.6"/>`;
  lines += `<line class="ln" x1="${W - 2}" x2="${W - 2}" y1="${tops[0]}" y2="${tops[1] + 40}"/>`;
  xBar.forEach(bx => {
    lines += `<line class="ln bar" x1="${bx}" x2="${bx}" y1="${tops[0]}" y2="${tops[1] + 40}"/>`;
  });
  clefChanges.forEach(ch => {
    const bx = (xBar.get(key(ch.t)) ?? x0 + ch.t * ppb) + 2;
    body +=
      ch.k === 't'
        ? glyph('gClef', bx, tops[ch.s] + 30, 'gl small')
        : glyph('fClef', bx, tops[ch.s] + 10, 'gl small');
  });
  const xs = steps.map(s => pos.get(key(s.beat)));
  // notes
  cols.forEach((col, k) => {
    const ix = pos.get(k);
    if (ix == null) return;
    [0, 1].forEach(s => {
      const ns = col.notes.filter(n => (n.st === 'b' ? 1 : 0) === s).sort((a, b) => diaOf(a.n) - diaOf(b.n));
      let prevD = -99,
        prevShift = false;
      let accCol = 0;
      ns.slice()
        .reverse()
        .forEach(n => {
          if (n.acc) {
            n.ax = ix - 12 - (accCol % 2) * 9;
            accCol++;
          }
        });
      ns.forEach(n => {
        const d = diaOf(n.n);
        const y = yOf(s, d, col.t);
        const shift = d - prevD === 1 && !prevShift;
        prevShift = shift;
        prevD = d;
        const hx = shift ? ix + 11.4 : ix;
        const c = clefAt(s, col.t);
        const lo = topLine(c) - 8,
          hi = topLine(c);
        for (let dd = lo - 2; dd >= d; dd -= 2)
          lines += `<line class="ln" x1="${ix - 4}" x2="${ix + 16 + (shift ? 11 : 0)}" y1="${yOf(s, dd, col.t)}" y2="${yOf(s, dd, col.t)}" style="stroke-width:1.2"/>`;
        for (let dd = hi + 2; dd <= d; dd += 2)
          lines += `<line class="ln" x1="${ix - 4}" x2="${ix + 16 + (shift ? 11 : 0)}" y1="${yOf(s, dd, col.t)}" y2="${yOf(s, dd, col.t)}" style="stroke-width:1.2"/>`;
        const cls =
          n.step < 0
            ? 'ghost'
            : hl.bad && hl.bad.has(n.step)
              ? 'bad'
              : hl.ok && hl.ok.has(n.step)
                ? 'ok'
                : hl.cur === n.step
                  ? 'cur'
                  : '';
        if (n.acc) {
          const nm =
            n.n.a > 0
              ? n.n.a > 1
                ? 'dsharp'
                : 'sharp'
              : n.n.a < 0
                ? n.n.a < -1
                  ? 'dflat'
                  : 'flat'
                : 'natural';
          body += glyph(
            GLYPHS[nm] ? nm : n.n.a > 0 ? 'sharp' : n.n.a < 0 ? 'flat' : 'natural',
            n.ax,
            y,
            'gl note ' + cls,
          );
        }
        const dur = n.d || 0;
        const head = dur >= 3.9 ? 'nhW' : dur >= 1.9 ? 'nhH' : 'nhB';
        if (dur === 0 && n.step >= 0)
          body += `<g transform="translate(${hx + 3} ${y}) scale(.68) translate(${-hx - 3} ${-y})">${glyph('nhB', hx, y, 'note ' + cls)}</g>`;
        else body += glyph(head, hx, y, 'note ' + cls);
        if (n.f && n.step >= 0) {
          const above = s === 0;
          const fy = above ? Math.min(y - 12, tops[0] - 6) : Math.max(y + 18, tops[1] + 52);
          body += `<text class="fing ${n.fcls || ''}" x="${ix + 6}" y="${fy}">${n.f}</text>`;
        }
      });
    });
  });
  return {
    svg: `<svg class="staff piece" viewBox="0 0 ${W} ${H}" role="img" aria-label="Score">${lines}${body}</svg>`,
    W,
    H,
    xs,
    x0,
    ppb,
  };
}
