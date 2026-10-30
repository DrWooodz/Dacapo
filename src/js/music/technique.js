/* What a scale or arpeggio run says about technique, from MIDI timing and loudness alone.
   The app cannot see your hands, but some habits leave clear traces:
     hands not together  one hand consistently later than the other on the same beat
     late crossings      the note after a thumb-under (or a finger crossing over the thumb) comes late
     accented thumb      thumb notes louder than the others (the thumb drops instead of playing)
   One run proves little, so advice appears only when a trace shows up in most of the last few runs. */
import { meanOf, median } from '../core/util.js';

const CROSSINGS = new Set(['3>1', '4>1', '1>3', '1>4']);
const LIMITS = { lag: 30, cross: 25, accent: 1.18 }; // ms, ms, loudness ratio

// a straight line through (beat, time) points; returns each point's distance from it in ms
function residuals(points) {
  const xs = points.map(p => p.beat);
  const ys = points.map(p => p.t);
  const mx = meanOf(xs);
  const my = meanOf(ys);
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i] - my);
    den += (x - mx) ** 2;
  });
  const b = den ? num / den : 0;
  return points.map(p => p.t - (my + b * (p.beat - mx)));
}

// one run: {lag:{hand, ms}, cross:{hand, ms}, accent:{hand, ratio}} for whatever stands out (or null)
export function techniqueReport(an, drill) {
  if (!drill || !drill.even || drill.steps.length < 8 || !an) return null;
  const hands = { rh: [], lh: [] };
  for (const r of an.res) {
    if (!r.ok || !r.notes) continue;
    const s = drill.steps[r.i];
    s.notes.forEach((x, j) => {
      const hit = r.notes.find(n => n.m === s.midis[j]);
      if (hit && hands[x.fcls])
        hands[x.fcls].push({ i: r.i, beat: s.beat, t: hit.t, vel: hit.vel, f: +x.f || 0 });
    });
  }
  const out = {};
  // hands together: compare the two hands on the same steps
  if (hands.rh.length >= 6 && hands.lh.length >= 6) {
    const lh = new Map(hands.lh.map(p => [p.i, p.t]));
    const lags = hands.rh.filter(p => lh.has(p.i)).map(p => lh.get(p.i) - p.t);
    const m = median(lags);
    if (lags.length >= 6 && Math.abs(m) >= LIMITS.lag)
      out.lag = { hand: m > 0 ? 'lh' : 'rh', ms: Math.round(Math.abs(m)) };
  }
  for (const hand of ['rh', 'lh']) {
    const pts = hands[hand];
    if (pts.length < 8 || pts.some(p => !p.f)) continue;
    const res = residuals(pts);
    const cross = [];
    const other = [];
    pts.forEach((p, k) => (k && CROSSINGS.has(`${pts[k - 1].f}>${p.f}`) ? cross : other).push(res[k]));
    if (cross.length >= 2 && other.length >= 4) {
      const late = meanOf(cross) - meanOf(other);
      if (late >= LIMITS.cross && (!out.cross || late > out.cross.ms))
        out.cross = { hand, ms: Math.round(late) };
    }
    const thumb = pts.filter(p => p.f === 1).map(p => p.vel);
    const rest = pts.filter(p => p.f !== 1).map(p => p.vel);
    if (thumb.length >= 3 && rest.length >= 4 && meanOf(rest) > 0) {
      const ratio = meanOf(thumb) / meanOf(rest);
      if (ratio >= LIMITS.accent && (!out.accent || ratio > out.accent.ratio))
        out.accent = { hand, ratio: Math.round(ratio * 100) / 100 };
    }
  }
  return out;
}

const HAND = { rh: 'right hand', lh: 'left hand' };

// advice from the last few runs: {lesson, text} for the most persistent trace, or null
export function techniqueAdvice(history) {
  const recent = (history || []).slice(-4);
  if (recent.length < 3) return null;
  const seen = kind => recent.filter(r => r && r[kind]).length >= 3;
  const last = kind => recent.filter(r => r && r[kind]).pop()[kind];
  if (seen('lag')) {
    const { hand, ms } = last('lag');
    return {
      lesson: 'together',
      text: `The ${HAND[hand]} is about ${ms} ms behind the other. Aim both thumbs at the same moment; play slower until the hands land as one.`,
    };
  }
  if (seen('cross')) {
    const { hand, ms } = last('cross');
    return {
      lesson: 'thumb',
      text: `In the ${HAND[hand]}, the notes where the thumb passes under (or a finger crosses over) come about ${ms} ms late. Move the thumb under early, while the 2nd and 3rd fingers play, so it is already waiting over its key.`,
    };
  }
  if (seen('accent')) {
    const { hand } = last('accent');
    return {
      lesson: 'thumb',
      text: `Thumb notes in the ${HAND[hand]} are louder than the rest. Let the thumb play from close to the key with the same small motion as the fingers, not a drop.`,
    };
  }
  return null;
}
