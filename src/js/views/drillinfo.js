/* About a drill: its short name, the (i) panel with where it stands, and how the stages work. Shared by
   the practice screen, the skills screen and the players. */
import { $, esc } from '../core/util.js';
import { closeBtn, openSheet } from '../core/ui.js';
import { COMPOSERS, Library, listenUrl, scoreUrl } from '../music/library.js';
import { criterion, itemState, STAGE_TXT } from '../learn/curriculum.js';
import { itemDef } from '../learn/areas.js';

export function shortTitle(d) {
  if (!d) return '';
  if (d.kind === 'section') return `${d.title} §${d.k + 1}`;
  if (d.kind === 'full') return `${d.title} (whole)`;
  if (d.kind === 'pattern') return d.title.split(':')[0] + ' pattern';
  if (d.kind === 'improv') return d.title.split(':')[0] + ' improv';
  return d.title;
}

export function howSheet() {
  openSheet(
    `<div class="sheethead"><h2 class="h2">How it works</h2>${closeBtn}</div>
    <div class="prose small">
      <p><b>The goal is unconscious competence</b>: playing where the notes and movements run by themselves,
        so your attention is free for the music. DaCapo is built around the practice methods with the
        strongest evidence for getting there.</p>
      <p><b>One focus a week, a little of everything.</b> DaCapo suggests a focus for the week (your weakest
        area that matters to you, or one that has waited); you can keep it or choose another. Most of each
        session goes to it. The other areas get a few minutes of upkeep, so nothing fades. Each drill comes
        back session after session until it is integrated; consolidation happens between sessions, during
        sleep, so spreading the work over days beats one long push.</p>
      <p><b>Stages.</b> <i>Learning</i>: slowly, in wait mode, where the app waits for the right notes
        (hands separately when needed; key hints fade after a clean run). <i>Building speed</i> (note reading
        and theory): the same, with a time goal per note or per answer that tightens as you reach it.
        <i>Building tempo</i>: with the metronome; two clean runs out of three raise the tempo about 5%, and
        wrong notes lower it 10%. If you play steadily faster than the click, that becomes your tempo.
        <i>Checking</i>: the goal, cold, as the first thing you play that day. Right on two different days
        means it is integrated.</p>
      <p><b>When something stalls,</b> the approach changes instead of repeating the same thing: back to wait
        mode with the keys shown, one hand alone, an easier goal for the day, or (in theory) the explanation
        again with the answer shown sooner.</p>
      <p><b>Reviews.</b> Integrated items come back for one cold run after 3, 7, 15, 30 and 60 days, then
        every 120 days. If one slipped, it goes back a step, which usually takes a day or two.</p>
      <p><b>A practice day</b> runs from 4 in the morning to 4 the next morning, so a late session that goes
        past midnight still counts as one day.</p>
      <p><b>What counts.</b> Only playing on a real piano (MIDI, or the microphone for single notes). The
        on-screen keys are for trying things out. Timing is judged against your own steady tempo; uneven
        timing alone never counts as a messy run. Steadiness has its own place in your skills.</p>
      <p><b>Your pieces</b> are split into short sections. Each section is learned hands separately, then
        together, then brought to tempo starting one bar early so the joins are practiced too. Pieces come
        up when they are your focus, when you mark them for daily practice, or in a piece session.</p>
    </div>`,
    null,
    { label: 'How it works' },
  );
}

const DRILL_NOTES = {
  scale: `Keep the fingering shown fixed: the same fingers every time is what makes it automatic.
    Target: two notes per click at the target tempo, both hands together, two octaves up and down.`,
  read: `Read from the staff, not the keyboard: no key hints here (one appears if you are stuck for a
    few seconds). Find each note from the nearest landmark: middle C, treble G, bass F, and the C's.`,
};
DRILL_NOTES.arp = DRILL_NOTES.scale;

// the (i) panel of a drill: what it is, where it stands, recent days
export function aboutDrill(id) {
  const d = itemDef(id);
  const it = itemState(id);
  if (!d) return;
  const piece = d.pid ? Library.get(d.pid) : null;
  const recent = ((it && it.log) || []).slice(-10).reverse();
  const edition = piece
    ? `<p class="small">${esc((COMPOSERS[piece.c] || {}).n || '')}${piece.y ? ', ' + piece.y : ''}.
         Edition: ${esc(piece.lic || '')}${piece.by ? ', typeset by ' + esc(piece.by) : ''} (Mutopia Project).
         The notation here is simplified: spacing shows timing, open note heads are half and whole notes.
         <a href="${scoreUrl(piece)}" target="_blank" rel="noopener">Full score</a>
         · <a href="${listenUrl(piece)}" target="_blank" rel="noopener">Listen</a></p>`
    : '';
  const dayRow = h => `<div class="row between small">
    <span>${esc(h.d)}</span>
    <span>${h.reps} reps · ${h.clean} ${d.kind === 'theory' ? 'right' : 'clean'}${h.bpm ? ' · best ♩ ' + h.bpm : ''}</span>
  </div>`;
  openSheet(
    `<div class="sheethead"><h2 class="h2">${esc(shortTitle(d))}</h2>${closeBtn}</div>
     ${d.about ? `<p>${esc(d.about)}</p>` : ''}
     ${d.use ? `<p class="small"><b>Where it helps:</b> ${esc(d.use)}</p>` : ''}
     ${DRILL_NOTES[d.kind] ? `<p class="small">${DRILL_NOTES[d.kind]}</p>` : ''}
     ${edition}
     <div class="stack" style="gap:4px">
       <span class="eyebrow">Where it stands</span>
       <p><b>${esc(STAGE_TXT[it ? it.stage : ''] || 'Not started')}</b> · ${esc(criterion(id))}</p>
     </div>
     ${
       recent.length
         ? `<div class="stack" style="gap:4px">
              <span class="eyebrow">Recent days</span>${recent.map(dayRow).join('')}
            </div>`
         : ''
     }
     <button class="btn sm ghost" type="button" id="adHow" style="align-self:flex-start">How stages work</button>`,
    sheet => {
      $('#adHow', sheet).onclick = howSheet;
    },
    { label: 'About this drill' },
  );
}
