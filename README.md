# DaCapo

**A piano practice companion that listens.** Open it, and today's session is already waiting: a focus for the week, a few minutes on the pieces you are working on, and a quick cold check of what you learned before. Play on your digital piano over MIDI and DaCapo follows note by note, moves on by itself, and decides what comes next, today and over the coming months. You keep your hands on the keys.

It is built for classical repertoire (Satie, Chopin, Debussy, Rachmaninoff) and for improvisation, and it ships with real scores of their music that you can learn section by section.

*Da capo* is the marking on a score that means "from the beginning." The name is the app's attitude: however far you get, you stay a beginner at heart and keep coming back to the top.

It runs as a single web page. There is no account, no server and no tracking. Everything runs in your browser and your progress stays on your device.

---

## How it teaches

DaCapo aims at **unconscious competence**: the notes and movements run by themselves, so your attention is free for the music. Every part of the app follows the practice methods with the strongest evidence behind them.

- **One focus a week, a little of everything.** DaCapo suggests a focus for the week (an area that is behind, matters to you, or has waited) and you keep it or choose another; your choices teach the suggestions. Most of each session goes to the focus. Pieces you mark for daily practice come up every day, and the other areas get a few minutes of upkeep so nothing fades.
- **Carried over several days.** A drill comes back session after session until it is integrated. Motor memory consolidates between sessions, during sleep, so a few focused minutes a day beat one long push.
- **Accuracy first, then fluency.** *Learning* happens in wait mode: the app waits for the right notes, hands separately where that helps, and key hints fade after a clean rep. Pauses are fine there. Note reading and theory then build *speed*, with a time goal per note or per answer that tightens as you reach it. Scales and pieces build *tempo* with the metronome: two clean runs out of three raise it about 5%, and wrong notes lower it 10%. Uneven timing alone never lowers it, and if you play steadily faster than the click, that becomes your tempo.
- **When something stalls, the approach changes.** Many runs without progress lead back to wait mode with the keys shown, one hand alone, an easier goal for the day, or (in theory) the explanation again with the answer shown sooner, instead of the same thing again.
- **Honest tests.** At the goal an item moves to *Checking*: it must be right cold (the first thing you play that day), without hints, on two different days. Only then is it *integrated*.
- **Spaced reviews.** Integrated items come back for one cold run after 3, 7, 15, 30 and 60 days, then every 120 days. If one has slipped, it goes back a step.
- **A practice day runs from 4 am to 4 am,** so a late session past midnight stays one session with one honest cold check.
- **Only real playing counts.** Progress comes from MIDI, or from the microphone for single notes. The on-screen keys are for trying things out.

## Areas and skills

| Area | What it covers |
|---|---|
| **Reading** | Treble and bass, each in its own units: from middle C outward, both staves, ledger lines, key signatures, accidentals and intervals. Every line is new, so you read instead of memorizing. The weaker clef comes first. |
| **Sight-reading** | Once both clefs read fluently up to an octave: reading in time, rhythms (tap any key) up to sixteenths and triplets, hands together, chords, then two-bar excerpts of real music you are not learning. |
| **Technique** | Major and harmonic-minor scales and arpeggios in all keys, two octaves, hands together, with standard fingering; the keys of your pieces come first. From MIDI timing and loudness DaCapo notices a lagging hand, late thumb crossings and accented thumbs, and offers short lessons on posture, hands and arms. |
| **Theory** | 17 units in three tiers, answered by playing: the keyboard, steps, scales, intervals and chords; chords of a key, key signatures, inversions, sevenths and cadences; then ii–V–I, minor keys, secondary dominants, voice leading, modes and other scales. Each unit says where it helps at the piano. |
| **Pieces** | The pieces you choose to work on (up to four), each split into sections of about four bars. Sections are learned hands separately, then together, then brought to tempo starting one bar early so the joins get practiced too. Mark a piece for daily practice, or start a longer piece session when you have time. |
| **Improvisation** | Five style studies built on the masters' harmony: Satie's Gymnopédie colors, a Chopin nocturne left hand, Debussy's whole-tone haze, black-key pentatonic, and Rachmaninoff bells. First the left-hand pattern, then improvising over a backing; the app measures how often your strong-beat notes land on chord tones. |

The **Skills** screen shows where you stand in each, on a scale of 0 to 3 (Foundations, Developing, Fluent), measured from what you play, plus your steadiness with the metronome. An optional **8-minute placement check** (reading in each clef, a scale, a few theory questions and a steady beat) sets the starting points. Any area can be switched off in Settings.

## Free play

- **Listen:** play anything; DaCapo names the chords, guesses the key, and writes your last notes on the staff.
- **Jam:** a loop station. Pick a beat or program your own on the drum grid, press Record and play a layer on the piano (or the screen keys, or drum pads), then record another on top: bass, e-piano, pad or piano, up to eight layers, with snap-to-grid and swing that can be changed afterwards. Sketches are kept on the device and save as a MIDI file for any music program.
- **Echo:** an ear game. DaCapo plays a short phrase, you play it back; three right in a row and the phrases grow.
- **Improvise**, **Record** yourself with playback, and a **Metronome**.

## The library

There are 29 pieces with every note, from early-intermediate to advanced:

- **Satie:** the three Gymnopédies, three Gnossiennes, and the three *Enfantillages pittoresques*
- **Chopin:** Preludes Op. 28 Nos. 2, 4, 6, 7, 9, 15 and 20, the Nocturnes Op. 9 No. 2 and Op. 72 No. 1, the Waltzes Op. 64 No. 1 and Op. 69 No. 2, and the Fantaisie-Impromptu
- **Debussy:** both Arabesques, *Clair de lune*, *Danseuses de Delphes* and *Voiles*
- **Rachmaninoff:** the Preludes Op. 3 No. 2, Op. 23 No. 4 and Op. 23 No. 5

The scores come from editions typeset by volunteers of the [Mutopia Project](https://www.mutopiaproject.org). `tools/lily.py` reads the notes straight from their LilyPond sources, without running LilyPond. It covers variables, relative pitch, chords, ties, tuplets, grace notes, unfolded repeats, voices, staff changes and tags. `tools/build_library.py` then checks every piece: each bar check in the source must land on a bar line, and every note must lie within the piano's range. The notation in the app is simplified: horizontal spacing shows timing, and open note heads mark half and whole notes. Each piece links to its full score on IMSLP and to recordings.

You can also **import your own MIDI files.** Files exported from notation software work best.

## Input

| | What it hears | Notes |
|---|---|---|
| **MIDI (USB)** | Everything: chords, timing to the millisecond, loudness, pedal | Chrome or Edge on Android or a computer. Use the piano's square "USB to Host" port; on a phone, a USB-B to USB-C data cable. iPhone and iPad browsers have no Web MIDI. |
| **Microphone** | One note at a time | Any piano. Chords and hands-together drills are practice only. |
| **On-screen keys** | Touch, multi-touch | For trying things out; not counted. |

Browsers allow sound only after one tap on the page. If the metronome is needed before you have tapped, DaCapo asks for that tap.

## Something not working?

Tap the **flag** button at the top. Describe what happened. A diagnostic log is attached: app events, errors, device and browser, MIDI message counts, and a summary of your learning state, with no personal data. Copy it or save it as a file, and send it to whoever helps you with the app. The log is kept on the device across reloads, so a report made after a problem still shows what led up to it.

## Put it on your phone (free, about 10 minutes)

1. Create a free account on github.com and a **public** repository, for example `dacapo`.
2. Upload this project (or just the `docs/` folder). `docs/index.html` holds the whole app; the icons, `manifest.webmanifest` and `sw.js` next to it make it installable and usable offline.
3. Go to **Settings → Pages** and choose **Deploy from a branch → main → /docs** (or **/(root)** if you uploaded only the contents of `docs/`).
4. After a minute, open `https://YOUR-NAME.github.io/dacapo/` in Chrome, then use **⋮ → Add to Home screen → Install**. It then appears in the app list like any other app.

To update, replace `docs/index.html`. Your progress stays in the browser and is not affected.

## Your data

Progress is saved in the browser's local storage, or in your Claude account when the app is opened from Claude. **Settings → Save a backup file** exports everything, including imported pieces and Jam sketches. **Restore from file** brings it back on any device. Recordings stay on the device that made them. Progress from earlier versions carries over when you update.

## Development

You need Python 3 to build, and Node.js 22 for the checks and tests.

```
npm install                    # development tools: ESLint, Prettier, Playwright
npx playwright install chromium

npm run dev                    # serve src/ at http://localhost:8080/ and run the modules directly
npm run build                  # python3 build.py: docs/ (the site) and dist/DaCapo.artifact.html
npm test                       # build, then the end-to-end tests in a real browser
npm run lint                   # ESLint
npm run format                 # Prettier
node tools/fix-imports.mjs     # regenerate import and export lines after moving code between files
```

The app itself has no runtime dependencies. In development the browser loads the ES modules in `src/js` as they are. `build.py` turns them into one self-contained file: it orders the modules the way the browser would evaluate them, removes the `import` and `export` lines, checks that every imported name is exported and that no two modules declare the same top-level name, and inlines the styles and the music data. `docs/` is the build output that GitHub Pages serves, so it is committed; CI checks that it matches the source.

```
src/
  index.html          the page (runs as is in development)
  styles.css          design tokens (light and dark), layout, every screen
  data/               glyphs.json (Bravura outlines), library.json (the pieces; generated)
  manifest.webmanifest, sw.js, icons/    installable app
  js/
    app.js            entry point: wires the parts together, starts the app
    env.js, data.js   build facts and built-in data (filled in by build.py)
    core/             log (diagnostics), util, store (progress, migration, sync), audio (synth,
                      metronome), input (MIDI, microphone, on-screen keys), ui (router, sheets), files
    music/            theory, render (notation, keyboard), analysis (chords, key, timing), technique
                      (habits from MIDI), drills, library, midiread / midifile (import), midiwrite,
                      instruments / sounds (the Jam's synths), loop (the Jam's loop), transport
    learn/            areas (what there is to learn), curriculum (stages and when a rep counts),
                      status (where each skill stands), skills (levels and the weekly focus),
                      sessions (today's session), theory (the theory units), assess (placement),
                      lessons, echo; the players: player, quiz, answer, drill, improv
    views/            practice, skills, library, free play (jam, echo, takes), assess, drillinfo,
                      guides, settings, report
tests/                end-to-end tests (Playwright), unit tests of the pure modules, a MIDI fixture
tools/                lily.py (LilyPond reader), build_library.py (pieces -> library.json),
                      fix-imports.mjs
build.py              src/ -> docs/ and dist/
```

How the parts fit:

- **The curriculum decides, the player executes.** `learn/areas.js` lists every item in tiers; `learn/status.js` finds the next one per skill; `learn/sessions.js` builds today's session around the focus from `learn/skills.js`. `planFor(id)` in `learn/curriculum.js` says what the next rep should be (hand, tempo or speed goal, hints, cold or warm). `learn/player.js` (or `learn/quiz.js` for theory) runs that rep, judges it with `music/analysis.js`, and reports back with `recordRep` (or `recordAnswer`).
- **Everything is logged.** `core/log.js` loads first and depends on nothing else, so it catches errors anywhere. Navigation, every player transition, every rep result, MIDI and audio events go into a log kept across reloads; the flag button turns it into a problem report.
- **One handle for debugging.** `window.DaCapo` exposes the main parts (store, input, player, curriculum functions) in the browser console. The tests use the same handle to play simulated MIDI into the app.
- **Saved state is versioned.** `core/store.js` migrates older saved states step by step, so updates never lose progress.

To rebuild the music library, sparse-check out the needed folders of the Mutopia repository and run:

```
python3 tools/build_library.py /path/to/MutopiaProject/ftp
```

See `CONTRIBUTING.md` before sending changes.

## Credits and licenses

- Code: MIT, © 2026 DrWooodz (see `LICENSE`).
- Music data in `src/data/library.json` comes from Mutopia Project editions. Each piece is in the public domain or under Creative Commons Attribution-ShareAlike (3.0 or 4.0), as recorded with that piece; its typesetter is credited in the app. The CC BY-SA data stays under that license (see `LICENSES/`).
- Music notation glyphs come from **Bravura** by Steinberg Media Technologies, under the SIL Open Font License 1.1.
- Typefaces: Bodoni Moda, Instrument Sans and IBM Plex Mono, from Google Fonts.

DaCapo gives practice guidance, not medical advice. If playing hurts, stop and have a teacher look at your technique.
