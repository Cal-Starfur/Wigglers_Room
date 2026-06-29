# DEMO DELTA — Changes in demo vs game.js

Tracks every meaningful divergence between `wigglers-demo-t05.html` and the
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
