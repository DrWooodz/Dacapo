# Changelog

## 2.3.0

- 15 more pieces by masters, from Mutopia Project editions:
  - Bach: Prelude in C major
  - Mozart: Sonata K. 545 (first movement), Fantasia in D minor
  - Beethoven: Für Elise, "Moonlight" Sonata (first movement)
  - Schubert: Moment musical No. 3
  - Schumann: Melody, First Loss
  - Tchaikovsky: Old French Song
  - Mussorgsky: The Old Castle
  - Grieg: Åse's Death
  - Albéniz: Rumores de la Caleta
  - Bartók: Brâul
  - Chopin: the "Black Key" Étude
  - Sakura, from an 1895 collection of Japanese koto music
- Each mood's page in Explore lists the music clearly in that mood: the pieces and tunes whose scale it is and where they come to rest. Natural and harmonic minor list each other's pieces too, since minor-key music uses both. Moods no piece is clearly in have no list.
- A piece's panel can open Play in its mood and key.
- Songs is shelved by era (Tunes, Bach to Schubert, Romantic, Modern).
- Where a tune is still in copyright outside the US (Finlandia, Kingsfold's four-part setting), its license line says so.

## 2.2.0

This release brings both planned steps, 2.1 (Play) and 2.2 (Songs).

**Play**

- When you stop playing (90 seconds without a note, **Done**, or leaving Play), the sitting is read back: the mood you were in, or the one it sounded like; minutes and notes; the chords you held, with their numerals; notes outside the scale and whether they resolved; the color note; how much the left hand and the pedal did; and one thing to try next time. Links go to the mood's page and its practice, or to the suggested neighbor mood.
- A journal keeps each sitting. The last six are recorded automatically and can be heard again. Takes you record yourself stay separate.
- The key it hears now covers all 17 moods: "Probably D Dorian (or C major)". A five-note tune comes out pentatonic, and a raised 7th points to harmonic minor. One tap takes it.

**Songs**

- Tunes: 18 public-domain melodies with their chords (Greensleeves, Picardy, Slane, the Passion Chorale, Kingsfold, Ode to Joy and others) from the Open Hymnal Project. Each has two arrangements. *Melody and chords* has the tune in the right hand and root-position chords in the left. *Four-part setting* is the hymn harmony.
- Chord symbols appear above the staff.
- **Noodle over its chords** opens Play in the tune's mood and key, with its chords looping as the backing, their numerals shown.
- **Add a song** reads MusicXML files (.musicxml, .xml, .mxl), the format every notation app exports. That includes both staves, ties, key and time signatures, clefs, tempo, fingerings and chord symbols. When a file has no chord symbols, DaCapo names the chords itself for noodling but does not print its guesses.
- Pieces with progress always show under Learning. **Start this section over** sends a section back to wait mode, after a second tap to confirm.

## 2.0.0

DaCapo is now a companion for playing, not a course. Four tabs:

- **Play** is the landing page: chords named as you play (with numerals once a mood is chosen), the key it hears (one tap takes it), the scale lit across the whole keyboard, a backing, notes outside the scale and whether they resolved (instead of "% in the scale"), and *Try something*: one idea for each hand at a time. Recordings and a metronome are at the bottom.
- **Explore**, with nothing recorded: moods by the feel you are after (type or tap words like brooding, tragic, dreamy), a page per mood (sound, scale, color note, chords, progressions, neighbors one note away, relatives with the same notes), the circle of fifths, the ear games, and a map of what there is to learn.
- **Practice**: the core first (major and minor in every key, the circle of fifths), everything else when you like. New: inversions, left-hand patterns over a progression, and a drill around the circle. A note counts in any octave unless you ask for the exact one. A key is known after one passed check; the met / comfortable / solid / yours ladder is gone.
- **Songs**: the pieces, each with its sections on one page; tap any section.

Removed: the daily course (sessions, weekly focus, spaced reviews, cold checks, skill levels, the placement check), note reading and rhythm drills, the 20 theory units and their walkthroughs, the course's technique and style studies (Practice and Play cover them), the loop station, and the Free play tab. Course progress is kept in the saved data's archive; pieces and moods carry on.

Also: chord fingers in one hand are stacked beside the chord on the staff; inversions and progressions are fingered by the chord's shape (1 2 5 for a first inversion); your piano through this device is in Settings.

## 1.5.1

An audit of the theory and the code.

- Chord numerals count letters from home, the same in every key: Locrian's chord on the low 5th is ♭V (it said ♯IV); pentatonic progressions are spelled from their parent scale.
- Harmonic and melodic minor take their natural minor's name and key signature: G♯ harmonic minor (not A♭), C melodic minor with three flats. On a tie between two names, the usual key name (E♭ minor, F♯ major).
- Arpeggios on black-key roots use the published fingerings (D♭ major: 4 1 2 4 right hand, 2 1 4 2 left), at one octave too. The course's arpeggios now show fingering for black-key roots, from the same engine.
- Color notes: minor pentatonic's tip named a note outside the scale; diminished's named no note. Both fixed.
- Improvising: a plain scale run no longer counts as a motif and sequence.
- Chord readout: the inversion follows the chord tone in the bass (an add9 chord over its 9th was called "2nd inversion"), and the bass is spelled from the root (C7/B♭, not C7/A♯).

## 1.5.0

- A Moods sitting has five steps: Listen, Scale (right, left or both hands inside it), Chords, Arpeggios, Improvise.
- Chords: the chords each scale makes (numeral, name, notes, its 7th), the signature chord marked, and two or three progressions per mood, voiced so each chord takes the shape nearest the last. Hear them, or play them as a drill (right-hand chords, left-hand roots, or both).
- Arpeggios of the home chord, the signature chord or any chord of the scale, fingered for both hands, one or two octaves. They count apart from the scale's progress.
- Every mood names its color note: the note that makes it sound the way it does, and what to do with it.
- Improvising: ten left-hand patterns, each voice-led over the progression with fingers and a Hear it button (root and fifth, octaves, chord on the beat, broken chord, bass and chord, Alberti, open tenth, sweep, walking bass, pedal point), and six right-hand ideas with feedback (free, color note, targets, motif and sequence, thirds and sixths, call and response).
- The backing plays: the drone is a held pad in the middle of the piano, started when you choose it; the chords backing plays the progression you pick, with a bass. (The drone was too low to hear on most speakers.)
- Which mood?, an ear game on Home: a phrase, four choices, and the color note that gave it away. Moods you miss come back more.
- Removed unused styles.

## 1.4.0

- Moods, a second way to use DaCapo, made for short sittings: 17 scales by the sound they make (dark, bittersweet, exotic, strange, bright), each in all 12 keys, with fingering for both hands. A sitting has five steps in any order (listen, right hand, left hand, both hands, improvise); help (keys lit, finger numbers, metronome) is switchable; checks are strict and happen only when asked.
- Home is built around the chosen path (Moods or the full course), switchable there. On Moods it shows where you left off, the next sitting, insights from your playing (left-hand patterns, pedal), every mood and key (by mood, by hand shape, around the circle of fifths), and your trajectory.
- The welcome screen offers the two paths.
- Recorder: a take played with the sustain pedal held down now shows every note (key presses as solid bars, the pedal's ringing as a faint tail); the pedal share no longer exceeds 100%.
- Removed: MIDI file import and arranging, and "About the music". Pieces imported earlier stay playable under Your files.
- The installed app opens on Home (it opened straight into the course's practice session).

## 1.3.1

- The service worker now deletes only DaCapo's own old caches. Other apps on drwooodz.github.io (Katalog) keep their offline files when DaCapo updates.
- The manifest states the app's id (`/Dacapo/`, the same id Chrome already derived), so another app on the same site can't be mistaken for DaCapo. Installed copies are unaffected.

## 1.3.0

- Home screen: today's session step by step with times (start it or any step), the weekly focus, each skill's level and next item, and the week. Replaces the Practice and Skills tabs; three tabs remain (Home, Library, Free play).
- One place per function: focus and placement check on Home; help and problem reports in Settings (flag button removed); style-study improvising under the Improvisation skill (removed from Free play); piece practice in the Library.
- Practice screen: just the drill, a step strip that jumps to any step, and Back. Next replaces Skip.
- Library shows one composer at a time; whole rows open a piece.
- Fixed: a theory level could show "NaN".

## 1.2.0

- MIDI import for multi-instrument files: parts listed with instrument names; Full, Simple, My choice and As written piano versions, with preview. The file is kept so the arrangement can be changed later.
- About the music: key or mode with an explanation, and each section's chords as numerals and names, playable.
- Theory walkthroughs (step by step, with examples to hear) for 13 units; new units on ♭VII/Mixolydian, folk minor and Dorian.
- Four modal style studies with walkthroughs: Mixolydian waltz, folk-minor ballad, Dorian, drone.
- Jam: play your piano through the device with one sound or a split per hand (two layers when recording); harp and flute sounds.

## 1.1.1

A full audit of the app. Fixes:

**Practice and progress**
- Theory cold checks can now finish inside the daily session (the session moved on after two answers, but a cold check takes five, so theory units could never become integrated from the session).
- A practice day now runs from 4 am to 4 am. A session past midnight stays one day, and two cold checks minutes apart around midnight no longer count as "two different days".
- Theory has a stall rule: when answers keep missing, the unit is explained again and the answer appears sooner for a few questions.
- Reviews follow the documented intervals: 3, 7, 15, 30 and 60 days, then every 120 days.
- Pieces marked for daily practice no longer come up when the Pieces area is switched off, and switched-off areas never fill an empty session.
- The weekly focus is suggested for an area with something new to learn.
- The placement check: one stray note in the scale costs one note instead of the whole score, and notes played after the scale no longer skip the next step.
- Two library pieces (Gnossienne No. 2 and the Waltz Op. 69 No. 2) had sections with no notes to play, which left those pieces stuck; imported MIDI files with long rests could do the same.
- Improvising on the screen keys no longer counts toward the minutes.

**Reading and notation**
- Accidentals last to the end of the bar, as in printed music: a natural sign is written when needed, and a repeated sharp is not written twice.
- Smooth voice leading shows on the staff the voicings it plays.
- Left-hand arpeggio fingering for D, A, E and B major (3 on the third).

**Robustness**
- Damaged or old saved data no longer stops the app: wrong values fall back to defaults and impossible stages are repaired.
- A keyboard is bound once, so reconnecting cannot double every note; keyboard notes are ignored while the microphone is chosen.
- Restoring a backup brings the restored progress up to date at once.
- Stopping the Jam silences everything already scheduled; notes past the end of a shortened loop go quiet instead of wrapping around; triplets are not swung.
- Imported pieces are read once instead of on every lookup, and sketches read from storage are checked.
- Sheets move keyboard focus into the panel and back.

## 1.1.0

Practice is now built around skills and a weekly focus, and Free play gained a loop station and an ear game.

**Practice**
- A focus for the week: DaCapo suggests one (with its reason), you keep it or choose another, and your choices shape later suggestions. The other areas get a few minutes of upkeep each day.
- The Skills screen shows each skill on a 0–3 scale (Foundations, Developing, Fluent), with trends and steadiness.
- An optional 8-minute placement check sets your starting points.
- Theory is a new area: 17 units in three tiers, answered by playing.
- Treble and bass reading are separate skills, and note reading now builds speed per note instead of using the metronome.
- Pieces: a "Working on" list of up to four pieces, each with a daily-practice switch, and longer piece sessions.
- Technique advice from MIDI (a lagging hand, late thumb crossings, accented thumbs), with short lessons on posture, hands and arms.

**Fairer judging**
- Pauses no longer make a wait-mode run unclean, and uneven timing alone never lowers the tempo.
- Playing the right notes an octave off, or the other hand's part, is named instead of counted as wrong notes.
- Two clean runs out of the last three raise the tempo (not two in a row), in steps of at least 3 bpm.
- When an item stops moving, the approach changes (wait mode with keys shown, one hand alone, or an easier goal) instead of repeating it.

**Free play**
- Jam: a loop station with drum beats, a drum grid, drum pads and recorded layers (piano, e-piano, pad, bass), snap-to-grid and swing; sketches save on the device and as MIDI files.
- Echo: a call-and-response ear game that adapts its level.

Progress from 1.0 carries over.

## 1.0.0

First public version.
