# Session Manifest — Wigglers Room
Session: 33 | Branch: main | Devvit: 0.0.180 | Updated: 2026-06-28

## Blocked
- ISS-19 (localStorage race condition) — P1, code freeze until shipped
- No game.js / main.tsx changes this sprint

## Current State — Clean Slate
- docs/demo-game.js — DELETED
- docs/tut-game.js — DELETED
- docs/demo.html — shell only; _enterBin fades intro + adds body.playing, NO game JS loaded
- docs/game.js — production file, untouched (ISS-19 freeze)
- docs/tutorial-module.js — tutorial curriculum reference (549 lines)
- Active work file: TBD — next session decides what to build

## Session 33 — Clean slate: deleted demo-game.js + tut-game.js, stripped demo.html

### Problem history (why we nuked the files)
- demo-game.js accumulated months of tutorial grafts, perf patches, and always-on tutorial wiring
  on top of an already-stripped game. Three attempts to fix a black screen (ctx.restore mismatch,
  _showSky undefined, Devvit 3000ms boot wait) revealed systemic fragility.
- tut-game.js was built as a fresh purpose-built tutorial sim (914 lines) but was immediately
  rejected ("not our game, cheap rip-off") and reverted in the same session.
- Decision: delete both, start from a clean slate next session.

### Commits this session (chronological)
- a29d4c6 — Fix: drop Devvit host wait 3000ms→400ms for standalone demo (black screen fix #1)
- 250791a — Fix: define _showSky before use — was undefined, causing unmatched ctx.restore()
            every frame; entire world translate popped = black canvas (black screen fix #2)
- 1624d8d — Delete docs/demo-game.js
- e842df9 — Delete docs/tut-game.js
- 1068f2f — Strip dead game-JS inject from _enterBin — no more 404 on Enter Bin click
- 45a7b02 — Fix: end-screen h2 margin-bottom 10px→0 to match intro screen spacing

### HEAD
45a7b02

## OPEN / NEXT SESSION
- **Decide the new game file strategy.** Options:
  - Base on game.js (production, full economy, predates perf fixes)
  - Build fresh (clean, purpose-built, no legacy)
  - Hybrid: copy game.js to a new docs/ file and strip/patch from there
- demo.html shell is ready — _enterBin just needs `_gs.src = '<newfile>.js' + _vq` restored
- ISS-19 (localStorage race) — P1, still open, targeted July 2026

## Session 32 — Tutorial end-screen auto-cut fix + tut=2 verified live (docs/demo-game.js)
- d8fe78b — Tutorial end-screen never auto-showed. Root cause: tutorialStep()'s "sequence complete"
            branch (si >= steps.length) re-fires EVERY frame while the worm sleeps and was resetting
            tutorial._doneAt = Date.now() each time, so drawTutorialDone()'s >2600ms dwell never elapsed
            and _tutFinish() -> window.showDemoEnd() never fired. Now latched once:
            if (!tutorial.done) { done = true; _doneAt = now }. Final beat now runs:
            viewscroll -> "Tutorial Complete" card -> ~2.6s -> #end-screen.
- ?tut=2 (live merge mode) confirmed WORKING on device — curriculum over the real field.

## Session 31 — Geometry halve + castings cleanup + tea re-attach + tutorial merge mode
- cSurf() moved 3H->2.5H; compost band [2H..2.5H]; all sump-dependent values rescaled
- Removed castings array (never populated); label cleanup
- Tea re-attach fix (b15c11a)
- Tutorial merge mode (?tut=2): same 11-step curriculum over live game, no field wipe

## Session 30 — Per-poop lag fix + tutorial constipation/refuel arc
- Per-poop mobile lag fixed (clog clip -> capsule stroke)
- Constipation arc: acidfull -> pooprelief -> cure (2 eggshells) -> refuel -> compost poop

## Tooling notes
- Push scripts: /tmp/github-sync/scripts/ (re-bootstrap each session)
- Config: /tmp/github-sync/memory/github_config.json
- Edit pattern: Python assert content.count(old)==1, node --check, stage, push --approved
- demo.html is ~1.9MB — two-step blob fetch required (contents API SHA -> git/blobs/{sha})
- Lead every post-push reply with cache-busted demo URL: https://cal-starfur.github.io/Wigglers_Room/demo.html?v=SHA
