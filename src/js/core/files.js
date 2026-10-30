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
