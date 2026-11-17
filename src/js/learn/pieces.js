/* Learning a piece, a section of about four bars at a time, then the whole piece.
     learn  - in wait mode (the app waits for the right notes): each hand alone, then together, two clean
              runs each
     tempo  - with the metronome: two clean runs out of the last three raise the tempo about 5%; a run with
              wrong notes lowers it 10%. Uneven timing alone never lowers it
     done   - at the piece's tempo. Play it whenever you like
   When a section stops moving (many runs, few clean), the approach changes instead of repeating the same
   thing. Only playing on a real piano counts (MIDI, or the microphone for single notes). */
import { Log } from '../core/log.js';
import { DAY, todayKey } from '../core/util.js';
import { dayRec, Store } from '../core/store.js';
import { Library } from '../music/library.js';

export const STAGE_TXT = { learn: 'Learning', tempo: 'Building tempo', done: 'At tempo' };

export const handWord = h => ({ rh: 'right hand', lh: 'left hand', ht: 'hands together' })[h] || '';
const Cap = s => s[0].toUpperCase() + s.slice(1);
export const addDays = (d, n) => todayKey(new Date(new Date(d + 'T12:00').getTime() + n * DAY));

// how many runs without progress before the approach changes, and the clean share that counts as stuck
const STALL_REPS = 10;
const STALL_CLEAN = 0.4;

/* ---------- what there is to learn in a piece ---------- */
// the pieces you are learning: [{pid}]
export const workingPieces = () => (Store.s.piece.working || []).filter(w => Library.get(w.pid));

export function startPiece(pid) {
  if (!Library.get(pid) || workingPieces().some(w => w.pid === pid)) return;
  Store.s.piece.working = [...workingPieces(), { pid }];
  Store.save();
}
export function stopPiece(pid) {
  Store.s.piece.working = workingPieces().filter(w => w.pid !== pid);
  Store.save();
}

// the sections of one piece (a repeat shares its first time's item), then the whole piece
export function pieceOrder(pid) {
  if (!Library.get(pid)) return [];
  return Library.sections(pid)
    .filter(s => s.n > 0)
    .map(s => `p:${pid}:${s.k}`)
    .filter(id => sectionOriginal(id) === id)
    .concat([`p:${pid}:full`]);
}

export function sectionOriginal(id) {
  const p = id.split(':');
  if (p[0] !== 'p' || p[2] === 'full') return id;
  const s = Library.sections(p[1])[+p[2]];
  return s && s.same >= 0 ? `p:${p[1]}:${s.same}` : id;
}

// a section or the whole piece: p:<piece>:<section number | full>
export function itemDef(id) {
  const p = id.split(':');
  if (p[0] !== 'p') return null;
  const pid = p[1];
  const P = Library.get(pid);
  if (!P) return null;
  const base = { id, pid, title: P.t, about: P.tip, level: P.lvl || 1 };
  if (p[2] === 'full')
    return {
      ...base,
      kind: 'full',
      sub: 'The whole piece',
      phases: [],
      start: Math.max(30, Math.round(P.bpm * 0.85)),
      target: P.bpm,
    };
  const k = +p[2];
  const sec = Library.sections(pid)[k];
  if (!sec || !sec.n) return null;
  const tgt = Library.tempoAt(pid, sec.a);
  const label = P.pickup
    ? sec.a === 0
      ? `bars 1–${sec.z - 1}`
      : `bars ${sec.a}–${sec.z - 1}`
    : `bars ${sec.a + 1}–${sec.z}`;
  const hands = ['rh', 'lh'].filter(h =>
    Library.range(pid, sec.a, sec.z).some(n => n.h === (h === 'rh' ? 0 : 1)),
  );
  return {
    ...base,
    kind: 'section',
    k,
    sec,
    sub: `Section ${k + 1} of ${Library.sections(pid).length} · ${label}`,
    phases: hands.length === 2 ? ['rh', 'lh', 'ht'] : hands.length === 1 ? [hands[0]] : ['ht'],
    start: Math.max(30, Math.round(tgt * 0.55)),
    target: tgt,
  };
}

/* ---------- state ---------- */
export const itemState = id => Store.s.items[id] || null;

export function ensureItem(id) {
  const def = itemDef(id);
  if (!def) return null;
  let it = Store.s.items[id];
  if (!it) {
    it = Store.s.items[id] = {
      stage: def.kind === 'full' ? 'tempo' : 'learn',
      phase: def.phases[0] || null,
      pc: 0,
      bpm: def.start,
      target: def.target,
      cl: 0,
      mess: 0,
      first: todayKey(),
      last: null,
      reps: 0,
      clean: 0,
      log: [],
      hintsOff: false,
      recent: [], // the last results: 'c' clean, 's' slips, 'm' messy
      since: 0, // runs since the item last moved forward
    };
    Log.ev('item started', { id, stage: it.stage });
  }
  if (def.target && it.target !== def.target) it.target = def.target; // targets can change with app updates
  // (stages from older versions: a cold check or a review is simply at tempo now)
  if (!['learn', 'tempo', 'done'].includes(it.stage)) it.stage = it.stage === 'check' ? 'done' : 'tempo';
  if (it.stage === 'tempo' && !(it.bpm > 0)) it.bpm = def.start;
  if (it.stage === 'learn' && def.phases.length && !def.phases.includes(it.phase)) it.phase = def.phases[0];
  for (const k of ['recent', 'log', 'tech']) if (it[k] != null && !Array.isArray(it[k])) it[k] = [];
  if (!it.recent) it.recent = [];
  if (!it.log) it.log = [];
  return it;
}

// bring saved items up to date with the current definitions (after loading, or an app update)
export function refreshItems() {
  Object.keys(Store.s.items).forEach(id => itemDef(id) && ensureItem(id));
}

/* ---------- plans: how the next rep should run ---------- */
export function planFor(id) {
  const def = itemDef(id);
  const it = ensureItem(id);
  if (!def || !it) return null;
  const base = { id, kind: def.kind, bpm: it.bpm, target: it.target, hints: false, hand: 'ht' };
  if (it.stage === 'learn') {
    const ph = it.phase || def.phases[0] || 'ht';
    return {
      ...base,
      mode: 'wait',
      hand: ph,
      hints: !it.hintsOff,
      label: `Learn the notes, ${handWord(ph)}. Take your time; the app waits for you.`,
    };
  }
  const hand = def.phases.length === 1 ? def.phases[0] : 'ht';
  if (it.stage === 'tempo') {
    if (it.solo)
      return {
        ...base,
        mode: 'tempo',
        hand: it.solo,
        label: `${Cap(handWord(it.solo))} alone at ♩ ${it.bpm}, then back to both hands.`,
      };
    return { ...base, mode: 'tempo', hand, label: `♩ ${it.bpm} on the way to ${it.target}.` };
  }
  return {
    ...base,
    mode: 'tempo',
    hand,
    bpm: it.target,
    label: `At tempo: ♩ ${it.target}. Play it as music.`,
  };
}

export function criterion(id) {
  const def = itemDef(id);
  const it = itemState(id);
  if (!def) return '';
  if (!it) return 'Not started';
  if (it.stage === 'learn') return `Learning ${handWord(it.phase)}: ${it.pc || 0} of 2 clean`;
  if (it.stage === 'tempo') return `♩ ${it.bpm} → ${it.target}`;
  return `At tempo, ♩ ${it.target}`;
}

/* ---------- recording ---------- */
function logDay(it, clean, bpm) {
  const t = todayKey();
  let L = it.log[it.log.length - 1];
  if (!L || L.d !== t) {
    L = { d: t, reps: 0, clean: 0, bpm: 0 };
    it.log.push(L);
    if (it.log.length > 30) it.log.shift();
  }
  L.reps++;
  if (clean) L.clean++;
  if (bpm) L.bpm = Math.max(L.bpm, bpm);
  const day = dayRec(t);
  day.reps = (day.reps || 0) + 1;
  if (clean) day.clean = (day.clean || 0) + 1;
}

function tempoUp(bpm, target) {
  const s = Math.max(3, Math.round((bpm * 0.05) / 2) * 2);
  return Math.min(target, bpm + s);
}
const twoOfThree = marks => marks.slice(-3).filter(x => x === 'c').length >= 2;
const FORWARD = new Set(['phase', 'stage', 'tempo', 'done']);

/* r (from the player): {mode, hand, clean, rating 'clean'|'slips'|'messy', acc, wrong, hes, hinted, pace,
   bpm, played, adopt, valid, weak, msg}
   returns {msg, tone, change}. change is null, a step forward ('phase' 'stage' 'tempo' 'done'), or a step
   back ('slower' 'stall') */
export function recordRep(id, r) {
  const def = itemDef(id);
  const it = ensureItem(id);
  if (!def || !it) return { msg: '', tone: '' };
  if (!r.valid)
    return {
      msg: r.clean
        ? 'Clean. (Practice only: connect your piano to count it.)'
        : 'Practice only: connect your piano to count this.',
      tone: r.clean ? 'ok' : '',
      change: null,
    };
  it.reps++;
  if (r.clean) it.clean++;
  it.last = todayKey();
  logDay(it, r.clean, r.mode === 'tempo' && r.clean ? r.played || r.bpm : 0);
  it.recent = (it.recent || []).concat(r.rating[0]).slice(-8);
  it.since = (it.since || 0) + 1;
  if (r.tech) it.tech = (it.tech || []).concat([r.tech]).slice(-6); // traces of technique, see music/technique.js
  let out =
    it.stage === 'learn'
      ? learnStep(def, it, r)
      : it.stage === 'tempo'
        ? tempoStep(id, def, it, r)
        : { msg: r.clean ? 'Clean at tempo.' : r.msg || 'Again.' };
  if (out.change === 'stage' || out.change === 'phase') it.recent = []; // a new kind of run starts fresh
  if (FORWARD.has(out.change)) it.since = 0;
  else {
    const stall = stallStep(id, def, it);
    if (stall) out = stall;
  }
  Store.save();
  return { tone: r.clean ? 'ok' : 'bad', ...out };
}

function learnStep(def, it, r) {
  const ph = it.phase || def.phases[0];
  if (r.clean) {
    it.pc = (it.pc || 0) + 1;
    it.hintsOff = true;
  } else {
    it.pc = 0;
    it.hintsOff = (r.wrong || 0) <= 1 && it.hintsOff;
  }
  if (it.pc < 2)
    return {
      msg: r.clean
        ? it.hintsOff
          ? 'Clean. Once more, without the key hints.'
          : 'Clean. Once more.'
        : r.msg || 'Again, slowly.',
    };
  const next = def.phases[def.phases.indexOf(ph) + 1];
  it.pc = 0;
  it.hintsOff = false;
  if (next && !it.reentry) {
    it.phase = next;
    return { msg: `Two clean. Now ${handWord(next)}.`, change: 'phase' };
  }
  // after a step back (reentry), one clean phase is enough to return to the metronome
  it.stage = 'tempo';
  it.phase = null;
  it.reentry = false;
  return { msg: `Notes learned. Now with the metronome at ♩ ${it.bpm}.`, change: 'stage' };
}

function tempoStep(id, def, it, r) {
  // right notes and steady, but steadily faster than the click: that is your tempo now
  if (r.adopt && r.played > it.bpm) {
    it.bpm = Math.min(it.target, r.played);
    it.recent = [];
    it.mess = 0;
    return {
      msg: `Right notes and steady at ♩ ${r.played}: that is your tempo now${it.bpm >= it.target ? ' (the target)' : ''}.`,
      change: 'tempo',
      tone: 'ok',
    };
  }
  if (r.rating === 'clean') {
    it.mess = 0;
    if ((r.bpm || 0) < it.bpm) return { msg: `Clean at ♩ ${r.bpm}.` };
    if (it.solo) {
      it.cl = (it.cl || 0) + 1;
      if (it.cl < 2) return { msg: 'Clean. Once more alone.' };
      const msg = `${Cap(handWord(it.solo))} is clean at ♩ ${it.bpm}. Both hands again.`;
      it.solo = null;
      it.cl = 0;
      return { msg, change: 'phase' };
    }
    if (!twoOfThree(it.recent))
      return {
        msg:
          it.bpm >= it.target
            ? 'Clean at the target tempo. Once more and it is yours.'
            : `Clean at ♩ ${it.bpm}. One more moves the tempo up.`,
      };
    it.recent = [];
    if (it.bpm >= it.target) {
      it.stage = 'done';
      Store.s.hist.push({ d: todayKey(), t: Date.now(), id, e: 'done' });
      Log.ev('milestone done', { id });
      return { msg: 'Two clean runs at the target tempo: this one is at tempo.', change: 'done', tone: 'ok' };
    }
    const nb = tempoUp(it.bpm, it.target);
    it.bpm = nb;
    return { msg: `Two clean runs. Tempo up to ♩ ${nb}.`, change: 'tempo' };
  }
  if (r.rating === 'slips') {
    it.mess = 0;
    return { msg: r.msg || 'Small slips. Same tempo, once more.' };
  }
  it.mess = (it.mess || 0) + 1;
  const floor = Math.max(24, Math.round(def.start * 0.75));
  const nb = Math.max(floor, Math.round(it.bpm * 0.9));
  const dropped = nb < it.bpm;
  it.bpm = nb;
  // three rough runs hands together: fix the weaker hand alone, then come back
  if (it.mess >= 3 && def.phases.length > 1 && r.weak && !it.solo) {
    it.solo = r.weak;
    it.mess = 0;
    it.cl = 0;
    return {
      msg: `Three rough runs. Let's fix the ${handWord(r.weak)} alone at ♩ ${it.bpm}.`,
      change: 'phase',
    };
  }
  return {
    msg:
      (r.msg ? r.msg + ' ' : '') +
      (dropped ? `Down to ♩ ${nb}: clean runs teach, messy ones teach mistakes.` : 'Slow and clean wins.'),
    change: dropped ? 'slower' : null,
  };
}

/* ---------- stuck: change the approach instead of repeating it ---------- */
function stallStep(id, def, it) {
  if (it.since < STALL_REPS) return null;
  const marks = it.recent.slice(-8);
  if (marks.filter(x => x === 'c').length / marks.length >= STALL_CLEAN) return null;
  it.since = 0;
  it.recent = [];
  it.stalls = (it.stalls || 0) + 1;
  Log.ev('stall', { id, stage: it.stage, bpm: it.bpm });
  if (it.stage === 'tempo' && def.phases.length) {
    // back to wait mode with the keys shown; the metronome returns after a clean run or two
    const weakest = it.solo || (def.phases.includes('ht') ? 'ht' : def.phases[0]);
    Object.assign(it, { stage: 'learn', phase: weakest, pc: 0, hintsOff: false, reentry: true, solo: null });
    return {
      msg: `This has not moved for a while, so let's change the approach: a few runs in wait mode with the keys shown (${handWord(weakest)}), then the metronome again. Speed comes once the notes are automatic.`,
      change: 'stall',
      tone: '',
    };
  }
  if (it.stage === 'tempo') {
    it.bpm = Math.max(30, Math.round(it.bpm * 0.85));
    return {
      msg: `Let's make it easier: ♩ ${it.bpm}. Tap "Hear it" first and listen once before you play.`,
      change: 'stall',
      tone: '',
    };
  }
  if (it.stage === 'learn' && def.phases.length > 1 && it.phase !== def.phases[0]) {
    const hand = def.phases[0];
    Object.assign(it, { phase: hand, pc: 0, hintsOff: false });
    return {
      msg: `Let's make it smaller: ${handWord(hand)} alone first, with the keys shown.`,
      change: 'stall',
      tone: '',
    };
  }
  return null;
}
