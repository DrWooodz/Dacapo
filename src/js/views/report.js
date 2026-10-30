/* The problem report: describe what happened and send it with the diagnostic log. */
import { APP_VERSION, IN_CLAUDE } from '../env.js';
import { Log } from '../core/log.js';
import { $, esc, toast } from '../core/util.js';
import { Store } from '../core/store.js';
import { closeBtn, closeSheet, openSheet } from '../core/ui.js';
import { saveFile } from '../core/files.js';

export function reportSheet(prefill = '') {
  const hint = IN_CLAUDE
    ? 'Send stores the report with this app so Claude can read it when you ask.'
    : 'Then paste it (or attach the file) in your conversation with Claude.';
  openSheet(
    `<div class="sheethead"><h2 class="h2">Report a problem</h2>${closeBtn}</div>
    <p class="small">Describe what happened and what you expected. The diagnostic log (what the app did,
      any errors, your device and browser, no personal data) is attached so the problem can be found.</p>
    <label class="field">What happened?<textarea class="input" id="rpText"
      placeholder="For example: I played the first note of the scale and nothing happened after the count-in…"
      >${esc(prefill)}</textarea></label>
    <label class="toggle">
      <input type="checkbox" id="rpLog" checked>
      <span><b>Attach the diagnostic log</b>
        <span class="small">${Log.buf.length} events, ${Log.errCount} errors this visit</span></span>
    </label>
    <div class="row">
      ${IN_CLAUDE ? '<button class="btn cover" type="button" id="rpSend">Send to Claude</button>' : ''}
      <button class="btn ${IN_CLAUDE ? '' : 'cover'}" type="button" id="rpCopy">Copy report</button>
      <button class="btn" type="button" id="rpSave">Save as file</button>
    </div>
    <p class="small" id="rpHint">${hint}</p>
    <details>
      <summary>Saved reports and log</summary>
      <div class="stack">
        <div id="rpSaved" class="small"></div>
        <div class="row"><button class="btn sm ghost" type="button" id="rpClear">Clear the log</button></div>
      </div>
    </details>`,
    sheet => {
      const text = () => Log.report($('#rpText', sheet).value, $('#rpLog', sheet).checked);
      const keep = rep => {
        try {
          const l = JSON.parse(localStorage.getItem('dacapo.reports') || '[]');
          l.unshift({ t: Date.now(), note: $('#rpText', sheet).value.slice(0, 200), size: rep.length });
          localStorage.setItem('dacapo.reports', JSON.stringify(l.slice(0, 10)));
        } catch (e) {}
      };
      const paintSaved = () => {
        let l = [];
        try {
          l = JSON.parse(localStorage.getItem('dacapo.reports') || '[]');
        } catch (e) {}
        $('#rpSaved', sheet).innerHTML = l.length
          ? l
              .map(x => `<div>${new Date(x.t).toLocaleString()} · ${esc(x.note || '(no description)')}</div>`)
              .join('')
          : 'No reports made yet.';
      };
      paintSaved();
      Log.ev('report opened');
      $('#rpCopy', sheet).onclick = async () => {
        const rep = text();
        Log.ev('report copied', { size: rep.length });
        try {
          await navigator.clipboard.writeText(rep);
          toast('Report copied. Paste it to Claude.');
          keep(rep);
          paintSaved();
        } catch (e) {
          const ta = document.createElement('textarea');
          ta.value = rep;
          ta.className = 'input';
          ta.style.minHeight = '160px';
          $('#rpHint', sheet).replaceWith(ta);
          ta.select();
          toast('Select all and copy the text below.');
        }
      };
      $('#rpSave', sheet).onclick = async () => {
        const rep = text();
        Log.ev('report saved as file');
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        if (await saveFile(`dacapo-report-${stamp}.txt`, rep, 'text/plain')) {
          keep(rep);
          paintSaved();
        }
      };
      const send = $('#rpSend', sheet);
      if (send)
        send.onclick = async () => {
          const rep = text();
          try {
            if (!Store.db || !Store.uid) throw new Error('storage unavailable');
            const id = 'report-' + Date.now().toString(36);
            await Store.db.doc('data/users/' + Store.uid + '/' + id).set({
              text: rep.slice(0, 200000),
              at: Date.now(),
              note: $('#rpText', sheet).value.slice(0, 500),
              version: APP_VERSION,
            });
            Log.ev('report sent', { id });
            keep(rep);
            paintSaved();
            toast('Report sent. Ask Claude to read your DaCapo reports.');
            closeSheet();
          } catch (e) {
            Log.warn('report send failed', String((e && e.message) || e));
            toast('Could not send; use Copy instead.');
          }
        };
      $('#rpClear', sheet).onclick = () => {
        Log.clear();
        toast('Log cleared');
        closeSheet();
      };
    },
    { label: 'Report a problem' },
  );
}
