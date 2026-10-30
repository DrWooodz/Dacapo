/* Writing a standard MIDI file (format 1): one track for tempo and meter, then one track per part.
   Positions and lengths are in beats (quarter notes). Drums go on channel 10, as General MIDI expects. */

const PPQ = 480;

// a variable-length quantity, as MIDI files store delta times
function vlq(n) {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const text = s => Array.from(new TextEncoder().encode(s));

function chunk(type, bytes) {
  return [...text(type), ...u32(bytes.length), ...bytes];
}

// events: [{tick, bytes}] -> a track chunk with delta times and an end-of-track
function trackChunk(events) {
  const out = [];
  let last = 0;
  events
    .slice()
    .sort((a, b) => a.tick - b.tick || a.order - b.order)
    .forEach(e => {
      out.push(...vlq(e.tick - last), ...e.bytes);
      last = e.tick;
    });
  out.push(0, 0xff, 0x2f, 0);
  return chunk('MTrk', out);
}

const meta = (tick, type, data) => ({ tick, order: 0, bytes: [0xff, type, ...vlq(data.length), ...data] });

/* song: {bpm, beats (per bar), name, tracks: [{name, ch, program, notes: [{b, m, d, v}]}]}
   returns the file as a Uint8Array */
export function writeMidi({ bpm, beats = 4, name = '', tracks }) {
  const tick = b => Math.max(0, Math.round(b * PPQ));
  const us = Math.round(60000000 / bpm);
  const head = [
    meta(0, 0x03, text(name || 'DaCapo sketch')),
    meta(0, 0x51, [(us >> 16) & 255, (us >> 8) & 255, us & 255]),
    meta(0, 0x58, [beats, 2, 24, 8]), // beats per bar, over a quarter note
  ];
  const parts = tracks.map(tr => {
    const ch = tr.ch & 15;
    const ev = [meta(0, 0x03, text(tr.name || ''))];
    if (ch !== 9) ev.push({ tick: 0, order: 1, bytes: [0xc0 | ch, tr.program & 127] });
    for (const n of tr.notes) {
      const on = tick(n.b);
      const off = Math.max(on + 1, tick(n.b + n.d));
      const vel = Math.max(1, Math.min(127, Math.round((n.v ?? 0.8) * 127)));
      // at the same tick, note-offs come before note-ons so repeated notes are not cut
      ev.push({ tick: on, order: 3, bytes: [0x90 | ch, n.m & 127, vel] });
      ev.push({ tick: off, order: 2, bytes: [0x80 | ch, n.m & 127, 0] });
    }
    return trackChunk(ev);
  });
  const header = chunk('MThd', [0, 1, 0, parts.length + 1, (PPQ >> 8) & 255, PPQ & 255]);
  return new Uint8Array([...header, ...trackChunk(head), ...parts.flat()]);
}
