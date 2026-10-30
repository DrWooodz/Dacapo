/* Settings, backups and the About panel. */
import { APP_VERSION, BUILD, IN_CLAUDE } from '../env.js';
import { Log } from '../core/log.js';
import { $, esc, toast, todayKey } from '../core/util.js';
import { DEFAULT_STATE, migrate, Store } from '../core/store.js';
import { AudioEngine, Wake } from '../core/audio.js';
import { Input, MidiOut } from '../core/input.js';
import { bindSegs, closeBtn, closeSheet, go, openSheet, seg, UI } from '../core/ui.js';
import { saveFile } from '../core/files.js';
import { Library } from '../music/library.js';
import { AREAS } from '../learn/areas.js';
import { rebuildSession } from '../learn/sessions.js';
import { bodySheet, pianoGuideSheet } from './guides.js';
import { howSheet } from './drillinfo.js';
import { reportSheet } from './report.js';
import { Sketches } from './jam.js';

export function settingsSheet() {
  const S = Store.s.settings;
  const P = Store.s.profile;
  const toggle = (id, on, label, hint = '') => `
    <label class="toggle">
      <input type="checkbox" id="${id}" ${on ? 'checked' : ''}>
      <span><b>${label}</b>${hint ? `<span class="small">${hint}</span>` : ''}</span>
    </label>`;
  const modes = [
    ['midi', 'MIDI (USB)'],
    ['mic', 'Microphone'],
    ['touch', 'On-screen keys'],
  ];
  openSheet(
    `<div class="sheethead"><h2 class="h2">Settings</h2>${closeBtn}</div>
    <h3 class="h3">Your piano</h3>
    ${seg('sMode', modes, Input.mode)}
    <div id="sStatus" class="small"></div>
    <div class="prose small">
      <p><b>MIDI</b> hears exactly what you play: chords, timing, loudness, pedal. Use the piano's square
        "USB to Host" port with a data cable (USB-B to USB-C on a phone). Chrome or Edge on Android or a
        computer; iPhone and iPad browsers have no MIDI.</p>
      <p><b>Microphone</b> works with any piano but hears one note at a time, so chords and
        hands-together drills are practice only.</p>
      ${
        IN_CLAUDE
          ? `<p class="notice">Inside the Claude app, MIDI and the microphone are blocked. Open your hosted
               copy of DaCapo in Chrome to play with your piano; your progress syncs only within Claude.</p>`
          : ''
      }
    </div>
    <div id="sOut"></div>
    <button class="btn sm ghost" type="button" id="sGuide" style="align-self:flex-start">
      Guide to your piano →</button>
    <div class="divider"></div>
    <h3 class="h3">Areas</h3>
    <p class="small">Switch off an area you do not want to practice at all. For a lighter touch, choose
      another focus instead: everything else then gets only a few minutes of upkeep.</p>
    ${AREAS.map(a => toggle('ar_' + a.id, P.areas[a.id] !== false, a.n, a.d)).join('')}
    <div class="divider"></div>
    <h3 class="h3">Sound and screen</h3>
    ${toggle('sSnd', S.sound, 'App sounds', 'Examples, backing tracks and the Jam. The metronome always clicks.')}
    <label class="field">Volume<input type="range" id="sVol" min="0" max="1" step="0.05" value="${S.volume}"></label>
    ${toggle('sWake', S.keepAwake, 'Keep the screen on while practicing', 'Releases after 20 minutes without playing.')}
    ${toggle('sOct', S.octaveTolerant, 'Microphone: forgive octave mix-ups', 'Low piano notes are often heard an octave off.')}
    <div class="divider"></div>
    <h3 class="h3">Your data</h3>
    <p class="small">Progress is saved on this device${IN_CLAUDE ? ' and in your Claude account' : ''}.
      A backup file moves it to another device.</p>
    <div class="row">
      <button class="btn sm" type="button" id="sBackup">Save a backup file</button>
      <label class="btn sm" style="cursor:pointer">Restore from file<input type="file" id="sRestore"
        accept=".json,application/json" hidden></label>
    </div>
    <div class="divider"></div>
    <h3 class="h3">Help</h3>
    <div class="row">
      <button class="btn sm" type="button" id="sHow">How DaCapo works</button>
      <button class="btn sm" type="button" id="sBody">Body and hands</button>
      <button class="btn sm" type="button" id="sCheck">Placement check</button>
      <button class="btn sm" type="button" id="sReport">Report a problem</button>
      <button class="btn sm ghost" type="button" id="sAbout">About</button>
    </div>
    <details>
      <summary>Start over</summary>
      <div class="stack">
        <p class="small">Erases all progress on this device (save a backup first). Your imported files,
          recordings and Jam sketches stay.</p>
        <button class="btn sm bad" type="button" id="sReset">Erase my progress</button>
      </div>
    </details>
    <p class="small">DaCapo ${APP_VERSION} · ${BUILD}</p>`,
    sheet => {
      const status = () => {
        const connected = `<span class="tag ${Input.live ? 'ok' : ''}">${Input.live ? 'Connected' : 'Not connected'}</span>`;
        $('#sStatus', sheet).innerHTML = `${connected} ${esc(Input.lastErr || Input.status || '')}`;
        const o = $('#sOut', sheet);
        o.innerHTML =
          Input.mode === 'midi' && Input.live && MidiOut.port
            ? toggle(
                'sMidiOut',
                S.midiOut,
                "Play the app's sounds on the piano",
                "Examples and backing tracks come out of the piano's own speakers.",
              ) +
              toggle(
                'sClick',
                S.clickOnPiano,
                'Metronome on the piano too',
                "Uses the piano's drum sounds on channel 10 if it has them; otherwise leave this off.",
              )
            : '';
        const mo = $('#sMidiOut', sheet);
        if (mo)
          mo.onchange = e => {
            S.midiOut = e.target.checked;
            Store.save();
            Log.ev('midi out ' + S.midiOut);
          };
        const mc = $('#sClick', sheet);
        if (mc)
          mc.onchange = e => {
            S.clickOnPiano = e.target.checked;
            Store.save();
          };
      };
      status();
      let changed = false;
      bindSegs(sheet, {
        sMode: async v => {
          changed = true;
          AudioEngine.ensure();
          await Input.setMode(v);
          status();
        },
      });
      const offS = Store.on(k => {
        if (k === 'input') status();
      });
      $('#sGuide', sheet).onclick = pianoGuideSheet;
      AREAS.forEach(a => {
        $('#ar_' + a.id, sheet).onchange = e => {
          changed = true;
          P.areas[a.id] = e.target.checked;
          Log.ev('area ' + a.id + ' ' + e.target.checked);
          rebuildSession();
        };
      });
      $('#sSnd', sheet).onchange = e => {
        S.sound = e.target.checked;
        Store.save();
      };
      $('#sVol', sheet).oninput = e => {
        S.volume = +e.target.value;
        if (AudioEngine.master) AudioEngine.master.gain.value = S.volume;
      };
      $('#sVol', sheet).onchange = () => Store.save();
      $('#sWake', sheet).onchange = e => {
        S.keepAwake = e.target.checked;
        Store.save();
        if (!S.keepAwake) Wake.release();
      };
      $('#sOct', sheet).onchange = e => {
        S.octaveTolerant = e.target.checked;
        Store.save();
      };
      $('#sBackup', sheet).onclick = saveBackupFile;
      $('#sRestore', sheet).onchange = e => restoreFile(e.target.files[0]);
      $('#sHow', sheet).onclick = howSheet;
      $('#sBody', sheet).onclick = bodySheet;
      $('#sCheck', sheet).onclick = () => {
        closeSheet();
        go('assess');
      };
      $('#sReport', sheet).onclick = () => reportSheet();
      $('#sAbout', sheet).onclick = aboutSheet;
      $('#sReset', sheet).onclick = () => {
        if (!confirmTwice(sheet)) return;
        const keep = { settings: Store.s.settings, favorites: Store.s.profile.favorites };
        Store.s = DEFAULT_STATE();
        Store.s.settings = keep.settings;
        Store.s.profile.favorites = keep.favorites;
        Store.save();
        Log.ev('progress erased');
        closeSheet();
        go('practice');
        toast('Progress erased');
      };
      return () => {
        offS();
        if (changed && UI.view === 'practice') setTimeout(() => go('practice', UI.params), 0);
      };
    },
    { label: 'Settings' },
  );
}

function confirmTwice(sheet) {
  const b = $('#sReset', sheet);
  if (b.dataset.armed) return true;
  b.dataset.armed = '1';
  b.textContent = 'Tap again to erase';
  setTimeout(() => {
    if (b.isConnected) {
      delete b.dataset.armed;
      b.textContent = 'Erase my progress';
    }
  }, 4000);
  return false;
}

function saveBackupFile() {
  const data = JSON.stringify({
    dacapo: 4,
    state: Store.s,
    imports: Library.imports(),
    sketches: Sketches.list(),
  });
  saveFile(`dacapo-backup-${todayKey()}.json`, data);
}

function restoreFile(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const o = JSON.parse(r.result);
      const st = o.state || o;
      if (!st || typeof st !== 'object' || !st.settings) throw new Error('This is not a DaCapo backup.');
      Store.s = migrate(st);
      Store.s.savedAt = Date.now();
      Store.save();
      if (Array.isArray(o.imports)) Library.saveImports(o.imports);
      Sketches.merge(o.sketches);
      Library.cache.clear();
      Store.emit(); // brings the restored items up to date (see app.js)
      Log.ev('restored backup', { v: st.v });
      closeSheet();
      go('practice');
      toast('Progress restored');
    } catch (e) {
      Log.warn('restore failed', String(e.message || e));
      toast(e.message || 'That file could not be read.');
    }
  };
  r.readAsText(file);
}

function aboutSheet() {
  openSheet(
    `<div class="sheethead"><h2 class="h2">About DaCapo</h2>${closeBtn}</div>
    <div class="prose small">
      <p>DaCapo is a free, open-source piano practice companion. It runs in your browser; nothing is sent
      anywhere unless you send a report yourself.</p>
      <p><b>Music.</b> The built-in pieces come from editions typeset by volunteers of the Mutopia Project,
      in the public domain or under Creative Commons Attribution-ShareAlike (3.0 or 4.0); each piece names
      its typesetter and license. DaCapo reads the notes from the LilyPond sources and checks every bar
      against its time signature.</p>
      <p><b>Notation.</b> Glyphs from the Bravura font by Steinberg (SIL Open Font License). Typefaces:
      Bodoni Moda, Instrument Sans and IBM Plex Mono (Google Fonts).</p>
      <p><b>Method.</b> Short daily sessions, one focus at a time across several days, accuracy before
      speed, a metronome ladder that only climbs after clean runs, cold checks on separate days, and spaced
      reviews: the practice methods with the strongest evidence for durable skill.</p>
      <p>DaCapo gives practice guidance, not medical advice. If playing hurts, stop and have a teacher look
      at your technique.</p>
    </div>`,
    null,
    { label: 'About DaCapo' },
  );
}
