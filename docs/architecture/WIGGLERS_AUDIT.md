
# Wigglers Room — Audit Log

> **Rebuilt:** 2026-06-19 — restructured for clarity (was append-only since S14)
> **Current session:** 25 | **Devvit version:** 0.0.201 | **game.js:** ~8,950 lines | **main.tsx:** ~1,050 lines
> **Next P1:** PERF-1 (trash chunk offscreen pre-render) — largest single source of lag

---

## Section 1 — Devvit Platform Rules (Read Every Session)

Hard-won lessons. Violating these causes silent failures or broken deploys.


### GitHub CI (added 2026-06-20)
- 4-job pipeline: typecheck → lint → test → build running on every push
- Strict ESLint (`@typescript-eslint/recommended-requiring-type-checking`) — zero errors required
- `notify-calendar.yml` auto-syncs project calendar in claude-skills on push
- `vitest.config.ts` ready — add `.test.ts` files to `src/` to activate real tests

### Assets
- PNG only — GIF/JPG rejected by Devvit uploader
- Push binary files via GitHub API directly — sync script corrupts binaries
- All images in `/assets/`, referenced by filename only

### Devvit API
- `user.getSnoovatarUrl()` — method call, not a property
- External `fetch()` to non-Reddit domains silently fails — blocked by sandbox
- `webView.mount()` only inside `onPress` — never in render body (fires every render = crash)

### Realtime / useChannel
- Channel names must be `[a-zA-Z0-9_]` only — colons crash render
- Declare `useChannel` after `useWebView` — scope dependency

### Message Bridge
- Devvit wraps `webView.postMessage()` in envelope: `{ type: 'devvit-message', data: { message: ... } }`
- Origin of host→webview messages is NOT `https://www.reddit.com` — removed strict origin check
- game.js uses **raw strings** for message types — MSG_* constants not yet applied (S2 reverted, P2)

### Post Lifecycle
- Old posts go read-only after re-upload — create new post to test every time
- Always `git pull` before `devvit upload` — API push bypasses local git

### Canvas / Coordinate System
- `resizeCanvas()` must always update W/H — never guard with `if (!W || !H)`
- `camX` must always be `>= 0` — negative camX breaks translate and pointer coords
- Background elements use `WORLD_W` not `W` — sky, ground, sun, moon, stars, grass, flowers
- `mX = screenX - centreOffsetX + camX` — all pointer→world conversions

### Snoo Cinematics
- All `drawSnoo*` calls must be inside `ctx.translate(centreOffsetX - camX, 0)` — world coords work natively
- Never call cinematics after `ctx.restore()` — screen-space conversion breaks on mobile
- Feed Snoo is the reference implementation — if positioning breaks, check world transform

### Version Tracking
- Devvit auto-increments its internal version on every `devvit upload`
- We track it in `devvit.yaml` — auto-bumped by `propose_commit.py` after every push
- Current: `0.0.179` → next push will become `0.0.180`

---

## Section 2 — Open Issues

### Priority table

| ID | Priority | Devvit version introduced | Summary |
|----|----------|--------------------------|---------|
| PERF-1 | ✅ SHIPPED S21 | ~0.0.160 | Trash chunks: 21k canvas ops/frame — offscreen pre-render |
| PERF-2 | ✅ SHIPPED S22 | ~0.0.160 | pPath nested scans: Y-bucket index, O(2000) → O(10-30) |
| ISS-13 Bug A | ✅ CLOSED S22 | 0.0.170 | Tunnel drains decrement `pooled` at `_teaHit` — verified correct |
| ISS-15 | P2 — needs arch analysis | 0.0.184 | Tea drifts out of tube through compost to lowest world-Y point |
| PERF-3 | ✅ SHIPPED S22 | ~0.0.160 | Blade fringe: 1,788 canvas calls/frame — offscreen pre-render |
| PERF-4 | ✅ SHIPPED S22 | ~0.0.160 | Debris cap 300→80; skip rotate() for settled scraps |
| ISS-3  | P2 | ~0.0.140 | 17 `_underscore` function names (S4 rename reverted) |
| ISS-4  | P2 | ~0.0.140 | `draw()` 2,022-line monolith (S5 split reverted) |
| ISS-5  | P2 | ~0.0.140 | 5 duplicate Snoo SVG helper pairs |
| ISS-6  | P2 | ~0.0.140 | 18 raw message strings in game.js (S2 reverted) |
| ISS-7  | P2 | ~0.0.140 | 4 dead functions in codebase |
| ISS-8  | P3 | 0.0.100 | `DEBUG_PASSWORD` plaintext `'wigglers2025'` |
| ISS-9  | Low | ~0.0.150 | `bornTs` not stamped on cocoon hatch respawn |
| ISS-10 | P3 | ~0.0.150 | `weeklyContrib` client-authoritative |
| ISS-11 | Future | ~0.0.150 | Weekly drain only fires while a player is open |
| FEAT-1 | Future | logged S20 | Cross-player tunnel clogging (design doc below) |
| ISS-19 | P1 — July 1 (START HERE) | S25 | localStorage race — game boots from local save before Devvit responds. Root cause of all ISS-18/FEAT-2 symptoms. Fix spec in docs/ISS-19-SPEC.md. |
| FEAT-2 | P1 — July 1 (after ISS-19) | S25 | Device conflict overlay not showing on mobile. Debug build live (0.0.201). S26: enable DEBUG_MODE on desktop, read conflict= field, fix and redeploy. |
| FEAT-3 | P3 | logged S20 | Passive bridge version capture (design doc below) |
| FEAT-4 | P2 | logged S21 | Long-press drain/tunnel placement + sleep scoping + drain visual unification (design doc below) |

| ISS-16 | Audit | main.tsx | `_MSG_SET_FLOOD_RESERVED` — placeholder msg type for flood events; flood currently game.js-only. Investigate when multiplayer flood sync is needed. |
| ISS-17 | Audit | main.tsx | `_KV_COCOONS_RESERVED` — placeholder KV key for cocoon storage; cocoons currently bundled in world state. Investigate when cocoons need dedicated KV or cross-player interactions. |
| ISS-18 | ✅ SHIPPED S24 | S23 | KV_WORLD now authoritative — tLvl/castingEnrichment removed from worm session; scrapsLevel added to all worldUpdate sends. |

---

## Section 3 — Open Issue Detail

### PERF-1 — Trash Chunks: 21,000 Canvas Ops/Frame

**Priority: P1 — fix next session**
**Introduced:** ~0.0.160 | **Fix ready:** yes — offscreen pre-render

`spawnScraps()` creates ~156 `trashChunks`. Each frame `draw()` iterates all 156 items **6 times** (one per Z-depth pass in `drawOrder = [5,2,4,1,3,0]`). For each visible item it calls `drawTrashChunk()` — a 701-line switch statement with 436 canvas operations per item.

At 60fps with ~50 items visible: **50 × ~70 canvas ops × 6 passes = ~21,000 canvas state changes/frame** just for trash.

**Fix:** Pre-render each trash chunk to `OffscreenCanvas` once at `spawnScraps()` time. Cache as `tc.img`. Replace `drawTrashChunk()` call with `ctx.drawImage(tc.img, ...)` in draw loop.

```js
function _prerenderTrashChunk(name, r, hpFrac) {
  var oc = document.createElement('canvas');
  var pad = Math.ceil(r * 1.3);
  oc.width = pad * 2; oc.height = pad * 2;
  var octx = oc.getContext('2d');
  octx.translate(pad, pad);
  drawTrashChunk(octx, name, r, hpFrac);
  return oc;
}
// In spawnScraps(): chunk.img = _prerenderTrashChunk(chunk.t.name, chunk.sz, 1.0);
// In draw() loop: ctx.drawImage(tc.img, -pad, -pad, pad*2, pad*2);
```

HP bar still draws live (cheap). Re-render offscreen only when `hpFrac` crosses 10% threshold.

**Files:** `game.js` — `spawnScraps()`, draw loop (~line 5858), new `_prerenderTrashChunk()` helper
**Expected speedup:** 50–100×

---

### PERF-2 — pPath Nested Scans: Up to 400,000 Iterations/Frame

**Priority: P1 — fix next session**
**Introduced:** ~0.0.160 | **Fix ready:** yes — Y-bucket index

`updatePhysics()` processes up to 200 active drops/frame. Each drop routing through a tunnel triggers multiple inner `for` loops scanning all 2,000 pPath points.

Hot loops: `_nae` (~line 4184), `_uae` (~line 4207), `_jsi`/`_jsi2` (~line 4235), `pi8/pi3/pi7/pi5` segment boundary walks.

**Fix:** Y-bucket index on pPath — divide into `PPATH_BUCKET_H = 8px` buckets. `nearestPathIdx()` scans only 1–3 buckets (~10–30 points) instead of 2,000.

```js
var _pPathBuckets = {};
var PPATH_BUCKET_H = 8;
function _pPathBucket(y) { return Math.floor(y / PPATH_BUCKET_H); }
// In addPoint(): insert index into bucket
// In nearestPathIdx(): only scan bMin–bMax buckets
// Cleanup needed on pPath.splice() prune
```

**Files:** `game.js` — `_pPathBuckets` global, `addPoint()`, pPath prune block (~line 767), `nearestPathIdx()`
**Expected speedup:** 50–200×

---

### ISS-13 Bug A — Tunnel Drains May Not Decrement pooled

**✅ CLOSED S22 — verified correct in code**
**Introduced:** 0.0.170 | **Fixed:** S20 | **Verified:** S22

The `!d.inTunnel` guard was removed in S20. Verified S22: `_teaHit` block correctly decrements `pooled` for tunnel drops with no `inTunnel` guard, poop excluded. Fix is confirmed live.

```js
// Confirmed in game.js _teaHit block:
if (!d.isPoop) pooled = Math.max(0, pooled - 0.005); // no inTunnel guard ✓
```

---

### PERF-3 — Blade Fringe: 1,788 Canvas Calls/Frame

**✅ SHIPPED S22 — Devvit 0.0.185**
**Introduced:** ~0.0.160

Pre-rendered all grass blades to an offscreen canvas (`_buildBladeCanvas()`) once in `setup()`. Draw loop replaced with single `ctx.drawImage(_bladeCanvas, 0, horizScreenY - 20)`. Canvas is WORLD_W × 20px, blades drawn at base Y=20.

**Files:** `game.js` — `_buildBladeCanvas()` (new), `setup()` call, `draw()` loop replaced
**Result:** 1,788 calls/frame → 1 drawImage

---

### PERF-4 — Debris + Scraps: 19,200 Canvas Ops/Frame

**✅ PARTIALLY SHIPPED S22 — Devvit 0.0.186**
**Introduced:** ~0.0.160

Two of three fixes shipped:
- ✅ Debris spawn cap lowered 300 → 80
- ✅ Skip `ctx.rotate()` for settled scraps where `Math.abs(s.rot) < 0.02`
- 🔲 Pre-render unique `(name, col, col2, sz)` combos — deferred, `sz` varies continuously making this non-trivial

**Files:** `game.js` — debris spawn cap, scraps draw loop

---

## Section 4 — Feature Backlog

### FEAT-1 — Cross-Player Tunnel Clogging

**Priority: Future** | **Logged:** S20 (Devvit 0.0.179)

When Player A's poop clogs a tunnel, Player B walking through the same tunnel should encounter the blockage. Currently clog state is local-only per client. Requires broadcasting clog state via Realtime presence updates.

Full design doc was written in S20 — refer to that session's commit `23da7ac` in WIGGLERS_AUDIT_V20.md (pre-rebuild) for the full spec.

---

### FEAT-2 — Cross-Device Session Continuity

**Priority: P2 — after PERF-1 and PERF-2** | **Logged:** S20 (Devvit 0.0.179)

Same Reddit login on two devices should give the same worm. What already works: `KV_WORM_SESSION` is per-user not per-device. What breaks: simultaneous open = last-write-wins race. No "already playing" signal.

**Fix:** Active device heartbeat token in `KV_ACTIVE_DEVICE(username)`. 15s heartbeat renews it. On open: if fresh token exists → show conflict UI ("Take over / Wait"). On close: `visibilitychange` clears token via `MSG_DEVICE_RELEASE`.

**New constants:**
```js
// game.js
var DEVICE_HEARTBEAT_MS = 15000;
var DEVICE_LOCK_TTL_MS = 45000;
// main.tsx
KV_ACTIVE_DEVICE(username) → 'worm_active:u/username'
MSG_DEVICE_HEARTBEAT, MSG_DEVICE_RELEASE, MSG_DEVICE_TAKEOVER, MSG_SET_DEVICE_CONFLICT
```

**New message types:**

| Direction | Type | Purpose |
|---|---|---|
| Webview → Host | `deviceHeartbeat` | Renew token every 15s |
| Webview → Host | `deviceRelease` | Clear token on close |
| Webview → Host | `deviceTakeover` | Player confirmed takeover |
| Host → Webview | `setDeviceConflict` | Block open, show conflict overlay |

**Files:** `main.tsx` (4 new handlers), `game.js` (heartbeat interval, conflict overlay UI)

---

### FEAT-3 — Passive Bridge Version Capture

**Priority: P3** | **Logged:** S20 (Devvit 0.0.179)

Reddit assigns its own internal version number on every `devvit upload` (e.g. `0.0.179`). Currently we estimate it by auto-incrementing `devvit.yaml` +1 after each push. We can't read it directly — it only appears in the Codespace terminal and on developers.reddit.com.

**Proposed fix:** `bridge3.js` already runs passively in the Codespace. Add a stdout watcher that captures the version string from `devvit upload` output and writes it to `relay/outbox.json`. Next Claude session reads it and syncs `devvit.yaml` with the real number — zero manual steps, zero bottleneck.

This is passive only — bridge does NOT drive the upload (too slow). You upload at full terminal speed, bridge just listens.

**When to build:** After PERF-1 and PERF-2. Current +1 estimate is accurate enough for now.

---

### FEAT-4 — Long-Press Drain/Tunnel Placement, Sleep Scoping, Drain Visual Unification

**Priority: P2** | **Logged:** S21 (Devvit 0.0.183)

---

#### The Idea

Replace the current fixed drain/tunnel connection flow with an intentional long-press gesture system. The player uses touch to direct the worm to build meaningful infrastructure — drain points, tunnel junctions — rather than having these appear automatically. Sleep is preserved but scoped tightly so it doesn't conflict.

---

#### Gesture Map (New)

| Gesture | Target | Action |
|---------|--------|--------|
| Long press on **worm body** | Worm hit radius only | Sleep (same as now — just scoped tighter) |
| Long press on **sump barrier** | The horizontal sump floor line | Worm autopilots to sump, digs drain connection |
| Long press on **tunnel wall / segment** | Any existing pPath segment | Worm autopilots to that point, digs tunnel junction |
| Any tap/touch **while autopiloting** | Anywhere | Cancels autopilot, returns to manual control |

---

#### Sleep Scoping Fix

Currently long-press fires sleep from anywhere on the canvas. This conflicts with the new drain/tunnel gestures because both use long-press on non-worm regions.

**Fix:** Add a worm hit-radius check before triggering sleep. If the long-press origin is within `pSR * 3` of any `pSegs` point → sleep. Otherwise → check for sump barrier or tunnel target.

```js
// Pseudocode — long press handler
var onWorm = pSegs.some(function(s) {
  var dx = longPressX - s.x, dy = longPressY - s.y;
  return dx*dx + dy*dy < (pSR * 3) * (pSR * 3);
});
if (onWorm) { triggerSleep(); return; }
if (onSumpBarrier(longPressY)) { triggerAutopilotDrain(); return; }
if (nearTunnelSegment(longPressX, longPressY)) { triggerAutopilotJunction(); return; }
```

---

#### Autopilot Behaviour

When a drain or junction target is set:
- A subtle visual indicator appears at the target point (e.g. glowing dot)
- The worm steers toward the target using the existing movement system (not teleport)
- On arrival, the appropriate action fires automatically (drain dig / junction dig)
- Any touch input cancels autopilot and clears the indicator
- Autopilot does not override death, flood, or cinematic states

---

#### Drain Unification — Visual vs Logic

The two drain types look and feel identical to the player but are implemented differently under the hood. This asymmetry needs to be documented and eventually reconciled.

**Down-drain (sump exit):**
- Player digs to the sump floor → pPath reaches `sumpExit` point
- Liquid flows down through the worm tunnel, exits at sump drain
- Logic: `tLvl` decremented when `_teaHit` block fires at sump floor

**Up-drain (inverse sump exit):**
- Visually looks like the same drain valve but at the top of the sump
- **⚠️ BUG NOTE:** The up-drain reuses the sump exit logic but with inverted pPath direction. Because `pPath` is consumed head-to-tail, the up-drain has a directional assumption baked in that is the mirror image of the down-drain. This causes subtle routing inconsistencies — drops that should flow upward sometimes stall or reverse because the path-following logic was written assuming downward gravity flow.
- The `_teaHit` decrement and `nearestPathIdx()` scan both implicitly assume the worm dug downward. The up-drain effectively runs these in reverse, which works most of the time but breaks at junctions and near segment boundaries.

**Unification goal:**
- Both drains share one visual language (same valve sprite, same animation)
- Under the hood: down-drain keeps existing logic unchanged; up-drain gets a direction flag (`drain.dir = 'up'|'down'`) so the path-following and decrement logic can branch correctly
- The existing up-drain bug should be fixed as part of FEAT-4 implementation — don't just add the long-press mechanic on top of broken up-drain logic

**Files to touch:**
- `game.js` — long-press handler, `updatePlayer()` autopilot state, `drawSnooDrain()` visual, `_teaHit` block direction branch, `nearestPathIdx()` up-drain routing
- `main.tsx` — no changes expected (drain logic is client-side)

---

#### Open Questions (resolve before building)

- **Tunnel junction mechanic:** Does long-pressing a tunnel segment create a branch point (liquid can flow through the junction), or a waypoint anchor the worm routes through on future passes? *(To be clarified by Cal before implementation)*
- **Autopilot speed:** Same movement speed as manual, or slightly faster to feel responsive?
- **Visual for autopilot target:** Glowing dot? Pulsing ring? Should match the game's existing aesthetic.

---

### ISS-15 — Tea Drifts Out of Tube Through Compost to Lowest World-Y Point

**Priority: P2 — needs dedicated architectural analysis before any fix**
**Introduced:** 0.0.184 | **Logged:** S22

**Observed:** Tube dug upward then back down with no updrain connection. Tea enters the tube then drifts through the compost wall to the lowest world-Y point of the segment rather than staying inside the tube.

**Note:** Root cause is unclear. There is a known architectural tension between world-Y as "gravity" and pPath-index as "tunnel direction" that has caused multiple related bugs across many sessions. This and FEAT-4 drain direction issues may share the same root. **Do not attempt to patch in isolation — requires a dedicated architectural analysis of how world-Y and pPath-index interact throughout the drop routing system before any fix is designed.**

---

### ISS-18 — Bin State Not Authoritative

**Priority: P1 — blocks all multiplayer work**
**Introduced:** architecture (always present) | **Logged:** S23

**Observed:** Opening the same Reddit post on two devices shows completely different world states — different tea levels, different compost, different scraps. Each device is running a fully independent bin with no shared state.

**Root cause:** `KV_WORLD` (per-post, shared) is shallow and event-driven. It only gets updated when specific events fire (`worldUpdate` on food drop, drain, flood). Between events, each client runs its own in-memory world state with no sync. When a new device opens the post, it reads whatever partial snapshot is in `KV_WORLD` — which may be stale or nearly empty — then immediately diverges.

Compounding this: `tLvl` and `castingEnrichment` are saved inside `KV_WORM_SESSION` (per-user, not per-post). So each user loads their own personal copy of tea level from their own session save, not from the shared bin. The bin has no authoritative living state.

**What needs to change:**

`KV_WORLD` must become the single source of truth for all bin state that should be shared:
- `tLvl` — tea level (currently also in per-user session save — remove it from there)
- `castingEnrichment` — compost richness
- `scrapsLevel` — trash density
- `pooled` — active tea drops (currently runtime-only — may need to be shared)

World state must be written to `KV_WORLD` continuously (on every `saveSession` or on a regular interval), not only on specific events.

On open, `MSG_READY` must send the full authoritative `KV_WORLD` snapshot and the client must use it — not its own local copy from `KV_WORM_SESSION`.

`tLvl` must be removed from `saveSession` / `KV_WORM_SESSION` entirely. It belongs to the bin, not the worm.

**Prerequisite for:**
- FEAT-2 (cross-device conflict — no point if bin isn't shared)
- True multiplayer presence (FEAT-1, FEAT-4)
- Any feature that assumes the bin is a real shared place

**Files:** `game.js` (`saveSession`, `setWorldState` handler, `worldUpdate` sends), `main.tsx` (`MSG_SAVE_SESSION`, `MSG_WORLD_UPDATE`, `MSG_READY` world load)

---

## Section 5 — Session Log

Sessions newest first. Each entry: session number, date, Devvit version, summary, commits.

---

### Session 25 — 2026-06-22 | Devvit 0.0.201

**Focus:** ISS-18 — make KV_WORLD authoritative and independent from per-user session state. Blocked at end of session by GitHub Codespaces core-hour limit (resets 2026-07-01).

**Deployed versions this session:** 0.0.191 → 0.0.201 (10 uploads)

---

#### What we shipped

**ISS-18 Phase 1 — Strip bin state from worm session (shipped, confirmed working)**

`tLvl` and `castingEnrichment` were being saved inside `KV_WORM_SESSION` (per-user) and restored on every session load, overwriting whatever `KV_WORLD` (shared) had sent. This was the architectural root cause: the bin belonged to each user, not to the post.

| Commit | File | What |
|--------|------|------|
| `c83c6ea` | game.js | Removed `tLvl`/`castingEnrichment` from `saveSession()`; added `scrapsLevel` to all 6 `worldUpdate` sends |
| `78b3c58` | main.tsx | `MSG_SAVE_SESSION` now strips `tLvl`/`castingEnrichment` before writing `KV_WORM_SESSION` |

**ISS-18 Phase 2 — Fix message ordering race (shipped)**

`setSession` was sent before `setWorldState` in the `MSG_READY` handler. Since `setSession` triggers `setup()` → `spawnScraps()`, world globals (`_hostScrapsLevel`, `tLvl`, `castingEnrichment`) were still at defaults when scraps spawned. Reordered: `setWorldState` → `weekStartTs` → `setSession`.

| Commit | File | What |
|--------|------|------|
| `21bf577` | main.tsx | Send `setWorldState` and `weekStartTs` before `setSession` |
| `39b54a5` | game.js | Send `worldUpdate` immediately after `spawnScraps()` to prime `KV_WORLD` on first join |

**ISS-18 Phase 3 — Fix self-ghost worm (shipped)**

`requestPresence` fired at boot before `username` was known. When the presence response returned with the player's own username, the self-filter (`p.username === username`) failed because `username` was still `''`. The player appeared as a blue ghost worm in their own bin.

| Commit | File | What |
|--------|------|------|
| `3db1a2d` | game.js | Defer `requestPresence` until after `setUsername`; retroactive `otherPlayers` prune in `setUsername` and `setSession` handlers; `_pendingUsername` fallback in `setPresence` filter |

**FEAT-2 — Device conflict detection (partially working, investigation ongoing)**

The "Already Playing Elsewhere" overlay exists and renders. The device lock (`KV_ACTIVE_DEVICE`) check is wired. But two devices can still both reach the playing state with the same username and diverging game state.

| Commit | File | What |
|--------|------|------|
| `6b8309a` | game.js | Boot `setup()+loop()` on `setDeviceConflict` so overlay actually renders; `_loopRunning` flag; re-run `setup()` on takeover |
| `0038e98` | main.tsx | Dedup `MSG_READY` per mount; 3s minimum token age to prevent self-conflict from retry loop |
| `6cdd3a9` | main.tsx | Move `readyHandled` to `useState` — `context` object is recreated each render, state persists |

**DEBUG overlay (live in 0.0.201, must remove before launch)**

| Commit | File | What |
|--------|------|------|
| `92577c9` | game.js | On-screen debug panel (top-left, DEBUG_MODE only): shows `username`, `karma`, `sesTs`, `tLvl`, `castingEnrichment`, `scrapsLevel`, `weekStartTs`, `deviceConflictActive` |

---

#### What we learned

**Weather syncs. Session state does not.**

By end of session, `weekStartTs` (which drives weather simulation) was confirmed syncing between devices — both showed the same weather. This proves `KV_WORLD` and `KV_WEEK` are genuinely shared across devices for the same post.

`KV_WORM_SESSION` (per-user) is also shared — both devices load the same karma value on open. But since both devices run independently after that, they diverge: each earns karma separately, each saves independently (every 30s), and last-write-wins corrupts the canonical state.

**The conflict detection is broken at the Devvit layer, not the logic layer.**

Every time Devvit fires a Realtime message, it re-renders the component and creates a fresh `context` object. Any state stored directly on `context` (like `_readyHandled`) is reset. The `game.js` retry loop sends `ready` up to 5 times at 500ms intervals — each one that hits `MSG_READY` after a re-render re-claims the device token with a fresh timestamp, evicting the other device's lock silently. Moving to `useState` (persists across renders) is the right architectural fix and was shipped, but needs verification once Codespaces is back.

**The open investigation: is the conflict overlay actually showing?**

At session end it was unclear whether `setDeviceConflict` is being sent at all, or whether it's sent but the overlay isn't rendering. The debug build (`92577c9`) includes `deviceConflictActive` in the on-screen panel. That will tell us definitively.

---

#### What is NOT fixed yet

| Issue | Status |
|-------|--------|
| Two devices same username both reach playing state | Under investigation — conflict detection not reliably blocking |
| Scraps layout differs between devices | By design — positions are random per `spawnScraps()`. Density matches via `scrapsLevel`. Layout would require storing full chunk list in KV (not worth it). |
| Debug overlay in production build | Must remove `drawDebugOverlay()` call and function before public launch |

---

#### Next steps (waiting on Codespaces — resets 2026-07-01)

1. Open game on two devices with DEBUG_MODE on — read `conflict=` field from each device's overlay. This tells us if `setDeviceConflict` is being sent.
2. If `conflict=false` on Device 2: the lock isn't being written or read correctly — add `console.warn` logging to the `MSG_READY` handler and check Devvit logs.
3. If `conflict=true` on Device 2 but game still loads: the overlay is rendering but being dismissed or overwritten — check tap handler and `deviceConflictActive` flag lifecycle.
4. Remove debug overlay before any public post.

---

### Session 24 — 2026-06-22 | Devvit 0.0.183

**Shipped:** ISS-18 (KV_WORLD authoritative)

| Commit | File | What |
|--------|------|------|
| `c83c6ea` | game.js | ISS-18: remove tLvl/castingEnrichment from saveSession(); add scrapsLevel to all 6 worldUpdate sends |
| `78b3c58` | main.tsx | ISS-18: strip tLvl/castingEnrichment from KV_WORM_SESSION on MSG_SAVE_SESSION |

**Root cause fixed:** Session restore was overwriting bin state — `loadSession()` was stomping `setWorldState` with per-user values. Now `KV_WORLD` is the only source of truth for bin state on open.

---

### Session 23 — 2026-06-22 | Devvit 0.0.190

**Shipped:** FEAT-2 (partially — parked after architectural discovery)
**Opened:** ISS-18

| Commit | File | What |
|--------|------|------|
| `19eb83b` | main.tsx | FEAT-2: KV_ACTIVE_DEVICE token, MSG_DEVICE_* constants, device check in MSG_READY |
| `9cdeea2` | game.js | FEAT-2: heartbeat interval, conflict overlay draw, visibilitychange release |
| `db50cd7` | main.tsx | Fix: kvStore.del → ts:0 tombstone (del not in Devvit KV API) |
| `830899e` | game.js | Fix: remove deviceRelease from visibilitychange (mobile app-switch was killing token) |

**Finding:** FEAT-2 conflict detection cannot work because ISS-18 means the bin isn't shared at all. Two devices don't fight over the same bin — they each run a completely independent one. FEAT-2 parked until ISS-18 is resolved.

---

### Session 22 — 2026-06-20 | Devvit 0.0.186

**Closed:** PERF-2, PERF-3, PERF-4 (partial), ISS-13 Bug A (verified)
**Opened:** ISS-15
**Shipped:**

| Commit | File | What |
|--------|------|------|
| `8ce6daf` | game.js | PERF-2: pPath Y-bucket spatial index — drop scan O(2000) → O(10-30) per drop |
| `25093f9` | game.js | PERF-3: blade fringe offscreen pre-render — 1,788 canvas calls → 1 drawImage |
| `5af0fa6` | game.js | PERF-4: debris cap 300→80; skip rotate() for settled scraps |
| `a79f411` | WIGGLERS_AUDIT.md | Log ISS-15; mark PERF-1+2 shipped |
| `dd2f263` | WIGGLERS_AUDIT.md | Close ISS-13 Bug A — verified pooled decrement correct |

---

### Session 20 — 2026-06-19 | Devvit 0.0.179

**Closed:** ISS-14 (fully), ISS-13 Bugs B+C
**Opened:** PERF-1–4, FEAT-1–3
**Shipped:**

| Commit | File | What |
|--------|------|------|
| `696121b` | game.js | ISS-14: setSession timestamp merge — KV never overwrites newer local save |
| `e106801` | game.js | ISS-14: Save and restore pAcid across sessions |
| `e11d4ec` | game.js | ISS-13 Bug B: Remove rain — strip precip, seasonal baselines, events, HUD; delete getEvapRate |
| `44d466a` | main.tsx | ISS-13 Bug C: Remove pooled from KV_WORLD worldData write |
| `4b0f7a1` | game.js | ISS-13 Bug C: pooled runtime-only — remove from setWorldState, worldUpdate, saveSession, setup() |
| `53ae826` | game.js | Fix pool gradient + saturation glow fillRect width to full bin edge |
| `1dd642e` | main.tsx | Hotfix: remove sync cache header accidentally committed |
| `23da7ac` | WIGGLERS_AUDIT_V20.md | FEAT-1 cross-player tunnel clogging design doc |

---

### Session 19 — 2026-06-19 | Devvit ~0.0.177

**Closed:** ISS-1, ISS-2 (weekly drain persistence — Moves 3+4)
**Opened:** ISS-13 (compost saturation — 3 bugs)

| Commit | File | What |
|--------|------|------|
| `54b91d4` | main.tsx | Move 3: Persist weekStartTs to KV_WEEK when weeklyDrain fires |
| `54b91d4` | main.tsx | Move 4: Broadcast weekStartTs via Realtime on drain — all clients reset epoch |

---

### Session 18 — 2026-06-19 | Devvit ~0.0.175

**Closed:** ISS-12 (drain Snoo X misalignment — coordinate space mismatch)

Root cause: `drawSnooDrain()` was called after `ctx.restore()` (screen space). On mobile where `camX ≈ 400px`, Snoo appeared 400px right of the tap. Fix: move call inside `ctx.translate(centreOffsetX - camX, 0)` — identical to feed Snoo. Net -13 lines.

| Commit | What |
|--------|------|
| `f276300` | Derive STOP_Y from tapSY geometrically — replace hardcoded H*0.559 |
| `a113987` | Convert drainSnooStopX to screen space (wrong approach — reverted) |
| `78ef406` | Store _tapWorldX at draw time (still wrong approach — reverted) |
| `fb12b98` | **The real fix:** move drawSnooDrain() inside world transform |
| `024879d` | Lower Snoo 100px — head at 52% down screen, boots at 68% |

**Key geometry (H=800):**
```
camY snap at trigger  = round(3*H + H*0.25 - H*0.45)
TAP_SY (pipe top)     = bsy + 8   (~46% down)
STOP_Y (torso top)    = TAP_SY + 137 - SC*0.1788  (~60% down)
drainSnooStopX        = b.cx - SC*0.127  (world X, inside world transform)
```

---

### Session 17 — 2026-06-18 | Devvit ~0.0.168

**Closed:** Canvas resize bug, desktop layout, camX negative bug, centreOffsetX system

Root cause: one-time guard in `resizeCanvas()` prevented W/H from updating after first paint. All background elements were using `W` (viewport) instead of `WORLD_W` (1194px fixed).

| Commit | What |
|--------|------|
| `c18e1cf` | Fix resizeCanvas() — remove one-time guard |
| `db5fb1b` | Fix camX on wide screens — lock to 0 when W >= WORLD_W |
| `2899a9a` | Fix sky/ground fillRects for ctx.translate |
| `6ebd284` | Fix grass tufts, blade fringe, flowers X position |
| `5eeb24b` | Introduce centreOffsetX global — fix all 15 affected locations |
| `058090b` | Fix background elements using W instead of WORLD_W |
| `ddf1e8a` | Fix base green ground fill |
| `beeb7bb` | Fix sky fill and sun/moon clip rect |

---

### Session 16 — 2026-06-18 | Devvit ~0.0.160

**Shipped:** Bin persistence Moves 1+2, Bin Refresh HUD, drain→feed chain

| Commit | File | What |
|--------|------|------|
| `263ead7` | main.tsx | Move 1: Read KV_WEEK on open, stamp if missing, send weekStartTs via setWorldState |
| `f24bb39` | game.js | Move 2: setWorldState handler accepts weekStartTs, overwrites local clock |
| `05efd5a` | game.js | Bin Refresh HUD under clock (`🪣 Refresh in 5d 14h 23m`), drain→feed chain |
| `60f5618` | game.js | Feed camera snap when chaining from drain |

---

### Session 15 — 2026-06-17 | Devvit ~0.0.155

**Shipped:** Full simulated weather system, Snoovatar fixes, coordinate system overhaul

| Commit | What |
|--------|------|
| `d180d0d` | Fix: username shown above worm head |
| `cf64c96` | Fix: user.getSnoovatarUrl() correct Devvit API |
| `ce2eb1e` | Fix: Snoovatar drawn full-body portrait |
| `4a95535` | Fix: pre-render Snoovatar to offscreen canvas (eliminates flicker) |
| `d624a1e` | Feature: full simulated weather system (replaced dead Open-Meteo integration) |
| `424ad15` | Fix: W=viewport width, WORLD_W=1194 fixed world width — separated properly |
| `a970e17` | Fix: _toCanvas uses root offset, all mX assignments corrected |

---

### Session 14 — 2026-06-17 | Devvit ~0.0.148

**Shipped:** Death headstone, preview background, mobile bridge fixes

| Commit | What |
|--------|------|
| `1a58fae` | Fix: Snoo drain invisible on mobile — camera formula |
| `81d2049` | Fix: Snoo push-down/push-up during cinematic |
| `ee574a2` | Feature: death headstone comment posted to Reddit thread |
| `1641bbe` | Feature: preview background — trash chunk wallpaper (preview-bg.png) |
| `4b0ac87` | Fix: Added Devvit message envelope unwrap in game.js |
| `b7089f4` | Fix: Removed strict origin check |

---

## Section 6 — Closed Issues

| ID | What | Fixed session | Devvit version |
|----|------|---------------|----------------|
| ISS-1 | Weekly drain weekStartTs not persisted across sessions | S19 | ~0.0.177 |
| ISS-2 | weekStartTs not broadcast to other clients on drain | S19 | ~0.0.177 |
| ISS-12 | Drain Snoo X misalignment — called in screen space not world space | S18 | ~0.0.175 |
| ISS-13 Bug A | Tunnel drops didn't decrement pooled — missing inTunnel guard at _teaHit | S20 fix / S22 verified | 0.0.179 |
| ISS-13 Bug B | Evaporation silently removed drops with no visual cause | S20 | 0.0.179 |
| ISS-13 Bug C | pooled synced via KV/Realtime — ghost saturation on join | S20 | 0.0.179 |
| ISS-14 Bug A | pHP hardcoded to 1.0 on every session load | S20 | 0.0.179 |
| ISS-14 Bug B | No save-on-exit — only 30s autosave | S20 | 0.0.179 |
| ISS-14 Bug C | Position restore relied on stale autosave | S20 | 0.0.179 (fixed by Bug B) |
| Canvas half-screen desktop | resizeCanvas() one-time guard | S17 | ~0.0.168 |
| camX negative on wide screens | broke steering and bin position | S17 | ~0.0.168 |
| Background wrong size desktop | W vs WORLD_W | S17 | ~0.0.168 |
| u/You hardcoded | username not used in avatar render | S15 | ~0.0.155 |
| Snoovatar wrong API | user.getSnoovatarUrl was used as property | S15 | ~0.0.155 |
| Snoovatar circle-cropped | should be full-body | S15 | ~0.0.155 |
| Snoovatar flicker | per-frame scaling | S15 | ~0.0.155 |
| Weather dead-ended on external API | Devvit blocks external HTTP | S15 | ~0.0.155 |
| Snoo drain invisible mobile | camera formula | S14 | ~0.0.148 |
| Death never posted to thread | missing Reddit API call | S14 | ~0.0.148 |
| Preview card plain brown | no wallpaper | S14 | ~0.0.148 |
| Any user could create bin post | missing mod check | S14 | ~0.0.148 |
| Devvit message envelope unwrapped | game.js missing unwrap | S14 | ~0.0.148 |


