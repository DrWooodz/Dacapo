/* Listening for the answer to a theory question, grouped the way you play it.
   For chords, keys pressed while others are still held (or within a moment) belong together, and
   releasing every key ends the chord; for melodies, every note counts on its own. The answer is complete
   when there are enough groups, or as soon as it is clearly wrong. */
import { Log } from '../core/log.js';
import { Input } from '../core/input.js';
import { answersInChords, answerSize, wrongSoFar } from './theory.js';

const CHORD_GAP_MS = 1500; // a chord also ends after this long without a new key
const RELEASE_MS = 250; // ...or this long after every key was released

// done(groups, early) is called once; early is true when the answer went wrong before it was complete
export function collectAnswer(q, done) {
  const groups = [];
  let cur = null;
  let gapT = 0;
  let finished = false;
  const chords = answersInChords(q);
  const finish = early => {
    if (finished) return;
    stop();
    done(groups, early);
  };
  const after = () => {
    if (wrongSoFar(q, groups)) return finish(true);
    if (groups.length >= answerSize(q)) finish(false);
  };
  const close = () => {
    clearTimeout(gapT);
    if (!cur || finished) return;
    groups.push([...new Set(cur.notes)].sort((a, b) => a - b));
    cur = null;
    after();
  };
  const onNote = Log.guard('answer note', ev => {
    if (finished) return;
    if (!chords) {
      groups.push([ev.m]);
      return after();
    }
    // a fresh attack after every key was released starts the next chord
    const othersHeld = [...Input.held.keys()].some(m => m !== ev.m);
    if (cur && !othersHeld && ev.t - cur.last > 150) close();
    if (finished) return;
    if (!cur) cur = { notes: [] };
    cur.notes.push(ev.m);
    cur.last = ev.t;
    clearTimeout(gapT);
    gapT = setTimeout(close, CHORD_GAP_MS);
  });
  const onOff = Log.guard('answer off', ev => {
    if (finished || !chords || !cur || ev.m == null || Input.held.size) return;
    clearTimeout(gapT);
    gapT = setTimeout(() => !Input.held.size && close(), RELEASE_MS);
  });
  const offs = [Input.on(onNote), Input.onOff(onOff)];
  function stop() {
    finished = true;
    clearTimeout(gapT);
    offs.forEach(f => f());
  }
  return { stop, groups };
}
