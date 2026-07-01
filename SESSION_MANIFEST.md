# SESSION MANIFEST — Wigglers Room

## HEAD SHA
`f39b6bac4107d9e65d3fbba23c7b76a036d46644`

## Active Work File
`docs/wigglers-demo-t08.html` — pushed to repo, live on GitHub Pages

## Ticket Status
- T-00 Demo Death Screen: ✅ DONE
- T-01 Canvas, Bin, Worm Movement: ✅ DONE
- T-02 Tier-1 Scraps + Eat + Gut: ✅ DONE
- T-03 Acid Chunk + Nibble + pAcid: ✅ DONE
- T-04 Poop + Castings: ✅ DONE
- T-05 Drops + pPath Tubes + Drain: ✅ DONE
- T-06 Cocoon + Sleep + View Mode: ✅ DONE
- T-07 Tutorial Wire-Up: ✅ DONE
- T-08 Cocoon Hatch → NPC Helper Worm (v1 simple AI): ✅ DONE
- T-09 Tea Drain System: `[ ] TODO`
- T-10 NPC Helper — Full Simulation: `[ ] TODO`
- T-11 View-Scroll X/Y/Diagonal: `[ ] TODO`

## What Shipped This Session (commit f39b6ba)

All changes are in `docs/wigglers-demo-t08.html`.

### NPC Rendering
- Helper worm now renders via `drawWorm()` — identical look to player (wave body, per-depth
  compost fade, proper two-eyed head, acid tint + HP pallor support)
- Spawns at `pSR * 0.5` (50% of player radius at hatch time) — visually clearly smaller

### Orientation / Resize Fix
- `resizeCanvas()` now reads from `visualViewport` first (most reliable post-rotation source),
  falls back to `window.innerWidth/innerHeight`, then `root.offsetWidth` as last resort
- `_toCanvas()` now uses `canvas.getBoundingClientRect()` + scales by buffer/CSS ratio —
  touch coords are exact regardless of CSS stretch or mid-rotation reflow state
- `orientationchange` fires `resizeCanvas` at 100ms, 300ms, and 500ms (triple-tap)
- `visualViewport.resize` listener added as a fourth trigger

### Two-Finger Gesture Steer Freeze
- Added `_steerFrozen` flag to `_gesture` object
- Second finger landing sets `_steerFrozen = true` — `touchmove` steer gated behind it,
  so finger-0 drift during poop hold/tap no longer jerks the worm
- Two-finger lift unfreezes and snaps `mX/mY` to current finger-0 position
- `touchcancel` also clears the flag

### HP Floor Fix
- Tutorial HP floor (`pHP < 0.08` clamp) now only applies when `tutorial.stepIndex > 0`
- At step 0 (player hasn't taken the first bite yet) starvation kills normally

### Death Screen Polish
- Title gradient: removed `#ffd580` centre highlight stop — clean amber `#f5a623` → `#d4880a`
- "Try Again" text button replaced with `assets/try_again_icon.png` (inlined as base64)
  - Floats with ±9px bob (`Math.sin(frame * 0.045)`) matching demo.html's `wfloat` keyframe
  - Amber radial glow with gentle pulse behind the icon
  - Hit-test rect updated to cover icon bounds

## ⚠ Still Needs Verification
- `acidfull`/`gutfull` curriculum split — flagged as unverified from a prior session, still outstanding

## Next Session Start
1. Bootstrap github-sync + set token
2. Fetch `docs/wigglers-demo-t08.html` pinned to SHA `f39b6ba` as working file
3. Verify `acidfull`/`gutfull` split against current file before any tutorial edits
4. T-10: Full NPC simulation — read DEMO_BUILD_PLAN.md T-10 spec; hoist `_fadeAt` first (see crash note in plan)
5. T-11: View-scroll X/Y diagonal — small surgical ticket, good warmup

## Demo URL
`https://cal-starfur.github.io/Wigglers_Room/wigglers-demo-t08.html?v=f39b6ba`

## PAT Note
Token active this session — rotate if needed (GitHub → Settings → Developer settings)
