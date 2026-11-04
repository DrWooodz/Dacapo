# DaCapo

A piano practice app that listens to your digital piano over MIDI, plans each day's practice, and tracks progress over months.

**Open it:** [drwooodz.github.io/Dacapo](https://drwooodz.github.io/Dacapo/) in Chrome or Edge (Android or desktop). To install it, use the browser's menu, then **Add to Home screen**. It works offline.

No account, server or tracking. Progress stays in the browser; Settings has backup and restore.

## What it does

- **A daily session.** One focus area a week, a few minutes of upkeep for the rest, and cold checks of what you learned before. Home shows the plan; start it or any step of it.
- **Six areas:** note reading (treble and bass), sight-reading, technique (scales and arpeggios in all keys), theory (20 units answered by playing, most with a walkthrough), pieces, and improvisation (nine style studies over a backing).
- **29 pieces** by Satie, Chopin, Debussy and Rachmaninoff, learned in sections of about four bars: hands separately, then together, then up to tempo.
- **Your own MIDI files,** including multi-instrument music, arranged for two hands (melody and bass as written, harmony from what the other instruments play). Every piece gets a key/mode and chord analysis.
- **Free play:** a chord and key readout, a loop station (with your piano played through the device, split per hand), an ear game, a recorder and a metronome.

## How progress works

- Learning happens in wait mode: the app waits for the right notes. Then speed (reading, theory) or tempo (scales, pieces): two clean runs out of three raise the tempo about 5%, wrong notes lower it 10%.
- An item is *integrated* only when it is right cold (the first thing you play that day) on two different days. Integrated items come back after 3, 7, 15, 30, 60, then every 120 days.
- When something stalls, the approach changes (one hand, wait mode, hints sooner) instead of repeating.
- Only MIDI, or the microphone for single notes, counts. On-screen keys are for trying things out. A practice day runs from 4 am to 4 am.

## Input

| | Hears | Works with |
|---|---|---|
| MIDI (USB) | everything: chords, timing, loudness, pedal | Chrome or Edge on Android or desktop; the piano's "USB to Host" port. iPhone and iPad browsers have no Web MIDI. |
| Microphone | one note at a time | any piano |
| On-screen keys | touch | practice only, not counted |

## Development

Python 3 builds; Node.js 22 runs the checks and tests. The app has no runtime dependencies.

```
npm install && npx playwright install chromium
npm run dev                    # serve src/ as modules at http://localhost:8080/
npm run build                  # build.py: src/ -> docs/ (the site) and dist/ (single-file artifact)
npm test                       # build, then Playwright tests (simulated MIDI in a real browser)
npm run lint && npm run format:check && node tools/fix-imports.mjs --check
```

`build.py` bundles the ES modules in `src/js` into one file: it orders them, strips `import`/`export`, checks that every import is exported and no top-level name is declared twice, and inlines styles and data. `docs/` is committed because GitHub Pages serves it; CI checks it matches the source. Rebuild the music data with `python3 tools/build_library.py /path/to/MutopiaProject/ftp`.

```
src/js/core/    log, util, store (state, migration), audio, input (MIDI, mic, touch), ui (router, sheets)
src/js/music/   theory, notation, analysis, harmony, MIDI read/write, piano arrangement, the Jam's sounds and loop
src/js/learn/   curriculum and stages, sessions, skills and focus, theory units, walkthroughs, the players
src/js/views/   home, practice, library, free play, settings and panels
tests/          Playwright tests; pure modules are unit-tested directly
tools/          LilyPond reader, library builder, import fixer
```

Conventions:

- Dependencies point one way: `core/` → `music/` → `learn/` → `views/`, no cycles. Pure modules (no browser globals) are tested directly.
- Each top-level name is declared in exactly one module (the bundle shares one scope). `tools/fix-imports.mjs` writes the import lines.
- Every behavior change comes with a test. Commit the rebuilt `docs/` with the source.
- A feature ships only when it works reliably at the piano, phone included. Practice methods must have good evidence behind them.

## Licenses

- Code: MIT, © 2026 DrWooodz (`LICENSE`).
- Music data: from [Mutopia Project](https://www.mutopiaproject.org) editions, public domain or CC BY-SA 3.0/4.0 per piece (`LICENSES/MUSIC-DATA.md`).
- Notation glyphs: Bravura, SIL Open Font License 1.1 (`LICENSES/OFL-1.1-Bravura.txt`).
- Fonts: Bodoni Moda, Instrument Sans, IBM Plex Mono (Google Fonts).

Practice guidance, not medical advice: if playing hurts, stop.
