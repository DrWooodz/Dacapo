/* A recorded take, read back into notes. Events are [ms, 'n', key, velocity], [ms, 'f', key] and
   [ms, 'p', 1|0] for the sustain pedal.
   Pair note-ons with offs. Each note has two lengths: how long the key was down (key) and how long it
   rang (dur): the sustain pedal keeps a released note sounding until the pedal lifts. Playback uses the
   ringing length; the picture shows the key length, with the ringing as a faint tail, so a take played
   with the pedal held down all the way still shows every note where it was played. */

export function readTake(ev) {
  const out = [];
  const open = new Map(); // keys that are sounding: {t, m, vel, key, dur}
  let pedal = false;
  const pedalSpans = [];
  let pStart = 0;
  const end = ev.length ? ev[ev.length - 1][0] + 400 : 0;
  const close = (o, t) => {
    o.dur = t - o.t;
    if (o.key == null) o.key = o.dur;
    out.push(o);
  };
  ev.forEach(([t, k, m, v]) => {
    if (k === 'n') {
      if (open.has(m)) close(open.get(m), t); // the same key again: the old note stops
      open.set(m, { t, m, vel: v / 127, key: null, dur: 0 });
    } else if (k === 'f') {
      const o = open.get(m);
      if (!o || o.key != null) return;
      o.key = t - o.t;
      if (!pedal) {
        close(o, t);
        open.delete(m);
      }
    } else if (k === 'p') {
      if (m && !pedal) {
        pedal = true;
        pStart = t;
      } else if (!m && pedal) {
        pedal = false;
        pedalSpans.push([pStart, t]);
        open.forEach((o, mm) => {
          if (o.key != null) {
            close(o, t);
            open.delete(mm);
          }
        });
      }
    }
  });
  if (pedal) pedalSpans.push([pStart, end]);
  open.forEach(o => close(o, Math.max(o.t + 300, end)));
  out.forEach(o => {
    o.dur = Math.max(60, o.dur);
    o.key = Math.max(60, Math.min(o.key, o.dur));
  });
  // the pedal counts from the first note (it may go down before), and never beyond the end
  const first = out.length ? Math.min(...out.map(o => o.t)) : 0;
  const spans = pedalSpans.map(([a, b]) => [Math.max(a, first), b]).filter(([a, b]) => b > a);
  return {
    notes: out.sort((a, b) => a.t - b.t),
    pedal: spans,
    dur: Math.max(end, ...out.map(o => o.t + o.dur)),
  };
}
