/* Play: sit down and play; DaCapo keeps up. It names each chord as you play it (with its numeral, once a
   mood is chosen), says which key you seem to be in, and writes your last notes on the staff. Choose a
   mood (or take the key it heard) and the scale lights up across the whole keyboard, a backing can play,
   and notes outside the scale are noted with whether they resolved. "Try something" gives one idea for
   each hand at a time. Recording and a metronome are at the bottom. Nothing here is scored. */
import { Log } from '../core/log.js';
import { $, $$, clamp, esc, fmtTime, toast, todayKey } from '../core/util.js';
import { Store } from '../core/store.js';
import { AudioEngine, Metro } from '../core/audio.js';
import { Input } from '../core/input.js';
import { bindSegs, closeBtn, closeSheet, go, onUnmount, openSheet, seg, UI } from '../core/ui.js';
import { spellerFor } from '../music/theory.js';
import { kbSVG, staffSVG } from '../music/render.js';
import { dynName, groupSteps, Live } from '../music/analysis.js';
import { Library } from '../music/library.js';
import {
  CHORD_TONES,
  chordInfo,
  MOOD_BY,
  MOOD_FAMILIES,
  moodName,
  MOODS,
  moodSig,
  PCS,
  plainestKey,
  tonicName,
} from '../music/moods.js';
import { guessMood, LH_BY, LH_PATTERNS, patternBar, pc12, RH_TOOLS, toolHow } from '../music/moodtools.js';
import { detectChord } from '../music/harmony.js';
import { Sounds } from '../music/sounds.js';
import { readTake } from '../music/takeread.js';
import { songChords } from '../music/pack.js';
import { prefs } from '../learn/moods.js';
import { createCompanion } from '../learn/moodplay.js';
import { createRecorder, SITTING, Sittings } from '../learn/sitting.js';
import { readBack } from '../learn/journal.js';
import { bindConnect, connectNotice } from './connect.js';
import { bindTakes, takesCardHTML } from './takes.js';
import { bindJournal, bindReadBack, journalHTML, readBackHTML } from './journal.js';

export const playView = (page, params = {}) => {
  const p = prefs();
  const C = createCompanion({ onChange: kind => changed(kind) });
  const ui = Object.assign({ tool: 'free', tryOpen: false }, UI.playState || {});
  UI.playState = ui;
  onUnmount(() => C.destroy());

  page.innerHTML = `
    <h1 class="h1 pagetitle">Play</h1>
    ${
      Store.s.profile.onboarded
        ? ''
        : `<section class="card welcome" id="plyWelcome">
      <span class="eyebrow">Welcome to DaCapo</span>
      <p>Connect your piano and play. DaCapo names each chord, hears which key you are in, and keeps your
        playing correct. <b>Explore</b> finds a mood by the feel you want, with its chords and the circle of
        fifths; <b>Practice</b> is there when you want to work on something; <b>Songs</b> has pieces to learn.</p>
      <button class="btn sm cover" type="button" id="plyHi" style="align-self:flex-start">Got it</button>
    </section>`
    }
    ${connectNotice()}
    <div id="plyReadback"></div>
    <section class="card stack">
      <div class="readout">
        <div class="stack" style="gap:2px;min-width:0">
          <div class="chordname" id="plyChord">–</div>
          <div class="small" id="plyLong">Play a chord or a few notes</div>
        </div>
        <div class="stack" style="align-items:flex-end;gap:4px">
          <span class="tag" id="plyPedal">Pedal up</span>
          <span class="small mono" id="plyVel"></span>
        </div>
      </div>
      <div id="plyMood"></div>
      <div class="kbwrap scrollx" id="plyKbWrap"><div class="kb88" id="plyKb"></div></div>
      <p class="small mono" id="plyOut"></p>
      <div class="row between" id="plySit" hidden><span class="small" id="plySitTime"></span>
        <button class="btn sm ghost" type="button" id="plyDone">Done</button></div>
      <div class="staffwrap" id="plyStaff"></div>
    </section>
    <div id="plyBacking"></div>
    <div id="plyTry"></div>
    <details class="card" id="plyTakesBox"><summary><b>Recordings</b> <span class="small">record a run, listen back</span></summary>
      <div id="plyTakes"></div></details>
    <details class="card" id="plyJournalBox"><summary><b>Journal</b> <span class="small">each sitting, read back</span></summary>
      <div id="plyJournal"></div></details>
    <section class="card row between" id="plyMetro"></section>`;
  bindConnect();
  const hi = $('#plyHi', page);
  if (hi)
    hi.onclick = () => {
      Store.s.profile.onboarded = true;
      Store.save();
      $('#plyWelcome', page).remove();
    };

  /* ---------- the mood you are in ---------- */
  const setMood = (mood, pc) => {
    C.setMood(mood, pc);
    if (mood) Object.assign(p, { mood, pc });
    Store.save();
    paintMood();
    paintBacking();
    paintTry();
    paintKb();
  };
  const paintMood = () => {
    const box = $('#plyMood', page);
    if (C.st.mood) {
      box.innerHTML = `<div class="row between">
          <span><span class="eyebrow">In</span> <b>${esc(moodName(C.st.mood, C.st.pc))}</b>
            <span class="small">${esc(MOOD_BY[C.st.mood].feel)}</span></span>
          <span class="row" style="gap:6px">
            <button class="btn sm ghost" type="button" id="plyAbout">About it</button>
            <button class="btn sm" type="button" id="plyChoose">Change</button>
            <button class="btn sm ghost" type="button" id="plyClear" aria-label="Stop following a mood">×</button>
          </span>
        </div>`;
      $('#plyAbout', box).onclick = () => go('explore', { mood: C.st.mood, pc: C.st.pc });
      $('#plyClear', box).onclick = () => setMood(null);
    } else {
      box.innerHTML = `<div class="row between">
          <span class="small" id="plyKey">Play for a little while and I will work out the key.</span>
          <span class="row" style="gap:6px">
            <button class="btn sm ghost" type="button" id="plyUse" hidden></button>
            <button class="btn sm" type="button" id="plyChoose">Choose a mood</button>
          </span>
        </div>`;
      paintKey();
    }
    $('#plyChoose', box).onclick = chooseSheet;
  };
  // the key it hears, while no mood is chosen; one tap takes it
  let keyNow = null;
  const paintKey = () => {
    keyNow = guessMood(Live.hist.slice(-80));
    const e = $('#plyKey', page);
    if (!e) return;
    const use = $('#plyUse', page);
    if (!keyNow) {
      e.textContent = 'Play for a little while and I will work out the key.';
      use.hidden = true;
      return;
    }
    const { mood, pc, alt, sure } = keyNow;
    const how = sure > 0.5 ? 'Sounds like' : sure > 0.2 ? 'Probably' : 'Possibly';
    const or = sure <= 0.5 ? ` (or ${moodName(alt.mood, alt.pc)})` : '';
    e.textContent = `${how} ${moodName(mood, pc)}${or}.`;
    use.hidden = false;
    use.textContent = 'Use it';
    use.onclick = () => setMood(mood, pc);
  };

  function chooseSheet() {
    let mood = C.st.mood || p.mood || 'natural';
    const body = () => `
      <div class="stack" style="gap:10px">${MOOD_FAMILIES.map(
        f => `<div><span class="eyebrow">${esc(f.n)}</span>
          <div class="chips">${MOODS.filter(m => m.fam === f.id)
            .map(
              m =>
                `<button type="button" class="chip" data-m="${m.id}" aria-pressed="${m.id === mood}">${esc(m.n)}</button>`,
            )
            .join('')}</div></div>`,
      ).join('')}</div>
      <p class="small">${esc(MOOD_BY[mood].feel)}</p>
      <span class="eyebrow">Key</span>
      <div class="chips">${PCS.map(
        x => `<button type="button" class="chip" data-k="${x}">${esc(tonicName(mood, x))}</button>`,
      ).join('')}</div>
      <p class="small">Not sure which? <button type="button" class="linkbtn small" id="chFeel">Find one by feel</button></p>`;
    openSheet(
      `<div class="sheethead"><h2 class="h2">Choose a mood</h2>${closeBtn}</div><div id="chBody" class="stack"></div>`,
      sheet => {
        const paint = () => {
          $('#chBody', sheet).innerHTML = body();
          $$('[data-m]', sheet).forEach(b => {
            b.onclick = () => {
              mood = b.dataset.m;
              paint();
            };
          });
          $$('[data-k]', sheet).forEach(b => {
            b.onclick = () => {
              closeSheet();
              setMood(mood, +b.dataset.k);
            };
          });
          $('#chFeel', sheet).onclick = () => {
            closeSheet();
            go('explore', { tab: 'feel' });
          };
        };
        paint();
      },
      { label: 'Choose a mood' },
    );
  }

  /* ---------- the keyboard: what you hold, the scale, the idea's notes ---------- */
  const kb = () => $('#plyKb svg', page);
  const paintKb = () => {
    const marks = {};
    const K = C.key;
    if (K) {
      const c = C.chordAt(performance.now());
      const tones = new Set(CHORD_TONES[c.type].map(x => pc12(c.rootPc + x)));
      for (let m = 21; m <= 108; m++) {
        if (!K.scalePcs.has(m % 12)) continue;
        const special =
          ui.tryOpen &&
          ((ui.tool === 'color' && m % 12 === K.color.pc) || (ui.tool === 'targets' && tones.has(m % 12)));
        marks[m] = { cls: special ? 'color' : 'tone' };
      }
      if (ui.tryOpen)
        patternBar(C.st.pattern, C.lhVoiced(), c.i, K.tPc).forEach(g =>
          g.ms.forEach((m, k) => (marks[m] = { cls: 'lh', f: g.f[k] })),
        );
    }
    $('#plyKb', page).innerHTML = kbSVG({ from: 21, to: 108, h: 120, marks });
    paintHeld();
  };
  const paintHeld = () => {
    const svg = kb();
    if (!svg) return;
    svg.querySelectorAll('.held,.sus').forEach(e => e.classList.remove('held', 'sus'));
    Live.sustained.forEach(m => {
      const e = svg.querySelector(`[data-m="${m}"]`);
      if (e) e.classList.add('sus');
    });
    Input.held.forEach((_, m) => {
      const e = svg.querySelector(`[data-m="${m}"]`);
      if (e) {
        e.classList.remove('sus');
        e.classList.add('held');
      }
    });
  };

  /* ---------- the readout ---------- */
  let lastChord = null;
  const sig = () =>
    C.key ? moodSig(C.st.mood, C.st.pc) : keyNow && keyNow.conf > 0.04 ? keyNow.best.sig : 0;
  const paintReadout = () => {
    $('#plyPedal', page).textContent = Input.pedal ? 'Pedal down' : 'Pedal up';
    $('#plyPedal', page).className = 'tag ' + (Input.pedal ? 'lh' : '');
    const sounding = [...new Set([...Input.held.keys(), ...Live.sustained])];
    if (sounding.length >= 2) lastChord = detectChord(sounding, spellerFor(sig()));
    $('#plyChord', page).textContent = lastChord ? lastChord.name : '–';
    let long = lastChord ? lastChord.long : 'Play a chord or a few notes';
    if (lastChord && lastChord.type && C.key) {
      const num = chordInfo(C.st.mood, C.st.pc, [pc12(lastChord.root - C.key.tPc), lastChord.type]).num;
      long = `${num} · ${long}`;
    }
    $('#plyLong', page).textContent = long;
    $('#plyStaff', page).innerHTML = recentStaff();
  };
  // your last notes on a grand staff, the newest highlighted
  const recentStaff = () => {
    const steps = groupSteps(Live.hist.slice(-40)).slice(-14);
    if (!steps.length) return '';
    const sp = spellerFor(sig());
    const items = steps.map((g, k) => ({
      notes: g.ms.map(m => ({ n: sp(m), st: m >= 60 ? 't' : 'b', cls: k === steps.length - 1 ? 'cur' : '' })),
    }));
    const svg = staffSVG({ clef: 'grand', sig: sig(), items, spacing: 30, minW: 320, bottom: 40 }).svg;
    return `<div style="max-width:720px;margin:0 auto">${svg}</div>`;
  };
  const paintOut = () => {
    const S = C.stats;
    const e = $('#plyOut', page);
    if (!C.key || !S.notes) {
      e.textContent = '';
      return;
    }
    e.textContent =
      `${S.notes} notes · ${fmtTime(S.ms / 1000)}` +
      (S.outside
        ? ` · ${S.outside} outside the scale, ${S.resolved} resolved by a step`
        : ' · all in the scale');
  };

  /* ---------- backing ---------- */
  const paintBacking = () => {
    const box = $('#plyBacking', page);
    if (!C.key) {
      box.innerHTML = '';
      return;
    }
    const st = C.st;
    const M = C.key.M;
    const V = C.voiced();
    const c = C.chordAt(performance.now());
    if (st.song && st.backing === 'chords') {
      box.innerHTML = `<section class="card stack">
        <div class="row between"><span><span class="eyebrow">Over the chords of</span> <b>${esc(st.song.t)}</b></span>
          <button class="btn sm ghost" type="button" id="plySongOff">Stop</button></div>
        <div class="row between">
          <div class="improv-chords" id="plyChords">${songChips(c.i)}</div>
          <span class="row" style="gap:4px"><span class="small mono">♩ ${st.bpm}</span>
            <button class="btn sm ghost" type="button" data-bbpm="-6" aria-label="Slower">−</button>
            <button class="btn sm ghost" type="button" data-bbpm="6" aria-label="Faster">+</button></span>
        </div>
        <p class="small">The tune's chords loop, with its numerals in ${esc(moodName(st.mood, st.pc))}.
          Play the tune over them, or your own line.</p>
        ${Sounds.on() ? '' : '<p class="small">Sound is off in Settings.</p>'}
      </section>`;
      $('#plySongOff', box).onclick = () => {
        C.setProg(0);
        C.setBacking('off');
        paintBacking();
      };
      $$('[data-bbpm]', box).forEach(b => {
        b.onclick = () => {
          C.setBpm(st.bpm + +b.dataset.bbpm);
          paintBacking();
        };
      });
      return;
    }
    box.innerHTML = `<section class="card stack">
      <div class="row between"><span class="eyebrow">Backing</span>
        ${Sounds.on() ? '' : '<span class="small">Sound is off in Settings.</span>'}</div>
      ${seg(
        'plyBack',
        [
          ['off', 'Off'],
          ['drone', 'Drone'],
          ['chords', 'Chords'],
        ],
        st.backing,
        'sm',
      )}
      ${
        st.backing === 'chords'
          ? `${seg(
              'plyProg',
              M.progs.map((pr, k) => [
                String(k),
                pr.chords.map(x => chordInfo(st.mood, st.pc, x).num).join(' – '),
              ]),
              String(st.prog),
              'sm wrap',
            )}
            <p class="small">${esc(M.progs[st.prog].why)}.</p>
            <div class="row between">
              <div class="improv-chords" id="plyChords">${V.map((v, k) => `<span class="chip" aria-pressed="${k === c.i}">${esc(v.info.name)}</span>`).join('')}</div>
              <span class="row" style="gap:4px"><span class="small mono">♩ ${st.bpm}</span>
                <button class="btn sm ghost" type="button" data-bbpm="-6" aria-label="Slower">−</button>
                <button class="btn sm ghost" type="button" data-bbpm="6" aria-label="Faster">+</button></span>
            </div>`
          : st.backing === 'drone'
            ? '<p class="small">Home and its fifth, held: anything in the scale fits.</p>'
            : ''
      }
    </section>`;
    bindSegs(box, {
      plyBack: v => {
        C.setBacking(v);
        paintBacking();
      },
      plyProg: v => {
        C.setProg(+v);
        paintBacking();
      },
    });
    $$('[data-bbpm]', box).forEach(b => {
      b.onclick = () => {
        C.setBpm(st.bpm + +b.dataset.bbpm);
        paintBacking();
      };
    });
  };
  // a tune's chord now and the three after it, with their numerals
  const songChips = i => {
    const ch = C.st.song.chords;
    return [0, 1, 2, 3]
      .map(k => {
        const [s, type, , , name] = ch[(i + k) % ch.length];
        const num = chordInfo(C.st.mood, C.st.pc, [s, type]).num;
        return `<span class="chip" aria-pressed="${k === 0}">${esc(name)} <span class="small">${esc(num)}</span></span>`;
      })
      .join('');
  };
  const paintChordChips = () => {
    const c = C.chordAt(performance.now());
    if (c && C.st.song) {
      const box = $('#plyChords', page);
      if (box) box.innerHTML = songChips(c.i);
    } else if (c)
      $$('#plyChords .chip', page).forEach((el, k) => el.setAttribute('aria-pressed', String(k === c.i)));
  };

  /* ---------- try something: one idea for each hand ---------- */
  const paintTry = () => {
    const box = $('#plyTry', page);
    if (!C.key) {
      box.innerHTML = '';
      return;
    }
    if (!ui.tryOpen) {
      box.innerHTML = `<section class="card pathcard"><div class="grow"><b>Try something</b>
        <span class="small">An idea for the right hand and a pattern for the left, one at a time.</span></div>
        <button class="btn sm" type="button" id="plyTryGo">Show me</button></section>`;
      $('#plyTryGo', box).onclick = () => {
        ui.tryOpen = true;
        paintTry();
        paintKb();
      };
      return;
    }
    const tool = RH_TOOLS.find(t => t.id === ui.tool) || RH_TOOLS[0];
    const pat = LH_BY[C.st.pattern];
    const opt = (list, sel) =>
      list
        .map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.n)}</option>`)
        .join('');
    box.innerHTML = `<section class="card stack">
      <div class="row between"><b>Try something</b>
        <button class="btn sm ghost" type="button" id="plyTryHide">Hide</button></div>
      <div class="stack" style="gap:4px">
        <div class="row between"><span class="eyebrow">Right hand</span>
          <span class="row" style="gap:6px"><select class="input sm" id="plyTool" aria-label="Right-hand idea">${opt(RH_TOOLS, tool.id)}</select>
          <button class="btn sm ghost" type="button" id="plyToolNext" aria-label="Another idea">↻</button></span></div>
        <p class="small">${esc(toolHow(tool.id, C.st.mood, C.st.pc))}</p>
        ${tool.id === 'call' ? '<button class="btn sm" type="button" id="plyCall" style="align-self:flex-start">Play a call</button>' : ''}
        <p class="small mono" id="plyRh"></p>
      </div>
      <div class="stack" style="gap:4px">
        <div class="row between"><span class="eyebrow">Left hand</span>
          <span class="row" style="gap:6px"><select class="input sm" id="plyPat" aria-label="Left-hand pattern">${opt(LH_PATTERNS, pat.id)}</select>
          <button class="btn sm ghost" type="button" id="plyPatNext" aria-label="Another pattern">↻</button></span></div>
        <div class="row"><p class="small grow">${esc(pat.how)} Its notes are marked on the keyboard.</p>
          <button class="btn sm ghost" type="button" id="plyHearLh">Hear it</button></div>
        <p class="small mono" id="plyLh"></p>
      </div>
    </section>`;
    $('#plyTryHide', box).onclick = () => {
      ui.tryOpen = false;
      paintTry();
      paintKb();
    };
    const setTool = id => {
      ui.tool = id;
      // landing on chord tones needs chords to land on
      if (id === 'targets' && C.st.backing !== 'chords') {
        C.setBacking('chords');
        paintBacking();
      }
      paintTry();
      paintKb();
    };
    const setPat = id => {
      C.setPattern(id);
      paintTry();
      paintKb();
    };
    $('#plyTool', box).onchange = e => setTool(e.target.value);
    $('#plyPat', box).onchange = e => setPat(e.target.value);
    $('#plyToolNext', box).onclick = () =>
      setTool(RH_TOOLS[(RH_TOOLS.indexOf(tool) + 1) % RH_TOOLS.length].id);
    $('#plyPatNext', box).onclick = () =>
      setPat(LH_PATTERNS[(LH_PATTERNS.indexOf(pat) + 1) % LH_PATTERNS.length].id);
    $('#plyHearLh', box).onclick = () => C.hearPattern();
    const call = $('#plyCall', box);
    if (call)
      call.onclick = () => {
        C.playCall();
        $('#plyRh', page).textContent = 'Your turn: answer when the call ends.';
      };
    paintFeedback();
  };
  const paintFeedback = () => {
    const rh = $('#plyRh', page);
    const lhEl = $('#plyLh', page);
    if (!rh || !C.key) return;
    const S = C.stats;
    const r = S.rh;
    const lh = S.lh;
    const K = C.key;
    if (ui.tool === 'call') {
      const a = C.st.lastAnswer;
      if (C.st.call) return;
      rh.textContent = a
        ? !a.n
          ? 'No answer heard. Play a call again when you are ready.'
          : `Answered with ${a.n} note${a.n > 1 ? 's' : ''}${a.home ? ', home at the end. Settled.' : '; it ended away from home. Try ending on the home note.'}`
        : r.calls
          ? `${r.answers} of ${r.calls} calls answered · ${r.home} ended home`
          : '';
    } else
      rh.textContent = {
        free: '',
        color: r.color
          ? `${K.color.name} ${r.color} time${r.color > 1 ? 's' : ''}, resolved ${r.resolved}`
          : `${K.color.name} not played yet`,
        targets:
          C.st.backing !== 'chords'
            ? 'Needs the chords backing.'
            : r.strong
              ? `On beats 1 and 3: ${r.onChord} of ${r.strong} notes were chord tones`
              : 'Nothing on beats 1 and 3 yet',
        motif:
          r.sequences + r.repeats ? `${r.sequences} sequences · ${r.repeats} repeats` : 'No motif back yet',
        dyads: r.thirds + r.sixths ? `${r.thirds} thirds · ${r.sixths} sixths` : 'No thirds or sixths yet',
      }[ui.tool];
    lhEl.textContent = lh.n ? `${Math.round((lh.fit / lh.n) * 100)}% on the pattern · ${lhWord(lh)}` : '';
  };
  const lhWord = lh => {
    const kinds = ['chords', 'octaves', 'rootFifth', 'broken', 'pedal', 'passing'];
    const top = kinds.reduce((a, k) => (lh[k] > lh[a] ? k : a), kinds[0]);
    return lh[top] < lh.n * 0.5
      ? 'a mix'
      : {
          chords: 'mostly chords',
          octaves: 'mostly octaves',
          rootFifth: 'mostly roots and fifths',
          broken: 'moving through the chords',
          pedal: 'holding home under the chords',
          passing: 'walking between chord tones',
        }[top];
  };

  /* ---------- recordings and the metronome ---------- */
  $('#plyTakes', page).innerHTML = takesCardHTML();
  const offTakes = bindTakes($('#plyTakes', page));
  if (typeof offTakes === 'function') onUnmount(offTakes);
  const paintMetro = () => {
    const box = $('#plyMetro', page);
    box.innerHTML = `<span><b>Metronome</b> <span class="small mono">♩ ${Metro.bpm || 72}</span></span>
      <span class="row" style="gap:4px">
        <button class="btn sm ghost" type="button" data-mbpm="-4" aria-label="Slower">−</button>
        <button class="btn sm ghost" type="button" data-mbpm="4" aria-label="Faster">+</button>
        <button class="btn sm ghost" type="button" id="plyTap">Tap</button>
        <button class="btn sm ${Metro.running ? 'cover' : ''}" type="button" id="plyMetroGo">${Metro.running ? 'Stop' : 'Start'}</button>
      </span>`;
    const run = bpm => Metro.start({ bpm, beats: Metro.beats || 4, sub: 1 });
    $$('[data-mbpm]', box).forEach(b => {
      b.onclick = () => {
        const bpm = clamp((Metro.bpm || 72) + +b.dataset.mbpm, 30, 220);
        if (Metro.running) run(bpm);
        else Metro.bpm = bpm;
        paintMetro();
      };
    });
    $('#plyTap', box).onclick = () => {
      Metro.tap();
      if (Metro.running) run(Metro.bpm);
      paintMetro();
    };
    $('#plyMetroGo', box).onclick = () => {
      AudioEngine.ensure();
      if (Metro.running) Metro.stop();
      else run(Metro.bpm || 72);
      paintMetro();
    };
  };
  paintMetro();
  onUnmount(() => Metro.stop());

  /* ---------- keeping up ---------- */
  let raf = 0;
  let keyT = 0;
  const sched = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      paintHeld();
      paintReadout();
    });
  };
  const o1 = Input.on(ev => {
    sched();
    if (ev.src === 'midi')
      $('#plyVel', page).textContent = `${dynName(ev.vel)} · ${Math.round(ev.vel * 127)}`;
    if (!C.key) {
      clearTimeout(keyT);
      keyT = setTimeout(paintKey, 600);
    }
  });
  const o2 = Input.onOff(sched);
  onUnmount(() => {
    o1();
    o2();
    cancelAnimationFrame(raf);
    clearTimeout(keyT);
  });
  /* ---------- a sitting: from your first note until you stop (90 s quiet, Done, or leaving Play) ---------- */
  let rec = createRecorder();
  const endSitting = reason => {
    const T = C.tally;
    const ev = rec ? rec.stop() : null;
    rec = reason === 'leave' ? null : createRecorder();
    C.newSitting();
    $('#plySit', page).hidden = true;
    // a few notes in passing are not a sitting
    if (!ev || T.notes < SITTING.minNotes || T.ms < SITTING.minMs) return;
    const { notes } = readTake(ev);
    const id = 's' + Date.now().toString(36);
    const entry = readBack(T, {
      guess: guessMood(notes.map(n => ({ m: n.m, t: n.t, d: n.dur }))),
      day: todayKey(),
      at: Date.now(),
      id,
    });
    Store.s.journal.push(entry);
    Store.save();
    Sittings.save(id, ev);
    Log.ev('sitting', { min: entry.min, notes: entry.notes, mood: entry.mood, reason });
    if (reason === 'leave') {
      toast('Your sitting is in the journal');
      return;
    }
    showReadBack(entry);
    paintJournal();
  };
  const showReadBack = entry => {
    const box = $('#plyReadback', page);
    box.innerHTML = `<section class="card stack readback">
      <div class="row between"><h2 class="h2">That sitting</h2>
        <button class="btn sm ghost" type="button" id="plyRbClose" aria-label="Close">×</button></div>
      ${readBackHTML(entry)}</section>`;
    bindReadBack(box, entry, { onTry: (mood, pc) => setMood(mood, pc) });
    $('#plyRbClose', box).onclick = () => (box.innerHTML = '');
    box.scrollIntoView({ block: 'nearest' });
  };
  const paintJournal = () => {
    const box = $('#plyJournal', page);
    box.innerHTML = journalHTML();
    bindJournal(box, { onTry: (mood, pc) => setMood(mood, pc) });
  };
  paintJournal();
  $('#plyDone', page).onclick = () => endSitting('done');
  const paintSit = () => {
    const T = C.tally;
    if (!T.notes) return;
    if (C.quiet > SITTING.quiet) {
      endSitting('quiet');
      return;
    }
    $('#plySit', page).hidden = false;
    $('#plySitTime', page).textContent = `This sitting: ${fmtTime(T.ms / 1000)} · ${T.notes} notes`;
  };
  onUnmount(() => endSitting('leave'));

  function changed(kind) {
    if (kind === 'chord') {
      paintChordChips();
      if (ui.tryOpen) paintKb();
    } else if (kind === 'answer' || kind === 'tick') {
      paintOut();
      paintFeedback();
      if (kind === 'tick') paintSit();
    }
  }

  // a mood to start in: from Explore or Practice ("Noodle in this"), else none until you choose one
  const start = params.mood && MOOD_BY[params.mood] ? params.mood : null;
  setMood(start, start ? (Number.isInteger(+params.pc) ? +params.pc % 12 : plainestKey(start)) : 0);
  // or a tune's chords (Songs: "Noodle over its chords")
  const song = params.song && Library.get(params.song);
  if (song && song.syms && song.mood) {
    C.setSong({ ...song, chords: songChords(song.syms, Library.bars(song.id)) });
    Object.assign(p, { mood: song.mood, pc: song.pc });
    paintMood();
    paintBacking();
    paintTry();
    paintKb();
  }
  // keep the middle of the keyboard in view
  requestAnimationFrame(() => {
    const wrap = $('#plyKbWrap', page);
    const k = kb() && kb().querySelector('[data-m="60"]');
    if (k && wrap && wrap.scrollWidth > wrap.clientWidth)
      wrap.scrollLeft =
        k.getBoundingClientRect().left -
        wrap.getBoundingClientRect().left -
        wrap.clientWidth / 2 +
        wrap.scrollLeft;
  });
  paintReadout();
  Log.ev('play open', { mood: start });
};
