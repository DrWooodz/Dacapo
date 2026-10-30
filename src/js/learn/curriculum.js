/* The curriculum's rules: when an item moves on, and when it counts as learned.
   Every item moves through stages:
     learn  - slowly, in wait mode (the app waits for the right notes), hands separately where it helps
     pace   - note reading and theory: the same, faster. A goal time per note (or per answer) tightens
              as you reach it; no metronome
     tempo  - with the metronome: two clean runs out of the last three raise the tempo about 5%; a run with
              wrong notes lowers it 10%. Uneven timing alone never lowers it
     check  - the goal, as the FIRST attempt of the day (cold), on two different days = integrated
     done   - integrated; it comes back for a cold review after 3, 7, 15, 30, 60 and then every 120 days
   When an item stops moving (many reps, few clean), the approach changes instead of repeating the same thing.
   Only playing on a real piano counts (MIDI, or the microphone for single notes). */
import { Log } from '../core/log.js';
import { DAY, median, todayKey } from '../core/util.js';
import { dayRec, Store } from '../core/store.js';
import { itemDef } from './areas.js';

export const STAGE_TXT = {
  learn: 'Learning',
  pace: 'Building speed',
  tempo: 'Building tempo',
  check: 'Checking',
  done: 'Integrated',
  create: 'Improvising',
};

export const handWord = h => ({ rh: 'right hand', lh: 'left hand', ht: 'hands together' })[h] || '';
const Cap = s => s[0].toUpperCase() + s.slice(1);
// "3 wrong notes", "1 long pause", or '' for none
const count = (n, word) => (n ? `${n} ${word}${n > 1 ? 's' : ''}` : '');
const secs = ms => `${(ms / 1000).toFixed(1)} s`;
export const addDays = (d, n) => todayKey(new Date(new Date(d + 'T12:00').getTime() + n * DAY));
export const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / DAY);

// how many runs without progress before the approach changes, and the clean share that counts as stuck
const STALL_REPS = 10;
const STALL_CLEAN = 0.4;
// a theory cold check is the first few questions of the day
const COLD_QUESTIONS = 5;
// theory answers without progress before the approach changes
const THEORY_STALL = 12;
// days between spaced reviews of an integrated item: each review that holds moves one step along
const REVIEW_DAYS = [3, 7, 15, 30, 60, 120];
const nextInterval = ivl => REVIEW_DAYS.find(d => d > (ivl || 0)) || REVIEW_DAYS[REVIEW_DAYS.length - 1];

/* ---------- item state ---------- */
export const itemState = id => Store.s.items[id] || null;

const firstStage = def =>
  def.kind === 'rhythm' || def.kind === 'full' ? 'tempo' : def.kind === 'improv' ? 'create' : 'learn';

export function ensureItem(id) {
  const def = itemDef(id);
  if (!def) return null;
  let it = Store.s.items[id];
  if (!it) {
    it = Store.s.items[id] = {
      stage: firstStage(def),
      phase: def.phases[0] || null,
      pc: 0,
      bpm: def.start,
      target: def.target,
      cl: 0,
      mess: 0,
      passes: [],
      fails: 0,
      ivl: 0,
      due: null,
      first: todayKey(),
      last: null,
      lastCold: null,
      reps: 0,
      clean: 0,
      mins: 0,
      log: [],
      hintsOff: false,
      recent: [], // the last results: 'c' clean, 's' slips, 'm' messy
      since: 0, // runs since the item last moved forward
    };
    Log.ev('item started', { id, stage: it.stage });
  }
  if (def.target && it.target !== def.target) it.target = def.target; // targets can change with app updates
  if (def.paced && it.stage === 'tempo') {
    // note reading used to be played with the metronome (before version 4); it now trains speed
    Object.assign(it, { stage: 'pace', pace: def.pace.start, recent: [], since: 0 });
    Log.ev('item moved to pace', { id });
  }
  normalize(id, def, it);
  return it;
}

// a saved item whose stage this kind of drill cannot have (old or damaged data) is put somewhere it can be
function normalize(id, def, it) {
  const building = def.kind === 'improv' ? 'create' : def.paced || def.kind === 'theory' ? 'pace' : 'tempo';
  const allowed = def.kind === 'improv' ? ['create', 'done'] : ['learn', building, 'check', 'done'];
  if (!allowed.includes(it.stage)) {
    const was = it.stage;
    it.stage = ['pace', 'tempo', 'create'].includes(was) ? building : firstStage(def);
    Log.warn('item stage repaired', { id, was, now: it.stage });
  }
  if (it.stage === 'pace' && !(it.pace > 0)) it.pace = def.paced ? def.pace.start : def.goal * 2;
  if (it.stage === 'tempo' && !(it.bpm > 0)) it.bpm = def.start;
  if (it.stage === 'learn' && def.phases.length && !def.phases.includes(it.phase)) it.phase = def.phases[0];
  for (const k of ['recent', 'passes', 'log', 'answers', 'paces', 'paceMarks', 'tech'])
    if (it[k] != null && !Array.isArray(it[k])) it[k] = [];
  if (!it.recent) it.recent = [];
  if (!it.passes) it.passes = [];
  if (!it.log) it.log = [];
}

// bring saved items up to date with the current definitions (after loading, or an app update)
export function refreshItems() {
  Object.keys(Store.s.items).forEach(id => itemDef(id) && ensureItem(id));
}

// set an item to a stage directly (the placement check uses this)
export function placeItem(id, stage, extra = {}) {
  const it = ensureItem(id);
  if (!it) return;
  Object.assign(it, { stage, phase: null, pc: 0, cl: 0, recent: [], since: 0 }, extra);
  if (stage === 'done') {
    it.ivl = 7;
    it.due = addDays(todayKey(), 7);
  }
}

/* ---------- plans: how the next rep should run ---------- */
export function planFor(id) {
  const def = itemDef(id);
  const it = ensureItem(id);
  if (!def || !it) return null;
  const t = todayKey();
  const due = it.stage === 'check' || (it.stage === 'done' && it.due && it.due <= t);
  const cold = due && it.lastCold !== t;
  const base = { id, kind: def.kind, bpm: it.bpm, target: it.target, hints: false, cold: false, hand: 'ht' };
  if (def.kind === 'improv') return { ...base, mode: 'improv', bpm: def.target };
  if (def.kind === 'theory') {
    return {
      ...base,
      mode: 'quiz',
      hints: it.stage === 'learn',
      cold,
      pace: it.stage === 'pace' ? it.pace : null,
      label: cold
        ? 'Cold check: the first five questions today, no hints.'
        : it.stage === 'learn'
          ? 'Take your time. The answer appears if you need it.'
          : it.stage === 'pace'
            ? `Aim for under ${secs(it.pace)} per answer.`
            : 'Keep it fresh.',
    };
  }
  if (def.kind === 'read' && def.paced) {
    if (it.stage === 'learn')
      return { ...base, mode: 'wait', label: 'Read and play each note. No hints: find it from the staff.' };
    const goal = it.stage === 'pace' ? it.pace : def.pace.target;
    return {
      ...base,
      mode: 'wait',
      paced: true,
      pace: goal,
      cold,
      label: cold
        ? `Cold check: one line at under ${secs(goal * 1.15)} per note, first try today.`
        : `Aim for under ${secs(goal)} per note. Read ahead; let your hands follow.`,
    };
  }
  if (def.kind === 'read' || def.kind === 'rhythm') {
    if (it.stage === 'learn')
      return { ...base, mode: 'wait', label: 'Read and play each note. No hints: find it from the staff.' };
    const bpm = it.stage === 'check' || it.stage === 'done' ? it.target : it.bpm;
    const verb = def.kind === 'rhythm' ? 'Tap the rhythm' : 'Read in time';
    return {
      ...base,
      mode: 'tempo',
      bpm,
      cold,
      label: cold
        ? `Cold check at ♩ ${bpm}: keep going, do not stop for mistakes.`
        : `${verb} at ♩ ${bpm}. Keep going; do not stop for mistakes.`,
    };
  }
  if (it.stage === 'learn') {
    const ph = it.phase || def.phases[0] || 'ht';
    if (ph === 'probe')
      return {
        ...base,
        mode: 'wait',
        label: 'First, try it hands together. If it is already in your hands, you skip ahead.',
      };
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
    cold,
    label: cold
      ? it.stage === 'done'
        ? 'Review: one cold run at the target tempo.'
        : `Cold check: first try today, ♩ ${it.target}, no hints.`
      : `Polish at ♩ ${it.target}.`,
  };
}

/* ---------- the criterion, in words ---------- */
export function criterion(id) {
  const def = itemDef(id);
  const it = itemState(id);
  if (!def) return '';
  if (!it) return 'Not started';
  if (def.kind === 'improv')
    return `${Math.round(it.mins || 0)} of ${def.minutes} minutes improvised${
      it.land != null ? `, ${it.land}% chord tones on strong beats` : ''
    }`;
  if (it.stage === 'learn') {
    if (def.kind === 'theory') return `Right answers: ${okCount(it, 8)} of the last 8 (7 needed)`;
    if (def.kind === 'read') return `Clean lines: ${it.pc || 0} of 3`;
    return it.phase === 'probe'
      ? 'First try hands together'
      : `Learning ${handWord(it.phase)}: ${it.pc || 0} of 2 clean`;
  }
  if (it.stage === 'pace') {
    const goal = def.kind === 'theory' ? def.goal : def.pace.target;
    return `Goal ${secs(it.pace)} per ${def.kind === 'theory' ? 'answer' : 'note'} → ${secs(goal)}`;
  }
  if (it.stage === 'tempo') return `♩ ${it.bpm} → ${it.target}`;
  if (it.stage === 'check') return `Cold check: ${(it.passes || []).length} of 2 days`;
  if (it.stage === 'done')
    return it.due
      ? `Integrated · review ${it.due <= todayKey() ? 'today' : 'in ' + daysBetween(todayKey(), it.due) + ' days'}`
      : 'Integrated';
  return '';
}
const okCount = (it, n) => (it.answers || []).slice(-n).filter(a => a.ok).length;

/* ---------- recording ---------- */
function milestone(id, e, v) {
  Store.s.hist.push({ d: todayKey(), t: Date.now(), id, e, v });
  Log.ev('milestone ' + e, { id, v });
}

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

function toCheck(id, it, t) {
  it.stage = 'check';
  it.passes = [];
  it.fails = 0;
  it.cl = 0;
  it.lastCold = t; // checks start next session: today it is warm
  milestone(id, 'stage', 'check');
}

/* r (from the player): {mode, hand, clean, rating 'clean'|'slips'|'messy', acc, wrong, hes, hinted, pace,
   bpm, played, adopt, valid, weak, msg}
   returns {msg, tone, change, reached}. change is null, a step forward ('phase' 'stage' 'tempo' 'pace' 'pass'
   'done'), or a step back ('slower' 'fail' 'stall') */
export function recordRep(id, r) {
  const def = itemDef(id);
  const it = ensureItem(id);
  const t = todayKey();
  if (!def || !it) return { msg: '', tone: '' };
  if (!r.valid)
    return {
      msg: r.clean
        ? 'Clean. (Practice only: connect your piano to count it.)'
        : 'Practice only: connect your piano to count this.',
      tone: r.clean ? 'ok' : '',
      change: null,
      practice: true,
    };
  const wasCold = it.lastCold !== t;
  it.reps++;
  if (r.clean) it.clean++;
  it.last = t;
  logDay(it, r.clean, r.mode === 'tempo' && r.clean ? r.played || r.bpm : 0);
  it.recent = (it.recent || []).concat(r.rating[0]).slice(-8);
  it.since = (it.since || 0) + 1;
  if (r.tech) it.tech = (it.tech || []).concat([r.tech]).slice(-6); // traces of technique, see music/technique.js
  const step =
    it.stage === 'learn'
      ? learnStep
      : it.stage === 'pace'
        ? paceStep
        : it.stage === 'tempo'
          ? tempoStep
          : it.stage === 'check'
            ? checkStep
            : reviewStep;
  let out = step(id, def, it, r, { t, wasCold });
  if (out.change === 'stage' || out.change === 'phase') it.recent = []; // a new kind of run starts fresh
  if (FORWARD.has(out.change)) it.since = 0;
  else {
    const stall = stallStep(id, def, it, r);
    if (stall) out = stall;
  }
  Store.save();
  return {
    tone: r.clean ? 'ok' : 'bad',
    ...out,
    reached:
      (out.change === 'stage' && it.stage === 'check') || out.change === 'done' || out.change === 'pass',
  };
}

const FORWARD = new Set(['phase', 'stage', 'tempo', 'pace', 'pass', 'done']);

function learnStep(id, def, it, r) {
  if (def.kind === 'read') {
    if (r.clean) {
      it.pc = (it.pc || 0) + 1;
      if (r.pace) it.paces = (it.paces || []).concat(r.pace).slice(-5);
    }
    if (it.pc < 3) {
      const slips = [count(r.wrong, 'wrong note'), count(r.hinted, 'hint')].filter(Boolean).join(', ');
      return {
        msg: r.clean
          ? `Clean line (${it.pc} of 3)${r.pace ? `, ${secs(r.pace)} per note` : ''}.`
          : `${slips ? Cap(slips) + '.' : r.msg || 'Not quite clean.'} Next line.`,
      };
    }
    it.pc = 0;
    milestone(id, 'stage', def.paced ? 'pace' : 'tempo');
    if (def.paced) {
      // start from the speed you already read at, within the unit's range
      const now = median(it.paces || []) || def.pace.start;
      it.pace = roundPace(Math.min(def.pace.start, Math.max(def.pace.target, now)));
      it.stage = 'pace';
      return {
        msg: `Three clean lines. Now for speed: aim for under ${secs(it.pace)} per note.`,
        change: 'stage',
      };
    }
    it.stage = 'tempo';
    return {
      msg: `Three clean lines. Now in time: ♩ ${it.bpm}, and keep going through mistakes.`,
      change: 'stage',
    };
  }
  const ph = it.phase || def.phases[0];
  if (ph === 'probe') {
    if (r.clean) {
      it.stage = 'tempo';
      it.phase = null;
      milestone(id, 'stage', 'tempo');
      return { msg: `Already in your hands. Straight to the metronome at ♩ ${it.bpm}.`, change: 'stage' };
    }
    it.phase = def.phases[1] || 'ht';
    it.pc = 0;
    it.hintsOff = false;
    return {
      msg: `Let's build it: ${handWord(it.phase)} first, with the keys shown.`,
      change: 'phase',
      tone: '',
    };
  }
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
  milestone(id, 'stage', 'tempo');
  return { msg: `Notes learned. Now with the metronome at ♩ ${it.bpm}.`, change: 'stage' };
}

const roundPace = ms => Math.round(ms / 50) * 50;

// note reading and theory: a time goal that tightens as you reach it
function paceStep(id, def, it, r, { t }) {
  const onPace = r.clean && r.pace && r.pace <= it.pace;
  it.paceMarks = (it.paceMarks || []).concat(onPace ? 'c' : 'x').slice(-3);
  const what = `${secs(r.pace || 0)} per note`;
  if (!onPace)
    return {
      msg: r.clean
        ? `Clean, ${what}. Goal: ${secs(it.pace)}. Look one note ahead.`
        : `${Cap([count(r.wrong, 'wrong note'), count(r.hinted, 'hint')].filter(Boolean).join(', ') || 'Not quite clean')}. Next line.`,
    };
  if (!twoOfThree(it.paceMarks)) return { msg: `On pace: ${what}. One more and the goal tightens.` };
  it.paceMarks = [];
  if (it.pace <= def.pace.target) {
    toCheck(id, it, t);
    return {
      msg: `Two lines on pace at the goal. From tomorrow: cold checks, one line on the first try of the day.`,
      change: 'stage',
    };
  }
  it.pace = roundPace(Math.max(def.pace.target, it.pace * 0.88));
  return { msg: `Two lines on pace. New goal: ${secs(it.pace)} per note.`, change: 'pace' };
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
            ? 'Clean at the target tempo. One more, and the cold checks start next session.'
            : `Clean at ♩ ${it.bpm}. One more moves the tempo up.`,
      };
    it.recent = [];
    if (it.bpm >= it.target) {
      toCheck(id, it, todayKey());
      return {
        msg: "Clean at the target tempo. From tomorrow: cold checks. Two clean first tries on different days and it's integrated.",
        change: 'stage',
      };
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

function coldPassed(def, it, r) {
  if (def.kind === 'read' && def.paced) return r.clean && r.pace && r.pace <= def.pace.target * 1.15;
  return r.clean && r.mode === 'tempo' && (r.bpm || 0) >= it.target;
}

function checkStep(id, def, it, r, { t, wasCold }) {
  if (!wasCold)
    return {
      msg: r.clean ? 'Clean (warm). The cold check next session is what counts.' : r.msg || 'Again.',
    };
  return coldCheck(id, def, it, coldPassed(def, it, r), t);
}

function reviewStep(id, def, it, r, { t, wasCold }) {
  if (!(wasCold && it.due && it.due <= t)) return { msg: r.clean ? 'Clean.' : r.msg || 'Again.' };
  return coldReview(id, def, it, coldPassed(def, it, r), t);
}

// the outcome of a cold check (first try of the day) for an item in the check stage
function coldCheck(id, def, it, passed, t) {
  it.lastCold = t;
  if (passed) {
    it.passes = (it.passes || []).filter(d => d !== t).concat([t]);
    it.fails = 0;
    if (it.passes.length < 2)
      return { msg: "Clean cold check. One more on another day and it's integrated.", change: 'pass' };
    it.stage = 'done';
    it.ivl = 3;
    it.due = addDays(t, 3);
    milestone(id, 'done');
    return {
      msg: 'Clean cold, on a second day: integrated. It will come back for a quick review in 3 days.',
      change: 'done',
      tone: 'ok',
    };
  }
  it.passes = [];
  it.fails = (it.fails || 0) + 1;
  if (it.fails < 3)
    return {
      msg: 'Not clean cold yet. That is normal: practice it warm now; the check comes back next session.',
      change: 'fail',
    };
  it.fails = 0;
  rebuild(it, def);
  milestone(id, 'stage', it.stage);
  return {
    msg: "Three cold checks in a row didn't hold. Back a step: it needs more consolidation.",
    change: 'fail',
  };
}

// the outcome of a spaced review of an integrated item
function coldReview(id, def, it, passed, t) {
  it.lastCold = t;
  if (passed) {
    it.ivl = nextInterval(it.ivl);
    it.due = addDays(t, it.ivl);
    milestone(id, 'review', 'ok');
    return { msg: `Still clean cold. Next review in ${it.ivl} days.`, change: 'pass' };
  }
  rebuild(it, def);
  it.ivl = 0;
  it.due = null;
  milestone(id, 'review', 'fail');
  return {
    msg: 'It slipped since the last review. Rebuilding; this usually comes back quickly.',
    change: 'fail',
  };
}

// back to building, a little below the goal
function rebuild(it, def) {
  if (def.paced || def.kind === 'theory') {
    it.stage = 'pace';
    it.pace = roundPace((def.paced ? def.pace.target : def.goal) * 1.25);
  } else {
    it.stage = 'tempo';
    it.bpm = Math.max(def.start, Math.round(it.target * 0.9));
  }
  it.recent = [];
}

/* ---------- stuck: change the approach instead of repeating it ---------- */
function stallStep(id, def, it) {
  if (it.since < STALL_REPS) return null;
  const marks = it.recent.slice(-8);
  if (marks.filter(x => x === 'c').length / marks.length >= STALL_CLEAN) return null;
  it.since = 0;
  it.recent = [];
  it.stalls = (it.stalls || 0) + 1;
  Log.ev('stall', { id, stage: it.stage, bpm: it.bpm, pace: it.pace });
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
  if (it.stage === 'tempo' && def.kind === 'read') {
    Object.assign(it, { stage: 'learn', pc: 0 });
    return {
      msg: 'Reading in time is not clicking yet, so back to reading at your own speed for three clean lines. Then the metronome again.',
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
  if (it.stage === 'pace') {
    const start = def.paced ? def.pace.start : def.goal * 2;
    it.pace = roundPace(Math.min(start * 1.2, it.pace * 1.15));
    return {
      msg: `Speed is not moving today, which is normal: it often jumps after a night's sleep. The goal is a little easier now: ${secs(it.pace)}.`,
      change: 'stall',
      tone: '',
    };
  }
  if (it.stage === 'learn' && def.phases.length > 1 && it.phase !== def.phases[1]) {
    const hand = def.phases.includes('rh') ? 'rh' : def.phases[0];
    Object.assign(it, { phase: hand, pc: 0, hintsOff: false });
    return {
      msg: `Let's make it smaller: ${handWord(hand)} alone first, with the keys shown.`,
      change: 'stall',
      tone: '',
    };
  }
  return null;
}

/* ---------- theory answers ---------- */
// a: {ok, ms, valid}
export function recordAnswer(id, a) {
  const def = itemDef(id);
  const it = ensureItem(id);
  const t = todayKey();
  if (!def || !it) return { msg: '' };
  if (!a.valid)
    return { msg: a.ok ? 'Right. (Practice only: connect your piano to count it.)' : '', practice: true };
  it.reps++;
  if (a.ok) it.clean++;
  it.last = t;
  logDay(it, a.ok, 0);
  it.answers = (it.answers || []).concat({ ok: a.ok, ms: a.ms }).slice(-12);
  it.since = (it.since || 0) + 1;
  if (it.guided > 0) it.guided--;
  let out = { msg: '' };
  const last = n => it.answers.slice(-n);
  const okMs = n =>
    median(
      last(n)
        .filter(x => x.ok)
        .map(x => x.ms),
    );
  if (it.stage === 'learn') {
    if (last(8).length >= 6 && okCount(it, 8) >= 7) {
      it.stage = 'pace';
      it.pace = roundPace(Math.min(def.goal * 2, Math.max(def.goal, okMs(8) || def.goal * 2)));
      it.answers = [];
      it.since = 0;
      milestone(id, 'stage', 'pace');
      out = { msg: `You know this. Now for speed: under ${secs(it.pace)} per answer.`, change: 'stage' };
    } else if (it.since >= THEORY_STALL && okCount(it, 8) < 4) {
      // not clicking: show how it works again, with the answer appearing early for a few questions
      it.since = 0;
      it.stalls = (it.stalls || 0) + 1;
      it.guided = 4;
      Log.ev('stall', { id, stage: 'learn' });
      out = {
        msg: "Let's look at how it works again. For the next few questions the answer appears sooner: watch it, then play it.",
        change: 'stall',
      };
    }
  } else if (it.stage === 'pace') {
    if (last(10).length >= 8 && okCount(it, 10) >= 9 && okMs(6) <= it.pace) {
      it.answers = [];
      it.since = 0;
      if (it.pace <= def.goal) {
        toCheck(id, it, t);
        out = { msg: 'Quick and sure. From tomorrow: a cold check of five questions.', change: 'stage' };
      } else {
        it.pace = roundPace(Math.max(def.goal, it.pace * 0.85));
        out = { msg: `Quicker now. New goal: ${secs(it.pace)} per answer.`, change: 'pace' };
      }
    } else if (it.since >= THEORY_STALL * 2) {
      it.since = 0;
      it.stalls = (it.stalls || 0) + 1;
      it.pace = roundPace(Math.min(def.goal * 2, it.pace * 1.15));
      Log.ev('stall', { id, stage: 'pace' });
      out = {
        msg: `Speed often jumps after a night's sleep. The goal is a little easier for now: ${secs(it.pace)}.`,
        change: 'stall',
      };
    }
  } else if (it.lastCold !== t && (it.stage === 'check' || (it.stage === 'done' && it.due && it.due <= t))) {
    // the cold check: the first five answers of the day, four of them right
    if (!it.coldSet || it.coldSet.d !== t) it.coldSet = { d: t, n: 0, ok: 0 };
    it.coldSet.n++;
    if (a.ok) it.coldSet.ok++;
    if (it.coldSet.n >= COLD_QUESTIONS) {
      const passed = it.coldSet.ok >= COLD_QUESTIONS - 1;
      out = (it.stage === 'check' ? coldCheck : coldReview)(id, def, it, passed, t);
    }
  }
  Store.save();
  return {
    ...out,
    reached:
      (out.change === 'stage' && it.stage === 'check') || out.change === 'done' || out.change === 'pass',
  };
}

/* ---------- improvisation minutes ---------- */
export function recordImprov(id, ms, land, bars) {
  const def = itemDef(id);
  const it = ensureItem(id);
  const t = todayKey();
  if (!it || !def) return null;
  it.mins = Math.round(((it.mins || 0) + ms / 60000) * 10) / 10;
  it.last = t;
  if (land != null && bars >= 4) {
    it.land = Math.round(land);
    it.days = Array.from(new Set([...(it.days || []), t])).slice(-10);
  }
  if (it.stage !== 'done' && it.mins >= def.minutes && (it.days || []).length >= 2 && (it.land || 0) >= 55) {
    it.stage = 'done';
    milestone(id, 'done');
    Store.save();
    return 'done';
  }
  Store.save();
  return null;
}
