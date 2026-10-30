/* What a drill is made of: the notes to play (steps), the meter, the tempo unit and the count-in,
   built from an item of the curriculum and the plan for the next rep. */
import { pick } from '../core/util.js';
import {
  arpSteps,
  PAL_BY_ID,
  patternSteps,
  READ_UNITS,
  readingLine,
  realExcerpt,
  RHY_UNITS,
  rhythmBar,
  rhythmSteps,
  scaleSteps,
} from '../music/drills.js';
import { Library } from '../music/library.js';

export function buildDrill(def, plan) {
  const k = def.kind;
  const hand = plan.hand || 'ht';
  if (k === 'scale') {
    const r = scaleSteps(def.type, def.key, hand, 2, 2);
    return { ...r, npb: 2, even: true, beats: r.steps.length / 2, meter: [4, 4], unit: 1, clicks: 4 };
  }
  if (k === 'arp') {
    const r = arpSteps(def.type === 'major' ? 'major' : 'minor', def.key, hand, 2);
    return { ...r, npb: 2, even: true, beats: r.steps.length / 2, meter: [4, 4], unit: 1, clicks: 4 };
  }
  if (k === 'read') {
    const real = READ_UNITS[def.unit] && READ_UNITS[def.unit].real;
    if (real) {
      const r = realExcerpt(real);
      if (r) return { ...r, fresh: true };
    }
    // no excerpt found (rare): a generated line of the same kind instead
    const r = readingLine(real ? (real === 'ht' ? 'r12' : 'r5') : def.unit);
    return {
      ...r,
      npb: 1,
      even: true,
      beats: r.steps.length,
      meter: [4, 4],
      unit: 1,
      clicks: 4,
      fresh: true,
      barEvery: 4,
    };
  }
  if (k === 'rhythm') {
    const U = RHY_UNITS[def.unit];
    const meter = pick(U.meters);
    const bars = [rhythmBar(U.level, meter), rhythmBar(U.level, meter)];
    const events = bars.flat();
    const steps = rhythmSteps(events);
    return {
      kind: 'rhythm',
      events,
      bars,
      steps,
      beats: meter * 2,
      meter: [meter, 4],
      unit: 1,
      clicks: meter,
      fresh: true,
      any: true,
    };
  }
  if (k === 'pattern') {
    const r = patternSteps(PAL_BY_ID[def.pal]);
    const P = PAL_BY_ID[def.pal];
    return { ...r, even: true, beats: r.beats, meter: [P.meter, 4], unit: 1, clicks: P.meter, spacing: 40 };
  }
  if (k === 'section' || k === 'full') {
    const pid = def.pid;
    let a = k === 'full' ? 0 : def.sec.a;
    const z = k === 'full' ? Library.get(pid).nb : def.sec.z;
    // with the metronome, hands together: start a bar early to practice the join
    if (k === 'section' && a > 0 && plan.mode === 'tempo' && hand === 'ht') a -= 1;
    const r = Library.steps(pid, a, z, hand);
    const m = Library.meter(pid, a);
    return {
      ...r,
      piece: true,
      a,
      z,
      beats: r.total,
      meter: [m.n, m.d],
      unit: m.unit,
      clicks: m.clicks > 8 ? m.clicks / 2 : m.clicks,
      lead: a < (def.sec ? def.sec.a : 0) ? Library.bars(pid)[def.sec.a] - Library.bars(pid)[a] : 0,
    };
  }
  return null;
}
