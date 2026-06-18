# Wigglers Room — Audit Log V20
> Last updated: 2026-06-18 Session 17 (canvas resize + desktop/fullscreen layout fixed)
> Current state: V20 + all Session 14 + Session 15 + Session 16 + Session 17 fixes

---

## Session 17 — 2026-06-18 (Canvas Resize + Desktop Layout)

### Session Summary
Focused session fixing canvas sizing and layout issues that only appeared on desktop and fullscreen. The root cause was a one-time guard in `resizeCanvas()` that prevented `W`/`H` from ever updating after the first paint. Fixing that exposed a chain of coordinate system issues: camX going negative, background fills not covering the full canvas, and background detail elements using `W` (viewport) instead of `WORLD_W` (world width).

### What Shipped
| Commit | Change |
|--------|--------|
| `c18e1cf` | Fix `resizeCanvas()` — remove one-time `if (!W\|\|!H)` guard, always update W/H and canvas dimensions on every resize. Invalidates bin + soil gradient caches. |
| `db5fb1b` | Fix camX on wide screens — when `W >= WORLD_W`, lock `camX = 0` instead of lerping to a negative value. Fix spawn + respawn snaps. |
| `2899a9a` | Fix sky/ground fillRects — compensate for `ctx.translate` by starting at `camX` (later superseded). |
| `6ebd284` | Fix grass tufts, blade fringe, flowers X position — compensate for translate. |
| `5eeb24b` | Introduce `centreOffsetX` global. Keep `camX >= 0` always. Use `ctx.translate(centreOffsetX - camX)` to centre bin on wide screens without breaking mouse/touch coords. Fix all 15 affected locations (mouse, touch, click, spawn, respawn, sky, ground, grass, flowers). |
| `058090b` | Fix background detail elements using `W` instead of `WORLD_W` — stars, sun, moon, grass tufts, blade fringe, flowers all switched to `WORLD_W`. |
| `ddf1e8a` | Fix base green ground fill — `WORLD_W` not `W`. |
| `beeb7bb` | Fix sky fill and sun/moon clip rect — `WORLD_W` not `W`. |

### Root Causes Found
1. **`resizeCanvas()` one-time guard** — `if (!W || !H)` meant canvas dimensions and `W`/`H` were only ever set at initial load. On desktop, if the initial load happened at mobile size (or a different size), the canvas stayed at that size forever. Background fills only covered the original dimensions → black bar + half-filled background.

2. **Negative `camX` broke everything** — First attempt at centring on wide screens set `camX = WORLD_W/2 - W/2` (negative). `ctx.translate(-camX)` then shifted the world right, making the bin drift when the worm moved, and `mX = screenX + camX` subtracted instead of added (wrong world coords for steering).

3. **`W` vs `WORLD_W` in background draws** — All sky/ground/garden elements are world-space objects and should span `WORLD_W`. Using `W` (viewport width) made them only cover part of the world on desktop where `W != WORLD_W`.

### The Clean Solution
- `centreOffsetX = max(0, floor((W - WORLD_W) / 2))` — computed globally, updated each frame in `draw()`
- `ctx.translate(centreOffsetX - camX, 0)` — combines centring + camera scroll in one transform
- `camX` stays `>= 0` always — correct for `mX = screenX - centreOffsetX + camX`
- All world-space background draws use `WORLD_W`, with `x` offset by `-centreOffsetX` where needed
- On mobile: `centreOffsetX = 0`, behaviour identical to before

### Key Rule Going Forward
> **If it's part of the sky, ground, or garden — use `WORLD_W`. Only HUD elements and canvas-clearing operations use `W`.**

---

## Session 16 — 2026-06-18 (Bin Persistence + HUD + Drain Animation)

### Session Summary
Big session. Shipped Moves 1 and 2 of the bin persistence plan, added the Bin Refresh HUD, wired drain→feed chaining, and spent significant time debugging the drain Snoo camera/position system. Moves 3 and 4 (persisting and broadcasting the new weekStartTs on drain completion) are deferred to Session 17 — the drain animation positioning needs to be solved cleanly first.

### What Shipped
| Commit | File | What |
|--------|------|------|
| `263ead7` | main.tsx | Move 1: Read `KV_WEEK` on open, stamp if missing, send `weekStartTs` via `setWorldState` |
| `f24bb39` | game.js | Move 2: `setWorldState` handler accepts `weekStartTs`, overwrites local clock |
| `05efd5a` | game.js | Bin Refresh HUD under clock, drain→feed chain, `weeklyFeedPending` flag, clock reset after feed |
| `60f5618` | game.js | Feed camera snap when chaining from drain (prevents slow lerp from sump) |
| `4dafda9` | game.js | Drain camera: single deterministic snap attempt (later superseded) |
| `a24b874` | game.js | Drain: STOP_Y=H*0.81 attempt |
| `b44b3c3` | game.js | Drain: live STOP_Y derived from tap each frame + camera ease (matches feed pattern) |
| `4513fa7` | game.js | Drain: camY snap at trigger + -25px offset attempt |

### What Works
- **Bin Refresh HUD** — `🪣 Refresh in 5d 14h 23m` centred under clock, counts down live. Pulses gold during drain and feed cinematics. Resets to 7d after feed completes.
- **Drain→feed chain** — no gap between cinematics. `weeklyFeedPending` flag gates the clock reset.
- **Clock reset** — stamps new `weekStartTs` after feed Snoo slides out, saves + broadcasts.
- **Move 1+2** — all players now receive shared `weekStartTs` from `KV_WEEK` on open.
- **Feed Snoo camera** — snaps correctly when chaining from drain.

### What's Broken — ISS-12: Drain Snoo positioning
The drain Snoo cinematic is not placing Snoo correctly relative to the tap. Root cause is unresolved. Multiple approaches tried — see ISS-12 in Known Issues.

---

## Session 15 — 2026-06-17 (Afternoon/Evening)

### Session Summary
A massive day. Solved real username display, real Snoovatar, weather system design decision, and the entire horizontal scrolling architecture.

### Commits Shipped
| SHA | Change |
|-----|--------|
| `d180d0d` | Fix: username shown above worm head |
| `cf64c96` | Fix: `user.getSnoovatarUrl()` correct Devvit API |
| `ce2eb1e` | Fix: Snoovatar drawn full-body portrait |
| `4a95535` | Fix: pre-render Snoovatar to offscreen canvas |
| `d624a1e` | Feature: full simulated weather system |
| `424ad15` | Fix root cause: W=viewport width, WORLD_W=1194 fixed |
| `a970e17` | Fix: _toCanvas uses root offset, all mX assignments add camX |

### Lessons Learned
- `getBin()` must use `WORLD_W` not `W` — bin is fixed width, viewport scrolls
- All `mX` assignments from pointer events need `+ camX`
- External HTTP (`fetch()`) is blocked in Devvit sandbox — use self-contained simulation

---

## Session 14 — 2026-06-17 (Full Day)

### Commits Shipped
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

### Canvas / Coordinate System (NEW — Session 17)
- ✅ **`resizeCanvas()` must always update W/H** — never guard with `if (!W || !H)`
- ✅ **`camX` must always be `>= 0`** — negative camX breaks `ctx.translate` and mouse coords
- ✅ **Use `centreOffsetX` to centre on wide screens** — not negative camX
- ✅ **Background elements use `WORLD_W` not `W`** — sky, ground, sun, moon, stars, grass, flowers
- ✅ **`mX = screenX - centreOffsetX + camX`** — all pointer → world coord conversions need centreOffsetX subtracted

---

## Priority Queue — Next Session

### P1 — ISS-12: Fix Drain Snoo positioning
Before Moves 3+4 can ship. Study feed Snoo pattern exactly — recalculate `tapSY` every frame from live camY, measure exact hand offset from draw geometry, snap camY at trigger.

### P1 — Weekly Drain Moves 3+4 (after ISS-12)
- Move 3: Persist new `weekStartTs` in `KV_WEEK` when drain fires
- Move 4: Broadcast new `weekStartTs` via Realtime on drain

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
| ISS-1 | Weekly drain persistence — Moves 1+2 done. Moves 3+4 blocked on ISS-12 | P1 — Session 18 |
| ISS-2 | `KV_WEEK` never written on drain — blocked by ISS-12 | Part of ISS-1 |
| ISS-12 | Drain Snoo position/camera broken — Snoo doesn't land at tap correctly. Multiple approaches tried, unresolved. Fix before Moves 3+4. | P1 — Session 18 first task |
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
