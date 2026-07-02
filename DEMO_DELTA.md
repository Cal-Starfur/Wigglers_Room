# DEMO DELTA — Changes in demo vs game.js

Tracks every meaningful divergence between `wigglers-demo-t07.html` (formerly
t05, superseded across T-06/T-07 work) and the
frozen source `docs/game.js` @ SHA `84343c0`. Each entry notes what changed,
where it lives in the demo, and what needs to happen when porting back to production.

---

## 1. Worm renderer — `drawWorm()`

**What changed:**
- Stroke path switched from straight `lineTo` to **quadratic Chaikin smoothing**:
  each segment is a control point, actual curve passes through midpoints.
  Eliminates sharp kinks on turns.
- `lineWidth` now driven by `_widthScale` (see §2) so body thins when stretched.
- Clitellum arc radius also scales with `_widthScale`.

**Demo location:** `drawWorm()`, the two-pass stroke loop (~line 1493)

**Port notes:**
- The midpoint quadratic loop is a drop-in replacement for the `lineTo` loop.
  No state dependencies — pure draw code.
- `_widthScale` depends on `_wormStretch` (§2) — port both together.
- Low risk. Pure visual improvement, no gameplay impact.

---

## 2. Peristaltic stretch — `_wormStretch` + `_wormMoving`

**What changed:**
- New globals: `_wormStretch` (0→1 stretch amount), `_wormMoving` (bool).
- `_wormStretch` is locked to `1.0` (always fully stretched/skinny).
  Originally designed to oscillate; simplified to constant after iteration.
- `_stretchScale` expands segment `spacing` by up to +55% when `_wormStretch > 0`.
- `_widthScale` thins `lineWidth` by up to −40% when stretched.
- `_wormMoving` is set from `isMoving = d > 2` at the top of `updatePlayer()`.
  Previously `isMoving` was only a local inside `drawWorm()`.
- Wiggle (lateral wave offset) now runs unconditionally (previously gated on `isMoving`).

**Demo location:**
- Globals declared ~line 1214–1216
- `_widthScale` computed in `drawWorm()` ~line 1481
- `_wormMoving` set + pHist flush in `updatePlayer()` ~line 2094–2101
- `_wormStretch` + `_stretchScale` + modified spacing ~line 2237–2242

**Port notes:**
- `_wormMoving` and `isMoving = d > 2` at the top of `updatePlayer()` is a clean
  addition — game.js can keep its own `isMoving` definition and just add the global export.
- `_wormStretch` constant at 1.0 means the stretch/width math is always active.
  In production you may want to make this dynamic (e.g. oscillate while moving).
- The pHist flush on stopped→moving transition (`pHist = []` + rebuild from pSegs)
  prevents a sideways snap artifact. Should be safe to port — it only fires on the
  single transition frame.
- Medium risk. Touches `updatePlayer()` spacing math and `drawWorm()` lineWidth.

---

## 3. Segment lerp placement

**What changed:**
- Segment placement now **lerps** toward history targets instead of snapping.
- Lerp rate: `0.18` when moving, `0.06` when stopped.
- When stopped and history too short to place a segment, eases toward a computed
  rest position behind the head along the last travel direction.

**Demo location:** segment placement loop in `updatePlayer()` ~line 2243–2264

**Port notes:**
- game.js currently snaps segments directly (`pSegs[i].x = pHist[j].x`).
  The lerp is a visual improvement with no gameplay impact.
- The rest-position fallback is demo-only feel polish — may not be needed in
  production where the worm is always active.
- Low–medium risk. Only touches the inner segment placement loop.

---

## 4. Poop mechanic — hold-to-charge

**What changed:**
- `tryPoop()` now accepts a `charge` parameter (0→1).
- New globals: `_poopCharge`, `_poopCharging`.
- Two-finger **down** → `_poopCharging = true`, charge resets to 0.
- Each frame while charging: `_poopCharge += 1/90` (full charge in ~1.5s).
- Two-finger **lift** → `tryPoop(_poopCharge)` fired with accumulated charge.
- Charge scales: `numLumps`, `lumpSz`, gut drain (`pGut * (0.15 + charge * 0.5)`).
- Tap (instant lift) = minimum charge (0.05) = single small drop.
- Hold to max = large multi-lump dump draining up to 65% of gut.
- Spacebar fires at `charge = 1.0` (full, for desktop testing).
- Gut bar shows amber pulsing overlay + `💩 42%` → `💩 MAX!` label while charging.

**Demo location:**
- `tryPoop()` function ~line 75
- `_poopCharge` tick in `loop()` ~line 2564
- Touch handlers: two-finger down ~line 2669, lift ~line 2732, cancel ~line 2757
- HUD overlay drawn in `draw()` ~line 2042–2052

**Port notes:**
- This is a **significant gameplay change** — replaces the instant two-finger tap.
- The charge accumulation and `tryPoop(charge)` signature are clean and self-contained.
- The gut bar overlay draw code is purely additive (drawn after the existing gut bar).
- The touch handler changes are surgical: one line on touchstart (n>=2), one block
  on touchend (peak===2), one line on touchcancel.
- Needs UX review before production port — charging while steering with one finger
  may feel awkward on mobile. Consider whether charge should pause movement.
- **High value port** — makes the poop mechanic feel intentional and skill-based.

---

## 5. `isMoving` promoted to `updatePlayer()` scope

**What changed:**
- `isMoving` was previously only a local var inside `drawWorm()`.
- Now defined at the top of `updatePlayer()` as `var isMoving = d > 2`.
- Used by both the stretch system and the segment lerp.

**Demo location:** `updatePlayer()` ~line 2094

**Port notes:**
- game.js `updatePlayer()` should add `var isMoving = d > 2` near the top,
  after `d` is computed. Safe addition with no side effects.

---

## 6. Stubs (demo-only, do NOT port)

These exist only to satisfy calls in the demo that Devvit handles in production:

```js
function postToHost(msg){}
function saveSession(){}
function loadSession(){return null;}
function applyOfflineDrain(){}
function getGenColor(g){return '#e88aaa';}  // overridden to '#ff4d8f' in demo
var username='You',karma=0,generation=0,...
var snooScene=null,snooPhase='done',...
function _restartDemo(){ window.location.reload(); }
```

Also missing and needed as no-ops before next demo session:
- `trySleep()`
- `tryLayCocoon()`
- `triggerSnoo()`
- `triggerDrainTap()`
- `closeDrainTap()`

---

## Open Questions for Production Port

- Should `_wormStretch` oscillate in production (true peristalsis) or stay constant?
- Hold-to-poop: does charging pause worm movement? Currently it doesn't.
- Lerp segment placement: keep in production or revert to snap for performance?

---

## 7. Tutorial folded into native code (architecture change)

**What changed:**
- The tutorial was previously a separate `tutorial-module.js` file, designed to be loaded
  as a standalone block and wired into the host file via ~15 documented "hooks."
- This session folded it fully into `wigglers-demo-t07.html` as native code: the state
  object now sits next to other core state declarations, the step-machine functions sit
  directly above `updatePlayer()`, the render helpers sit directly above `draw()`, and
  `spawnTutorialScene()` sits directly after `spawnScraps()`. No separate "module" framing,
  no porting-manifest comments — it reads as code that was always part of the file.
- Hard defaults changed: `tutorial.scene`, `tutorial.active`, **and `tutorial.live`** are
  all forced `true` at load (previously only `?tut=1`/`?tut=2` set these via URL param).
  `tutorial.live = true` means `spawnTutorialScene()` calls `spawnScraps()` first to build
  the real field (full trash pile + ambient scraps), then lays the curriculum on top —
  this is the "tutorial OVER the live game" merge mode the architecture skill described as
  a future goal; it's now the actual default for the demo.
- The eat-gate was also fixed to match the originally-documented merge-mode spec: in live
  mode it now locks down ALL scraps (not just `tutProtected` ones) except the active
  target/extras, so the ambient real-field scraps can't be used to skip the curriculum order.

**Demo location:** scattered — state object near top-of-file globals, step machine above
`updatePlayer()`, render helpers above `draw()`, `spawnTutorialScene()` after `spawnScraps()`

**Port notes:**
- This is demo-architecture-only; nothing here is meant to port back to `game.js`,
  since `game.js` has no tutorial system at all.
- If `tutorial-module.js` is kept as a separate repo file going forward, it is now
  **out of sync** with the actual demo — the demo no longer loads it as a module.
  Decide whether to delete it or keep it as historical/reference documentation only.

---

## 8. Procedural curriculum

**What changed:**
- Tutorial scrap types are no longer hardcoded (`lettuce`, `watermelon_chunk`, `bread_crust`).
  `spawnTutorialScene()` now builds three pools from `TRASH_TYPES` — `_safePool` (any
  non-acidic type), `_juicyPool` (non-acidic, `liq >= 4`, for the tea-drip beat), and
  `_acidPool` (any acidic type, for the tier-0 pile chunk) — and picks randomly from
  each pool per spawn.
- Small position jitter (±3% of bin span, ±2% for the tightly-paired eggshell beat) added
  to every food item's spawn coordinate so layout varies slightly run to run.
- Panel titles for the beats that used to name a specific food ("Lettuce", "Watermelon",
  "Overripe Fruit") now read dynamically via a `_titleCase()` helper off whichever type
  got picked. The "First Bite" panel also now names its scrap in the body text.
- **Eggshell stays fixed** for the cure beat — it's the literal acid antidote
  (`if (s.t.name === 'egg_shell') pAcid -= 0.15` is hardcoded by name in the eat loop,
  not data-driven), so randomizing it would mean the "antidote" sometimes doesn't cure
  anything. If full randomization of that beat is wanted later, it needs a generic
  `antacid: true` flag added to one or more `TRASH_TYPES` entries and the eat loop
  switched to check that flag instead of the name.

**Demo location:** `spawnTutorialScene()`, plus the `tutorial.steps` panel definitions

**Port notes:** Demo-only flavor system, no port relevance — `game.js` doesn't have a
tutorial curriculum to vary.

---

## 9. Cocoon visuals restored (was fully invisible)

**What changed:**
- `tryLayCocoon()` was already pushing to `cocoons[]` and setting `window._cocoonMsg`,
  but nothing in `draw()` ever rendered any of it — laying a cocoon was a no-op visually.
- Ported from `game.js`: the lemon-shaped cocoon sac (3.5×5 ellipse + highlight + ridge
  line), the clitellum readiness band (pulsing pink ellipse ~30% back from the worm's
  head), and the fading feedback message.
- Dropped from the `game.js` version: maturity color-shift (needs a week-long timer the
  demo doesn't track), the owner-name label (always "You" in a single-player demo,
  redundant), and the karma-based `clitellumReady` gate — replaced with the same depth
  check `tryLayCocoon()` itself already used.
- The feedback message draws in **screen space** (after the camera transform restores),
  not world space like the `game.js` original — this matches the convention established
  by the tutorial-panel mobile-centering fix (see Bugs Fixed) and avoids the same class
  of bug.

**Demo location:** `draw()`, cocoon draw loop + clitellum band placed right before/after
`drawWorm()`; feedback message in the screen-space HUD section

**Port notes:** Low risk if ever needed — this is closely matched to existing `game.js`
code, just simplified for single-player/no-maturity-timer. Not actually a port candidate
in the other direction since `game.js` already has the full version.

---

## 10. Compost + tier-1 depth cut to 1/3 — new boundary functions

**What changed:**
- `game.js` and the prior demo both used four uniform `H`-tall tiers (`getTier(wy) =
  floor(wy/H)`). This session cut compost (tier 2) and tier 1 (the "active worm layer")
  to `H/3` each, while tier 0 and the sump's own `H*0.25` margin stayed unchanged.
- New functions, demo-only: `tier1Bot()` returns `H + H/3` (tier1/compost boundary,
  replaces literal `2*H`); `cSurf()` now derives from `tier1Bot()` instead of a literal
  `3*H`/`2*H+H/3`. `getTier()` switched from a uniform division to explicit boundary
  checks since the tiers are no longer equal height.
- Every place that hardcoded `2*H`/`3*H` as a tier boundary was swapped to the new
  functions: `inCompost()`, `compostDepth()`, camera clamps (awake + sleeping), the
  worm's max-depth clamp, drain-hold detection and stamp positions, the cocoon depth
  gate + clitellum band, the down-drain "spanning tunnel" bonus margin, the up-drain
  bonus check, the debris-settling clamp, and the tier-1+compost dirt gradient's
  internal color-stop fractions (these were hardcoded percentages tuned for the old
  tier proportions and silently went out of sync with the real boundary — see Bugs Fixed).
- Separately, everything that assumed tier1's *height* equaled a flat `H` (not just its
  *boundary* position) also needed scaling: all 8 tutorial food Y-positions
  (`H + H*0.47` → `H + (tier1Bot()-H)*0.47`), `spawnScraps()`'s ambient tier-1 scrap
  count and Y-span, the guaranteed-eggshell Y-span, and the worm's default spawn Y
  (`H*1.4` → `H + (tier1Bot()-H)*0.4`, since the old constant landed inside compost
  after the cut).

**Demo location:** scattered throughout `updatePlayer()`, `updatePhysics()`, `draw()`,
`spawnScraps()`, `spawnTutorialScene()`, `initPlayer()` — search for `tier1Bot()` and
`cSurf()` call sites for the full list

**Port notes:** **Demo-only.** `game.js` should NOT receive this change directly — it's a
visual/pacing tuning choice for the demo's shorter session length, not a production
design decision. If production ever wants variable tier depths, this gives a tested
reference for what has to move together (it's more than it looks like at first).

---

## 11. Lid repositioning — tracks the pile instead of a fixed point

**What changed:**
- The bin lid was anchored to a fixed `H*0.5` regardless of how full the tier-0 pile
  was, leaving a large (~426px at typical viewport heights) empty air gap between the
  lid and the trash/blanket surface.
- Now tracks `drawPileTopY - 36` (the same smoothed pile-top value already computed
  for pile rendering), so the lid visually rests just above the blanket and follows
  the pile up/down as chunks get eaten over a session.
- Four things kept in sync to this same anchor: the sky-gradient/star-clip boundary,
  the lid sprite, the bin wall's starting point, and the tier-0 background tint —
  all previously also hardcoded to `H*0.5` independently.
- Purely visual — the worm's actual movement ceiling was already tied to the pile via
  `getLowestScrapY()`/`wormCeiling`, not to the lid or to `H`, so no physics changed.

**Demo location:** `draw()`, the lid/wall/tint section (~early in the function)

**Port notes:** Could be a nice visual port to `game.js` if the production bin has the
same "lid floats with a big empty gap" issue — worth a look, low risk (pure rendering).

---

## 12. Worm Emoji Tint Caching (minor — only real divergence from the karma/clock/ring HUD ports)

**What changed:** The karma pill, clock HUD, and drain/junction charge ring were all
ported verbatim from `game.js` with no behavioral changes — not true deltas, so not
documented in detail here. The one actual difference: `game.js` regenerates the
karma pill's tinted worm emoji on an offscreen canvas every single frame; since the
demo's `genColor` never changes, it's cached once instead (`window._wormEmojiCanvas`).

Separately (not a `game.js` divergence, just worth a note): `karma` itself was a dead
variable in the demo before this — declared, never incremented, despite every tutorial
panel promising rewards. Wired up accrual using `game.js`'s own existing formulas (which
were already computed in the demo's code, just never added to `karma`), so demo karma
now matches game.js karma exactly — no divergence to track.

**Demo location:** `draw()` (emoji cache), various `karma +=` call sites in
`updatePlayer()`/`tryPoop()`.

**Port notes:** None — matches `game.js` behavior, nothing to port.

---

## 13. Worm Fade-Into-Compost + Matching Tunnel Fade (demo-only, no game.js equivalent)

**What changed:**
- New visual feature with no production equivalent: the worm now fades out of visibility
  **per-segment** as it crosses into compost — each point along the body fades based on
  its own world-Y depth (full visibility at the compost surface, fully transparent by
  25% depth into compost), not a single whole-body alpha. Implemented as a vertical
  canvas gradient used as the stroke style for both body passes in `drawWorm()`, so it
  costs the same as a flat color (one gradient object per draw call, not per point).
  Eyes and the small decorative body-cap dot use the same fade curve evaluated at their
  own specific point.
- Compost tunnels (`drawPath()`) now fade from the original two-tone look (dark border +
  lighter brown fill) to a flat uniform dark color using the *same* depth zone as the
  worm's fade — built as a gradient stroke once per stroke-batch pass, not per point, to
  stay cheap with a potentially large `pPath`.
- Fixed a related rendering artifact: tunnels visually poked out above the actual
  compost border due to the round line-cap on the topmost point extending past it (not a
  data issue — `addPoint()` already rejects anything above the border). Fixed with a hard
  clip at the border line.
- The drain charge ring and clitellum band (§13 and an earlier session's port) were
  initially gated behind the worm's visibility fade too, which was a bug — both activate
  at depths well past where the fade completes, so they were silently never rendering
  during real use. Ungated both since they're gameplay feedback, not part of the worm's
  body.

**Demo location:** `drawWorm()` (per-point fade + gradient stroke), `drawPath()`
(matching tunnel fade + border clip), `draw()` (ring/clitellum visibility fix).

**Port notes:** This is a deliberate demo-only aesthetic choice (the worm "going
underground" into a tunnel), not something to port back to `game.js` — production's
worm should stay fully visible regardless of depth. Flagging in case the visual is liked
enough to reconsider for production later, but treat as demo-specific by default.

---

## 14. Tea Pooling System — Visual + Detection Refinements

**What changed (building on the original pooling system from earlier this session):**
- Puddle fill switched from a flat color to a gradient (glossy highlight at the liquid
  surface → established tea color → soil-brown blend at the base, so it visually
  "soaks into" the compost instead of reading as a hard-edged rectangle). First attempt
  used one shared gradient scaled to the maximum possible puddle height, which made small
  young puddles nearly invisible (only sampling a sliver near the bottom of a much taller
  range) — fixed to scale the gradient to each puddle's own actual height instead.
- Fixed tea passing straight through the compost-border block almost immediately: the
  "is there a tunnel here" check accepted any nearby `pPath` point, including incidental
  carve marks left by the worm just passing through compost for unrelated reasons
  (sleeping, the compost-bonus poop beat, laying a cocoon). None of those lead anywhere.
  Now requires the candidate point's carved segment to actually reach the sump (a
  `sumpExit` stamp or a point near `cSurf()`) within a capped forward scan before
  counting as a real tunnel.

**Demo location:** `updatePhysics()` (tunnel-detection fix), `draw()` (puddle gradient
rendering, in the world-space compost-surface section).

**Port notes:** Still demo-only — `game.js` has no surface-pooling concept to compare
against (see Open Questions below, and `docs/DEMO_BUILD_PLAN.md` T-09 for the full
review of what `game.js`'s drop-following system could contribute to an eventual drain
mechanic for this pool).

---

## 15. Digestion / HP Regen Pacing Speedup

**What changed:** The digestion-to-HP-regen formula (`tryPoop()`'s neighbor logic in
`updatePlayer()`) was real and correctly implemented but calibrated to `game.js`'s
multi-day persistent-bin pacing — a full gut took 5 real-world minutes to fully digest,
making the regen technically functional but practically invisible within a short demo
session (under 0.15%/sec). Sped up the divisor so a full gut now digests in ~20 seconds
(~2%/sec), same total HP regen per gut digested, just compressed into a window where a
player actually notices it happening.

**Demo location:** `updatePlayer()`, the digestion block (`digestRate` calculation).

**Port notes:** Demo-only pacing change — production should almost certainly keep the
original slower, realistic timescale for a bin meant to live for days.

---

## 16. Constipation Card Split — `acidfull` → `acidfull` + `gutfull` (⚠ unverified)

**What changed:** Earlier this session the `acidfull` tutorial beat's completion was
changed from gut-fullness (`pGut >= 98%`) to acid level (`pAcid > 0.35`, "turn green") per
explicit direction. That created a side effect: the following beat (`pooprelief`, the
"Constipation" card) could become active and display its "you're bleeding from a full
gut" text before the gut was actually full, since acid crosses its threshold well before
gut typically does. Fix: split the single `acidfull` beat into two — `acidfull` (turn
green, unchanged) and a new `gutfull` (target stays the acid chunk, completes at
`pGut >= 98%`) — so the Constipation card is now gated on genuine gut fullness every
time, with no dynamic-text workaround needed.

**Demo location:** `spawnTutorialScene()`'s `tutorial.steps` array, `_tutStepDone()`.

**⚠ Status:** Sir flagged this edit immediately after it was made ("you are looking at
the old game file") but the session wrapped before clarification on what was meant or
what was actually wrong. **Re-verify this change before building anything further on top
of it** — see `SESSION_MANIFEST.md`'s "Needs re-verification" section.

**Port notes:** N/A — tutorial curriculum structure is entirely demo-specific, no
`game.js` equivalent.


---

## Stub corrections

The original stub list said `getGenColor()` was "overridden to `#ff4d8f` in demo." That
was tried this session and explicitly reverted — `#e88aaa` is the correct/intended demo
worm color. Disregard the `#ff4d8f` reference; it does not reflect the current file.

```js
function getGenColor(g){return '#e88aaa';}  // confirmed correct this session, do not change to ff4d8f
```

---

## Open Questions for Production Port (additions this session)

- The long-press-to-sleep drift-cancellation bug (comparing world-space `mX` against
  screen-space `lpStartX`, causing near-instant false cancellation whenever the camera
  had scrolled) — worth checking whether `game.js`'s own long-press/gesture code has
  the same coordinate-space mismatch.
- The view-scroll bug (a tracked drag variable, `viewCamY`, updated correctly but never
  actually applied to the rendering camera) — same caution, worth checking `game.js` for
  the same "computed but never consumed" pattern in its own view-mode camera code.
- Should the depth-cut tier proportions (1/3 compost, 1/3 tier-1) ever inform a production
  "quick session" or "compact bin" mode, or is this strictly a demo-only pacing choice?
- Is the worm-fades-into-compost visual (§13) worth reconsidering for production at some
  point, or should production's worm definitely stay fully visible at all depths? Flagged
  as demo-only by default, but it's a strong enough visual that it seemed worth a
  deliberate "no" rather than just never coming up.

---

## 17. iPad Orientation / Rotation Fix — World-Y Remap + Resize Stabilisation

**What changed:**

Three-part fix applied to `resizeCanvas()` and the event listeners at the bottom of the script.

**Part 1 — Debounced resize + orientationchange listener:**
- Replaced bare `window.addEventListener('resize', resizeCanvas)` with a debounced
  wrapper (`_debouncedResize`, 150ms) to absorb the premature resize Safari fires
  before rotation layout is stable.
- Added `window.addEventListener('orientationchange', ...)` with 300ms delay.
- Added `window.visualViewport.addEventListener('resize', ...)` as a fourth trigger
  (fires after layout is actually stable on iOS 13+).

**Part 2 — `_smoothPileTopY` snap on resize:**
- `_smoothPileTopY` lerps at 8%/frame. On rotation it held the old H for ~40 frames,
  making `lidWorldY` stale-high and exposing the `#3a4a6a` blue tier-0 band above
  the dirt gradient.
- Fix: `window._smoothPileTopY = null` in `resizeCanvas()`, forcing an immediate
  snap to the current pile position on the first draw after rotation (mirrors `setup()`).

**Part 3 — World-Y remap (root fix):**
- All world-Y positions are expressed as multiples of H (`tier1Bot = H + H/3`,
  `layerBaseY = H*0.97+75`, etc.) and baked at spawn time. After rotation H changes
  but stored Ys do not — tier boundaries (`tier1Bot()`, `cSurf()`) immediately reflect
  new H while objects remain at old-H coords, producing a large visible blue gap.
- Fix: capture `oldH` before updating `H`. If `oldH !== H`, multiply every stored `.y`
  by `newH / oldH` across `trashChunks`, `scraps`, `debris`, `pSegs`, `pHist`,
  `pPath`, and `mY`.
- Also switched `resizeCanvas()` to read from `window.visualViewport` first for
  reliable post-rotation dimensions on iOS.

**Demo location:** `resizeCanvas()` (all three parts); event listener block at bottom
of `<script>` (Part 1).

**Port notes:**
- Parts 1 and 2 are relevant to any HTML5 canvas game deployed on iOS — standard
  patterns worth keeping.
- Part 3 (world-Y remap) is only needed because `spawnScraps()` bakes `H` at init time.
  In production (`game.js` on Devvit), the Reddit app does not rotate — no port relevance.
  If a future non-Devvit build ever targets iOS rotation, the remap pattern here is the
  reference.

⚠ **Known gap:** Tutorial beacon spots set at `spawnTutorialScene()` time are walked
via the `scraps` array remap, but named local refs inside `tutorial.steps` closures are
not remapped. Tutorial navigation after rotation may be slightly off — flagged for the
next session that touches orientation handling.
