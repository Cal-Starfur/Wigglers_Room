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

## What Shipped This Session

All changes are in `docs/wigglers-demo-t08.html` (output: `wigglers-demo-t08-v3.html`).

### iPad Orientation / Rotation Fix (3-part)

**Part 1 — Debounced resize + orientationchange listener** (v1)
- Replaced bare `window.addEventListener('resize', resizeCanvas)` with a debounced
  wrapper (`_debouncedResize`, 150ms delay) — swallows the premature mid-rotation fire
  Safari emits before layout is stable.
- Added `orientationchange` listener with 300ms delay (minimum Safari needs before
  `offsetWidth/Height` reflect the new orientation).
- Added `visualViewport.resize` listener (fires after layout is actually stable on iOS 13+).

**Part 2 — `_smoothPileTopY` reset on resize** (v2)
- Root-caused blue layer-0 air-gap visible immediately after rotation: `_smoothPileTopY`
  lerps at 8%/frame and held the old portrait/landscape `H` for ~40 frames (~650ms),
  making `lidWorldY` stale-high and exposing the `#3a4a6a` blue band above the dirt.
- Fix: `window._smoothPileTopY = null` added to `resizeCanvas()`, mirroring `setup()`'s
  own init (line 1877). Forces a snap to current pile position on the very first draw
  after rotation.

**Part 3 — World-Y remap on H change** (v3, root fix)
- Root-caused persistent layer-0 bleed in portrait mode: all world-Y positions are
  expressed as multiples of H (`tier1Bot = H + H/3`, `layerBaseY = H*0.97 + 75`, etc.).
  `spawnScraps()` bakes `H` at call-time — after rotation H changes but every stored
  object Y reflects the old H. `tier1Bot()` and `cSurf()` immediately use new H,
  creating a mismatch between tier boundaries and where objects actually live.
- Fix: capture `oldH` before updating `H` in `resizeCanvas()`. If `oldH !== H`, walk
  every live object array and multiply all `.y` coords by `newH / oldH`:
  - `trashChunks[i].y` and `.dropY`
  - `scraps[i].y`
  - `debris[i].y`
  - `pSegs[i].y`, `pHist[i].y`, `pPath[i].y`
  - `mY`
- Also switched `resizeCanvas()` to read `visualViewport.width/height` first (stable
  post-rotation on iOS), falling back to `root.offsetWidth/Height`.

## ⚠ Still Needs Verification
- `acidfull`/`gutfull` curriculum split — flagged as unverified from a prior session,
  still outstanding. Re-verify before any tutorial edits.
- Tutorial beacon spots (`_poopSpot`, `_sleepSpot`, etc.) have Y values set at
  `spawnTutorialScene()` time and are NOT remapped by the world-Y remap (they live in
  the `scraps` array and ARE walked, but the named local refs in `tutorial.steps`
  closures are not). If tutorial navigation feels off after rotation, those named refs
  need the same `*= _hRatio` treatment.

## Next Session Start
1. Bootstrap github-sync + set token
2. Fetch `docs/wigglers-demo-t08.html` pinned to HEAD SHA as working file
3. Verify `acidfull`/`gutfull` split against current file before any tutorial edits
4. T-09: Tea Drain System — read DEMO_BUILD_PLAN.md T-09 spec
5. T-10: Full NPC simulation — hoist `_fadeAt` first (see crash note in plan)

## Demo URL
`https://cal-starfur.github.io/Wigglers_Room/wigglers-demo-t08.html`

## PAT Note
Token active this session — rotate if needed (GitHub → Settings → Developer settings)
