/* Guides: your piano (connecting it, and what its built-in features are good for), and body and hands. */
import { $, esc } from '../core/util.js';
import { Store } from '../core/store.js';
import { closeBtn, openSheet } from '../core/ui.js';
import { LESSON_BY, LESSONS } from '../learn/lessons.js';

/* ---------- instrument guide ---------- */
const CASIO_GUIDE = [
  {
    t: 'Connect it to DaCapo',
    p: [
      'Use the square USB port on the back (USB to Host) with a data cable: USB-B to USB-C for a phone, USB-B to USB-A or C for a computer. The piano is class-compliant, so no drivers are needed.',
      'The flat USB-A port is for a USB flash drive or the optional WU-BT10 Bluetooth adapter, not for the app.',
      'In Settings choose MIDI keyboard. Then turn on "Play the app\'s sounds on the piano" so examples and backing tracks come out of the piano\'s speakers.',
    ],
  },
  {
    t: 'Set the touch response',
    p: [
      'The CDP-S360 has three touch-sensitivity levels plus off. Never practice with touch off: it removes dynamics, the thing classical playing depends on.',
      'If your loudest notes never reach the top, use a lighter setting; if you cannot play really softly, a heavier one gives finer control at the soft end and builds strength for acoustic pianos.',
    ],
  },
  {
    t: 'Record yourself with the built-in recorder',
    p: [
      'The piano has a 6-track MIDI recorder (5 songs, about 12,000 notes each). Recording and listening back, away from the keys, is one of the fastest ways to hear what to fix.',
      "Hands-separate trick: record the left hand on one track, then practice the right hand against it at your working tempo. DaCapo's Takes (in Free play) does the same with a piano-roll view.",
      'Recorder songs can be saved to a USB flash drive in the USB-A port.',
    ],
  },
  {
    t: 'Use the pedals properly',
    p: [
      'The included SP-3 is an on/off sustain switch. For Debussy and Chopin, the optional SP-34 three-pedal unit adds soft and sostenuto pedals and half-damper control, which lets you clear the bass without losing all resonance.',
      'Pedal changes show in Free play (Pedal up / Pedal down) and in your takes as a gold bar under the piano roll, so you can check whether you change with the harmony.',
    ],
  },
  {
    t: 'Practice sound vs. performance sound',
    p: [
      'For technique work, turn reverb down or off: a dry sound exposes uneven notes and late fingers. Use more reverb (a hall setting) when you play pieces through for enjoyment.',
      'Store these as Registration setups (the piano holds 32), for example: Practice (grand piano, little reverb), Repertoire (grand piano, hall), Improv (a layered or split sound).',
    ],
  },
  {
    t: 'Improvise with its built-in tools',
    p: [
      'Layer a soft string tone under the piano, or split the keyboard with a bass tone on the left, to make improvising feel like an ensemble.',
      "Its automatic accompaniment and 100-type arpeggiator turn left-hand chords into a backing pattern. Use them for groove and chord-change practice, and use DaCapo's improvisation studies for classical-style palettes with feedback.",
    ],
  },
  {
    t: 'Other useful settings',
    p: [
      'Transpose (±12 semitones) and octave shift (±2): handy for trying a passage in another key to test that you know it by ear, not just by finger memory.',
      'Tuning (A4 from 415.5 to 465.9 Hz) and temperaments (equal plus 16 others): try 415 Hz with a historical temperament for Baroque music, but keep equal temperament for Chopin, Debussy, Satie and Rachmaninoff.',
      'Headphones: the PHONES/OUTPUT jack mutes the speakers for quiet practice. It can also run on six AA batteries (about four hours).',
    ],
  },
];

const GENERIC_GUIDE = [
  {
    t: 'Connect it to DaCapo',
    p: [
      'Most digital pianos made in the last ten years have a USB port that sends MIDI with no drivers. Connect it with a data cable and choose MIDI keyboard in Settings.',
      'If your piano supports it, turn on "Play the app\'s sounds on the piano" so examples come out of its speakers.',
    ],
  },
  {
    t: 'Touch and sound',
    p: [
      'Practice with touch sensitivity on: dynamics are half of classical playing.',
      'Practice technique with little reverb so unevenness is audible; use more when playing pieces through.',
    ],
  },
  {
    t: 'Record and listen back',
    p: [
      "Use Takes in Free play, or your piano's recorder if it has one. Listening away from the keys is one of the fastest ways to hear what to fix.",
    ],
  },
];

const ACOUSTIC_GUIDE = [
  {
    t: 'Listening on an acoustic piano',
    p: [
      'Use the microphone in Settings. It hears one note at a time, so it works best for scales, single-note reading and rhythm.',
      'Place the phone on the music desk, away from the speaker that plays the metronome.',
    ],
  },
  {
    t: 'Keep it in shape',
    p: [
      'A piano that is tuned and regulated about once a year responds evenly, which makes evenness practice meaningful.',
      'Record yourself with Takes (microphone input) and listen back away from the keys.',
    ],
  },
];

export function pianoGuideSheet() {
  const inst = Store.s.settings.instrument;
  const guides = {
    'cdp-s360': ['Your Casio CDP-S360', CASIO_GUIDE],
    acoustic: ['Your acoustic piano', ACOUSTIC_GUIDE],
  };
  const [name, guide] = guides[inst] || ['Your digital piano', GENERIC_GUIDE];
  const section = (x, i) => `
    <details ${i === 0 ? 'open' : ''}>
      <summary>${esc(x.t)}</summary>
      <div class="prose small">${x.p.map(p => `<p>${esc(p)}</p>`).join('')}</div>
    </details>`;
  openSheet(
    `<div class="sheethead"><h2 class="h2">${name}</h2>${closeBtn}</div>
    <label class="field">Your instrument<select class="input" id="pgInst">
      <option value="cdp-s360">Casio CDP-S360</option>
      <option value="other">Another digital piano</option>
      <option value="acoustic">Acoustic piano (microphone)</option>
    </select></label>
    <div class="stack" style="gap:0">${guide.map(section).join('')}</div>`,
    sheet => {
      const sel = $('#pgInst', sheet);
      sel.value = inst;
      sel.onchange = () => {
        Store.s.settings.instrument = sel.value;
        Store.save();
        pianoGuideSheet();
      };
    },
    { label: 'Piano guide' },
  );
}

/* ---------- body and hands ---------- */
const lessonHTML = l => `<div class="prose small">${l.text.map(p => `<p>${esc(p)}</p>`).join('')}</div>`;

// one note on how to play, opened from the practice screen
export function lessonSheet(id) {
  const l = LESSON_BY[id];
  if (!l) return;
  openSheet(
    `<div class="sheethead"><h2 class="h2">${esc(l.t)}</h2>${closeBtn}</div>
     ${lessonHTML(l)}
     <button class="btn sm ghost" type="button" id="lsAll" style="align-self:flex-start">All notes on body and hands</button>
     <p class="small">Guidance, not graded: the app cannot see you. A teacher who can watch you play is the
       best check. If playing hurts, stop.</p>`,
    sheet => {
      $('#lsAll', sheet).onclick = bodySheet;
    },
    { label: l.t },
  );
}

// all of them
export function bodySheet() {
  openSheet(
    `<div class="sheethead"><h2 class="h2">Body and hands</h2>${closeBtn}</div>
     <p class="small">How you sit and move decides how easy playing feels and how far your technique can
       go. The practice screen shows one of these at a time; here they all are.</p>
     <div class="stack" style="gap:0">${LESSONS.map(
       (l, i) => `<details ${i === 0 ? 'open' : ''}><summary>${esc(l.t)}</summary>${lessonHTML(l)}</details>`,
     ).join('')}</div>
     <p class="small">Guidance, not graded: the app cannot see you. If playing hurts, stop and have a teacher
       look at your technique.</p>`,
    null,
    { label: 'Body and hands' },
  );
}
