/* Library: the pieces you work on, the music to choose from (one shelf at a time), and your own files. */
import { $, esc, toast } from '../core/util.js';
import { Store } from '../core/store.js';
import { AudioEngine } from '../core/audio.js';
import { bindSegs, closeBtn, closeSheet, go, openSheet, seg, UI } from '../core/ui.js';
import { MAJOR_KEYS, MINOR_KEYS, prettyKey } from '../music/theory.js';
import { COMPOSERS, LEVEL_NAMES, Library, listenUrl, scoreUrl } from '../music/library.js';
import { itemState, STAGE_TXT } from '../learn/curriculum.js';
import { MAX_PIECES, pieceSession, setPieceDaily, stopPiece, workOnPiece } from '../learn/sessions.js';
import { sectionOriginal, workingPieces } from '../learn/areas.js';
import { skillStatus } from '../learn/status.js';
import { musicSheet } from './musicinfo.js';
import { arrangeSheet, rearrange } from './arrange.js';

export const libraryView = (page, params = {}) => {
  const fav = Store.s.profile.favorites || [];
  const all = Library.all();
  const shelves = Object.keys(COMPOSERS).filter(c => c === 'mine' || all.some(p => p.c === c));
  // one shelf at a time: the last one you looked at, else your favorite composer
  const shelf = shelves.includes(UI.shelf) ? UI.shelf : shelves.find(c => fav.includes(c)) || shelves[0];
  const shelfName = c => (c === 'mine' ? 'Your files' : COMPOSERS[c].short);
  page.innerHTML = `
    <h1 class="h1 pagetitle">Library</h1>
    ${workingCard()}
    <section class="card">
      ${seg(
        'lbShelf',
        shelves.map(c => [c, shelfName(c)]),
        shelf,
        'wrap',
      )}
      ${shelfBody(shelf, all)}
    </section>
    <p class="small">Scores: the Mutopia Project (mutopiaproject.org). Each piece shows its license and
      typesetter. Suggested listening and full scores open on YouTube and IMSLP.</p>`;
  bindSegs(page, {
    lbShelf: v => {
      UI.shelf = v;
      go('library');
    },
  });
  page.querySelectorAll('[data-open]').forEach(b => {
    b.onclick = () => pieceSheet(b.dataset.open);
  });
  page.querySelectorAll('[data-practice]').forEach(b => {
    b.onclick = () => practicePiece(b.dataset.practice);
  });
  page.querySelectorAll('[data-daily]').forEach(b => {
    b.onclick = () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      setPieceDaily(b.dataset.daily, on);
      b.setAttribute('aria-pressed', String(on));
    };
  });
  const ps = $('#lbSession', page);
  if (ps) ps.onclick = pieceSessionSheet;
  const imp = $('#lbImport', page);
  if (imp) imp.onchange = () => importFile(imp.files[0]);
  if (params.pieceSession && workingPieces().length) pieceSessionSheet();
};

const isWorking = pid => workingPieces().some(w => w.pid === pid);

// practice the next section of a piece (or its cold check)
function practicePiece(pid) {
  const st = skillStatus('p:' + pid);
  const id = st.focus || st.checks[0];
  if (id) go('practice', { item: id, from: 'library' });
  else toast('Every section is integrated. It comes back for reviews.');
}

// the pieces you work on: tap one for everything about it; Practice goes to its next section
function workingCard() {
  const pieces = workingPieces();
  const row = w => {
    const p = Library.get(w.pid);
    const st = skillStatus('p:' + w.pid);
    return `<div class="workrow">
      <div class="row between">
        <button type="button" class="grow linkrow" data-open="${esc(p.id)}">
          <span class="ttl">${esc(p.t)}</span>
          <span class="small">${esc((COMPOSERS[p.c] || {}).short || '')} · ${st.done} of ${st.total} integrated</span>
        </button>
        <button class="chip" type="button" data-daily="${esc(p.id)}" aria-pressed="${!!w.daily}"
          title="In daily practice">Daily</button>
        <button class="btn sm cover" type="button" data-practice="${esc(p.id)}">Practice</button>
      </div>
      ${sectionMap(p.id)}
    </div>`;
  };
  if (!pieces.length)
    return `<section class="card"><h2 class="h2">Working on</h2>
      <p class="small">Nothing yet. Open a piece below and choose "Work on this piece".</p></section>`;
  return `<section class="card">
    <div class="cardhead"><h2 class="h2">Working on</h2><span class="small">${pieces.length} of ${MAX_PIECES}</span></div>
    ${pieces.map(row).join('')}
    <p class="small">Daily pieces come up in every session; the others when pieces are your focus, or in a
      piece session: a longer sitting with your pieces, for when you have time.</p>
    <button class="btn" type="button" id="lbSession">Start a piece session</button>
  </section>`;
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

// the pieces on one shelf (a composer, or your own files), easiest first
function shelfBody(c, all) {
  const list = all.filter(p => p.c === c).sort((a, b) => a.lvl - b.lvl || a.t.localeCompare(b.t));
  const head =
    c === 'mine'
      ? `<p class="small">Import a MIDI file: a piano piece, or music for several instruments (game and band
           music too), which DaCapo arranges for piano. Use only files you have the right to use; they
           stay on this device.</p>
         <label class="btn sm cover" style="cursor:pointer;align-self:flex-start">Import a MIDI file<input
           type="file" id="lbImport" accept=".mid,.midi,audio/midi,audio/x-midi" hidden></label>`
      : `<p class="small">${esc(COMPOSERS[c].n)} · ${esc(COMPOSERS[c].life)}</p>`;
  return `${head}<div class="stack" style="gap:0">${list.map(pieceRow).join('')}</div>`;
}

function pieceRow(p) {
  const tag = isWorking(p.id)
    ? ' <span class="tag rh">working on</span>'
    : Store.s.piece.added[p.id]
      ? ' <span class="tag">started</span>'
      : '';
  return `
    <button type="button" class="piecerow" data-open="${esc(p.id)}">
      <span class="grow">
        <span class="ttl">${esc(p.t)}${tag}</span>
        <span class="small">${p.sub ? esc(p.sub) + ' · ' : ''}${levelDots(p.lvl)} ${LEVEL_NAMES[p.lvl] || ''}
          · ${p.nb} bars</span>
      </span>
      <span class="chev" aria-hidden="true">›</span>
    </button>`;
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
       <button class="btn ghost" type="button" id="psMusic">About the music</button>
       ${links}
     </div>
     ${action}
     ${started && !working ? '<p class="small">Your progress on it is kept from before.</p>' : ''}
     <p class="small">${source}</p>
     ${
       mine
         ? `<div class="row">
              ${p.orig ? '<button class="btn sm ghost" type="button" id="psArr">Change the arrangement</button>' : ''}
              <button class="btn sm ghost" type="button" id="psDel">Remove this file</button>
            </div>`
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
      $('#psMusic', sheet).onclick = () => musicSheet(pid, { back: () => pieceSheet(pid) });
      const arr = $('#psArr', sheet);
      if (arr)
        arr.onclick = () =>
          rearrange(p, () => {
            clearProgress(pid);
            go('library');
            pieceSheet(pid);
            toast('New arrangement saved. Its sections start over.');
          });
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

// the sections of a piece and their progress, for a piece that is removed or arranged anew
function clearProgress(pid) {
  for (const k of Object.keys(Store.s.items)) if (k.startsWith(`p:${pid}:`)) delete Store.s.items[k];
  Store.save();
}

function removeImport(pid) {
  Library.saveImports(Library.imports().filter(x => x.id !== pid));
  Library.forget(pid);
  stopPiece(pid);
  clearProgress(pid);
  closeSheet();
  go('library');
  toast('Removed');
}

// a MIDI file chosen from the device
function importFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () =>
    arrangeSheet({
      buf: reader.result,
      fileName: file.name,
      onSaved: piece => {
        go('library');
        pieceSheet(piece.id);
      },
    });
  reader.onerror = () => toast('Could not read that file.');
  reader.readAsArrayBuffer(file);
}
