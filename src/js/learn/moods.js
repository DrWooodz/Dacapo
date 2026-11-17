/* Practice: a mood's scale, chords and arpeggios in one key, on your terms. You choose the hand, the
   octaves and the help; nothing moves on by itself, and a note counts in any octave unless you ask for the
   exact one. A key is known once you pass a check: both hands together, two octaves, no help, every note
   right and even at your own pace. Checks happen only when you ask. */
import { todayKey } from '../core/util.js';
import { Store } from '../core/store.js';
import {
  arpeggioRun,
  circleRun,
  inversionRun,
  MOOD_BY,
  moodName,
  moodRun,
  progressionRun,
} from '../music/moods.js';
import { LH_BY, lhPatternRun } from '../music/moodtools.js';

const EVEN = 0.35; // a check's notes may spread this much around your own pace (spread of gaps / mean)

const M = () => Store.s.moods;
export const prefs = () => M().prefs;
const keyOf = (mood, pc) => `${mood}:${pc}`;
const keyState = (mood, pc) => M().keys[keyOf(mood, pc)] || null;
function ensureKey(mood, pc) {
  const k = keyOf(mood, pc);
  if (!M().keys[k]) M().keys[k] = { checks: [], extra: {}, last: todayKey() };
  return M().keys[k];
}
export const isKnown = (mood, pc) => ((keyState(mood, pc) || {}).checks || []).length > 0;

// what to learn first: major and minor (natural and harmonic) in every key; everything else is optional
export const CORE = ['major', 'natural', 'harmonic'];

/* ---------- drills for the player ----------
   id: m:<mood>:<pc>:<hand>:<octaves>[:<what>]. what: (the scale) | check | arp<semis>.<type> |
   inv<semis>.<type> (inversions) | prog<n> | lh<pattern>.<n> (a left-hand pattern over progression n) |
   circle (major home chords around the circle of fifths) */
export const runId = (mood, pc, hand, octs, what = '') =>
  `m:${mood}:${pc}:${hand}:${octs}${what ? ':' + what : ''}`;
function parseRun(id) {
  const [, mood, pc, hand, octs, what = ''] = id.split(':');
  const chord = re => {
    const x = re.exec(what);
    return x ? [+x[1], x[2]] : null;
  };
  const lh = /^lh(\w+)\.(\d+)$/.exec(what);
  const prog = /^prog(\d+)$/.exec(what);
  return {
    mood,
    pc: +pc,
    hand,
    octs: +octs,
    what,
    check: what === 'check',
    circle: what === 'circle',
    arp: chord(/^arp(\d+)\.(\w+)$/),
    inv: chord(/^inv(\d+)\.(\w+)$/),
    prog: prog ? +prog[1] : null,
    lh: lh ? { id: lh[1], prog: +lh[2] } : null,
  };
}
const HAND_WORD = { rh: 'right hand', lh: 'left hand', ht: 'hands together' };
const cap = s => s[0].toUpperCase() + s.slice(1);
const octWord = n => `${n} octave${n > 1 ? 's' : ''}`;

// what a drill plays, and how the player should treat it (kind: its cues and finger numbers; npb: notes
// per beat with the metronome; even: the notes come evenly)
function drillOf(r) {
  if (r.circle)
    return {
      title: 'Around the circle of fifths',
      sub: r.hand === 'ht' ? 'right hand chords, left hand roots' : HAND_WORD[r.hand],
      run: circleRun(r.hand),
      kind: 'pattern',
      npb: 0.5,
    };
  if (r.arp) {
    const run = arpeggioRun(r.mood, r.pc, r.arp, r.hand, r.octs);
    return {
      title: `${run.info.name} arpeggio`,
      sub: `${HAND_WORD[r.hand]} · ${octWord(r.octs)}`,
      run,
      kind: 'arp',
    };
  }
  if (r.inv) {
    const run = inversionRun(r.mood, r.pc, r.inv, r.hand);
    return { title: `${run.info.name}: inversions`, sub: HAND_WORD[r.hand], run, kind: 'pattern', npb: 0.5 };
  }
  if (r.lh) {
    const run = lhPatternRun(r.mood, r.pc, r.lh.id, r.lh.prog);
    return {
      title: LH_BY[r.lh.id].n,
      sub: run.steps
        .map(s => s.chord)
        .filter(Boolean)
        .join(' – '),
      run,
      kind: 'pattern',
      npb: 1,
      even: false,
    };
  }
  if (r.prog != null) {
    const run = progressionRun(r.mood, r.pc, r.prog, r.hand);
    return {
      title: run.steps.map(s => s.chord).join(' – '),
      sub: r.hand === 'ht' ? 'right hand chords, left hand roots' : HAND_WORD[r.hand],
      run,
      kind: 'pattern',
      npb: 0.5,
    };
  }
  return {
    title: r.check ? 'Check' : cap(HAND_WORD[r.hand]),
    sub: `${r.check ? 'hands together · ' : ''}${octWord(r.octs)}`,
    run: moodRun(r.mood, r.pc, r.hand, r.octs),
    kind: 'scale',
  };
}

// the player's source for a Moods drill: free practice, with the help you choose; checks are strict
export function moodSource() {
  return {
    def(id) {
      const r = parseRun(id);
      if (!MOOD_BY[r.mood]) return null;
      const D = drillOf(r);
      const npb = D.npb || 2;
      const beats = D.run.steps.length ? D.run.steps[D.run.steps.length - 1].beat + 1 / npb : 0;
      return {
        kind: D.kind,
        title: D.title,
        sub: D.sub,
        phases: [r.hand],
        target: prefs().bpm,
        build: () => ({
          ...D.run,
          npb,
          even: D.even !== false,
          beats,
          meter: [4, 4],
          unit: 1,
          clicks: 4,
        }),
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
        anyOctave: !r.check && !p.exactOctave,
        bpm: p.bpm,
        label: r.check ? 'Check: no help. Every note right, evenly, at your own pace.' : null,
      };
    },
    record: (id, rep) => recordRun(id, rep),
    // traces of technique from a key's runs (see music/technique.js): advice when a habit shows up
    state: id => {
      const r = parseRun(id);
      return { tech: (keyState(r.mood, r.pc) || {}).tech || [] };
    },
    stage: id => (parseRun(id).check ? { text: 'Check', cls: 'brass' } : { text: '', cls: '' }),
    criterion: id => criterionOf(parseRun(id)),
  };
}

function criterionOf(r) {
  const k = keyState(r.mood, r.pc) || { checks: [], extra: {} };
  if (r.check || !r.what) return isKnown(r.mood, r.pc) ? 'Known' : 'A check makes it known';
  const n = (k.extra || {})[`${r.what}:${r.hand}`] || 0;
  return n ? `Played clean ${n} time${n > 1 ? 's' : ''}` : 'Not played clean yet';
}

// a run is done: count it, and (for a check) see whether it passes
function recordRun(id, rep) {
  const r = parseRun(id);
  const k = ensureKey(r.mood, r.pc);
  k.last = todayKey();
  const counted = rep.clean && rep.valid !== false;
  if (rep.tech && rep.valid !== false) k.tech = (k.tech || []).concat([rep.tech]).slice(-6);
  if (r.what && !r.check) {
    if (counted) {
      k.extra = k.extra || {};
      const x = `${r.what}:${r.hand}`;
      k.extra[x] = (k.extra[x] || 0) + 1;
    }
    Store.save();
    return { msg: rep.clean ? 'Clean.' : rep.msg || 'Again.', tone: rep.clean ? 'ok' : 'bad', change: null };
  }
  if (!r.check) {
    Store.save();
    return { msg: rep.clean ? 'Clean.' : rep.msg || 'Again.', tone: rep.clean ? 'ok' : 'bad', change: null };
  }
  const was = isKnown(r.mood, r.pc);
  const even = rep.cv == null || rep.cv <= EVEN;
  const pass = counted && even;
  if (pass && !k.checks.includes(todayKey())) k.checks.push(todayKey());
  Store.save();
  return {
    msg: pass
      ? was
        ? 'Check passed. Still yours.'
        : `Check passed: ${moodName(r.mood, r.pc)} is known.`
      : rep.valid === false
        ? 'Checks count only from your piano (MIDI or microphone).'
        : !rep.clean
          ? 'Not this time: a check needs every note right with no help.'
          : 'Every note right, but uneven: let the notes come at a steady pace.',
    tone: pass ? 'ok' : 'bad',
    change: pass && !was ? 'stage' : null,
  };
}
