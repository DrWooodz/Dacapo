/* Reading a standard MIDI file: per track, its name and its events (notes, tempo, meter, key), with
   times in ticks. Making sense of them is in midifile.js. */

export function parseMidiFile(buf) {
  const v = new DataView(buf);
  let p = 0;
  const str = n => {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(v.getUint8(p + i));
    return s;
  };
  if (str(4) !== 'MThd') throw new Error('This is not a standard MIDI file.');
  const hl = v.getUint32(4);
  const fmt = v.getUint16(8),
    ntr = v.getUint16(10),
    div = v.getUint16(12);
  p = 8 + hl;
  if (div & 0x8000) throw new Error('This MIDI file uses SMPTE timing, which is not supported.');
  if (fmt === 2) throw new Error('MIDI format 2 files are not supported.');
  const tracks = [];
  for (let t = 0; t < ntr && p < buf.byteLength; t++) {
    if (str(4) !== 'MTrk') throw new Error('Damaged MIDI file (missing track header).');
    const len = v.getUint32(p + 4);
    let q = p + 8;
    const end = q + len;
    let tick = 0,
      rs = 0;
    const ev = [];
    let name = '';
    const vlq = () => {
      let x = 0,
        b;
      do {
        b = v.getUint8(q++);
        x = x * 128 + (b & 0x7f);
      } while (b & 0x80 && q < end);
      return x;
    };
    while (q < end) {
      tick += vlq();
      let st = v.getUint8(q);
      if (st & 0x80) q++;
      else st = rs;
      if (st === 0xff) {
        const type = v.getUint8(q++);
        const l = vlq();
        const data = new Uint8Array(buf, q, l);
        q += l;
        if (type === 0x51 && l === 3)
          ev.push({ tick, k: 'tempo', us: (data[0] << 16) | (data[1] << 8) | data[2] });
        else if (type === 0x58 && l >= 2) ev.push({ tick, k: 'time', n: data[0], d: Math.pow(2, data[1]) });
        else if (type === 0x59 && l >= 2) ev.push({ tick, k: 'key', sf: (data[0] << 24) >> 24, mi: data[1] });
        else if (type === 0x03) name = String.fromCharCode(...data);
        else if (type === 0x2f) break;
        continue;
      }
      if (st === 0xf0 || st === 0xf7) {
        const l = vlq();
        q += l;
        continue;
      }
      rs = st;
      const cmd = st & 0xf0,
        ch = st & 0x0f;
      const d1 = v.getUint8(q++);
      const d2 = cmd === 0xc0 || cmd === 0xd0 ? 0 : v.getUint8(q++);
      if (cmd === 0x90 && d2 > 0) ev.push({ tick, k: 'on', m: d1, vel: d2, ch });
      else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) ev.push({ tick, k: 'off', m: d1, ch });
    }
    tracks.push({ name, ev });
    p = end;
  }
  return { div, tracks };
}
