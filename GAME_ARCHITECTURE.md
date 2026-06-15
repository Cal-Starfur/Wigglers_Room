# GAME_ARCHITECTURE.md
*Source of truth. Updated every session. Never delete entries — only add or mark deprecated.*
*Generated: 2026-06-15 23:34 | Auto-scanned by Lead Dev skill*

---

## Identity
- **Game:** game
- **Platform:** p5.js
- **Game Type:** Platformer
- **Current Version:** V20
- **Last Updated:** 2026-06-15
- **Source File:** `game.js` (8402 lines)

---

## Platform Context
**p5.js**
- [Add platform-specific context here]

---

## Naming Conventions (ENFORCED — Never Violate)
- **Style detected:** camelCase
- **Prefixes in use:**
  - `t` prefix = 4 variables found
  - `p` prefix = 22 variables found
  - `h` prefix = 6 variables found
  - `l` prefix = 6 variables found
  - `x` prefix = 3 variables found
  - `s` prefix = 13 variables found
  - `j` prefix = 4 variables found
  - `c` prefix = 5 variables found
- **Constants:** ALL_CAPS_SNAKE_CASE
- **Rule:** Match existing style exactly. Never introduce a new naming pattern.

---

## Systems Map
*Auto-detected from function names. Review and refine each session.*

### Misc/Uncategorized
- **Functions (63):** `getRealDayTime()`, `scrapsPush()`, `dropsPush()`, `_registerPendingWorm()`, `_findPendingWorm()`, `getEvapRate()`, `getBin()`, `_refreshBin()` + 55 more
- **Talks To:** [fill in]
- **Must NOT modify:** [fill in]

### Communication
- **Functions (3):** `postToHost()`, `inCompost()`, `compostDepth()`
- **Talks To:** [fill in]
- **Must NOT modify:** [fill in]

### Progression/Save
- **Functions (4):** `addPoint()`, `updateScrapsLevel()`, `saveSession()`, `loadSession()`
- **Talks To:** [fill in]
- **Must NOT modify:** [fill in]

### UI/Rendering
- **Functions (17):** `drawTrashChunk()`, `drawDebrisFragment()`, `drawFarmerSnoo()`, `drawBoot()`, `drawSnooDrain()`, `drawSnooCinematic()`, `drawPath()`, `drawGenDebugPanel()` + 9 more
- **Talks To:** [fill in]
- **Must NOT modify:** [fill in]

### Game Loop
- **Functions (6):** `updateSnoo()`, `updateSnooDrain()`, `updateCocoons()`, `updatePhysics()`, `updatePendingWorms()`, `loop()`
- **Talks To:** [fill in]
- **Must NOT modify:** [fill in]

### Initialization
- **Functions (3):** `spawnScraps()`, `setup()`, `_dropSegStart()`
- **Talks To:** [fill in]
- **Must NOT modify:** [fill in]

### Player
- **Functions (3):** `initPlayer()`, `updatePlayer()`, `respawnPlayer()`
- **Talks To:** [fill in]
- **Must NOT modify:** [fill in]

### Input
- **Functions (2):** `_clickInBtn()`, `_touchInBtn()`
- **Talks To:** [fill in]
- **Must NOT modify:** [fill in]

---

## Constants Registry
*All named constants found in the codebase.*

| Constant | Value |
|---|---|
| — | No ALL_CAPS constants found — magic numbers may be in use |

---

## Function Registry
*Every function. Line numbers current as of last scan.*

| Function | Line | Length | Notes |
|---|---|---|---|
| `getRealDayTime()` | 51 | 4 lines |  This means all players worldwide see the same sky  |
| `scrapsPush(s)` | 106 | 9 lines |  Safe push — enforces the cap by removing oldest ea |
| `dropsPush(d)` | 123 | 10 lines |  Safe push — enforces the cap by dropping the oldes |
| `postToHost(msg)` | 196 | 6 lines |  Safe to call at any time; silently does nothing wh |
| `_registerPendingWorm(pw)` | 402 | 20 lines |  Derived rates — called each frame from updatePhysi |
| `_findPendingWorm(uname)` | 424 | 5 lines |   |
| `getEvapRate()` | 431 | 6 lines |   |
| `getBin()` | 573 | 3 lines |   |
| `_refreshBin()` | 580 | 0 lines |   |
| `getBinCached()` | 584 | 3 lines |   |
| `getTier(wy)` | 589 | 3 lines |   |
| `cSurf()` | 594 | 0 lines |   |
| `tSurf()` | 595 | 0 lines |   |
| `inCompost(wy)` | 598 | 0 lines |  ── Compost layer — the single combined castings/co |
| `compostDepth(wy)` | 600 | 0 lines |  0 at top of compost, 1 at bottom — for depth-scale |
| `nearestPathIdx(wx, wy, xTol, yTol)` | 605 | 14 lines |  Find the nearest pPath index at or below a given w |
| `addPoint(path, x, y, r, lastX)` | 624 | 33 lines |   |
| `drawTrashChunk(ctx, name, r, hpFrac)` | 662 | 0 lines |  ctx must be already translated & rotated before ca |
| `dim(hex)` | 664 | 0 lines |  dim() kept for colour reuse but always returns ful |
| `drawDebrisFragment(ctx, name, r, col, c)` | 1363 | 0 lines |  Called for both falling debris and settled tier-1  |
| `getLowestScrapY()` | 1589 | 10 lines |   |
| `drawFarmerSnoo(ctx, sx, sy, lidAng,)` | 1603 | 0 lines |  sx, sy = anchor (torso top). lidAng = lid open ang |
| `drawBoot(bx)` | 1638 | 8 lines |  ── Boots ───────────────────────────────────────── |
| `svgX(v)` | 1776 | 0 lines |   |
| `svgY(v)` | 1777 | 0 lines |   |
| `makeSnooGrad(gcx, gcy, gr)` | 1779 | 10 lines |   |
| `makeIrisGrad(icx, icy)` | 1826 | 9 lines |  Iris gradient |
| `smilePath(topSvgY, botSvgY, ha)` | 1873 | 9 lines |  Mouth |
| `updateSnoo()` | 1922 | 128 lines | ⚠️ LONG ── Update Snoo cinematic state machine ─────────── |
| `_snooEaseOut(x)` | 1953 | 0 lines |   |
| `_snooEaseIn(x)` | 1954 | 0 lines |   |
| `triggerSnoo(scene)` | 2053 | 14 lines |  ── Trigger the Snoo cinematic ──────────────────── |
| `triggerSnooDrain()` | 2070 | 27 lines |  ── Trigger the drain cinematic ─────────────────── |
| `updateSnooDrain()` | 2100 | 91 lines | ⚠️ LONG ── Update drain cinematic state (called from loop( |
| `easeOut(x)` | 2110 | 0 lines |   |
| `easeIn(x)` | 2111 | 0 lines |   |
| `drawSnooDrain()` | 2194 | 0 lines |  ── Draw drain cinematic ────────────────────────── |
| `_dBoot(bx)` | 2255 | 8 lines |  Boots |
| `_svgX(v)` | 2331 | 0 lines |   |
| `_svgY(v)` | 2332 | 0 lines |   |
| `_mkSnooGrad(gcx,gcy,gr)` | 2333 | 5 lines |   |
| `_mkIrisGrad(icx,icy)` | 2348 | 4 lines |   |
| `_smilePath(ty2,by2,hw2)` | 2366 | 5 lines |   |
| `drawSnooCinematic()` | 2460 | 13 lines |  ── Draw Snoo cinematic overlay (lid open, cascade  |
| `spawnScraps()` | 2475 | 172 lines | ⚠️ LONG  |
| `updateScrapsLevel()` | 2649 | 54 lines | ⚠️ LONG  |
| `frac(l)` | 2660 | 0 lines |  Fraction remaining per layer |
| `initPlayer(saved)` | 2706 | 9 lines |   |
| `saveSession()` | 2718 | 40 lines |  ── Session persistence ─────────────────────────── |
| `loadSession()` | 2760 | 6 lines |   |
| `applyOfflineDrain(saved)` | 2768 | 97 lines | ⚠️ LONG  |
| `formatOfflineTime(sec)` | 2867 | 4 lines |   |
| `resizeCanvas()` | 2891 | 20 lines |   |
| `setup()` | 2913 | 136 lines | ⚠️ LONG  |
| `updateCocoons()` | 3051 | 11 lines |   |
| `updatePlayer()` | 3064 | 0 lines |   |
| `updatePhysics()` | 3721 | 0 lines |   |
| `_dropSegStart(idx)` | 3890 | 5 lines |  Used so stalled tea drops only re-scan their own s |
| `_dropSegEnd(idx)` | 3898 | 5 lines |  Returns pPath.length if there is no trailing null  |
| `triggerWeeklyDrain()` | 4537 | 40 lines |   |
| `drawPath(path)` | 4579 | 46 lines | ⚠️ LONG  |
| `drawGenDebugPanel()` | 4628 | 54 lines | ⚠️ LONG ── Generation debug panel (DEBUG_MODE only) ────── |
| `getGenColor(gen)` | 4696 | 2 lines |   |
| `getGenName(gen)` | 4700 | 2 lines |   |
| `drawGenBadge(x, screenY, gen)` | 4704 | 22 lines |   |
| `drawWorm(segs, sr, col, sleep)` | 4728 | 119 lines | ⚠️ LONG  |
| `drawSnoo(ctx, cx, cy, s, slee)` | 4851 | 145 lines | ⚠️ LONG s = scale (1 = ~22px tall), cx/cy = centre of head |
| `svgX(v)` | 4862 | 0 lines |   |
| `svgY(v)` | 4863 | 0 lines |   |
| `makeSnooGrad(gcx, gcy, gr)` | 4865 | 10 lines |   |
| `makeIrisGrad(icx, icy)` | 4921 | 6 lines |  Iris gradient |
| `smilePath(topSvgY, botSvgY, ha)` | 4959 | 8 lines |  Mouth |
| `blendWet(e, mw, dr,dg,db, er,)` | 5002 | 5 lines |  Call: blendWet(e, mw, dryR,dryG,dryB, enrichR,enri |
| `getSoilGradStops(e, mw)` | 5015 | 13 lines |   |
| `blendEnrichCol(br, bg, bb, er, eg, )` | 5030 | 3 lines |   |
| `lerpCol(a, c, t)` | 5034 | 8 lines |   |
| `h(s,i)` | 5035 | 0 lines |   |
| `skyCol(t)` | 5043 | 11 lines |   |
| `draw()` | 5067 | 0 lines |   |
| `drawPendingWorms()` | 7091 | 116 lines | ⚠️ LONG ── Weather HUD ─────────────────────────────────── |
| `drawQueueHUD()` | 7209 | 80 lines | ⚠️ LONG  |
| `drawWeatherHUD()` | 7291 | 17 lines |   |
| `drawDeathScreen()` | 7310 | 164 lines | ⚠️ LONG  |
| `updatePendingWorms()` | 7477 | 27 lines |  ── Queue: update pending / unclaimed worms each fr |
| `loop()` | 7506 | 25 lines |   |
| `showErr(msg)` | 7532 | 7 lines |   |
| `respawnPlayer(usedKarma)` | 7541 | 53 lines | ⚠️ LONG  |
| `tryLayCocoon()` | 7596 | 37 lines |   |
| `triggerDrainTap()` | 7635 | 9 lines |   |
| `closeDrainTap()` | 7646 | 18 lines |   |
| `trySleep()` | 7666 | 34 lines |   |
| `tryPoop()` | 7702 | 67 lines | ⚠️ LONG  |
| `_toCanvas(cssX, cssY)` | 7774 | 4 lines |  CSS pixels and must be divided by the scale factor |
| `_clickInBtn(b)` | 7858 | 0 lines |   |
| `drawLongPressRing()` | 7904 | 22 lines |  Draw long-press ring — called from draw() each fra |
| `_cancelLP()` | 7928 | 3 lines |   |
| `_touchInBtn(b)` | 8014 | 0 lines |   |
| `showDebugPrompt()` | 8193 | 111 lines | ⚠️ LONG ── Password prompt overlay ─────────────────────── |
| `closeOverlay()` | 8246 | 2 lines |   |
| `showToast(msg, color)` | 8250 | 14 lines |   |
| `attempt()` | 8266 | 18 lines |   |

---

## Variable Registry
*Key variables tracked across sessions.*

| Variable | Kind | Type | Line | Hint |
|---|---|---|---|---|
| `msg` | var | unknown | 5 | `(e.message || '') + ' @ ' + (e.filename|` |
| `d` | var | unknown | 7 | `document.createElement('div')` |
| `root` | var | unknown | 15 | `document.getElementById('root')` |
| `canvas` | var | unknown | 16 | `document.getElementById('c')` |
| `ctx` | var | unknown | 17 | `canvas.getContext('2d')` |
| `_ctxFilterSupported` | var | unknown | 38 | `(function(){` |
| `t` | var | unknown | 39 | `document.createElement('canvas').getCont` |
| `W` | var | number | 42 | `0` |
| `camY` | var | number | 43 | `0` |
| `viewMode` | var | boolean | 44 | `false` |
| `viewCamY` | var | number | 45 | `0` |
| `mX` | var | number | 46 | `0` |
| `frame` | var | number | 47 | `0` |
| `username` | var | string | 48 | `'u/You'` |
| `now` | var | instance | 52 | `new Date()` |
| `secsSinceMidnight` | var | unknown | 53 | `now.getHours()*3600 + now.getMinutes()*6` |
| `dayTime` | var | unknown | 56 | `getRealDayTime()` |
| `TIERS` | var | array | 58 | `[` |
| `TRASH_TYPES` | var | array | 66 | `[` |
| `trashChunks` | var | array | 99 | `[]` |
| `scraps` | var | array | 102 | `[]` |
| `MAX_SCRAPS` | var | number | 104 | `300` |
| `_removed` | var | boolean | 108 | `false` |
| `_si3` | var | number | 109 | `0` |
| `debris` | var | array | 116 | `[]` |
| `_debrisDirty` | var | boolean | 117 | `false` |
| `drops` | var | array | 118 | `[]` |
| `MAX_DROPS` | var | number | 121 | `200` |
| `_di2` | var | number | 127 | `0` |
| `weatherQueue` | var | array | 134 | `[]` |
| `gardenTufts` | var | array | 135 | `[]` |
| `gardenFlowers` | var | array | 136 | `[]` |
| `bugs` | var | array | 137 | `[]` |
| `castings` | var | array | 138 | `[]` |
| `tLvl` | var | number | 139 | `0` |
| `castingEnrichment` | var | number | 140 | `0` |
| `pooled` | var | number | 141 | `0` |
| `tapReady` | var | boolean | 142 | `false` |
| `teaSplashes` | var | array | 143 | `[]` |
| `valveDrips` | var | array | 144 | `[]` |
| `WEEK_DRAIN_MS` | var | unknown | 147 | `7 * 24 * 60 * 60 * 1000` |
| `weekStartTs` | var | number | 148 | `0` |
| `weeklyContrib` | var | number | 149 | `0` |
| `floodActive` | var | boolean | 150 | `false` |
| `drainBonusPopups` | var | array | 151 | `[]` |
| `scrapsLevel` | var | number | 152 | `1.0` |
| `scrapsEmpty` | var | boolean | 153 | `false` |
| `karma` | var | number | 156 | `0` |
| `DEATH_KARMA_COST` | var | number | 157 | `50` |
| `deathScreen` | var | boolean | 160 | `false` |
| `deathCause` | var | string | 161 | `''` |
| `deathFade` | var | number | 162 | `0` |
| `OFFLINE_DRAIN_PER_SEC` | var | unknown | 168 | `1 / (24 * 3600)` |
| `MAX_OFFLINE_DRAIN` | var | number | 169 | `0.85` |
| `SESSION_KEY` | var | string | 170 | `'wigglers_session_v2'` |
| `weather` | var | object | 174 | `{` |
| `weatherLocationSet` | var | boolean | 183 | `true` |
| `_devvitSessionReceived` | var | boolean | 192 | `false` |
| `img` | var | instance | 252 | `new Image()` |
| `existing` | var | unknown | 278 | `null` |

---

## Known Issues / Tech Debt
*Honest. Never hide problems. Add entries every session.*

- [ ] [Run audit.py to populate this section]

---

## Do Not Touch
*Fragile, deprecated, or in active refactor.*

- [None identified yet — populate as issues are found]

---

## Changelog

### V20 — 2026-06-15
- **Intent:** Initial architecture scan
- **Changed:** Generated GAME_ARCHITECTURE.md from source file
- **New systems:** [list any]
- **Debt added:** None
- **Next session:** Review auto-detected systems, fill in system boundaries

---
*This file is maintained by the Lead Dev skill. Update it every session.*
