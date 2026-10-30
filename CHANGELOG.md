# Changelog

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
