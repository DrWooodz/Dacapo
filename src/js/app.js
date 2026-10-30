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
import { Transport } from './music/transport.js';
import { Sounds } from './music/sounds.js';
import { addDays, ensureItem, itemState, planFor, refreshItems } from './learn/curriculum.js';
import { Player } from './learn/player.js';
import { chooseFocus, currentFocus, rankAreas, skillLevel, snapshotSkills } from './learn/skills.js';
import { Quiz } from './learn/quiz.js';
import { itemDef } from './learn/areas.js';
import { skillStatus } from './learn/status.js';
import {
  currentSession,
  pieceSession,
  rebuildSession,
  setPieceDaily,
  workOnPiece,
} from './learn/sessions.js';
import { applyPlacement } from './learn/assess.js';
import { libraryView, pieceSheet } from './views/library.js';
import { reportSheet } from './views/report.js';
import { practiceView } from './views/practice.js';
import { skillsView } from './views/skills.js';
import { freeView } from './views/free.js';
import { assessView } from './views/assess.js';
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
      `pass${(it.passes || []).length}`,
      `last${it.last || '-'}`,
    ].join(' '),
  );
  return {
    v: s.v,
    savedAt: s.savedAt,
    session: s.session,
    pieces: s.piece && s.piece.working,
    focus: s.focus,
    prefs: s.profile,
    items: items.slice(0, 80),
    days: Object.keys(s.days || {}).length,
  };
}

function boot() {
  try {
    Log.setContext({ env: describeApp, state: describeLearning, openReport: () => reportSheet() });
    registerViews({
      practice: practiceView,
      skills: skillsView,
      library: libraryView,
      free: freeView,
      assess: assessView,
    });
    startLive();
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
    $('#reportBtn').onclick = () => reportSheet();
    Input.mode = Store.s.settings.input || 'touch';
    if (Input.mode === 'midi') Input.setMode('midi');
    else if (Input.mode === 'mic') {
      Input.status = 'Microphone is off. Turn it on in Settings.';
      Input.live = false;
    }
    Input.paint();
    snapshotSkills();
    let start = 'practice';
    try {
      start = sessionStorage.getItem('dacapo.view') || 'practice';
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
    // coming back to the app on a new day: note where the skills stand, and rebuild the session
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !Store.s.session || Store.s.session.day === todayKey())
        return;
      snapshotSkills();
      if (UI.view === 'practice') go('practice');
    });
  } catch (e) {
    Log.err(e, 'boot');
    const p = document.getElementById('page');
    if (p)
      p.innerHTML =
        '<div class="card"><h2 class="h2">DaCapo could not start</h2><p class="small">The problem was logged. Use the flag button at the top to report it.</p></div>';
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
  Quiz,
  Transport,
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
  pieceSheet,
  // the curriculum
  todayKey,
  addDays,
  itemDef,
  itemState,
  ensureItem,
  planFor,
  skillStatus,
  currentSession,
  rebuildSession,
  workOnPiece,
  setPieceDaily,
  pieceSession,
  // skills and focus
  skillLevel,
  rankAreas,
  currentFocus,
  chooseFocus,
  applyPlacement,
};

boot();
