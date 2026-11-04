/* About the music of a piece: the mode it is in and what that means, the chords of each section as
   numerals and names (with a way to hear them), and the instruments an imported file was written for. */
import { $, esc } from '../core/util.js';
import { AudioEngine } from '../core/audio.js';
import { closeBtn, openSheet } from '../core/ui.js';
import { Library } from '../music/library.js';
import { chordLabel } from '../music/harmony.js';

const TONES = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], dom7: [0, 4, 7, 10], min7: [0, 3, 7, 10] };
TONES.maj7 = [0, 4, 7, 11];

// a chord to hear: a close position around middle C over its root in the bass
const voicing = (root, type) => {
  const r = 55 + ((root - 55 + 120) % 12);
  return [r - 12, ...(TONES[type] || TONES.maj).map(s => r + s)];
};

// the bar number as it is printed (a pickup bar counts as bar 0)
const barNo = (p, k) => (p.pickup ? k : k + 1);

// the chords of one section: one cell per bar, numeral over name
export function sectionChords(pid, k) {
  const M = Library.music(pid);
  const s = M && M.sections[k];
  if (!s || !s.bars.length) return '';
  const cell = cs =>
    `<span class="chordbar">${
      cs.map(c => `<span><b>${esc(c.num)}</b><small>${esc(c.name)}</small></span>`).join('') ||
      '<span><small>–</small></span>'
    }</span>`;
  return `<div class="chordrow" data-sec="${k}">${s.bars.map(cell).join('')}</div>`;
}

// play the chords of a section, one beat-and-a-half per chord
function hearSection(pid, k) {
  const M = Library.music(pid);
  const s = M && M.sections[k];
  if (!s) return;
  const chords = s.bars.flat();
  AudioEngine.ensure();
  AudioEngine.stopAll();
  const t0 = AudioEngine.now() + 0.1;
  chords.forEach((c, i) => AudioEngine.chord(voicing(c.root, c.type), t0 + i * 0.9, 0.85, 0.45));
}

const modeLine = M =>
  `<b>${esc(M.home + ' ' + M.mode)}</b>` +
  (M.info.also ? ` <span class="small">(also called ${esc(M.info.also)})</span>` : '');

export function musicSheet(pid, { back } = {}) {
  const p = Library.get(pid);
  const M = Library.music(pid);
  if (!p || !M) return;
  const extra = [];
  if (M.raised7)
    extra.push(
      `It often raises its 7th to ${esc(chordLabel((M.tonic + 11) % 12, 'maj', M.parentSig))}, which makes the V chord major and pulls hard back home: that is harmonic minor.`,
    );
  if (M.outside > 0.15)
    extra.push(
      'Many of its notes are outside this scale, so the key changes or the harmony is chromatic in places; the numerals still show each chord against the home note.',
    );
  const from = (p.from || []).length
    ? `<div class="stack" style="gap:4px"><span class="eyebrow">Written for</span>
         <p class="small">${p.from.map(esc).join(', ')}. DaCapo's piano version keeps the melody and bass as
           written and takes the harmony from what these instruments really play.</p></div>`
    : '';
  const secs = Library.sections(pid);
  const secRow = s => {
    const label = `Section ${s.k + 1} · bars ${barNo(p, s.a)}–${barNo(p, s.z - 1)}`;
    return `<div class="stack" style="gap:4px">
      <div class="row between"><span class="small">${label}</span>
        <button class="btn sm ghost" type="button" data-hear="${s.k}">Hear the chords</button></div>
      ${sectionChords(pid, s.k)}
    </div>`;
  };
  openSheet(
    `<div class="sheethead"><h2 class="h2">The music of ${esc(p.t)}</h2>${closeBtn}</div>
     <div class="stack" style="gap:4px">
       <span class="eyebrow">Home</span>
       <p>${modeLine(M)}: ${esc(M.info.feel)}.</p>
       <p class="small">${esc(M.info.how)}</p>
       ${extra.map(x => `<p class="small">${x}</p>`).join('')}
       <button class="btn sm ghost" type="button" id="muHome" style="align-self:flex-start">
         Hear the home chord</button>
     </div>
     <div class="stack" style="gap:4px">
       <span class="eyebrow">Chords, bar by bar</span>
       <p class="small">Numerals count up from the home note on its major scale, so the same numeral sounds
         the same in every key: I is home, a lowercase numeral is a minor chord, ♭ means a half step lower
         than in major. Below each numeral is the chord's name. Chords are read from what sounds in the
         bar, so a passing note or a bar of melody alone can make a guess look odd.</p>
     </div>
     ${secs.map(secRow).join('')}
     ${from}
     ${back ? '<button class="btn ghost" type="button" id="muBack">Back to the piece</button>' : ''}`,
    sheet => {
      $('#muHome', sheet).onclick = () => {
        AudioEngine.ensure();
        AudioEngine.chord(voicing(M.tonic, M.homeType), AudioEngine.now() + 0.05, 1.6, 0.5);
      };
      sheet
        .querySelectorAll('[data-hear]')
        .forEach(b => (b.onclick = () => hearSection(pid, +b.dataset.hear)));
      const b = $('#muBack', sheet);
      if (b) b.onclick = back;
      return () => AudioEngine.stopAll();
    },
    { label: 'About the music' },
  );
}
