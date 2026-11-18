/* Saving a file to the device (or through the Claude app when running inside it). */
import { IN_CLAUDE } from '../env.js';
import { Log } from './log.js';
import { toast } from './util.js';

/* ---------- backup ---------- */
export async function saveFile(filename, data, type = 'application/json') {
  if (IN_CLAUDE) {
    try {
      const dl = await window.claude.use('downloads');
      if (!dl) throw new Error('downloads unavailable');
      await dl.save({ filename, data });
      toast('Saved');
      return true;
    } catch (e) {
      if (e && e.code === 'declined') return false;
      Log.warn('download failed', String((e && e.message) || e));
      toast(
        e && /extension/.test(e.code || '')
          ? 'The Claude app cannot save this kind of file. Open DaCapo in your browser to save it.'
          : 'Saving files is not available here.',
      );
      return false;
    }
  }
  try {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Saved to your downloads');
    return true;
  } catch (e) {
    Log.err(e, 'save file');
    toast('Could not save the file.');
    return false;
  }
}

/* ---------- reading a score ---------- */
// the text of a MusicXML file: plain (.musicxml, .xml) or compressed (.mxl, a zip with the score inside)
export async function scoreText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!(buf[0] === 0x50 && buf[1] === 0x4b)) return decodeText(buf);
  const entries = zipEntries(buf);
  const read = async e => {
    const raw = buf.subarray(e.data, e.data + e.size);
    if (e.method === 0) return decodeText(raw);
    if (e.method !== 8) throw new Error('This .mxl is compressed in a way DaCapo cannot read.');
    const out = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return decodeText(new Uint8Array(await new Response(out).arrayBuffer()));
  };
  // META-INF/container.xml names the score; otherwise the first .xml outside META-INF
  const box = entries.find(e => e.name === 'META-INF/container.xml');
  let name = null;
  if (box) name = (/full-path="([^"]+)"/.exec(await read(box)) || [])[1];
  const e =
    entries.find(x => x.name === name) ||
    entries.find(x => !x.name.startsWith('META-INF') && /\.(xml|musicxml)$/i.test(x.name));
  if (!e) throw new Error('No score inside this .mxl file.');
  return read(e);
}

// text in UTF-8, or UTF-16 when it starts with a byte-order mark (some notation apps write that)
function decodeText(b) {
  const enc =
    b[0] === 0xff && b[1] === 0xfe ? 'utf-16le' : b[0] === 0xfe && b[1] === 0xff ? 'utf-16be' : 'utf-8';
  return new TextDecoder(enc).decode(b);
}

// the files in a zip, from its central directory: {name, method, size, data (offset)}
function zipEntries(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--)
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('This .mxl file is damaged.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let k = 0; k < count && dv.getUint32(p, true) === 0x02014b50; k++) {
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extra = dv.getUint16(p + 30, true);
    const comment = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    const data = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    out.push({ name, method, size, data });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
