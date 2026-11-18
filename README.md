# DaCapo

A piano companion that listens to your digital piano over MIDI. Sit down, play, and it keeps up: it names what you play, keeps it correct, and shows you where to go next.

**Open it:** [drwooodz.github.io/Dacapo](https://drwooodz.github.io/Dacapo/) in Chrome or Edge (Android or desktop). To install it, use the browser's menu, then **Add to Home screen**. It works offline.

No account, server or tracking. Progress stays in the browser; Settings has backup and restore.

## Four tabs

- **Play.** Just play. Each chord is named as you play it, with its inversion; DaCapo hears which mood and key you are in (all 17 moods: "Probably D Dorian"), and one tap takes it. Choose a mood instead and its scale lights up across the keyboard, chords get their numerals (♭VI, V), a backing can play (a held drone, or one of the mood's progressions with a bass), and notes outside the scale are noted with whether they resolved. *Try something* gives one idea at a time for each hand: ten left-hand patterns (root and fifth to Alberti, open tenths, walking bass, pedal point) and six right-hand ideas (color note, chord tones on the strong beats, motif and sequence, thirds and sixths, call and response), each with what DaCapo heard. When you stop, the sitting is read back (the mood, the chords you held with their numerals, outside notes and whether they resolved, the color note, the left hand and the pedal) with one thing to try next time, and kept in a journal with its recording. Recordings show every note, even with the pedal held down.
- **Explore.** Nothing here is recorded. Find a mood by the feel you are after (brooding, tragic, dreamy, fiery…), hear it, and find music in it. Each of the 17 moods, in any of the 12 keys, has its sound, scale and fingering, its color note (the one that makes it different), its chords and progressions, and its neighbors: one note different, or the same notes from another home. Also: the circle of fifths (signatures, relative minors, the chords of a key), two ear games (name the mood; play back a phrase), and a map of what there is to learn, the core first.
- **Practice.** When you want to work on something. The core is major and minor (natural and harmonic) in every key, and the circle of fifths; everything else is a tap away. A key has its scale (right, left or both hands), its chords (progressions, inversions, left-hand patterns over a progression) and its arpeggios. Help is yours to switch: keys lit, finger numbers, a metronome, the exact octave (any octave counts otherwise). *Check me* is the one strict moment: both hands, two octaves, no help, every note right and even. Passing it once makes the key known.
- **Songs.** 44 pieces by Bach, Mozart, Beethoven, Schubert, Chopin, Schumann, Mussorgsky, Tchaikovsky, Grieg, Albéniz, Rachmaninoff, Debussy, Satie and Bartók, plus Japanese koto music, easy to advanced; and 18 tunes with their chords (folk and hymn melodies, each as melody and chords or a four-part setting). Each mood's page in Explore lists the music clearly in that mood. Noodle over a tune's chords in Play. Add your own as MusicXML (MuseScore and every notation app export it). A piece is learned a section of about four bars at a time: each hand, then together, in wait mode (the app waits for the right notes), then with the metronome up to tempo (two clean runs out of three raise it about 5%, wrong notes lower it 10%), then the whole piece.

## Theory and fingering

- Every scale is spelled with the right note names in every key. Major and minor scales use the published fingerings; modes use their parent scale's (D Dorian is fingered like C major); the rest are worked out from the rules pianists use: thumb off black keys, crossings after 3 or 4, no overstretching. Arpeggios use the standard fingerings, including the black-key ones (D♭ major: 4 1 2 4 in the right hand).
- Chord numerals count letters from home, the same in every key. Progressions are voiced so each chord takes the shape nearest the last.

Only MIDI, or the microphone for single notes, counts. On-screen keys are for trying things out.

## Input

| | Hears | Works with |
|---|---|---|
| MIDI (USB) | everything: chords, timing, loudness, pedal | Chrome or Edge on Android or desktop; the piano's "USB to Host" port. iPhone and iPad browsers have no Web MIDI. |
| Microphone | one note at a time | any piano |
| On-screen keys | touch | practice only, not counted |

Settings can also play your piano through the device with another sound, split at middle C if you like.

## Development

Python 3 builds; Node.js 22 runs the checks and tests. The app has no runtime dependencies.

```
npm install && npx playwright install chromium
npm run dev                    # serve src/ as modules at http://localhost:8080/
npm run build                  # build.py: src/ -> docs/ (the site) and dist/ (single-file artifact)
npm test                       # build, then Playwright tests (simulated MIDI in a real browser)
npm run lint && npm run format:check && node tools/fix-imports.mjs --check
```

`build.py` bundles the ES modules in `src/js` into one file: it orders them, strips `import`/`export`, checks that every import is exported and no top-level name is declared twice, and inlines styles and data. `docs/` is committed because GitHub Pages serves it; CI checks it matches the source. Rebuild the music data with `python3 tools/build_library.py /path/to/MutopiaProject/ftp` and the tunes with `node tools/build_songs.mjs /path/to/openhymnal` (a clone of the Open Hymnal Project's ABC files).

```
src/js/core/    log, util, store (state, migration), audio, input (MIDI, mic, touch), ui (router, sheets)
src/js/music/   theory, notation, analysis, harmony, moods (scales, spelling, fingering, chords), improvising tools, sounds, the library, MusicXML
src/js/learn/   the player, pieces, moods practice, Play's listening and backing, sittings and the journal, echo, lessons
src/js/views/   play, explore, practice, songs, settings and panels
tests/          Playwright tests; pure modules are unit-tested directly
tools/          LilyPond and ABC readers, library and tunes builders, import fixer
```

Conventions:

- Dependencies point one way: `core/` → `music/` → `learn/` → `views/`, no cycles. Pure modules (no browser globals) are tested directly.
- Each top-level name is declared in exactly one module (the bundle shares one scope). `tools/fix-imports.mjs` writes the import lines.
- Every behavior change comes with a test. Commit the rebuilt `docs/` with the source.
- A feature ships only when it works reliably at the piano, phone included. Practice methods must have good evidence behind them.

## Licenses

- Code: MIT, © 2026 DrWooodz (`LICENSE`).
- Music data: from [Mutopia Project](https://www.mutopiaproject.org) editions, public domain or CC BY-SA 3.0/4.0 per piece (`LICENSES/MUSIC-DATA.md`). Tunes: from the [Open Hymnal Project](https://openhymnal.org), public domain.
- Notation glyphs: Bravura, SIL Open Font License 1.1 (`LICENSES/OFL-1.1-Bravura.txt`).
- Fonts: Bodoni Moda, Instrument Sans, IBM Plex Mono (Google Fonts).

Practice guidance, not medical advice: if playing hurts, stop.
