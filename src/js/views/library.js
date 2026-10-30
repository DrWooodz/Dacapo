/* Library: the music you want to learn, and importing your own. */
import { Log } from '../core/log.js';
import { $, clamp, esc, toast } from '../core/util.js';
import { Store } from '../core/store.js';
import { AudioEngine } from '../core/audio.js';
import { bindSegs, closeBtn, closeSheet, go, openSheet, seg } from '../core/ui.js';
import { MAJOR_KEYS, MINOR_KEYS, prettyKey } from '../music/theory.js';
import { COMPOSERS, LEVEL_NAMES, Library, listenUrl, scoreUrl } from '../music/library.js';
import { importMidi } from '../music/midifile.js';
import { itemState, STAGE_TXT } from '../learn/curriculum.js';
import { MAX_PIECES, pieceSession, setPieceDaily, stopPiece, workOnPiece } from '../learn/sessions.js';
import { sectionOriginal, workingPieces } from '../learn/areas.js';
import { skillStatus } from '../learn/status.js';

export const libraryView = (page, params = {}) => {
  const P = Store.s.profile;
  const fav = new Set(P.favorites);
  const all = Library.all();
  const composers = Object.keys(COMPOSERS);
  // your favorite composers first, otherwise in the usual order
  const order = composers
    .slice()
    .sort((a, b) => fav.has(b) - fav.has(a) || composers.indexOf(a) - composers.indexOf(b));
  const composerChip = ([k, c]) =>
    `<button type="button" class="chip" data-fav="${k}" aria-pressed="${fav.has(k)}">${esc(c.short)}</button>`;
  page.innerHTML = `
    <div class="stack">
      <span class="eyebrow">Library</span>
      <h1 class="h1">Music to <em>learn</em>.</h1>
      <p class="lead">Real scores, note for note, from public-domain and Creative Commons editions.
        DaCapo teaches each piece section by section and checks every note.</p>
    </div>
    ${workingCard()}
    <div class="card">
      <div class="cardhead">
        <h2 class="h2">Your composers</h2>
        <span class="small">Shown first; used for suggestions</span>
      </div>
      <div class="chips">${Object.entries(COMPOSERS)
        .filter(([k]) => k !== 'mine')
        .map(composerChip)
        .join('')}</div>
    </div>
    ${order.map(c => composerCard(c, all)).join('')}
    <p class="small">Scores: the Mutopia Project (mutopiaproject.org). Each piece shows its license and
      typesetter. Suggested listening and full scores open on YouTube and IMSLP.</p>`;
  page.querySelectorAll('[data-fav]').forEach(b => {
    b.onclick = () => {
      const k = b.dataset.fav;
      const s = new Set(P.favorites);
      if (s.has(k)) s.delete(k);
      else s.add(k);
      P.favorites = [...s];
      Store.save();
      go('library');
    };
  });
  page.querySelectorAll('[data-open]').forEach(b => {
    b.onclick = () => pieceSheet(b.dataset.open);
  });
  page.querySelectorAll('[data-practice]').forEach(b => {
    b.onclick = () => practicePiece(b.dataset.practice);
  });
  page.querySelectorAll('[data-daily]').forEach(input => {
    input.onchange = () => {
      setPieceDaily(input.dataset.daily, input.checked);
      toast(input.checked ? 'In daily practice' : 'Only when pieces are your focus, or in a piece session');
    };
  });
  const ps = $('#lbSession', page);
  if (ps) ps.onclick = pieceSessionSheet;
  const imp = $('#lbImport', page);
  if (imp) imp.onchange = () => importSheet(imp.files[0]);
  if (params.pieceSession && workingPieces().length) pieceSessionSheet();
};

const isWorking = pid => workingPieces().some(w => w.pid === pid);

// practice the next section of a piece (or its cold check)
function practicePiece(pid) {
  const st = skillStatus('p:' + pid);
  const id = st.focus || st.checks[0];
  if (id) go('practice', { item: id });
  else toast('Every section is integrated. It comes back for reviews.');
}

// the pieces you work on, each with a daily-practice switch
function workingCard() {
  const pieces = workingPieces();
  const row = w => {
    const p = Library.get(w.pid);
    const st = skillStatus('p:' + w.pid);
    return `<div class="workrow">
      <div class="row between">
        <div class="grow">
          <div class="ttl">${esc(p.t)}</div>
          <div class="small">${esc((COMPOSERS[p.c] || {}).short || '')} · ${st.done} of ${st.total} integrated</div>
        </div>
        <button class="btn sm" type="button" data-open="${esc(p.id)}">More</button>
        <button class="btn sm cover" type="button" data-practice="${esc(p.id)}">Practice</button>
      </div>
      ${sectionMap(p.id)}
      <label class="toggle small-toggle">
        <input type="checkbox" data-daily="${esc(p.id)}" ${w.daily ? 'checked' : ''}>
        <span><b>In daily practice</b><span class="small">Otherwise it comes up when pieces are your
          focus, or in a piece session.</span></span>
      </label>
    </div>`;
  };
  return `<div class="card">
    <div class="cardhead">
      <h2 class="h2">Working on</h2>
      <span class="small">Up to ${MAX_PIECES} pieces</span>
    </div>
    ${pieces.length ? pieces.map(row).join('') : '<p class="small">Nothing yet. Open a piece below and choose "Work on this piece".</p>'}
    ${
      pieces.length
        ? `<div class="row"><button class="btn cover" type="button" id="lbSession">Start a piece session</button>
           <span class="small">A longer sitting with your pieces, for when you have time.</span></div>`
        : ''
    }
  </div>`;
}

function pieceSessionSheet() {
  openSheet(
    `<div class="sheethead"><h2 class="h2">Piece session</h2>${closeBtn}</div>
     <p class="small">A longer sitting with the pieces you work on: cold checks first, then the next sections,
       with the time shared between your pieces. Your daily session stays as it is.</p>
     <div class="row">${[15, 30, 45].map(m => `<button class="btn cover" type="button" data-min="${m}">${m} minutes</button>`).join('')}</div>`,
    sheet => {
      sheet.querySelectorAll('[data-min]').forEach(b => {
        b.onclick = () => {
          pieceSession(+b.dataset.min);
          closeSheet();
          go('practice', { session: 'pieces' });
        };
      });
    },
    { label: 'Piece session' },
  );
}

// difficulty as five dots
const levelDots = n =>
  `<span class="lvl" title="${LEVEL_NAMES[n] || ''}">` +
  [1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('') +
  '</span>';

function composerCard(c, all) {
  const list = all.filter(p => p.c === c).sort((a, b) => a.lvl - b.lvl || a.t.localeCompare(b.t));
  if (!list.length && c !== 'mine') return '';
  const rows =
    list.map(pieceRow).join('') ||
    `<p class="small">Import a MIDI file of a piece you want to learn. Files exported from notation
       software (MuseScore, IMSLP, Mutopia) work best.</p>`;
  const importButton = `
    <div class="row">
      <label class="btn sm cover" style="cursor:pointer">Import a MIDI file<input type="file" id="lbImport"
        accept=".mid,.midi,audio/midi,audio/x-midi" hidden></label>
    </div>`;
  return `
    <div class="card">
      <div class="cardhead">
        <h2 class="h2">${esc(COMPOSERS[c].n)}</h2>
        <span class="small">${esc(COMPOSERS[c].life)}</span>
      </div>
      <div class="stack" style="gap:0">${rows}</div>
      ${c === 'mine' ? importButton : ''}
    </div>`;
}

function pieceRow(p) {
  const tag = isWorking(p.id)
    ? ' <span class="tag rh">working on</span>'
    : Store.s.piece.added[p.id]
      ? ' <span class="tag">started</span>'
      : '';
  return `
    <div class="piecerow">
      <div class="grow">
        <div class="ttl">${esc(p.t)}${tag}</div>
        <div class="small">${p.sub ? esc(p.sub) + ' · ' : ''}${levelDots(p.lvl)} ${LEVEL_NAMES[p.lvl] || ''}
          · ${p.nb} bars</div>
      </div>
      <button class="btn sm" type="button" data-open="${esc(p.id)}">Open</button>
    </div>`;
}

// one square per section, colored by its stage
function sectionMap(pid) {
  const square = s => {
    const it = itemState(sectionOriginal(`p:${pid}:${s.k}`));
    const cls = s.same >= 0 && !(it && it.stage === 'done') ? 'same' : it ? it.stage : '';
    const name = `Section ${s.k + 1}${s.same >= 0 ? ` (same as ${s.same + 1})` : ''}`;
    return `<i class="${cls}" title="${name}: ${it ? STAGE_TXT[it.stage] : 'not started'}"></i>`;
  };
  return `<div class="secmap" aria-label="Sections">${Library.sections(pid).map(square).join('')}</div>`;
}

export function pieceSheet(pid) {
  const p = Library.get(pid);
  if (!p) return;
  const working = isWorking(pid);
  const started = !!Store.s.piece.added[pid];
  const mine = p.c === 'mine';
  const secs = Library.sections(pid);
  const sig = p.keys && p.keys[0] ? p.keys[0][1] : 0;
  const major = MAJOR_KEYS.find(k => k.sig === sig);
  const minor = MINOR_KEYS.find(k => k.sig === sig);
  const keyName = major ? `${prettyKey(major.k)} major / ${prettyKey(minor.k)} minor signature` : '';
  const meter = p.ts && p.ts[0] ? `${p.ts[0][1]}/${p.ts[0][2]}` : '';
  const links = mine
    ? ''
    : `<a class="btn ghost" href="${scoreUrl(p)}" target="_blank" rel="noopener">Score</a>
       <a class="btn ghost" href="${listenUrl(p)}" target="_blank" rel="noopener">Listen</a>`;
  const full = workingPieces().length >= MAX_PIECES;
  const action = working
    ? `<button class="btn cover big" type="button" id="psGo">Practice now</button>
       <button class="btn sm ghost" type="button" id="psStop" style="align-self:flex-start">Stop working on it</button>`
    : `<button class="btn cover big" type="button" id="psLearn" ${full ? 'disabled' : ''}>${started ? 'Work on it again' : 'Work on this piece'}</button>
       ${full ? `<p class="small">You are working on ${MAX_PIECES} pieces. Stop one to add another.</p>` : ''}`;
  const source = mine
    ? esc(p.src || '') + ' · stays on this device'
    : `Edition: ${esc(p.lic)}${p.by ? ' · typeset by ' + esc(p.by) : ''}${p.mut ? ' · ' + esc(p.mut) : ''}`;
  openSheet(
    `<div class="sheethead"><h2 class="h2">${esc(p.t)}</h2>${closeBtn}</div>
     <p class="small">${p.sub ? esc(p.sub) + ' · ' : ''}${esc((COMPOSERS[p.c] || {}).n || '')}${p.y ? ', ' + p.y : ''}</p>
     <p>${esc(p.tip || '')}</p>
     <div class="stats">
       <div class="stat"><b>${p.nb}</b><span>bars</span></div>
       <div class="stat"><b>${secs.length}</b><span>sections</span></div>
       <div class="stat"><b>♩ ${p.bpm}</b><span>target tempo</span></div>
       <div class="stat">
         <b>${LEVEL_NAMES[p.lvl] ? p.lvl + '/5' : '–'}</b><span>${esc(LEVEL_NAMES[p.lvl] || '')}</span>
       </div>
     </div>
     <p class="small">${esc(meter)}${meter && keyName ? ' · ' : ''}${esc(keyName)}</p>
     ${started ? sectionMap(pid) : ''}
     <div class="row">
       <button class="btn" type="button" id="psHear">Hear the opening</button>
       ${links}
     </div>
     ${action}
     ${started && !working ? '<p class="small">Your progress on it is kept from before.</p>' : ''}
     <p class="small">${source}</p>
     ${
       mine
         ? `<button class="btn sm ghost" type="button" id="psDel" style="align-self:flex-start">
              Remove this file</button>`
         : ''
     }`,
    sheet => {
      $('#psHear', sheet).onclick = () => playOpening(p);
      const learn = $('#psLearn', sheet);
      if (learn)
        learn.onclick = () => {
          workOnPiece(pid);
          closeSheet();
          go('library');
          toast(`Working on ${p.t}`);
        };
      const practice = $('#psGo', sheet);
      if (practice)
        practice.onclick = () => {
          closeSheet();
          practicePiece(pid);
        };
      const stop = $('#psStop', sheet);
      if (stop)
        stop.onclick = () => {
          stopPiece(pid);
          closeSheet();
          go('library');
          toast('Stopped. Its progress is kept.');
        };
      const del = $('#psDel', sheet);
      if (del) del.onclick = () => removeImport(pid);
      return () => AudioEngine.stopAll();
    },
    { label: p.t },
  );
}

// the first four bars (plus a pickup), at the target tempo
function playOpening(p) {
  AudioEngine.ensure();
  const bars = Library.bars(p.id);
  const end = bars[Math.min(4 + (p.pickup ? 1 : 0), bars.length - 1)];
  const spb = 60 / p.bpm;
  const t0 = AudioEngine.now() + 0.1;
  for (const n of Library.notes(p.id)) {
    if (n.t >= end) continue;
    AudioEngine.note(n.m, t0 + Math.max(0, n.t) * spb, Math.max(0.15, n.d * spb), n.h ? 0.42 : 0.55);
  }
}

function removeImport(pid) {
  Library.saveImports(Library.imports().filter(x => x.id !== pid));
  Library.forget(pid);
  stopPiece(pid);
  for (const k of Object.keys(Store.s.items)) if (k.startsWith(`p:${pid}:`)) delete Store.s.items[k];
  Store.save();
  closeSheet();
  go('library');
  toast('Removed');
}

function importSheet(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let piece = null;
    let err = '';
    let split = 'auto';
    const build = () => {
      try {
        piece = importMidi(reader.result, file.name, split);
        err = '';
      } catch (e) {
        piece = null;
        err = e.message || String(e);
        Log.warn('midi import failed', { name: file.name, err });
      }
    };
    build();
    const paint = sheet => {
      const body = $('#imBody', sheet);
      if (err) {
        body.innerHTML = `<div class="notice">${esc(err)}</div>`;
        return;
      }
      const notes = Library.decode(piece);
      const rh = notes.filter(n => n.h === 0).length;
      const lh = notes.length - rh;
      const hands = [
        ['auto', 'Automatic'],
        ['tracks', 'By track'],
        ['split', 'Split at middle C'],
      ];
      body.innerHTML = `
        <label class="field">Title<input class="input" id="imTitle" value="${esc(piece.t)}"></label>
        <div class="stats">
          <div class="stat"><b>${piece.n}</b><span>notes</span></div>
          <div class="stat"><b>${piece.nb}</b><span>bars</span></div>
          <div class="stat"><b>${rh}/${lh}</b><span>right / left hand</span></div>
          <div class="stat"><b>♩ ${piece.bpm}</b><span>tempo in the file</span></div>
        </div>
        <div class="row"><span class="small">Hands:</span>${seg('imSplit', hands, split)}</div>
        <label class="field">Target tempo (♩)<input class="input" id="imBpm" type="number" min="30"
          max="220" value="${piece.bpm}"></label>
        <button class="btn cover" type="button" id="imSave">Add to my library</button>`;
      bindSegs(body, {
        imSplit: v => {
          split = v;
          build();
          paint(sheet);
        },
      });
      $('#imSave', sheet).onclick = () => {
        piece.t = ($('#imTitle', sheet).value || piece.t).slice(0, 80);
        piece.bpm = clamp(+$('#imBpm', sheet).value || piece.bpm, 30, 220);
        if (!Library.saveImports([...Library.imports(), piece])) {
          toast('Not enough space on this device to keep this file.');
          return;
        }
        Log.ev('midi imported', { id: piece.id, notes: piece.n, bars: piece.nb });
        closeSheet();
        go('library');
        pieceSheet(piece.id);
      };
    };
    openSheet(
      `<div class="sheethead"><h2 class="h2">Import ${esc(file.name)}</h2>${closeBtn}</div>
       <div id="imBody" class="stack"></div>
       <p class="small">Imported pieces stay on this device (and in backups). Files exported from notation
         software give the cleanest result; recordings of live playing are rounded to the nearest 1/24 beat.</p>`,
      sheet => paint(sheet),
      { label: 'Import' },
    );
  };
  reader.onerror = () => toast('Could not read that file.');
  reader.readAsArrayBuffer(file);
}
