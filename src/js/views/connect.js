/* The line that asks you to connect your piano, where it matters. */
import { IN_CLAUDE } from '../env.js';
import { $$, esc } from '../core/util.js';
import { AudioEngine } from '../core/audio.js';
import { Input } from '../core/input.js';
import { go, UI } from '../core/ui.js';
import { settingsSheet } from './settings.js';

export function connectNotice(always) {
  if (Input.live && Input.mode === 'midi')
    return always
      ? `<div class="notice info row between">
           <span>Piano connected: ${esc(Input.midiNames[0] || 'MIDI')}.</span>
         </div>`
      : '';
  if (IN_CLAUDE)
    return `<div class="notice info"><span>MIDI is blocked inside the Claude app. To play with your piano,
      open the hosted copy of DaCapo in Chrome. Here you can try everything with the on-screen keys
      (practice only, not counted).</span></div>`;
  if (Input.mode === 'mic' && Input.live)
    return always
      ? '<div class="notice info">Listening through the microphone: single notes only.</div>'
      : '';
  const text =
    Input.mode === 'midi'
      ? 'Your piano is not connected. Plug it in by USB (the square port), then tap Connect.'
      : 'Connect your piano so DaCapo can hear you.';
  return `<div class="notice info row between">
    <span>${text}</span>
    <button class="btn sm" type="button" data-connect>Connect</button>
  </div>`;
}

export function bindConnect() {
  $$('[data-connect]').forEach(b => {
    b.onclick = async () => {
      AudioEngine.ensure();
      await Input.setMode('midi');
      if (!Input.live) settingsSheet();
      else go(UI.view, UI.params);
    };
  });
}
