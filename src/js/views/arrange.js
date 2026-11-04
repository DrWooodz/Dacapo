/* Making a piano piece from a MIDI file: what is in the file, how it becomes a part for two hands, a
   preview, and saving it to your library. The same panel changes the arrangement of a piece later. */
import { Log } from '../core/log.js';
import { $, clamp, esc, toast } from '../core/util.js';
import { AudioEngine } from '../core/audio.js';
import { bindSegs, closeBtn, closeSheet, openSheet, seg } from '../core/ui.js';
import { midiName } from '../music/theory.js';
import { Library } from '../music/library.js';
import { buildPiece, fromBase64, importPlan, readMidi } from '../music/midifile.js';

const STYLES = {
  written: ['As written', 'The file is already a piano part: its two hands are kept as they are.'],
  full: [
    'Full',
    'Melody in the right hand, bass in the left, and the harmony of the other instruments filled in ' +
      'between them, never more than one hand can reach.',
  ],
  simple: ['Simple', 'Just the melody and the bass line, exactly as written. A good first version.'],
  hands: ['My choice', 'You choose which instrument each hand plays. Notes no hand can reach are left out.'],
};
const ROLES = [
  ['melody', 'Melody'],
  ['bass', 'Bass'],
  ['harmony', 'Harmony'],
  ['skip', 'Leave out'],
];
const HANDS = [
  ['rh', 'Right hand'],
  ['lh', 'Left hand'],
  ['skip', 'Leave out'],
];

// the opening four bars of a piece that may not be saved yet
function hearOpening(piece) {
  AudioEngine.ensure();
  AudioEngine.stopAll();
  const bars = Library.decodeBars(piece);
  const end = bars[Math.min(4, bars.length - 1)];
  const spb = 60 / piece.bpm;
  const t0 = AudioEngine.now() + 0.1;
  for (const n of Library.decode(piece)) {
    if (n.t >= end) continue;
    AudioEngine.note(n.m, t0 + n.t * spb, Math.max(0.15, n.d * spb), n.h ? 0.42 : 0.55);
  }
}

/* buf: the file; existing: the piece when changing an arrangement (its id, title and tempo are kept);
   onSaved(piece) after it is in the library */
export function arrangeSheet({ buf, fileName, existing = null, onSaved }) {
  let read;
  try {
    read = readMidi(buf);
  } catch (e) {
    Log.warn('midi import failed', { name: fileName, err: e.message });
    openSheet(
      `<div class="sheethead"><h2 class="h2">${esc(fileName)}</h2>${closeBtn}</div>
       <div class="notice">${esc(e.message || String(e))}</div>`,
      null,
      { label: 'Import' },
    );
    return;
  }
  const auto = importPlan(read);
  const piano = auto.style === 'written';
  const plan = existing && existing.arr ? structuredClone(existing.arr) : importPlan(read);
  // every part has a role and a hand, whichever style is chosen
  read.parts.forEach(p => {
    plan.roles[p.id] ??= auto.roles[p.id];
    plan.assign[p.id] ??= auto.assign[p.id];
  });
  let title = existing ? existing.t : null;
  let bpm = existing ? existing.bpm : null;
  let piece = null;
  let err = '';
  const build = () => {
    try {
      piece = buildPiece(read, fileName, plan, { id: existing && existing.id, title, bpm });
      err = '';
    } catch (e) {
      piece = null;
      err = e.message || String(e);
    }
  };
  const styles = Object.entries(STYLES)
    .filter(([k]) => piano || k !== 'written')
    .map(([k, [label]]) => [k, label]);

  const partRow = p => {
    const what = p.drums
      ? '<span class="small">Left out: drums have no pitches to play</span>'
      : plan.style === 'written'
        ? ''
        : plan.style === 'hands'
          ? seg('hand_' + p.id, HANDS, plan.assign[p.id], 'sm')
          : seg('role_' + p.id, ROLES, plan.roles[p.id], 'sm');
    const sub = p.drums
      ? ''
      : `${p.n} notes · ${midiName(p.lo, flats)}–${midiName(p.hi, flats)}${p.poly > 0.5 ? ' · chords' : ''}`;
    const named =
      p.trackName && p.trackName.toLowerCase() !== p.name.toLowerCase() ? ` · “${esc(p.trackName)}”` : '';
    return `<div class="partrow stack" style="gap:4px">
      <div><b>${esc(p.name)}</b><span class="small">${named}</span></div>
      ${sub ? `<span class="small">${sub}</span>` : ''}
      ${what}
    </div>`;
  };

  let flats = false;
  const paint = sheet => {
    build();
    flats = !!piece && piece.keys[0][1] < 0;
    const body = $('#imBody', sheet);
    const notes = piece ? Library.decode(piece) : [];
    const rh = notes.filter(n => n.h === 0).length;
    body.innerHTML = `
      <label class="field">Title<input class="input" id="imTitle" value="${esc(title ?? (piece ? piece.t : ''))}"></label>
      <div class="stack" style="gap:6px">
        <span class="eyebrow">Piano version</span>
        ${seg('imStyle', styles, plan.style)}
        <p class="small">${esc(STYLES[plan.style][1])}</p>
      </div>
      <div class="stack" style="gap:8px">
        <span class="eyebrow">In the file</span>
        ${read.parts.map(partRow).join('')}
      </div>
      ${
        err
          ? `<div class="notice">${esc(err)}</div>`
          : `<div class="stats">
               <div class="stat"><b>${piece.n}</b><span>notes</span></div>
               <div class="stat"><b>${piece.nb}</b><span>bars</span></div>
               <div class="stat"><b>${rh}/${notes.length - rh}</b><span>right / left hand</span></div>
             </div>
             <button class="btn" type="button" id="imHear">Hear the opening</button>`
      }
      <label class="field">Target tempo (♩)<input class="input" id="imBpm" type="number" min="30"
        max="220" value="${bpm ?? (piece ? piece.bpm : 80)}"></label>
      ${existing ? '<p class="small">Changing the arrangement starts the piece’s sections over.</p>' : ''}
      <button class="btn cover" type="button" id="imSave" ${err ? 'disabled' : ''}>
        ${existing ? 'Save the new arrangement' : 'Add to my library'}</button>`;
    // keep what was typed when the panel is redrawn
    $('#imTitle', sheet).oninput = e => (title = e.target.value);
    $('#imBpm', sheet).oninput = e => (bpm = clamp(+e.target.value || 80, 30, 220));
    const handlers = {
      imStyle: v => {
        plan.style = v;
        paint(sheet);
      },
    };
    read.parts.forEach(p => {
      handlers['role_' + p.id] = v => {
        plan.roles[p.id] = v;
        paint(sheet);
      };
      handlers['hand_' + p.id] = v => {
        plan.assign[p.id] = v;
        paint(sheet);
      };
    });
    bindSegs(body, handlers);
    const hear = $('#imHear', sheet);
    if (hear) hear.onclick = () => hearOpening({ ...piece, bpm: bpm ?? piece.bpm });
    $('#imSave', sheet).onclick = () => save();
  };

  const save = () => {
    if (!piece) return;
    piece.t = String(title || piece.t).slice(0, 80);
    if (bpm) piece.bpm = bpm;
    const others = Library.imports().filter(x => x.id !== piece.id);
    if (!Library.saveImports([...others, piece])) {
      toast('Not enough space on this device to keep this file.');
      return;
    }
    Library.forget(piece.id);
    Log.ev(existing ? 'midi rearranged' : 'midi imported', {
      id: piece.id,
      style: plan.style,
      notes: piece.n,
      bars: piece.nb,
    });
    closeSheet();
    onSaved(piece);
  };

  openSheet(
    `<div class="sheethead"><h2 class="h2">${existing ? 'Arrangement of ' + esc(existing.t) : 'Import ' + esc(fileName)}</h2>${closeBtn}</div>
     <div id="imBody" class="stack"></div>
     <p class="small">Imported pieces stay on this device (and in backups). Files written in notation or
       music software give the cleanest result; recordings of live playing are rounded to 1/24 of a beat.</p>`,
    sheet => {
      paint(sheet);
      return () => AudioEngine.stopAll();
    },
    { label: 'Import' },
  );
}

// changing the arrangement of an imported piece, from the file kept with it
export function rearrange(p, onSaved) {
  if (!p.orig) return;
  arrangeSheet({ buf: fromBase64(p.orig), fileName: p.src || 'file.mid', existing: p, onSaved });
}
