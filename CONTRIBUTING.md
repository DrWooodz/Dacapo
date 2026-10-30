# Contributing to DaCapo

Thank you for helping. DaCapo is used at the piano, with the phone on the music stand and both hands on the keys, so a feature that works most of the time is worse than no feature. Three rules guide every change:

1. **Quality over quantity.** A feature ships only when it works reliably, including on a phone. If it is not ready, it stays out.
2. **Only methods that work.** Drills and practice rules follow the methods with the best evidence for durable skill (spaced, focused practice; accuracy before speed; cold checks). New drills should say why they work.
3. **Open it and play.** The app always knows what comes next. Progress is tracked automatically and consistently over days and months; nothing should need settings or manual bookkeeping.

## Before you send a change

```
npm run lint
npm run format:check
node tools/fix-imports.mjs --check
npm test
```

`npm test` builds the app and runs the end-to-end tests, which play simulated MIDI into a real browser. Add or update a test for any change in behavior. Commit the rebuilt `docs/` together with the source; CI checks that they match.

## Code

- Plain JavaScript modules, no runtime dependencies, no framework. Keep it that way.
- Every module starts with a comment saying what it is for. Comments explain why, not what.
- Each name is declared in exactly one module (the build puts all modules in one scope and checks this). Let `tools/fix-imports.mjs` write the import lines.
- Dependencies point one way: `core/` → `music/` → `learn/` → `views/`. The players in `learn/` may open panels from `views/`, nothing else in `learn/` should. No import cycles.
- Keep logic that can be pure, pure: modules like `music/loop.js`, `music/midiread.js`, `music/midiwrite.js`, `learn/theory.js` and `learn/echo.js` touch no browser globals, so the tests import and check them directly.
- If the code gets tangled, untangle it before adding more. A refactor with the tests still green is always welcome.
- Log what matters for debugging with `Log.ev` (events) and `Log.warn`; wrap event handlers with `Log.guard` so an error is logged instead of breaking the screen.
- Text in the app is plain and friendly: full sentences, no jargon, no exclamation marks.

## Reporting a problem

Use the flag button in the app. It attaches a diagnostic log (app events, errors, device and browser, no personal data) to your description.
