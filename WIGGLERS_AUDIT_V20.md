# Wigglers Room — Audit Log V20
> Last updated: 2026-06-19 Session 20 (ISS-13 partially closed; ISS-14 closed; FEAT-1 + PERF-1–4 documented)
> Current state: V21 — rain removed, pooled runtime-only, ISS-14 fully closed

---

## Session 20 — 2026-06-19 (ISS-13 Partial + ISS-14 Closed + PERF-1–4 Documented)

### Session Summary
Closed ISS-14 completely (HP/acid/position persist; KV-vs-localStorage race fixed via timestamp merge). Partially closed ISS-13 — Bug A (tunnel drain decrement) and Bug B (evaporation removed) shipped in prior sessions; Bug C fixed this session by making `pooled` runtime-only (no longer saved to or loaded from KV). Removed rain entirely — saturation now driven only by food drops reaching compost. Fixed pool gradient and saturation glow width (were 4px short of bin walls each side). Documented FEAT-1 (cross-player tunnel clogging) and PERF-1–4 (performance issues identified via diagnostic).

### What Shipped
| Commit | File | What |
|--------|------|------|
| `696121b` | game.js | ISS-14: setSession merge — timestamp wins, stale KV never overwrites newer local save |
| `e106801` | game.js | ISS-14: Save and restore pAcid across sessions |
| `23da7ac` | WIGGLERS_AUDIT_V20.md | FEAT-1 cross-player tunnel clogging design doc |
| `e11d4ec` | game.js | Remove rain — strip precip from weather, seasonal baselines, events, HUD; delete getEvapRate |
| `44d466a` | main.tsx | ISS-13 Bug C: remove pooled from KV_WORLD worldData write |
| `4b0f7a1` | game.js | ISS-13 Bug C: pooled runtime-only — remove from setWorldState, worldUpdate broadcasts, saveSession, setup() restore |
| `1dd642e` | main.tsx | Hotfix: remove sync cache header accidentally committed |
| `53ae826` | game.js | Fix pool gradient + saturation glow fillRect width to full bin edge |

---

## PERF-1 — Trash Chunks: 156 Items × 701-Line Draw Function × 6 Z-Passes

**Priority: P1 — fix before launch. Largest single source of lag.**

### What's happening
`spawnScraps()` creates ~156 `trashChunks` at `WORLD_W=1194` (`(bw - 28) / 38 * scale` per layer × 6 layers). Each frame, `draw()` iterates all 156 items **6 times** (one per Z-depth pass in `drawOrder = [5,2,4,1,3,0]`). For each visible item it calls `drawTrashChunk()` — a 701-line switch statement with **436 canvas operations** per item (fills, strokes, ellipses, bezier curves, save/restore, translate, rotate).

At 60fps with ~50 items visible: **50 items × ~70 canvas ops × 6 passes = ~21,000 canvas state changes per frame** just for trash.

### Root cause
`drawTrashChunk` is called live every frame. It was designed for correctness (accurate shapes), not performance. The 6-pass Z-sort multiplies the cost.

### Fix: Offscreen canvas pre-render at spawn time
Pre-render each trash chunk to its own `OffscreenCanvas` (or regular `document.createElement('canvas')`) once when `spawnScraps()` runs. Cache it on the chunk object as `tc.img`. In the draw loop, replace `drawTrashChunk(ctx, tc.t.name, curR, tc.hpFrac)` with a single `ctx.drawImage(tc.img, -curR, -curR, curR*2, curR*2)`.

HP bar overlay still draws live (cheap). Re-render the offscreen canvas only when `hpFrac` crosses a visible threshold (e.g. every 10% HP).

```js
// In spawnScraps(), after building each chunk:
chunk.img = _prerenderTrashChunk(chunk.t.name, chunk.sz, 1.0); // full HP render

function _prerenderTrashChunk(name, r, hpFrac) {
  var oc = document.createElement('canvas');
  var pad = Math.ceil(r * 1.3); // enough for crust ridges etc.
  oc.width  = pad * 2;
  oc.height = pad * 2;
  var octx = oc.getContext('2d');
  octx.translate(pad, pad);
  drawTrashChunk(octx, name, r, hpFrac);
  return oc;
}

// In draw() trash chunk loop — replace drawTrashChunk call:
ctx.drawImage(tc.img, -pad, -pad, pad*2, pad*2);
```

**Expected speedup: 50–100× reduction in canvas ops for trash rendering.**

### Files to change
- `game.js` `spawnScraps()` — add `_prerenderTrashChunk()` call per chunk
- `game.js` draw loop (line ~5858) — replace `drawTrashChunk` call with `ctx.drawImage`
- `game.js` — new `_prerenderTrashChunk(name, r, hpFrac)` helper function

---

## PERF-2 — pPath Nested Scans: O(drops × pPath) Up to 400,000 Iterations/Frame

**Priority: P1 — fix before launch. Gets worse as the player digs more tunnels.**

### What's happening
`updatePhysics()` processes up to 200 active drops per frame. Each drop that is routing through a tunnel may trigger multiple inner `for` loops scanning `pPath` (up to 2,000 points) — junction scans, segment-end scans, rescan after detach. In the worst case (many drops, long tunnel):

**200 drops × 2,000 pPath points × multiple scans = up to 400,000+ iterations/frame**

Specific hot inner loops identified (all scan from `d.pathIdx` forward to `pPath.length`):
- `_nae` loop (line ~4184) — scan for `nextAfterExit`
- `_uae` loop (line ~4207) — scan for up-drain entry
- `_jsi` / `_jsi2` loops (line ~4235) — junction target scan
- `pi8`, `pi3`, `pi7`, `pi5` loops — segment boundary walks

### Fix: Spatial Y-bucket index on pPath
Divide pPath into Y-buckets of `2 * pSR` height. On each `addPoint()` call, insert the index into the appropriate bucket. `nearestPathIdx()` only scans buckets overlapping the query Y range — typically 1–3 buckets (~10–30 points) instead of 2,000.

```js
var _pPathBuckets = {}; // { bucketKey: [pPath indices] }
var PPATH_BUCKET_H = 8; // px — 2 × pSR

function _pPathBucket(y) { return Math.floor(y / PPATH_BUCKET_H); }

// In addPoint(), after path.push(pt):
var bk = _pPathBucket(pt.y);
if (!_pPathBuckets[bk]) _pPathBuckets[bk] = [];
_pPathBuckets[bk].push(path.length - 1);

// nearestPathIdx() — only scan relevant buckets:
var bMin = _pPathBucket(wy) - 1;
var bMax = _pPathBucket(wy + (yTol || 0)) + 1;
for (var bk2 = bMin; bk2 <= bMax; bk2++) {
  var bucket = _pPathBuckets[bk2];
  if (!bucket) continue;
  for (var bi = 0; bi < bucket.length; bi++) { /* existing check */ }
}
```

Also needs bucket cleanup on `pPath.splice()` prune and `null` insertion (segment separators don't need buckets).

**Expected speedup: 50–200× reduction in pPath scan work during active tunnelling.**

### Files to change
- `game.js` — `_pPathBuckets` global + `PPATH_BUCKET_H` constant
- `game.js` `addPoint()` — insert into bucket on push
- `game.js` pPath prune block (~line 767) — rebuild or prune bucket on splice
- `game.js` `nearestPathIdx()` — replace full scan with bucket scan
- `game.js` tunnel decay loop (`tdi` loop) — may benefit from bucket too

---

## PERF-3 — Blade Fringe: 298 Individual Triangle Fills Every Frame

**Priority: P2 — visible cost, easy fix.**

### What's happening
`draw()` draws a grass blade fringe at the horizon with a `for` loop over `WORLD_W / 4 = 298` iterations, each doing `beginPath` + `moveTo` + `lineTo` × 2 + `closePath` + `fill`. That's **~1,788 canvas calls per frame** when the horizon is on screen — which is most of the time (worm lives near the surface often).

```js
// Current — 298 beginPath/fill per frame:
var bladeCount = Math.floor(WORLD_W / 4);
for (var gi = 0; gi < bladeCount; gi++) { /* beginPath, moveTo, lineTo, fill */ }
```

### Fix: Pre-render to offscreen canvas once
Render the full `WORLD_W × 20px` blade strip to an offscreen canvas in `setup()`. In `draw()`, replace the loop with a single `ctx.drawImage(bladeCanvas, -centreOffsetX, horizScreenY - 18)`.

```js
// In setup() — render once:
var bladeCanvas = document.createElement('canvas');
bladeCanvas.width  = WORLD_W;
bladeCanvas.height = 24;
var bctx = bladeCanvas.getContext('2d');
// ... same loop, drawn into bctx at y=20 ...
window._bladeCanvas = bladeCanvas;

// In draw() — replace loop:
if (horizScreenY > -24 && horizScreenY < H) {
  ctx.drawImage(window._bladeCanvas, -centreOffsetX, horizScreenY - 20);
}
```

**Expected speedup: 1,788 canvas calls → 1 drawImage per frame.**

### Files to change
- `game.js` `setup()` — call `_buildBladeCanvas()` once
- `game.js` `draw()` — replace blade fringe loop with `drawImage`
- `game.js` — new `_buildBladeCanvas()` helper

---

## PERF-4 — Debris + Scraps: Up to 600 Items with Save/Translate/Rotate/Restore Each

**Priority: P2 — secondary to PERF-1 and PERF-2.**

### What's happening
`draw()` processes up to 300 `debris[]` items and up to 300 `scraps[]` items. Each gets its own `ctx.save()` → `ctx.translate()` → `ctx.rotate()` → `drawDebrisFragment()` (226 lines, 135 canvas ops) → `ctx.restore()`. At cap:

**600 items × (save + translate + rotate + ~30 ctx ops + restore) = ~19,200 canvas ops/frame**

`drawDebrisFragment` is a 226-line switch statement similar to `drawTrashChunk` — same problem, smaller scale.

### Fix A: Pre-render debris fragments (same approach as PERF-1)
Pre-render each unique `(name, col, col2, sz)` combination to an offscreen canvas. Cache by a `name+sz` key. `drawDebrisFragment` called once per unique type, then `drawImage` at each instance position.

### Fix B: Lower debris cap
`MAX_DEBRIS` is not defined — debris is capped at 300 by an inline check (`if (debris.length < 300)`). Reducing this to 80–100 would halve the cost with minimal visual impact (debris is small particles). Same for scraps.

### Fix C: Skip rotate for settled scraps
Most settled scraps have `rotSpd` near zero after landing. Skip `ctx.rotate()` (and save/restore) when `Math.abs(s.rot) < 0.02` — use `ctx.translate` only, draw upright.

### Files to change
- `game.js` — `_buildDebrisCache()` pre-render helper
- `game.js` debris draw loop (~line 6026) — `drawImage` instead of `drawDebrisFragment`
- `game.js` scraps draw loop — same
- `game.js` — lower inline debris cap from 300 → 80

---



## Session 19 — 2026-06-19 (ISS-1 + ISS-2 Closed | ISS-13 Opened)

### Session Summary
Shipped Moves 3+4 of the weekly drain persistence plan — the final two pieces to make the bin's drain cycle survive across sessions. When `triggerWeeklyDrain()` fires and game.js sends `worldUpdate` with `weeklyDrain: true`, main.tsx now stamps a fresh `weekStartTs = serverNow`, writes it to `KV_WEEK`, and includes it in the Realtime broadcast. All open clients reset their local `weekStartTs` on receipt. ISS-1 and ISS-2 are closed.

Also identified ISS-13: a structural bug in the compost saturation mechanic (`pooled`) where the numeric value and the liquid drops that give it meaning are stored separately and can diverge. Documented below — P1 pre-launch.

### What Shipped
| Commit | File | What |
|--------|------|------|
| `54b91d4` | main.tsx | Move 3: Persist `weekStartTs` to `KV_WEEK` when `weeklyDrain === true` |
| `54b91d4` | main.tsx | Move 4: Broadcast `weekStartTs` in Realtime on drain so all clients reset epoch |

---

## ISS-13 — Compost Saturation: Three Compounding Bugs

**Priority: P1 — must fix before launch**

---

### Bug A — Draining tunnels do not reduce saturation

**The core gameplay bug.** When a player digs a tunnel to the sump, tea drops flow through it and `d.inTunnel = true`. When that drop enters the sump zone, the pooled decrement is guarded:

```js
// game.js line 4533
if (!d.inTunnel && !d.isPoop) pooled = Math.max(0, pooled - 0.005);
```

The `!d.inTunnel` guard means **tunnel drops never decrement `pooled`**. They hit the tea surface, fire a splash, add to `tLvl`, and disappear — but saturation stays exactly where it was. The player digs drains, watches tea fill up, and the green moisture glow never moves. This is why draining feels broken: it *is* broken for saturation.

**Fix:** Remove the `!d.inTunnel` guard from the sump entry decrement, OR add a separate decrement at the `_teaHit` point when `d.active = false`.

---

### Bug B — Evaporation silently removes drops the player never sees

Evaporation runs every frame on all active, pathless, non-poop drops in compost:

```js
// game.js line 4573
var _evapChance = getEvapRate() * 10;  // ≈ 0.000625 per drop per frame at median weather
if (Math.random() < _evapChance) {
  _cd.active = false;
  pooled = Math.max(0, pooled - 0.005);
}
```

At median weather (~70°F, ~50% RH) each stalled drop has a 1-in-1600 chance per frame of vanishing. With 20 stalled drops at 60fps that's about 0.75 drops/sec. Saturation drains in ~27 seconds with no player action. **The player sees the moisture glow fade with no visual explanation.** They dug no drains, no drops are visibly disappearing — the compost just quietly dries on its own.

This undermines the core design intent (draining = the mechanic) and creates confusing feedback. The player can't tell if their drains worked or if weather did it.

**Fix:** Remove or disable the evaporation loop. Drainage should be the only way to reduce saturation. If some passive decay is wanted, it should be extremely slow (days-scale, not seconds-scale) and clearly tied to a visible mechanic.

---

### Bug C — pooled is a ghost counter that detaches from reality

`pooled` is never recalculated from the actual drop array. It is purely event-driven:
- Drop enters compost → `pooled += 0.005`
- Drop evaporates → `pooled -= 0.005`
- (Tunnel drain → nothing, see Bug A)

`pooled` is also stored in `KV_WORLD` (shared, no drops) while `drops[]` lives in `KV_WORM_SESSION` (per-player). This means:

**New player joins a wet bin:** Gets `pooled = 0.8` from `KV_WORLD`. Has zero drops. Evaporation loop finds nothing to evaporate. `pooled` is stuck at 0.8 forever. Worm takes constant drowning HP damage in bone-dry compost.

**Two players in the same bin:** Each client counts only its own drops but writes to shared `pooled` via Realtime. They fight over the value every broadcast cycle. Neither player's moisture reading is accurate.

**Returning player:** `setWorldState` fires *after* `setup()` so `KV_WORLD.pooled` overwrites whatever the player's own saved drops would have produced. Drop count and counter are now mismatched.

**Fix (recommended for launch):** Make `pooled` local-only. Stop syncing it via Realtime and stop storing it in `KV_WORLD`. Each client derives moisture from its own drops only. The shared world values (`tLvl`, `castingEnrichment`, `scrapsLevel`) are objective and drop-independent — they stay synced. `pooled` is the one value that is inherently local.

---

### Combined Effect on Gameplay
1. Player plays for a while — compost gets wet from food drops and rain
2. Saturation appears high (green glow, correct)
3. Player digs drains hoping to reduce it — **nothing happens to saturation** (Bug A)
4. Meanwhile evaporation quietly removes drops and pooled decrement fires — **saturation drops with no visible cause** (Bug B)
5. Player returns next session — `KV_WORLD.pooled` value may have no real drops to back it — **phantom saturation or phantom dry** (Bug C)
6. Worm takes drowning damage with no saturated-looking compost or vice versa

---

### Files to Change

**Bug A fix** — `game.js`:
- At `_teaHit` (line ~4554): add `if (!d.isPoop) pooled = Math.max(0, pooled - 0.005);` alongside `d.active = false`
- Remove the `!d.inTunnel` guard on the sump entry decrement (line 4533) OR leave that block only for pathless drops and handle tunnel drops at hit-point

**Bug B fix** — `game.js`:
- Remove the entire evaporation `for` loop (lines 4567–4581)
- Remove `getEvapRate()` function (line 560) if nothing else uses it (verify first)

**Bug C fix** — `game.js` + `main.tsx`:
- `game.js` line 390: remove `pooled` from `setWorldState` handler
- `game.js`: remove `pooled` from all `postToHost({ type: 'worldUpdate', ... })` calls
- `main.tsx` MSG_WORLD_UPDATE: remove `pooled` from `worldData` object
- `main.tsx`: remove `pooled` from `KV_WORLD` reads/writes
- Keep `pooled` in `saveSession()` / `KV_WORM_SESSION` so each player's own moisture persists across their own sessions


---

## ISS-14 — Non-sleeping worm restores to full HP and wrong position on reload

**Priority: P1 — must fix before launch**

### What the player sees
- Put worm to sleep → leave → come back → worm is exactly where you left it, sleeping ✅
- Leave worm active (not sleeping) → come back → worm is at full HP, back at spawn position ❌

The sleeping path works correctly. The active worm path has three compounding problems.

---

### Bug A — pHP hardcoded to 1.0 on every session load

`game.js` `setup()`, line 3137:
```js
// Always spawn at full health — saved HP ignored, hunger is the pressure
pHP = 1.0;
```

`saved.pHP` is read and clamped by `clampSession()` in `main.tsx` and stored in `KV_WORM_SESSION` correctly — but `setup()` unconditionally overwrites it with `1.0` on every load. The comment says "hunger is the pressure" but hunger only affects gut, not HP directly. HP damage from acid, oversaturation, and flood all get silently restored on reload.

**Fix:** Remove the `pHP = 1.0` override at line 3137 and restore `pHP` from `saved.pHP` the same way `pGut` is restored. Keep the `pHP = 1.0` resets in `respawnPlayer()` — those are correct (baby respawn and cocoon hatch should start fresh).

---

### Bug B — No save-on-exit, only a 30-second autosave

`game.js` line 3028:
```js
setInterval(function() { if (!deathScreen && pSegs.length) saveSession(); }, 30000);
```

There is no `visibilitychange`, `beforeunload`, or `pagehide` listener. If the player leaves the game at any point between autosave ticks — which is a 30-second window — the position, gut, and HP saved to KV are up to 30 seconds stale. On a mobile app where backgrounding kills the webview instantly, this window is effectively always open.

The sleeping path avoids this because `trySleep()` calls `saveSession()` explicitly at the moment of sleep. Active worm has no equivalent save-on-exit.

**Fix:** Add a `visibilitychange` listener that calls `saveSession()` when `document.visibilityState === 'hidden'`. This fires on tab switch, app background, and most close events in both mobile WebView and desktop browser.

```js
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden' && !deathScreen && pSegs.length) {
    saveSession();
  }
});
```

---

### Bug C — Position restoration relies on autosave being recent

`initPlayer(saved)` at line 2859 does restore `saved.pX` and `saved.pY` correctly:
```js
var startX = (saved && saved.pX) ? saved.pX : b.cx;
var startY = (saved && saved.pY) ? Math.max(H * 0.55, Math.min(H * 3.8, saved.pY)) : H * 1.4;
```

But if Bug B isn't fixed, `saved.pX/pY` may be the position from 30 seconds ago, not where the player actually left. On a fast session (under 30s) the very first autosave may not have fired at all, so `saved.pX/pY` is `null` → falls back to `b.cx` (bin center) at `H * 1.4` (tier 0 spawn). This is the "comes back at spawn" symptom.

**Fix:** Bug B's `visibilitychange` save fixes this automatically — position is always current at the moment of exit.

---

### Why sleeping works and active doesn't

| | Sleeping | Active |
|--|---------|--------|
| Save on state change | ✅ `trySleep()` calls `saveSession()` | ❌ only 30s autosave |
| Position restored | ✅ `pSleepX/Y` + `pX/pY` both saved at sleep time | ⚠ only if autosave fired recently |
| HP restored | ❌ hardcoded `pHP = 1.0` (same bug, masked by sleeping HP being high) | ❌ hardcoded `pHP = 1.0` |
| Gut restored | ✅ `saved.pGut` restored correctly | ✅ `saved.pGut` restored correctly |

Note: sleeping worm also has this HP bug but it's invisible because a sleeping worm isn't taking damage — HP is usually full when you sleep anyway.

---

### Files to Change

**Bug A fix** — `game.js` line 3137:
- Replace `pHP = 1.0;` with `pHP = Math.max(0.01, Math.min(1, saved.pHP || 1.0));`
- The `0.01` floor prevents loading a dead worm (pHP=0 should have triggered death screen before save)
- Keep `pHP = 1.0` in `respawnPlayer()` (line 7804, 7814, 7819) — those are intentional fresh starts

**Bug B fix** — `game.js` after line 3028 (near the autosave interval):
```js
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden' && !deathScreen && pSegs.length) {
    saveSession();
  }
});
```

Bug C is resolved automatically by Bug B fix.

---

### Interaction with ISS-13

Once ISS-13 is fixed (`pooled` becomes local-only), the `visibilitychange` save also ensures the player's saturation state is written before exit — keeping their moisture level accurate on return. ISS-13 and ISS-14 should be fixed in the same session.

---

## Session 18 — 2026-06-19 (ISS-12 Closed)

### Session Summary
Sole focus: close ISS-12 (drain Snoo positioning). After several failed attempts in prior sessions, the root cause was identified as a coordinate space mismatch — `drawSnooDrain()` was being called after `ctx.restore()` (screen space) while the valve was drawn inside `ctx.translate(centreOffsetX - camX, 0)` (world space). On mobile where `camX ≈ 400px`, this caused Snoo to appear ~400px to the right of the tap. The fix was one structural move: call `drawSnooDrain()` inside the world transform, identical to how `drawSnooCinematic()` (feed Snoo) has always worked. ISS-12 is now closed. Moves 3+4 of bin persistence are unblocked.

### What Shipped
| Commit | Change |
|--------|--------|
| `f276300` | Derive `STOP_Y` from `tapSY` geometrically — bucket mouth 15px below spout. Replace hardcoded `H*0.559`. |
| `a113987` | Convert `drainSnooStopX` and `TAP_SX` to screen space (partial fix, wrong approach). |
| `78ef406` | Store `_tapWorldX` at draw time, convert at cinematic time (still wrong approach). |
| `fb12b98` | **The real fix:** move `drawSnooDrain()` inside world transform, same as feed Snoo. Remove all screen-space conversion hacks. Net -13 lines. |
| `024879d` | Lower Snoo 100px (`tapSY + 137 - _handOff`) — head at 52% down screen, boots at 68%. |

### Root Cause (ISS-12)
Feed Snoo (`drawSnooCinematic` → `drawFarmerSnoo`) was always called at line ~5476, inside `ctx.translate(centreOffsetX - camX, 0)`. It uses `b.cx` world coords and the transform handles conversion automatically — zero conversion math needed, works on every device.

Drain Snoo (`drawSnooDrain`) was called at line ~7291, **after** `ctx.restore()`. In screen space, `b.cx = WORLD_W/2 = 597` is a world coord, not a screen coord. On mobile where `camX ≈ 400`, the tap appears at screen X ≈ 197 but Snoo was placed at screen X ≈ 597 — a ~400px misalignment.

### Key Lesson
> **All Snoo cinematics must be drawn inside `ctx.translate(centreOffsetX - camX, 0)`.** World coords work natively. Calling any cinematic after `ctx.restore()` and attempting to convert coords manually is the wrong approach and will break on mobile.

### Final Drain Snoo Geometry (H=800)
```
camY snap             = round(3*H + H*0.25 - H*0.45)  → sump floor at 45% down
TAP_SY                = bsy + 8   (46% down)
Spout tip             = TAP_SY + 22  (49% down)
STOP_Y (torso top)    = TAP_SY + 137 - SC*0.1788  (60% down)
Snoo head top         ≈ 52% down
Snoo boots bottom     ≈ 68% down
drainSnooStopX        = b.cx - SC*0.127  (world X, inside world transform)
```

---

## Session 17 — 2026-06-18 (Canvas Resize + Desktop Layout)

### Session Summary
Fixed canvas sizing and layout issues only visible on desktop and fullscreen. Root cause was a one-time guard in `resizeCanvas()` preventing `W`/`H` from updating after first paint.

### What Shipped
| Commit | Change |
|--------|--------|
| `c18e1cf` | Fix `resizeCanvas()` — remove one-time guard, always update W/H on every resize |
| `db5fb1b` | Fix camX on wide screens — lock `camX = 0` when `W >= WORLD_W` |
| `2899a9a` | Fix sky/ground fillRects — compensate for `ctx.translate` |
| `6ebd284` | Fix grass tufts, blade fringe, flowers X position |
| `5eeb24b` | Introduce `centreOffsetX` global. Fix all 15 affected locations. |
| `058090b` | Fix background elements using `W` instead of `WORLD_W` |
| `ddf1e8a` | Fix base green ground fill — `WORLD_W` not `W` |
| `beeb7bb` | Fix sky fill and sun/moon clip rect — `WORLD_W` not `W` |

---

## Session 16 — 2026-06-18 (Bin Persistence + HUD + Drain Animation)

### What Shipped
| Commit | File | What |
|--------|------|------|
| `263ead7` | main.tsx | Move 1: Read `KV_WEEK` on open, stamp if missing, send `weekStartTs` via `setWorldState` |
| `f24bb39` | game.js | Move 2: `setWorldState` handler accepts `weekStartTs`, overwrites local clock |
| `05efd5a` | game.js | Bin Refresh HUD under clock, drain→feed chain, `weeklyFeedPending` flag |
| `60f5618` | game.js | Feed camera snap when chaining from drain |

### What Works
- **Bin Refresh HUD** — `🪣 Refresh in 5d 14h 23m` centred under clock, counts down live
- **Drain→feed chain** — no gap between cinematics
- **Move 1+2** — all players share `weekStartTs` from `KV_WEEK` on open

---

## Session 15 — 2026-06-17

| SHA | Change |
|-----|--------|
| `d180d0d` | Fix: username shown above worm head |
| `cf64c96` | Fix: `user.getSnoovatarUrl()` correct Devvit API |
| `ce2eb1e` | Fix: Snoovatar drawn full-body portrait |
| `4a95535` | Fix: pre-render Snoovatar to offscreen canvas |
| `d624a1e` | Feature: full simulated weather system |
| `424ad15` | Fix root cause: W=viewport width, WORLD_W=1194 fixed |
| `a970e17` | Fix: _toCanvas uses root offset, all mX assignments add camX |

---

## Session 14 — 2026-06-17

| SHA | Fix |
|-----|-----|
| `1a58fae` | Snoo drain invisible on mobile — camera formula |
| `81d2049` | Snoo push-down/push-up during cinematic |
| `ee574a2` | Death headstone comment posted to Reddit thread |
| `1641bbe` | Preview background — trash chunk wallpaper |
| `4b0ac87` | Added Devvit message envelope unwrap in game.js |
| `b7089f4` | Removed strict origin check |

---

## Devvit Platform Lessons Learned (CRITICAL — read before every session)

### Asset Rules
- ✅ **PNG only** — Devvit asset uploader rejects GIF, JPG, any non-PNG
- ✅ **Push binary files via GitHub API directly** — sync script corrupts binary files
- ✅ **Assets folder** — put all images in `/assets/`, referenced by filename only

### Devvit API
- ✅ **`user.getSnoovatarUrl()`** — method call, not a property
- ✅ **External HTTP blocked** — `fetch()` to non-Reddit domains silently fails
- ✅ **`webView.mount()` only inside `onPress`** — never in render body

### Realtime / useChannel
- ✅ **Channel names must be `[a-zA-Z0-9_]` only** — colons crash render
- ✅ **Declare `useChannel` after `useWebView`**

### Message Bridge
- ✅ **Devvit wraps `webView.postMessage()` in an envelope** — `{ type: 'devvit-message', data: { message: ... } }`
- ✅ **Origin of host→webview messages is NOT `https://www.reddit.com`**
- ✅ **Sync script prepends header to file content** — strip before using as game file

### Post Lifecycle
- ✅ **Old posts go read-only after re-upload** — create new post to test
- ✅ **Always `git pull` before `devvit upload`**

### Canvas / Coordinate System
- ✅ **`resizeCanvas()` must always update W/H** — never guard with `if (!W || !H)`
- ✅ **`camX` must always be `>= 0`** — negative camX breaks `ctx.translate` and mouse coords
- ✅ **Use `centreOffsetX` to centre on wide screens** — not negative camX
- ✅ **Background elements use `WORLD_W` not `W`** — sky, ground, sun, moon, stars, grass, flowers
- ✅ **`mX = screenX - centreOffsetX + camX`** — all pointer → world coord conversions need centreOffsetX subtracted

### Snoo Cinematics (NEW — Session 18)
- ✅ **All `drawSnoo*` calls must be inside `ctx.translate(centreOffsetX - camX, 0)`** — world coords work natively
- ✅ **Never call cinematics after `ctx.restore()`** — screen-space coord conversion is always wrong on mobile
- ✅ **`drainSnooStopX = b.cx - SC*0.127`** — world X, no camX/centreOffsetX needed when inside world transform
- ✅ **`STOP_Y = tapSY + 137 - SC*0.1788`** — torso anchor derived from tap geometry, not hardcoded H fraction
- ✅ **Feed Snoo is the reference** — if positioning breaks, check whether the draw call is inside the world transform

---

## Priority Queue — Next Session

### P1 — Weekly Drain Moves 3+4 (ISS-12 now closed — ship these next)
- Move 3: Persist new `weekStartTs` in `KV_WEEK` when drain fires (main.tsx, ~8 lines)
- Move 4: Broadcast new `weekStartTs` via Realtime on drain (main.tsx, ~2 lines)
- Closes ISS-1 and ISS-2

### P2 — Code Health (game.js)
| Task | What |
|------|------|
| S2a | 18 raw message strings → `MSG_*` constants |
| S2b | 5 duplicate Snoo SVG helper pairs → shared functions |
| S3  | Delete 4 dead functions |
| S4  | Rename 17 `_underscore` functions → camelCase |
| S5  | Split `draw()`, `updatePhysics()`, `updatePlayer()` monoliths |

### P3 — Pre-Launch
- Hash `DEBUG_PASSWORD` (currently plaintext `'wigglers2025'`)

---

## Known Issues (Open)

| ID | Issue | Priority |
|----|-------|----------|
| ISS-13 | `pooled` counter detached from drops — ghost saturation, fake drowning/flood | P1 — pre-launch |
| ISS-3 | 17 `_underscore` function names | P2 |
| ISS-4 | `draw()` 2,022 line monolith | P2 |
| ISS-5 | 5 duplicate Snoo SVG helper pairs | P2 |
| ISS-6 | 18 raw message strings in game.js | P2 |
| ISS-7 | 4 dead functions in codebase | P2 |
| ISS-8 | `DEBUG_PASSWORD` plaintext | P3 |
| ISS-9 | `bornTs` not stamped on cocoon hatch respawn | Low |
| ISS-10 | `weeklyContrib` client-authoritative | P3 |
| ISS-11 | Drain only fires while a player has the game open | Future |

---

## Closed Issues

| Fix | Session |
|-----|---------|
| Weekly drain persistence (Moves 3+4) — `KV_WEEK` written on drain, `weekStartTs` broadcast via Realtime | S19 |
| Drain Snoo X misalignment — called outside world transform, 400px off on mobile | S18 |
| Drain Snoo Y positioning — STOP_Y hardcoded H fraction, not derived from tap geometry | S18 |
| Canvas only fills half screen on desktop / fullscreen black bar | S17 |
| Background details (grass, flowers, sun, moon) wrong size on desktop | S17 |
| camX going negative on wide screens — broke steering and bin position | S17 |
| resizeCanvas() one-time guard — W/H never updated after first paint | S17 |
| u/You hardcoded — username variable not used in avatar render | S15 |
| Snoovatar fetch used wrong Devvit API | S15 |
| Snoovatar circle-cropped — should be full-body portrait | S15 |
| Snoovatar flicker — per-frame scaling, fixed by offscreen canvas | S15 |
| Weather HUD overlapping karma | S15 |
| Weather system dead-ended on external API — replaced with simulation | S15 |
| Bin size inconsistent across devices — WORLD_W=1194 fixed | S15 |
| camX never scrolled right — getBin() was using W not WORLD_W | S15 |
| Pointer/touch offset after coordinate system change | S15 |
| Snoo drain invisible on mobile (camera formula) | S14 |
| Snoo push-down/push-up during cinematic | S14 |
| Loading screen icon lost in revert | S14 |
| Death never posted to thread | S14 |
| Headstone dates were fake | S14 |
| Any user could create a bin post | S14 |
| Preview card had plain brown background | S14 |
