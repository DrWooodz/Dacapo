/* Moods: where you are with each scale, what a run counts for, and what to play next.
   A key of a mood (C♯ Phrygian) is
     met          once you have practiced it
     comfortable  after three clean runs with each hand (any help switched on)
     solid        after a check passed on two different days: both hands together, two octaves, no help,
                  every note right and even at your own pace. Checks only happen when you ask.
   A mood is yours once three of its keys are solid, one of them a black-key one. That is a suggestion,
   not a gate: every mood and key is open from the start.
   Practice is free: you choose the hand, the octaves and the help. Nothing moves on by itself. */
import { todayKey } from '../core/util.js';
import { Store } from '../core/store.js';
import {
  blackKey,
  CIRCLE,
  handShapes,
  MOOD_BY,
  MOOD_FAMILIES,
  moodName,
  moodRun,
  MOODS,
  PCS,
} from '../music/moods.js';
import { addDays } from './curriculum.js';

export const COMFORT_RUNS = 3;
export const CHECK_DAYS = 2;
const EVEN = 0.35; // a check's notes may spread this much around your own pace (spread of gaps / mean)

const M = () => Store.s.moods;
export const prefs = () => M().prefs;
const keyOf = (mood, pc) => `${mood}:${pc}`;
export const keyState = (mood, pc) => M().keys[keyOf(mood, pc)] || null;
function ensureKey(mood, pc) {
  const k = keyOf(mood, pc);
  if (!M().keys[k])
    M().keys[k] = { met: todayKey(), clean: { rh: 0, lh: 0, ht: 0 }, checks: [], last: todayKey() };
  return M().keys[k];
}

// 'new' | 'met' | 'comfortable' | 'solid'
export function keyStatus(mood, pc) {
  const k = keyState(mood, pc);
  if (!k) return 'new';
  if (new Set(k.checks).size >= CHECK_DAYS) return 'solid';
  if (k.clean.rh >= COMFORT_RUNS && k.clean.lh >= COMFORT_RUNS) return 'comfortable';
  return 'met';
}
export const STATUS_WORD = { new: 'not yet', met: 'met', comfortable: 'comfortable', solid: 'solid' };

// a mood is yours: three solid keys, one of them a black-key one
export function moodOwned(mood) {
  const solid = PCS.filter(pc => keyStatus(mood, pc) === 'solid');
  return solid.length >= 3 && solid.some(pc => blackKey(mood, pc));
}
export const moodCounts = mood => {
  const c = { new: 0, met: 0, comfortable: 0, solid: 0 };
  PCS.forEach(pc => c[keyStatus(mood, pc)]++);
  return c;
};

/* ---------- a drill for the player ----------
   id: m:<mood>:<pc>:<hand>:<octaves>[:check] */
export const runId = (mood, pc, hand, octs, check = false) =>
  `m:${mood}:${pc}:${hand}:${octs}${check ? ':check' : ''}`;
function parseRun(id) {
  const [, mood, pc, hand, octs, check] = id.split(':');
  return { mood, pc: +pc, hand, octs: +octs, check: check === 'check' };
}
const HAND_WORD = { rh: 'right hand', lh: 'left hand', ht: 'hands together' };

// the player's source for a Moods run: free practice, with the help you choose; checks are strict
export function moodSource({ onAbout = () => {} } = {}) {
  return {
    def(id) {
      const r = parseRun(id);
      if (!MOOD_BY[r.mood]) return null;
      return {
        kind: 'scale',
        title: r.check ? 'Check' : HAND_WORD[r.hand][0].toUpperCase() + HAND_WORD[r.hand].slice(1),
        sub: `${r.check ? 'hands together · ' : ''}${r.octs} octave${r.octs > 1 ? 's' : ''}`,
        phases: [r.hand],
        target: prefs().bpm,
        build: () => {
          const run = moodRun(r.mood, r.pc, r.hand, r.octs);
          return {
            ...run,
            npb: 2,
            even: true,
            beats: run.steps.length / 2,
            meter: [4, 4],
            unit: 1,
            clicks: 4,
          };
        },
      };
    },
    plan(id) {
      const r = parseRun(id);
      const p = prefs();
      return {
        mode: p.tempo && !r.check ? 'tempo' : 'wait',
        hand: r.hand,
        hints: r.check ? false : p.keys,
        fingers: r.check ? false : p.fingers,
        bpm: p.bpm,
        label: r.check ? 'Check: no help. Every note right, evenly, at your own pace.' : null,
      };
    },
    record: (id, rep) => recordRun(id, rep),
    state: () => null,
    stage: id => (parseRun(id).check ? { text: 'Check', cls: 'brass' } : { text: '', cls: '' }),
    criterion: id => criterionOf(parseRun(id)),
    about: () => onAbout(),
  };
}

function criterionOf({ mood, pc, hand, check }) {
  const k = keyState(mood, pc) || { clean: { rh: 0, lh: 0 }, checks: [] };
  const days = new Set(k.checks).size;
  if (check) return `Checks passed: ${days} of ${CHECK_DAYS} days`;
  const st = keyStatus(mood, pc);
  if (st === 'solid') return 'Solid';
  if (st === 'comfortable') return `Comfortable · checks: ${days} of ${CHECK_DAYS} days`;
  if (hand === 'ht') return `Together: ${k.clean.ht || 0} clean run${k.clean.ht === 1 ? '' : 's'}`;
  return `Clean runs, ${HAND_WORD[hand]}: ${Math.min(COMFORT_RUNS, k.clean[hand] || 0)} of ${COMFORT_RUNS}`;
}

// a run is done: count it, and (for a check) see whether it passes
function recordRun(id, rep) {
  const r = parseRun(id);
  const k = ensureKey(r.mood, r.pc);
  const before = keyStatus(r.mood, r.pc);
  k.last = todayKey();
  const sit = sitting(r.mood, r.pc);
  sit.runs[r.hand] = (sit.runs[r.hand] || 0) + 1;
  if (rep.clean && rep.valid !== false) {
    k.clean[r.hand] = (k.clean[r.hand] || 0) + 1;
    sit.clean = (sit.clean || 0) + 1;
  }
  let msg = '';
  let tone = rep.clean ? 'ok' : 'bad';
  if (r.check) {
    const even = rep.cv == null || rep.cv <= EVEN;
    const pass = rep.clean && even && rep.valid !== false;
    if (pass && !k.checks.includes(todayKey())) k.checks.push(todayKey());
    const days = new Set(k.checks).size;
    msg = pass
      ? days >= CHECK_DAYS
        ? 'Check passed. Solid.'
        : `Check passed. One more on another day makes it solid.`
      : !rep.valid
        ? 'Checks count only from your piano (MIDI or microphone).'
        : !rep.clean
          ? 'Not this time: a check needs every note right with no help.'
          : 'Every note right, but uneven: let the notes come at a steady pace.';
    tone = pass ? 'ok' : 'bad';
  }
  const after = keyStatus(r.mood, r.pc);
  if (after !== before && after === 'comfortable')
    msg = `${moodName(r.mood, r.pc)} is comfortable. Check it with both hands when you like.`;
  if (after !== before && after === 'solid' && moodOwned(r.mood))
    msg = `${moodName(r.mood, r.pc)} is solid, and ${MOOD_BY[r.mood].n} is yours.`;
  Store.save();
  return {
    msg: msg || (rep.clean ? 'Clean.' : rep.msg || 'Again.'),
    tone,
    change: after !== before ? 'stage' : null,
  };
}

/* ---------- sittings: what you did each time you sat down ---------- */
const MAX_SITTINGS = 300;
// the sitting for this mood and key today (one per key per day)
export function sitting(mood, pc) {
  const list = M().sittings;
  const d = todayKey();
  let s = list.find(x => x.d === d && x.mood === mood && x.pc === pc);
  if (!s) {
    s = { d, at: Date.now(), mood, pc, runs: {}, clean: 0 };
    list.push(s);
    if (list.length > MAX_SITTINGS) list.splice(0, list.length - MAX_SITTINGS);
  }
  s.at = Date.now();
  ensureKey(mood, pc);
  return s;
}
export const lastSitting = () =>
  M()
    .sittings.slice()
    .sort((a, b) => b.at - a.at)[0] || null;

// improvising in a sitting: how long, how many notes, how many in the scale, what the left hand did
export function recordImprovising(mood, pc, stats) {
  const s = sitting(mood, pc);
  const prev = s.imp || {
    ms: 0,
    notes: 0,
    inScale: 0,
    lh: { n: 0, chords: 0, broken: 0, rootFifth: 0 },
    pedalMs: 0,
  };
  s.imp = {
    ms: prev.ms + stats.ms,
    notes: prev.notes + stats.notes,
    inScale: prev.inScale + stats.inScale,
    pedalMs: prev.pedalMs + stats.pedalMs,
    lh: {
      n: prev.lh.n + stats.lh.n,
      chords: prev.lh.chords + stats.lh.chords,
      broken: prev.lh.broken + stats.lh.broken,
      rootFifth: prev.lh.rootFifth + stats.lh.rootFifth,
    },
    pattern: stats.pattern || prev.pattern,
  };
  Store.save();
}

/* ---------- what to play next ---------- */
const FAMILY_ORDER = MOOD_FAMILIES.map(f => f.id); // dark first: the moody ones
const moodsInOrder = () => FAMILY_ORDER.flatMap(f => MOODS.filter(m => m.fam === f));

// the next key of a mood, the way you browse: by hand shape (a key that shares the fingering of one you
// know) or by neighbor (one note different, around the circle)
function nextKey(mood, way) {
  const open = pc => keyStatus(mood, pc) === 'new' || keyStatus(mood, pc) === 'met';
  if (way === 'shape') {
    const known = PCS.filter(pc => !open(pc));
    const groups = handShapes(mood);
    const g =
      groups.find(x => x.pcs.some(pc => known.includes(pc)) && x.pcs.some(open)) ||
      groups.find(x => x.pcs.some(open));
    const pc = g && g.pcs.find(open);
    return pc == null
      ? null
      : {
          pc,
          why:
            known.length && g.pcs.some(p => known.includes(p))
              ? 'same hand shape as a key you know'
              : 'a new hand shape',
        };
  }
  const played = M()
    .sittings.filter(s => s.mood === mood)
    .sort((a, b) => b.at - a.at);
  // a mood starts from its plainest key (the fewest black keys: A for natural minor, C for major)
  const plain = plainestKey(mood);
  if (!played.length && open(plain)) return { pc: plain, why: 'its plainest key, nearly all white keys' };
  const from = played.length ? CIRCLE.indexOf(played[0].pc) : CIRCLE.indexOf(plain) - 1;
  for (let i = 1; i <= 12; i++) {
    const pc = CIRCLE[(from + i + 12) % 12];
    if (open(pc)) return { pc, why: 'one note different from the last key' };
  }
  return null;
}

// the key of a mood with the fewest black keys (ties: the first around the circle from C)
function plainestKey(mood) {
  const blacks = pc => MOOD_BY[mood].semis.filter(x => [1, 3, 6, 8, 10].includes((pc + x) % 12)).length;
  return CIRCLE.reduce((best, pc) => (blacks(pc) < blacks(best) ? pc : best), CIRCLE[0]);
}

// {mood, pc, why}: the suggested next sitting
export function suggestNext() {
  const last = lastSitting();
  const way = prefs().browse === 'shape' ? 'shape' : 'neighbor';
  if (last && keyStatus(last.mood, last.pc) === 'met' && last.d >= addDays(todayKey(), -21))
    return { mood: last.mood, pc: last.pc, why: 'Pick up where you left off.' };
  // stay with the mood you were in until it is yours, else the next one (dark moods first)
  const order = moodsInOrder().map(m => m.id);
  const start = prefs().mood || (last && last.mood) || order[0];
  const moods = [start, ...order.filter(m => m !== start)].filter(m => !moodOwned(m));
  for (const mood of moods) {
    const nk = nextKey(mood, way);
    if (nk) {
      const why =
        mood === start && last && last.mood === mood
          ? `More ${MOOD_BY[mood].n}: ${nk.why}.`
          : `${MOOD_BY[mood].feel[0].toUpperCase()}${MOOD_BY[mood].feel.slice(1)}: ${nk.why}.`;
      return { mood, pc: nk.pc, why };
    }
  }
  return { mood: order[0], pc: 0, why: 'Everything is solid. Pick any key to keep it warm.' };
}

/* insights from your playing, a few at most: {text} */
export function insights() {
  const out = [];
  const recent = M()
    .sittings.slice()
    .sort((a, b) => b.at - a.at);
  const withImp = recent.find(s => s.imp && s.imp.notes >= 30);
  if (withImp) {
    const { lh, notes, inScale, pedalMs, ms } = withImp.imp;
    if (lh.n < notes * 0.1)
      out.push({
        text: 'Your right hand did nearly all the playing. Give the left hand a pattern next time.',
      });
    else if (lh.rootFifth > lh.n * 0.7)
      out.push({
        text: 'Your left hand stayed on roots and fifths. Next time try the broken chord pattern.',
      });
    else if (lh.chords > lh.n * 0.6)
      out.push({
        text: 'Your left hand mostly played block chords. Try breaking them up: root, fifth, octave, fifth.',
      });
    if (pedalMs > ms * 0.9 && ms > 60000)
      out.push({
        text: 'The pedal was down nearly the whole time. Lift and press it again as each chord changes, so the chords stay clear.',
      });
    if (inScale < notes * 0.8)
      out.push({
        text: `About ${Math.round((1 - inScale / notes) * 100)}% of your notes were outside the scale. On purpose is fine; if not, keep the lit keys in view.`,
      });
  }
  const week = addDays(todayKey(), -5);
  for (const [k, v] of Object.entries(M().keys)) {
    const [mood, pc] = k.split(':');
    if (keyStatus(mood, +pc) === 'comfortable' && v.last <= week && out.length < 3) {
      out.push({
        text: `${moodName(mood, +pc)} has been comfortable for a while: check it when you like.`,
        mood,
        pc: +pc,
      });
      break;
    }
  }
  return out.slice(0, 3);
}

// the weeks of your practice: minutes per week (from playing) and solid keys over time, newest last
export function trajectory(weeks = 12) {
  const t = todayKey();
  const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = addDays(t, -7 * w);
    const days = Array.from({ length: 7 }, (_, i) => addDays(end, -i));
    const min = days.reduce((a, d) => a + ((Store.s.days[d] || {}).min || 0), 0);
    const solid = Object.values(M().keys).filter(k => {
      const ds = [...new Set(k.checks)].sort();
      return ds.length >= CHECK_DAYS && ds[CHECK_DAYS - 1] <= end;
    }).length;
    out.push({ end, min: Math.round(min), solid });
  }
  return out;
}
