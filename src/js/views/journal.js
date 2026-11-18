/* The journal: each sitting at Play, read back (learn/journal.js), with its recording when it is one of the
   last few. The read-back shows right after you stop, and again from the list. */
import { $$, esc } from '../core/util.js';
import { Store } from '../core/store.js';
import { closeBtn, closeSheet, go, openSheet } from '../core/ui.js';
import { midiName } from '../music/theory.js';
import { moodName } from '../music/moods.js';
import { Sittings } from '../learn/sitting.js';
import { Takes } from './takes.js';

const when = at =>
  new Date(at).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

// what was heard, plainly
export function readBackHTML(e) {
  const moodLine = e.mood
    ? e.chosen
      ? `In <b>${esc(moodName(e.mood, e.pc))}</b>.`
      : `It sounded like <b>${esc(moodName(e.mood, e.pc))}</b>${e.alt ? ` (or ${esc(moodName(e.alt.mood, e.alt.pc))})` : ''}.`
    : '';
  const facts = [
    `${e.min} min`,
    `${e.notes} notes`,
    e.range && `${midiName(e.range[0], true)} to ${midiName(e.range[1], true)}`,
    `left hand ${e.lh}%`,
    `pedal down ${e.pedal}%`,
  ].filter(Boolean);
  const chords = e.chords.length
    ? `<div class="chips">${e.chords
        .map(
          c =>
            `<span class="chip${c.out ? ' out' : ''}" title="${c.n}×">${esc(c.name)}${c.num ? ` <span class="small">${esc(c.num)}</span>` : ''}</span>`,
        )
        .join('')}</div>`
    : '<p class="small">No chords held (three notes or more together).</p>';
  const scale =
    e.outside == null
      ? ''
      : `<p class="small">${
          e.outside
            ? `${e.outside} note${e.outside === 1 ? '' : 's'} outside the scale, ${e.resolved} resolved by a step.`
            : 'Every note in the scale.'
        }${e.color ? ` The color note ${esc(e.color.name)}: ${e.color.n}×.` : ''}</p>`;
  const hasRec = !!Sittings.get(e.id);
  return `
    <p>${moodLine}</p>
    <p class="small">${esc(facts.join(' · '))}</p>
    <span class="eyebrow">Chords you held</span>
    ${chords}
    ${scale}
    <div class="callout"><b>Next time</b><p>${esc(e.tip.text)}</p></div>
    <div class="row">
      ${hasRec ? `<button class="btn sm" type="button" data-rb="hear">▶ Hear it</button>` : ''}
      ${e.mood ? `<button class="btn sm ghost" type="button" data-rb="about">About ${esc(moodName(e.mood, e.pc))}</button>` : ''}
      ${e.mood ? `<button class="btn sm ghost" type="button" data-rb="practice">Practice it</button>` : ''}
      ${e.tip.mood ? `<button class="btn sm ghost" type="button" data-rb="try">Try ${esc(moodName(e.tip.mood, e.pc))}</button>` : ''}
    </div>`;
}

// the read-back's buttons; onTry(mood, pc) changes Play's mood
export function bindReadBack(root, e, { onTry } = {}) {
  $$('[data-rb]', root).forEach(b => {
    b.onclick = () => {
      const k = b.dataset.rb;
      if (k === 'hear') {
        const take = Sittings.get(e.id);
        if (!take) return;
        if (Takes.playing) {
          Takes.stop();
          b.textContent = '▶ Hear it';
          return;
        }
        b.textContent = '■ Stop';
        Takes.play(take, () => (b.textContent = '▶ Hear it'));
        return;
      }
      closeSheet();
      if (k === 'about') go('explore', { mood: e.mood, pc: e.pc });
      if (k === 'practice') go('practice', { mood: e.mood, pc: e.pc });
      if (k === 'try') onTry ? onTry(e.tip.mood, e.pc) : go('play', { mood: e.tip.mood, pc: e.pc });
    };
  });
}

// the list of sittings, newest first
export function journalHTML() {
  const list = (Store.s.journal || []).slice().reverse();
  if (!list.length)
    return '<p class="small">Each time you sit down and play here, it is read back and kept.</p>';
  return `<div class="stack" style="gap:0">${list
    .slice(0, 30)
    .map(
      e => `<button type="button" class="piecerow" data-sit="${esc(e.id)}">
        <span class="grow"><span class="ttl">${esc(when(e.at))}</span>
          <span class="small">${e.min} min${e.mood ? ' · ' + esc(moodName(e.mood, e.pc)) : ''}${
            e.chords.length
              ? ' · ' +
                esc(
                  e.chords
                    .slice(0, 4)
                    .map(c => c.name)
                    .join(' '),
                )
              : ''
          }</span></span>
        <span class="chev" aria-hidden="true">›</span></button>`,
    )
    .join('')}</div>`;
}

export function bindJournal(root, opts) {
  $$('[data-sit]', root).forEach(b => {
    b.onclick = () => {
      const e = (Store.s.journal || []).find(x => x.id === b.dataset.sit);
      if (!e) return;
      openSheet(
        `<div class="sheethead"><h2 class="h2">${esc(when(e.at))}</h2>${closeBtn}</div>${readBackHTML(e)}`,
        sheet => {
          bindReadBack(sheet, e, opts);
          return () => Takes.stop();
        },
        { label: 'A sitting' },
      );
    };
  });
}
