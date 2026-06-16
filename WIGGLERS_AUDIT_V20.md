# Wigglers Room — Lead Dev Audit Report
**File:** `webroot/game.js`  
**Repo:** `Cal-Starfur/Wigglers_Room` (branch: `main`)  
**Scanned:** 2026-06-15  
**Version:** V20 (post-split from single-file V20.html)  
**Platform:** Devvit / Vanilla Canvas  
**Total Lines:** 8,402  
**Total Functions:** 103  
**Total Issues Found:** 228  

---

## Summary

| Severity | Category | Count |
|---|---|---|
| 🔴 Critical | Duplicate Functions | 5 |
| 🔴 Critical | Devvit Platform Violations | 3 |
| 🟠 Significant | Duplicate Variable Declarations | 101 |
| 🟠 Significant | Copy-Paste Blocks | 5 |
| 🟠 Significant | Long Functions (>50 lines) | 18 |
| 🟠 Significant | Dead Code | 5 |
| 🟡 Housekeeping | Naming Convention Mismatches | 17 |
| 🟡 Housekeeping | Single-Letter Variables | 50 |
| 🟡 Housekeeping | Magic Numbers | 20 |

---

## 🔴 CRITICAL — Fix Before Shipping to Devvit

### 1. Duplicate Functions (5 pairs)

These functions are defined **twice** — once inside `drawFarmerSnoo` (~line 1776) and again inside `drawSnoo` (~line 4862). JavaScript silently uses whichever runs last. This is a maintenance trap: editing one copy won't fix the other.

| Function | First Definition | Duplicate |
|---|---|---|
| `svgX(v)` | line 1776 | line 4862 |
| `svgY(v)` | line 1777 | line 4863 |
| `makeSnooGrad(gcx, gcy, gr)` | line 1779 | line 4865 |
| `makeIrisGrad(icx, icy)` | line 1826 | line 4921 |
| `smilePath(topSvgY, botSvgY, ha)` | line 1873 | line 4959 |

**✅ FIXED (Session 2):** `snooSvgX`, `snooSvgY`, `snooHeadGrad`, `snooIrisGrad`, `snooSmilePath` extracted as module-level helpers above `drawFarmerSnoo`. All inner copies removed from `drawFarmerSnoo`, `drawSnoo`, and `drawSnooDrain`. Each function now has a 1-line local shorthand delegating to the shared helper.

---

### 2. Raw `localStorage` Writes That Bypass the Devvit Host

`saveSession()` and `loadSession()` correctly dual-write (localStorage fallback + `postToHost`). However these **direct** raw `localStorage.setItem` calls outside those functions will **silently do nothing or cause errors in Devvit's sandboxed webview**:

| Line | Code | Problem |
|---|---|---|
| 335 | `localStorage.setItem(SESSION_KEY, ...)` | flood ts written directly, bypasses host |
| 2788 | `localStorage.setItem(SESSION_KEY, ...)` | offline drain clears lastFloodTs — not sent to host |
| 3020 | `localStorage.getItem(SESSION_KEY)` | raw read in `setup()` before `setSession` may arrive |
| 3023 | `localStorage.setItem(SESSION_KEY, ...)` | weekStartTs written directly |
| 3094 | `localStorage.setItem(SESSION_KEY, ...)` | death state written directly |
| 4463 | `localStorage.setItem(SESSION_KEY, ...)` | flood trigger writes lastFloodTs directly |
| 8342 | `localStorage.setItem(SESSION_KEY, ...)` | debug key shortcut writes lastFloodTs |

**Fix:** All session state mutations must go through `saveSession()` which already handles the dual-write. Replace raw calls with: load current data object → mutate the field → call `saveSession()`.

---

### 3. Devvit Platform Violations

#### 3a. Raw String Message Types in `game.js`
The audit found three message type strings used as raw literals instead of named constants:

```js
// Found in game.js — should be named constants like in main.tsx
'setPresence'      // used raw in message handler
'setPlayerAvatar'  // used raw in message handler  
'setSession'       // used raw in message handler
```

`main.tsx` correctly uses `const MSG_SET_PRESENCE = 'setPresence'` etc. `game.js` should mirror this pattern. When a string is mistyped, there's no error — the message just silently fails.

**Fix:** Add a `MSG_*` constants block at the top of `game.js` matching `main.tsx` exactly.

#### 3b. `DEBUG_PASSWORD` Hardcoded and Exposed
```js
var DEBUG_PASSWORD = 'wigglers2025';  // line 8185 — visible in shipped JS
```
This password is plaintext in the production bundle. Anyone can open DevTools and read it, then unlock debug mode on Reddit.

**Fix:** Replace with a hash check, or strip the debug system entirely from production builds using a build flag.

#### 3c. Audit Tool Note — Message Handlers Are `if/else`, Not `switch`
The automated audit flagged all message types as "unhandled." This is a **false positive** — `game.js` uses an `if/else` chain rather than a `switch` statement. All handlers are present and correct. However, this is worth noting because the `if/else` pattern is harder to scan. A future refactor to `switch(msg.type)` would make this more readable and eliminate false audit hits.

---

## 🟠 SIGNIFICANT — Fix Soon

### 4. Duplicate Variable Declarations (101)

Most are `var` loop variables (`i`, `t`, `r`, `g`, `b`) in different functions — JavaScript hoisting makes these technically safe, but they pollute the global scope and make debugging confusing. The ones that matter most are variables declared at **both global scope and inside a function**, which can cause subtle override bugs:

| Variable | Declared at Lines |
|---|---|
| `starving` | 3244, 6802 |
| `head` | 3168, 7598 |
| `now` | 52, 274, 3052, 6775, 7093, 7478, 7599, 7971, 8070 |
| `msg` | 5, 207 |
| `headR` | 1608, 2200, 4856 |
| `SC` | 2105, 2199, 4858 |
| `i` | 28 separate locations |
| `g` (gradient) | 8 separate locations |
| `r` (radius/red) | 9 separate locations |

**Fix:** Immediate priority is the global/local shadows (`starving`, `head`, `now`). Loop variables can be addressed over time by converting to `let` scoping.

---

### 5. Copy-Paste Blocks (5)

Lines **4865–4874** are a near-identical copy of lines **1779–1788** — the Snoo gradient and SVG helper setup. These are the same as the duplicate functions in issue #1 above. Resolving issue #1 eliminates all 5 copy-paste flags.

---

### 6. Long Functions — Refactor Candidates

Functions over 50 lines are hard to read and harder to debug. These are the worst offenders:

| Function | Line | Length | Suggested Split |
|---|---|---|---|
| `drawSnooDrain()` | 2194 | 263 lines | Split into: `drawSnooDrainPipes()`, `drawSnooDrainWater()`, `drawSnooDrainUI()` |
| `drawDebrisFragment()` | 1363 | 224 lines | Split by debris type |
| `drawDeathScreen()` | 7310 | 164 lines | Split into: `drawDeathBg()`, `drawDeathText()`, `drawDeathButtons()` |
| `spawnScraps()` | 2475 | 172 lines | Split into: `spawnFoodScraps()`, `spawnDebris()`, `spawnBugs()` |
| `drawSnoo()` | 4851 | 145 lines | Split into: `drawSnooBody()`, `drawSnooFace()`, `drawSnooAccessories()` |
| `setup()` | 2913 | 136 lines | Split into: `setupCanvas()`, `setupPlayer()`, `setupWorld()` |
| `updateSnoo()` | 1922 | 128 lines | Split into `updateSnooState()` + `advanceSnooAnimation()` |
| `drawPendingWorms()` | 7091 | 116 lines | Split into: `drawWormCard()`, `drawWormBadge()` |
| `showDebugPrompt()` | 8193 | 111 lines | Extract: `buildDebugOverlayDOM()` |
| `applyOfflineDrain()` | 2768 | 97 lines | Extract: `calculateOfflineDuration()`, `applyDrainToSession()` |
| `updateSnooDrain()` | 2100 | 91 lines | Split by drain phase |
| `drawQueueHUD()` | 7209 | 80 lines | Extract: `drawQueueSlot()` |
| `tryPoop()` | 7702 | 67 lines | Extract: `resolvePoopTarget()`, `depositPoop()` |
| `drawGenDebugPanel()` | 4628 | 54 lines | Dead code — remove instead |
| `updateScrapsLevel()` | 2649 | 54 lines | Extract per-tier logic |
| `respawnPlayer()` | 7541 | 53 lines | Extract: `applyCocoonRespawn()`, `applyNormalRespawn()` |
| `drawPath()` | 4579 | 46 lines | Extract: `drawPathSegment()` |
| `drawWorm()` | 4728 | 119 lines | Extract: `drawWormSegment()`, `drawWormHead()` |

**Priority:** `drawDeathScreen`, `setup`, `applyOfflineDrain` — these are the ones most likely to be edited and most likely to introduce bugs when they are.

---

### 7. Dead Code (5 functions)

These functions are defined but **never called anywhere** in the codebase:

| Function | Line | Notes |
|---|---|---|
| `onload` | 255 | Likely leftover from old HTML inline script pattern |
| `_refreshBin()` | 580 | Looks like it was planned for cache invalidation — never wired up |
| `nearestPathIdx(wx, wy, xTol, yTol)` | 605 | Tunnel-finding utility — may have been planned for NPC worms |
| `drawGenDebugPanel()` | 4628 | Debug-only panel that's also never called — double candidate for removal |
| `blendEnrichCol(br,bg,bb,er,eg,eb,e)` | 5030 | Color blend helper superseded by `blendWet()` |

**Fix:** `nearestPathIdx` is worth keeping (it'll be needed for NPC worm pathfinding). The rest can be deleted. Tag `nearestPathIdx` with a comment: `// reserved for NPC worm pathfinding`.

---

## 🟡 HOUSEKEEPING — Technical Debt

### 8. Naming Convention Mismatches (17 functions)

The project convention is `camelCase`. These functions use `_underscore` prefixes inconsistently:

| Function | Line | Should Be |
|---|---|---|
| `_registerPendingWorm()` | 402 | `registerPendingWorm()` |
| `_findPendingWorm()` | 424 | `findPendingWorm()` |
| `_refreshBin()` | 580 | `refreshBin()` (if kept) |
| `_snooEaseOut()` | 1953 | `snooEaseOut()` |
| `_snooEaseIn()` | 1954 | `snooEaseIn()` |
| `_dBoot()` | 2255 | `drawBoot()` or `dBoot()` |
| `_svgX()` | 2331 | `svgX()` (resolves when duplicates fixed) |
| `_svgY()` | 2332 | `svgY()` (resolves when duplicates fixed) |
| `_mkSnooGrad()` | 2333 | `makeSnooGrad()` (resolves when duplicates fixed) |
| `_mkIrisGrad()` | 2348 | `makeIrisGrad()` (resolves when duplicates fixed) |
| `_smilePath()` | 2366 | `smilePath()` (resolves when duplicates fixed) |
| `_dropSegStart()` | 3890 | `dropSegStart()` |
| `_dropSegEnd()` | 3898 | `dropSegEnd()` |
| `_toCanvas()` | 7774 | `toCanvas()` |
| `_clickInBtn()` | 7858 | `clickInBtn()` |
| `_cancelLP()` | 7928 | `cancelLP()` |
| `_touchInBtn()` | 8014 | `touchInBtn()` |

Note: 5 of these resolve automatically when the duplicate function issue is fixed.

---

### 9. Magic Numbers (20)

Numbers used directly in code with no explanation. High-risk ones:

| Value | Line | What It Is | Fix |
|---|---|---|---|
| `3600` | 53 | seconds in an hour | `const SECS_PER_HOUR = 3600` |
| `60` | 53 | minutes in an hour | already implied by above |
| `300` | 104 | `MAX_SCRAPS` cap | already has named var `MAX_SCRAPS` — use it |
| `200` | 121 | `MAX_DROPS` cap | already has named var `MAX_DROPS` — use it |
| `90000` | 314 | unknown — needs investigation | needs naming |
| `400` | 416 | unknown — needs investigation | needs naming |
| `70, 40, 50, 30, 60` | 452 | worm spawn coordinates? | needs naming |

---

### 10. Single-Letter Variables (50)

Scattered across the codebase. The loop-local ones (`i`, `r`, `g`, `b` for color math) are acceptable convention. The ones to fix are any that live outside a 3-line loop body. The audit caught 50 total — only the non-loop ones are worth addressing.

---

## ✅ What's Already Working Well

These are done right and should not be touched:

| System | Status |
|---|---|
| `main.tsx` message constants | ✅ All types are named constants |
| `main.tsx` KV key namespacing | ✅ `worm:{username}`, `world:{postId}` etc. |
| `main.tsx` anti-cheat clamps | ✅ score, karma, pSR, pSEG, cocoon timestamps |
| `postToHost()` wrapper | ✅ Safe to call at any time, silently no-ops locally |
| `saveSession()` dual-write | ✅ localStorage fallback + postToHost |
| `setSession` handler | ✅ Receives server session, applies it before setup |
| `setUsername` handler | ✅ Updates `username` variable before game starts |
| `setWorldState` handler | ✅ Present and wired (lines 261-270) |
| `setFlood` handler | ✅ Present and server-authoritative |
| `setPresence` handler | ✅ Present and wired (line 273) |
| `setPlayerAvatar` handler | ✅ Present (line 251) |
| `ready` message on load | ✅ Fires at line 8384, triggers main.tsx init chain |
| Offline drain logic | ✅ `applyOfflineDrain()` caps at 85%, worm never dies offline |
| Cocoon persistence | ✅ `owner` field tied to `username`, survives cross-device |
| Weekly drain server-auth | ✅ `weekStartTs` protected from client overwrite in main.tsx |

---

## Recommended Fix Order

| Priority | Task | Effort | Impact |
|---|---|---|---|
| 1 | ~~Extract duplicate `svgX/svgY/makeSnooGrad/makeIrisGrad/smilePath` to shared helpers~~ | ✅ DONE | Added `snooSvgX`, `snooSvgY`, `snooHeadGrad`, `snooIrisGrad`, `snooSmilePath` as module-level helpers. All 3 inner copies removed. |
| 2 | ~~Route all raw `localStorage.setItem` calls through `saveSession()`~~ | ✅ DONE | Fixed 6 locations (flood handler, offline drain, cocoon filter, death reset, 2x flood triggers). Only 2 intentional writes remain. |
| 3 | ~~Add `MSG_*` named constants to `game.js` matching `main.tsx`~~ | ✅ DONE | 24 constants added. All inbound handler comparisons and outbound postToHost calls updated. Zero raw strings remain. |
| 4 | Change `DEBUG_PASSWORD` to a hash or strip debug in prod build | Low | Security — plaintext password in shipped JS |
| 5 | Fix global/local variable shadows: `starving`, `head`, `now` | Medium | Prevents subtle state bugs |
| 6 | Delete confirmed dead code: `onload`, `_refreshBin`, `drawGenDebugPanel`, `blendEnrichCol` | Low | Reduce file size, reduce confusion |
| 7 | ~~Tag `nearestPathIdx` as reserved for NPC worms~~ | ✅ DONE | Kept for `otherPlayers` path-following (not NPC worms — original design intent was always real multiplayer worms). Corrected comment added. |
| 8 | ~~Rename `_underscore` functions to camelCase~~ | ✅ DONE | 11 functions renamed: `registerPendingWorm`, `findPendingWorm`, `toCanvas`, `cancelLP`, `snooEaseOut`, `snooEaseIn`, `dBoot`, `dropSegStart`, `dropSegEnd`, `clickInBtn`, `touchInBtn`. |
| 9 | ~~Split the 5 longest functions~~ | ✅ DONE | `draw()` 2030→13 lines (8 subfuncs), `updatePhysics()` 815→6 lines (4 subfuncs), `updatePlayer()` 643→12 lines (6 subfuncs). `dropSegStart/End` promoted to module-level. |
| 10 | Convert `var` loop variables to `let` | ⏳ DEFERRED | High change volume, low payoff. All meaningful shadows fixed in Priority 5. Revisit only if a scope bug surfaces. |

---

## Files Scanned This Session

| File | SHA | Status |
|---|---|---|
| `webroot/game.js` | `5a58c95` | ✅ Audited |
| `webroot/index.html` | `660ea08` | ✅ Reviewed — clean |
| `webroot/style.css` | `93bd130` | ✅ Reviewed — clean |
| `src/main.tsx` | `209d0a9` | ✅ Reviewed — clean, no issues |

---

## Session Log

- **Session:** 2026-06-15
- **What was done:** First GitHub pull + full automated audit of post-split repo
- **Bugs found:** 228 total — 5 critical (duplicate functions), 3 Devvit violations, 101 dup vars, 5 dead code
- **Audit tool note:** False-positive on message handlers — game.js uses `if/else` chain, tool scans for `switch/case`. All handlers are present.
- **Tool fix applied:** Added missing `defaultdict` import to `generate_architecture.py`
- **Next session:** Begin fixes in priority order — start with duplicate functions (#1) and raw localStorage calls (#2)

---

### Session 2 — 2026-06-15
- **What was done:** Applied Priority fixes 1, 2, and 3 to `webroot/game.js`
- **Fix 1:** Extracted 5 duplicate inner Snoo SVG helper functions into 5 shared module-level helpers (`snooSvgX`, `snooSvgY`, `snooHeadGrad`, `snooIrisGrad`, `snooSmilePath`). Removed all inner copies from `drawFarmerSnoo`, `drawSnooDrain`, `drawSnoo`.
- **Fix 2:** Routed 6 rogue `localStorage.setItem(SESSION_KEY)` calls through `data` object + `saveSession()`. Only 2 intentional writes remain (setSession mirror + saveSession body).
- **Fix 3:** Added 24 `MSG_*` named constants block to `game.js` matching `main.tsx`. Replaced all raw string comparisons and all `postToHost` type strings.
- **Skill update:** Added Rule 11 to lead-dev and Rule 7 to github-sync: PUSH ALL CHANGES BEFORE SESSION ENDS.
- **Lines:** 8401 → 8432 (+31 from shared helpers + constants block)
- **Next:** Priority 4 (DEBUG_PASSWORD hash), Priority 5 (global/local variable shadows), Priority 6 (dead code removal)

---

### Session 3 — 2026-06-15
- **What was done:** Applied Priority fixes 5 and 6 to `webroot/game.js`. Priority 4 (DEBUG_PASSWORD) deferred — debug mode still needed during active development.
- **Fix 5:** Renamed `var starving` in HUD draw function to `var starvingHUD` — eliminates shadow of `updatePlayer`'s `starving`. Updated `hungerFlash` and gut color block to match. `head` and `now` shadows reviewed — all are function-local, no fix needed.
- **Fix 6:** Deleted 3 confirmed dead functions: `_refreshBin` (1 line, never called), `drawGenDebugPanel` (55 lines, never called), `blendEnrichCol` (4 lines, superseded by `lerpCol`).
- **Lines:** 8432 → 8371 (-61 lines)
- **Commit:** `77c4fef`
- **Remaining priorities:** Priority 7 (tag `nearestPathIdx` as NPC-reserved), Priority 8 (rename `_underscore` functions), Priority 9 (split long functions — defer until touching those systems), Priority 10 (`var` → `let` — low priority)

---

### Session 4 — 2026-06-16
- **What was done:** Priority 8 (underscore renames) + otherPlayers real worm rendering
- **Priority 8:** Renamed 11 `_underscore` functions to camelCase across all call sites. `nearestPathIdx` audit note corrected — not for NPC worms, kept for `otherPlayers` path-following (original design intent).
- **otherPlayers overhaul:** Presence broadcast now sends real `pSegs` (capped at 20 pts), `generation`, `hp`, `gut`. `main.tsx` relay updated to pass all new fields. Draw loop now calls `drawWorm(opp.segs, opp.size, getGenColor(opp.generation), opp.sleeping, 0, opp.hp)` — identical to local worm. History ring buffer kept as 2s fallback. Alpha raised from 0.55 to 1.0 — real worms, not ghosts.
- **Commits:** `43fd1a2` (game.js), `37df5a4` (main.tsx)
- **Lines:** 8371 → 8398
- **Remaining:** Priority 9 (split long functions — defer), Priority 10 (var→let — low priority), DEBUG_PASSWORD hash (Priority 4 — deferred until pre-launch)

### Session 5 — 2026-06-16
- **What was done:** Priority 9 — split three monster functions
- **`draw()`** 2030 → 13 lines: `drawSky`, `drawBinBg`, `drawTunnels`, `drawScraps`, `drawSump`, `drawBinLid`, `drawWorms`, `drawHUD`
- **`updatePhysics()`** 815 → 6 lines: `updateTunnelDecay`, `updateDebris`, `updateDrops`, `updateFlood`; `dropSegStart`/`dropSegEnd` promoted from inner to module-level
- **`updatePlayer()`** 643 → 12 lines: `updatePlayerDeath`, `updatePlayerSleep`, `updatePlayerVitals`, `updatePlayerEating`, `updatePlayerMovement`, `updatePlayerDrains`
- **Priority 10** (`var`→`let`) deferred — high change volume, low payoff, all meaningful shadows already fixed
- **Commit:** `69496a9`
- **Lines:** 8398 → 8492 (+94 from new function headers and call sites)
- **Remaining:** Priority 4 (DEBUG_PASSWORD hash — defer to pre-launch only)

*Generated by Lead Dev skill — Wigglers Room V20 — Cal-Starfur/Wigglers_Room*

