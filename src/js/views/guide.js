/* A walkthrough shown step by step: what to notice, on the staff and the keyboard, and to hear.
   guideBox() draws it into a box (the theory player shows it above the first question); guideSheet()
   opens it as a panel. Moving to the next step plays its example. */
import { $, esc } from '../core/util.js';
import { AudioEngine } from '../core/audio.js';
import { closeBtn, openSheet } from '../core/ui.js';
import { midiOf } from '../music/theory.js';
import { kbSVG, staffSVG } from '../music/render.js';
import { GUIDES, stepGroups } from '../learn/guides.js';

export const hasGuide = unitId => !!GUIDES[unitId];

function hear(step) {
  const groups = stepGroups(step).map(g => g.map(midiOf));
  if (!groups.length) return;
  AudioEngine.ensure();
  AudioEngine.stopAll();
  if (step.notes) AudioEngine.chord(groups[0], AudioEngine.now() + 0.05, 1.8, 0.5);
  else if (step.seq)
    AudioEngine.seq(
      groups.map(g => g[0]),
      0.42,
      0.8,
      0.55,
    );
  else AudioEngine.seq(groups, 0.95, 0.9, 0.45);
}

function picture(step) {
  const groups = stepGroups(step);
  if (!groups.length) return '';
  // a chord stays on one staff: the treble unless it sits mostly below middle C
  const staffOf = g => (g.reduce((a, n) => a + midiOf(n), 0) / g.length >= 59 ? 't' : 'b');
  const items = groups.map(g => ({ notes: g.map(n => ({ n, st: staffOf(g), cls: 'ok' })) }));
  const staff = staffSVG({ clef: 'grand', sig: 0, items, spacing: 34, minW: 260, top: 30, bottom: 30 }).svg;
  const marks = {};
  groups.flat().forEach(n => (marks[midiOf(n)] = { cls: 'rh' }));
  const ms = Object.keys(marks).map(Number);
  const from = Math.min(48, Math.min(...ms) - 2);
  const to = Math.max(72, Math.max(...ms) + 2);
  return `<div class="staffwrap"><div style="max-width:520px;margin:0 auto">${staff}</div></div>
    <div class="kbwrap scrollx">${kbSVG({ from, to, marks, h: 80, interactive: false })}</div>`;
}

// box: the element to draw into; title: shown on top; onDone: after the last step (omit for no button)
export function guideBox(box, unitId, { title = '', onDone = null } = {}) {
  const steps = GUIDES[unitId];
  if (!steps) return;
  let i = 0;
  const paint = () => {
    const step = steps[i];
    const last = i === steps.length - 1;
    box.innerHTML = `<div class="guide stack" style="gap:8px">
      <div class="row between"><b>${esc(title)}</b><span class="small">Step ${i + 1} of ${steps.length}</span></div>
      <p>${esc(step.say)}</p>
      ${picture(step)}
      <div class="row">
        ${i ? '<button class="btn sm ghost" type="button" data-g="back">Back</button>' : ''}
        ${stepGroups(step).length ? '<button class="btn sm" type="button" data-g="hear">Hear it</button>' : ''}
        ${
          !last
            ? '<button class="btn sm cover" type="button" data-g="next">Next</button>'
            : onDone
              ? '<button class="btn sm cover" type="button" data-g="done">Got it: on to the questions</button>'
              : ''
        }
      </div>
    </div>`;
  };
  box.onclick = e => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    const what = b.dataset.g;
    if (what === 'hear') return hear(steps[i]);
    if (what === 'done') return onDone();
    i = Math.max(0, Math.min(steps.length - 1, i + (what === 'next' ? 1 : -1)));
    paint();
    if (what === 'next') hear(steps[i]);
  };
  paint();
}

export function guideSheet(unitId, title) {
  openSheet(
    `<div class="sheethead"><h2 class="h2">How it works</h2>${closeBtn}</div><div id="gdBox"></div>`,
    sheet => {
      guideBox($('#gdBox', sheet), unitId, { title });
      return () => AudioEngine.stopAll();
    },
    { label: 'How it works' },
  );
}
