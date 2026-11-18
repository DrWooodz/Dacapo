/* After a sitting: what you played, read back plainly, and one thing to try next time. Pure: it reads the
   tally Play's companion kept (learn/moodplay.js) and writes a journal entry. Nothing is scored.

   tally: {ms, notes, lh, pedalMs, lo, hi, chords: {name: {n, root, type}}, ms, moods: {'mood:pc': {ms,
   notes, outside, resolved, color}}}; guess: guessMood() of the sitting's notes, for when no mood was
   chosen. */
import { CHORD_TONES, chordInfo, MOOD_BY, moodChords, moodName, moodNeighbors } from '../music/moods.js';
import { colorNote, pc12 } from '../music/moodtools.js';

const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

export function readBack(tally, { guess = null, day = '', at = 0, id = '' } = {}) {
  // the mood: the one you were in longest, else what it sounded like
  const longest = Object.entries(tally.moods || {}).sort((a, b) => b[1].ms - a[1].ms)[0];
  const chosen = longest && longest[1].ms >= tally.ms * 0.3 ? longest : null;
  const [mood, pc] = chosen
    ? [chosen[0].split(':')[0], +chosen[0].split(':')[1]]
    : guess
      ? [guess.mood, guess.pc]
      : [null, 0];
  const M = mood && MOOD_BY[mood] ? MOOD_BY[mood] : null;
  const tonic = M ? pc12(pc) : 0;
  const tones = M ? new Set(M.semis.map(s => pc12(tonic + s))) : null;
  // the chords, most played first, with their numerals when they belong to the mood (or near it)
  const chords = Object.entries(tally.chords || {})
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 8)
    .map(([name, c]) => {
      const fits =
        tones && CHORD_TONES[c.type] && CHORD_TONES[c.type].every(x => tones.has(pc12(c.root + x)));
      return {
        name,
        n: c.n,
        num: M && CHORD_TONES[c.type] ? chordInfo(mood, pc, [pc12(c.root - tonic), c.type]).num : '',
        out: M ? !fits : false,
      };
    });
  const m = chosen ? chosen[1] : null;
  const color = M ? colorNote(mood, pc) : null;
  const sig = M ? moodChords(mood, pc).find(c => c.signature) : null;
  const usedRoots = new Set(Object.values(tally.chords || {}).map(c => c.root));
  const out = {
    id,
    day,
    at,
    min: Math.max(1, Math.round(tally.ms / 60000)),
    notes: tally.notes,
    mood,
    pc,
    chosen: !!chosen,
    sure: chosen ? 1 : guess ? guess.sure : 0,
    alt: !chosen && guess ? guess.alt : null,
    chords,
    outside: m ? m.outside : null,
    resolved: m ? m.resolved : null,
    color: m && color ? { name: color.name, n: m.color } : null,
    lh: pct(tally.lh, tally.notes),
    pedal: pct(tally.pedalMs, tally.ms),
    range: tally.notes ? [tally.lo, tally.hi] : null,
  };
  out.tip = suggestion(out, { M, sig, color, usedRoots, tonic });
  return out;
}

// one thing to try next time: the most useful of these, in order
function suggestion(r, { M, sig, color, usedRoots, tonic }) {
  if (r.outside >= 4 && r.resolved < r.outside / 2)
    return {
      text: `${r.outside - r.resolved} of your ${r.outside} notes outside the scale did not resolve. Next time, step from an outside note to its neighbor in the scale, a half step away: that turns a wrong-sounding note into tension and release.`,
    };
  if (r.lh < 10 && r.notes > 40)
    return {
      text: 'Your left hand mostly rested. Try root and fifth under each chord (Try something → left hand), even just once a bar.',
    };
  if (M && sig && r.chosen && !usedRoots.has(pc12(tonic + sig.semis)))
    return {
      text: `You did not play ${sig.name} (${sig.num}), the chord that gives ${M.n.toLowerCase()} its sound. Try it next to the home chord.`,
    };
  if (M && color && r.color && r.color.n < 3)
    return {
      text: `The color note, ${color.name} (${color.what}), hardly came up. ${color.tip[0].toUpperCase() + color.tip.slice(1)}.`,
    };
  if (r.pedal > 90 && r.chords.length > 1)
    return {
      text: 'The pedal was down almost the whole time. Lift it as each chord changes and the harmony stays clear.',
    };
  if (M) {
    const n = moodNeighbors(r.mood)[0];
    if (n)
      return {
        text: `Next time, try ${moodName(n.id, r.pc)}: ${n.change}. One note different, a new color.`,
        mood: n.id,
      };
  }
  return { text: 'Next time, choose a mood first: its scale lights up and you can play with a backing.' };
}
