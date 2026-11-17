# DaCapo

A piano practice app that listens to your digital piano over MIDI. Two ways to use it, switchable on Home:

- **Moods:** scales by the sound they make, in every key, with their fingering, and improvising in them. Made for short sittings whenever you have them.
- **The full course:** a daily plan across reading, technique, theory, pieces and improvising, tracked over months.

**Open it:** [drwooodz.github.io/Dacapo](https://drwooodz.github.io/Dacapo/) in Chrome or Edge (Android or desktop). To install it, use the browser's menu, then **Add to Home screen**. It works offline.

No account, server or tracking. Progress stays in the browser; Settings has backup and restore.

## Moods

- **16 moods in 12 keys.** Dark (natural and harmonic minor, Phrygian, Locrian), bittersweet (Dorian, melodic minor, minor pentatonic), exotic (Phrygian dominant, double harmonic, Hirajoshi), strange (whole tone, diminished) and bright (major, Mixolydian, Lydian, major pentatonic, blues). Each comes with what it sounds like, where you have heard it, and what makes it different.
- **Fingering for every scale.** Major and minor scales use the published fingerings; modes use their parent scale's (D Dorian is fingered like C major). The rest are worked out from the rules pianists use: thumb off black keys, crossings after 3 or 4, no overstretching.
- **A sitting** has five steps, in any order: listen, right hand, left hand, both hands, improvise. Help is yours to switch: keys lit, finger numbers, a metronome.
- **Progress:** a key is *comfortable* after three clean runs with each hand, and *solid* after a check passed on two different days (both hands, two octaves, no help, every note right and even). Checks happen only when you ask. A mood is *yours* once three keys are solid, one of them a black-key one.
- **Improvising:** a drone or the mood's chords as backing, and a left-hand pattern to try. DaCapo notes what your left hand did and how long the pedal was down, and suggests what to try next.
- **Home** shows where you left off, the suggested next sitting, what DaCapo noticed in your playing, every mood and key (browsed by mood, by shared hand shape, or around the circle of fifths), and your trajectory.

## The full course

- **A daily session.** One focus area a week, a few minutes of upkeep for the rest, and cold checks of what you learned before.
- **Six areas:** note reading (treble and bass), sight-reading, technique (scales and arpeggios in all keys), theory (20 units answered by playing, most with a walkthrough), pieces, and improvisation (nine style studies over a backing).
- **29 pieces** by Satie, Chopin, Debussy and Rachmaninoff, learned in sections of about four bars: hands separately, then together, then up to tempo.
- Learning happens in wait mode: the app waits for the right notes. Then speed (reading, theory) or tempo (scales, pieces): two clean runs out of three raise the tempo about 5%, wrong notes lower it 10%.
- An item is *integrated* only when it is right cold (the first thing you play that day) on two different days. Integrated items come back after 3, 7, 15, 30, 60, then every 120 days.
- When something stalls, the approach changes (one hand, wait mode, hints sooner) instead of repeating.

## Free play

A chord and key readout, a loop station (with your piano played through the device, split per hand), an ear game, a recorder (it shows every note, even with the pedal held down) and a metronome.

Only MIDI, or the microphone for single notes, counts toward progress. On-screen keys are for trying things out. A practice day runs from 4 am to 4 am.

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
src/js/music/   theory, notation, analysis, harmony, moods (scales, spelling, fingering), MIDI read/write, the Jam's sounds and loop
src/js/learn/   curriculum and stages, sessions, skills and focus, moods progress, theory units, walkthroughs, the players
src/js/views/   home (both paths), a moods sitting, practice, library, free play, settings and panels
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
