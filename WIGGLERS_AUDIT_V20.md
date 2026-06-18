# Wigglers Room — Audit Log V20
> Last updated: 2026-06-18 Session 16 (pre-implementation — bin persistence plan)
> Current state: V20 + all Session 14 + Session 15 fixes

---

## Session 16 — 2026-06-18 (Planning)

### Session Summary
Architecture review and persistence planning session. Pulled fresh repo state, reviewed all three root causes of ISS-1 (weekly drain never fires), and produced a concrete four-move implementation plan. No code shipped yet — plan is documented in both GAME_ARCHITECTURE.md (Bin Persistence section) and this audit (priority queue below). Next session starts directly on Move 1.

### Key Finding: ISS-1 Root Cause Breakdown
Three separate bugs all prevent the bin's weekly drain from working as a shared persistent event:

1. `weeklyDrain: true` flag sent in `MSG_WORLD_UPDATE` is silently dropped — the handler in main.tsx saves world state but never checks this flag
2. `KV_WEEK` is never read on post open — each player's `weekStartTs` defaults to `Date.now()`, so every player has an independent 7-day clock
3. When drain fires and `KV_WEEK` should be updated, the write never happens — the new `weekStartTs` is never persisted or broadcast

### Implementation Plan — Four Moves (next session)
| Move | File | What | Lines |
|------|------|------|-------|
| 1 | main.tsx | Read `KV_WEEK` on open, stamp if missing, send `weekStartTs` in `setWorldState` | ~15 |
| 2 | game.js | Accept `weekStartTs` from `setWorldState` message, overwrite local value | 1 |
| 3 | main.tsx | On `weeklyDrain: true` in `MSG_WORLD_UPDATE`, write new `KV_WEEK` | ~8 |
| 4 | main.tsx | Include `weekStartTs` in Realtime world broadcast on drain | ~2 |

Total estimated: ~26 lines across two files. No physics, no rendering, no renames.

### Commits Shipped
None — planning session only.

---

## Session 15 — 2026-06-17 (Afternoon/Evening)

### Session Summary
A massive day. Solved problems that had been blocking the game since the beginning — real username display, real Snoovatar, weather system design decision, and the entire horizontal scrolling architecture. The coordinate system work was particularly deep — required understanding the difference between viewport width, world width, screen space, and world space and getting all four consistent across rendering, physics, and input. Huge leap forward from yesterday's Devvit integration struggles.

### Commits Shipped
| SHA | Change |
|-----|--------|
| `d180d0d` | Fix: username shown above worm head — was hardcoded `'u/You'` literal, now uses `username` variable |
| `a1e3ae1` | Hotfix: sync-script header artifact prepended to game.js broke all JS — stripped and re-pushed clean |
| `cf64c96` | Fix: `user.getSnoovatarUrl()` — correct Devvit API for Reddit Snoovatar (was guessing property names) |
| `842d754` | Cleanup: remove debug logs from avatar handler |
| `607d945` | Polish: Snoovatar drawn as circle-clipped portrait — first attempt (too small) |
| `ce2eb1e` | Fix: Snoovatar drawn full-body portrait at correct aspect ratio |
| `4a95535` | Fix: pre-render Snoovatar to offscreen canvas on load — eliminates per-frame scaling flicker |
| `5a704b4` | Remove: MSG_SET_WEATHER dead constant from main.tsx |
| `f6539b5` | Remove: weather integration — cut setWeather handler, HUD, locName. Nashville defaults → pure sim values |
| `d624a1e` | Feature: full simulated weather system — seasonal baselines, random events, live HUD |
| `951293f` | Fix: move weather HUD to upper right — was overlapping karma display |
| `ceb3d84` | Clean: remove Gen avatar mode, remove flash label, cycle is now Snoo→Names→Hidden |
| `a6cad43` | Polish: humidity displays as `RH 68%` in weather HUD |
| `8419e51` | Attempt: cap logical width at 430px — wrong direction, abandoned |
| `3486cb8` | Attempt: lock to 1024×768 letterbox — pointer offset introduced, abandoned |
| `2b5bad5` | Fix: pointer/touch coords — account for canvas offset in _toCanvas |
| `db670c4` | Attempt: 1024px wide, height fills viewport — camX still broken |
| `7da62c4` | Lock logical resolution to iPad Pro 11" landscape 1194×834 |
| `424ad15` | Fix root cause: W=viewport width, WORLD_W=1194 fixed — bin always full size, camX scrolls |
| `a970e17` | Fix: _toCanvas uses root offset, all mX assignments add camX for world coords |

### What We Built / Fixed
- **Username above worm head** — was hardcoded `'u/You'` string literal, now uses the `username` variable
- **Real Snoovatar** — `user.getSnoovatarUrl()` (correct Devvit API), pre-rendered to offscreen canvas at 44px, drawn full-body above worm
- **Avatar toggle cleaned up** — Gen mode removed, flash label removed, 3 modes: Snoo→Names→Hidden
- **Weather system** — fully simulated, no external API. Seasonal baselines + slow drift + random events (rainstorm/dry/heat wave). HUD: date, °F, RH%, rain indicator upper right
- **Horizontal scrolling** — WORLD_W=1194 fixed bin size, W=viewport, camX follows worm with clamp to bin walls. Mobile side-scrolls ~700px. iPad fits perfectly
- **Pointer fix** — `_toCanvas` uses `root.getBoundingClientRect()`, all world coord assignments add `camX`

### Lessons Learned This Session

**Sync script adds header artifact**
`sync_from_github.py read` prepends `[Fresh from GitHub: sha]` to file content. If you use the output directly as a file, that header becomes the first line of your JS — syntax error, game breaks. Always strip or use the GitHub API client directly.

**Devvit avatar API**
`getCurrentUser()` returns a User object with a `getSnoovatarUrl()` method — not a property. `user.iconImg`, `user.snoovatarUrl`, `user.icon_img` are all wrong. The correct call is `await user.getSnoovatarUrl()`.

**Snoovatar is a full-body portrait, not a headshot**
Circle-clipping it cuts off the character. Draw it as a standing figure above the worm head, using `naturalWidth/naturalHeight` for aspect ratio, pre-rendered to an offscreen canvas to eliminate per-frame scaling flicker.

**Weather integration via external HTTP is blocked in Devvit**
`fetch()` to Open-Meteo or any external domain is silently blocked in Devvit's server sandbox. No `http` permission exists in devvit.yaml. Self-contained simulation is the correct approach.

**W vs WORLD_W — the key insight for horizontal scrolling**
The bin must be wider than the viewport for camX to have any range. If `getBin()` uses `W` (viewport width) to size the bin, then `binWidth ≈ W * 0.88`, and `camXMax = binRight - W ≈ -W * 0.12` — negative, so clamping to max(camXMin, camXMax) forces camX to zero. The fix: `getBin()` uses `WORLD_W` (fixed 1194px). `W` is the viewport. camX range = `WORLD_W - W` ≈ 700px on mobile.

**camX must be initialized at spawn and respawn**
`camX = 0` at startup puts the camera at the left edge while the worm is at `WORLD_W/2 = 597`. Fix: `camX = startX - W/2` at both initial spawn and respawn.

**All mX/mY world coord assignments need + camX**
Touch/mouse events return screen coordinates. `mX` is a world coordinate. Every place that sets `mX` from a pointer event must add `camX`: `mX = screenX + camX`. Missed any one of them and the worm tracks incorrectly on the far side of the bin.

---

## Session 14 — 2026-06-17 (Full Day)

### Commits Shipped
| SHA | Fix |
|-----|-----|
| `1a58fae` | Snoo drain invisible on mobile — `drainCamTarget` derived from `drainSnooStopY` not fixed `2.53*H` |
| `b68d383` | Loading screen icon restored — 512px full-bleed, soil brown bg, icon is tap target |
| `81d2049` | Snoo push-down/push-up during cinematic — snap `camY` at trigger, `STOP_Y = H * 0.58` screen space |
| `ee574a2` | Death headstone comment posted to Reddit thread on `playerDied` |
| `eca5080` | Headstone date format `M/YY` |
| `2b49f28` | `bornTs` stamped on worm spawn, sent with `playerDied` |
| `fe8d0b2` | Headstone uses real `bornTs`/`diedTs` — actual join and death dates |
| `5887af4` | Loading screen icon centered on mobile — `zstack` + 256px |
| `ea8f791` | Lock Create Wigglers Room to moderators only (`forUserType: 'moderator'`) |
| `1641bbe` | Preview background — trash chunk wallpaper using real game draw code |
| `04ad8ac` | `preview-bg.png` added to assets (all 27 trash items on dark soil, vignette) |
| `6580e10` | Re-pushed preview-bg.png as clean binary (was corrupted in first push) |
| `5b7548b` | Increased startup fallback timeout 400ms → 2000ms |
| `4b0ac87` | Added Devvit message envelope unwrap in game.js |
| `b7089f4` | Removed strict origin check (www.reddit.com was wrong) |

### What We Built
- Snoo drain cinematic fully working on mobile
- Death headstone comments — real RIP posts to Reddit thread
- Loading screen — 512px worm icon on soil brown, tap to enter
- Preview card wallpaper — all 27 trash items rendered via real `drawTrashChunk()` code
- Multiplayer channels wired — useChannel subscriptions for presence, world, flood

---

## Devvit Platform Lessons Learned (CRITICAL — read before every session)

### Asset Rules
- ✅ **PNG only** — Devvit asset uploader rejects GIF, JPG, any non-PNG
- ✅ **Push binary files via GitHub API directly** — sync script corrupts binary files. Use direct `urllib` PUT with `base64.b64encode(bytes)`
- ✅ **Verify PNG after push** — check `bytes[:8] == b'\x89PNG\r\n\x1a\n'`
- ✅ **Assets folder** — put all images in `/assets/`, referenced by filename only

### Devvit API
- ✅ **`user.getSnoovatarUrl()`** — method call, not a property. Returns the user's Snoovatar URL
- ✅ **`getCurrentUser()` fields** — only reliable: `username`, `getSnoovatarUrl()`. Do not guess other properties
- ✅ **External HTTP blocked** — `fetch()` to non-Reddit domains silently fails. No http permission in devvit.yaml. Use self-contained simulation instead
- ✅ **`webView.mount()` only inside `onPress`** — never in render body
- ✅ **`webView.render()` does not exist** — only `mount()`, `unmount()`, `postMessage()`

### Realtime / useChannel
- ✅ **Channel names must be `[a-zA-Z0-9_]` only** — colons crash render
- ✅ **Declare `useChannel` after `useWebView`** — hooks must run in consistent order
- ✅ **`presenceUpdate` sends `player: {}` but game expects `players: []`**

### Message Bridge
- ✅ **Devvit wraps `webView.postMessage()` in an envelope** — `{ type: 'devvit-message', data: { message: ... } }`
- ✅ **Origin of host→webview messages is NOT `https://www.reddit.com`** — removed strict origin check
- ✅ **Sync script prepends header to file content** — strip before using as game file

### Post Lifecycle
- ✅ **Old posts go read-only after re-upload** — create new post to test
- ✅ **`devvit install <subreddit>` required after every upload**
- ✅ **Always `git pull` before `devvit upload`**

---

## Priority Queue — Next Session

### P1 — Weekly Drain Wiring (main.tsx) — ~40 lines
Three bugs prevent weekly drain from ever firing automatically:
1. `weeklyDrain` flag silently dropped — `MSG_WORLD_UPDATE` handler ignores it
2. `KV_WEEK` never read — each player runs independent 7-day clock
3. New players never get shared `weekStartTs`

**Fix:** Read `KV_WEEK` on open → send `weekStartTs` in `setWorldState` → handle in game → on drain completion write new `weekStartTs` to `KV_WEEK` + broadcast via Realtime

### P2 — Re-apply S2–S5 Code Health (game.js)
| Task | What |
|------|------|
| S2a | 18 raw message strings → `MSG_*` constants matching main.tsx |
| S2b | 5 duplicate Snoo SVG helper pairs → shared functions |
| S3  | Delete 4 dead functions (`_refreshBin`, `blendEnrichCol`, `drawGenDebugPanel`, `nearestPathIdx`) |
| S4  | Rename 17 `_underscore` functions → camelCase |
| S5  | Split `draw()`, `updatePhysics()`, `updatePlayer()` monoliths |

### P3 — Pre-Launch
- Hash `DEBUG_PASSWORD` (currently plaintext `'wigglers2025'`)

---

## Known Issues (Open)

| ID | Issue | Priority |
|----|-------|----------|
| ISS-1 | Weekly drain never fires in Devvit — 3 root causes (see S16 plan) | P1 — next session |
| ISS-2 | `KV_WEEK` defined but never read or written — fixed by ISS-1 Move 1+3 | Part of ISS-1 |
| ISS-3 | 17 `_underscore` function names | P2 |
| ISS-4 | `draw()` 2,022 line monolith | P2 |
| ISS-5 | 5 duplicate Snoo SVG helper pairs | P2 |
| ISS-6 | 18 raw message strings in game.js | P2 |
| ISS-7 | 4 dead functions in codebase | P2 |
| ISS-8 | `DEBUG_PASSWORD` plaintext | P3 |
| ISS-9 | `bornTs` not stamped on cocoon hatch respawn | Low |
| ISS-10 | `weeklyContrib` client-authoritative — could be spoofed for tea bonus | P3 (post-ISS-1) |

---

## Closed Issues

| Fix | Session |
|-----|---------|
| u/You hardcoded — username variable not used in avatar render | S15 |
| Snoovatar fetch used wrong Devvit API (property vs method) | S15 |
| Snoovatar circle-cropped — should be full-body portrait | S15 |
| Snoovatar flicker — per-frame scaling, fixed by offscreen canvas pre-render | S15 |
| Weather HUD overlapping karma — moved to upper right | S15 |
| Gen avatar mode did nothing — removed, cycle is now 3 modes | S15 |
| Weather system dead-ended on external API — replaced with simulation | S15 |
| Bin size inconsistent across devices — WORLD_W=1194 fixed, viewport scrolls | S15 |
| camX never scrolled right — getBin() was using W not WORLD_W | S15 |
| Pointer/touch offset after coordinate system change — _toCanvas uses root rect + camX | S15 |
| Snoo drain invisible on mobile (camera formula) | S14 |
| Snoo push-down/push-up during cinematic | S14 |
| Loading screen icon lost in revert | S14 |
| Death never posted to thread | S14 |
| Headstone dates were fake | S14 |
| Any user could create a bin post | S14 |
| Preview card had plain brown background | S14 |

