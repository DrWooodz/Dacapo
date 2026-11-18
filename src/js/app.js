/* The entry point: wires the parts together and starts the app. */
import { APP_VERSION, BUILD, IN_CLAUDE } from './env.js';
import { Log } from './core/log.js';
import { $, $$, todayKey } from './core/util.js';
import { Activity, Store } from './core/store.js';
import { AudioEngine, Metro } from './core/audio.js';
import { Input, MidiOut } from './core/input.js';
import { closeSheet, go, hasView, registerViews, UI } from './core/ui.js';
import { startLive } from './music/analysis.js';
import { Library } from './music/library.js';
import { Thru } from './music/thru.js';
import { Sounds } from './music/sounds.js';
import { Player } from './learn/player.js';
import { addDays, ensureItem, itemDef, itemState, planFor, refreshItems } from './learn/pieces.js';
import { SITTING } from './learn/sitting.js';
import { reportSheet } from './views/report.js';
import { playView } from './views/play.js';
import { exploreView } from './views/explore.js';
import { practiceView } from './views/practice.js';
import { songsView } from './views/songs.js';
import { settingsSheet } from './views/settings.js';

/* ---------- boot ---------- */
// what a problem report says about the app, beyond the browser itself
function describeApp() {
  const s = Store.s;
  let audio = null;
  try {
    const c = AudioEngine.ctx;
    audio = c
      ? { state: c.state, sr: c.sampleRate, out: c.outputLatency || 0, base: c.baseLatency || 0 }
      : null;
  } catch (e) {}
  return {
    input: {
      mode: Input.mode,
      live: Input.live,
      devices: Input.midiNames,
      status: Input.status,
      err: Input.lastErr,
    },
    midiOut: { port: MidiOut.port ? MidiOut.port.name : null, on: !!s.settings.midiOut },
    audio,
    view: UI.view,
  };
}

function describeLearning() {
  const s = Store.s;
  const items = Object.entries(s.items || {}).map(([id, it]) =>
    [
      `${id} ${it.stage}${it.phase ? '/' + it.phase : ''}`,
      `bpm${it.bpm || '-'}${it.target ? '→' + it.target : ''}`,
      `last${it.last || '-'}`,
    ].join(' '),
  );
  return {
    v: s.v,
    savedAt: s.savedAt,
    pieces: s.piece && s.piece.working,
    moods: Object.keys(s.moods.keys).length,
    prefs: s.moods.prefs,
    items: items.slice(0, 80),
    days: Object.keys(s.days || {}).length,
  };
}

function boot() {
  try {
    Log.setContext({ env: describeApp, state: describeLearning, openReport: () => reportSheet() });
    registerViews({ play: playView, explore: exploreView, practice: practiceView, songs: songsView });
    startLive();
    Thru.listen(); // your piano through this device, when it is switched on in Settings
    Store.loadLocal();
    refreshItems();
    Log.ev('boot', {
      version: APP_VERSION,
      build: BUILD,
      inClaude: IN_CLAUDE,
      input: Store.s.settings.input,
      onboarded: Store.s.profile.onboarded,
    });
    $$('#tabs [data-view]').forEach(b => (b.onclick = () => go(b.dataset.view)));
    $('#inputChip').onclick = settingsSheet;
    $('#settingsBtn').onclick = settingsSheet;
    Input.mode = Store.s.settings.input || 'touch';
    if (Input.mode === 'midi') Input.setMode('midi');
    else if (Input.mode === 'mic') {
      Input.status = 'Microphone is off. Turn it on in Settings.';
      Input.live = false;
    }
    Input.paint();
    // a reload comes back to the same screen; a fresh start to Play
    let start = 'play';
    try {
      start = sessionStorage.getItem('dacapo.view') || 'play';
    } catch (e) {}
    const hv = (location.hash || '').slice(1);
    if (hasView(hv)) start = hv;
    go(start);
    // a newer state (from your Claude account, or a restored backup): redraw from it, so no screen keeps
    // working on objects from the old one
    Store.on(kind => {
      if (kind !== 'state') return;
      refreshItems();
      go(UI.view, UI.params);
    });
    Store.connect();
  } catch (e) {
    Log.err(e, 'boot');
    const p = document.getElementById('page');
    if (p)
      p.innerHTML =
        '<div class="card"><h2 class="h2">DaCapo could not start</h2><p class="small">The problem was logged. Reload the page; if it happens again, Settings → Report a problem includes the log.</p></div>';
  }
}

// A handle on the app's parts for the browser console and the end-to-end tests (tests/).
window.DaCapo = {
  // parts
  Store,
  Log,
  Input,
  Library,
  Player,
  Sounds,
  AudioEngine,
  Metro,
  Activity,
  UI,
  // navigation and panels
  go,
  closeSheet,
  settingsSheet,
  reportSheet,
  // pieces
  todayKey,
  addDays,
  itemDef,
  itemState,
  ensureItem,
  planFor,
  // Play's sittings
  SITTING,
};

boot();
