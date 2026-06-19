# Wigglers Room — Audit Log V20
> Last updated: 2026-06-19 Session 18 (ISS-12 closed — drain Snoo positioning fixed)
> Current state: V20 + all Session 14–18 fixes

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
| ISS-1 | Weekly drain persistence — Moves 3+4 ready to ship | P1 — Session 19 |
| ISS-2 | `KV_WEEK` never written on drain — blocked by ISS-1 | Part of ISS-1 |
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
