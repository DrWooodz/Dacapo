/* What a drill is made of: the notes to play (steps), the meter, the tempo unit and the count-in. Moods
   drills bring their own notes; a piece's section is read from the library. */
import { Library } from '../music/library.js';

export function buildDrill(def, plan) {
  if (def.build) return def.build(plan); // a drill that brings its own notes (Moods)
  const k = def.kind;
  const hand = plan.hand || 'ht';
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
