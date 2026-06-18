---
name: Wigglers Architecture
description: Load for any Wigglers Room worm bin game session, or whenever the user mentions their worm game, game.js, main.tsx, Devvit, V20, pPath tunnels, sumpExit drains, tLvl sump, poop clog system, worm tea physics, castingEnrichment, tunnel decay, or variables like pHP/pGut/pSEG/pSR/karma/pooled. Also load when the user asks about the audit, session fixes, draw subfunctions, updatePhysics, otherPlayers, or the weekly drain cycle.
---

# Wigglers Room — Architecture Reference

> **Source of truth pulled from GitHub on 2026-06-18 (after Session 7 — mobile bridge fix).**
> Always fetch fresh files via github-sync before editing. GAME_ARCHITECTURE.md and WIGGLERS_AUDIT_V20.md in the repo are the living records — read them first every session.

**Repo:** https://github.com/Cal-Starfur/Wigglers_Room  
**Branch:** main | **Version:** V20 | **game.js:** ~8,492 lines

---

## Repo Structure

```
Wigglers_Room/
├── src/main.tsx              — Devvit host (KV, Realtime, auth, message routing) — 416 lines
├── webroot/
│   ├── game.js               — All game logic — vanilla JS + Canvas — ~8492 lines
│   ├── index.html            — Webview shell
│   └── style.css
├── .github/workflows/
│   └── deploy.yml            — Build check (tsc + devvit build) on every push — NO auto-upload
├── GAME_ARCHITECTURE.md      — Living systems map + function/variable registry
├── WIGGLERS_AUDIT_V20.md     — Audit log: all bugs found, fixes applied, priority queue
├── devvit.yaml               — App config (redis, realtime, redditAPI, kvStore)
└── README.md
```

### Deploy Workflow (CRITICAL)
- CI only runs `tsc + devvit build` — it does NOT run `devvit upload`
- Upload is always manual: run `git pull` in Codespace first, then `devvit upload`
- **After any Claude session that pushes via API:** always `git pull` before `devvit upload` or files will be missing (Session 6 fix)

---

## Architecture: Two-Process Split

```
Reddit Host (main.tsx)              Webview (game.js)
────────────────────────────        ─────────────────────────────
Devvit KV Store                     Canvas 2D rendering
Realtime broadcast                  Physics / game loop
Anti-cheat clamping                 Player input
Reddit auth + avatar                localStorage fallback (dev mode)
Weather fetch (Open-Meteo)
          │   postMessage bridge    │
          └───────────────────────-─┘
```

### Message Constants — ALL named, no raw strings (Priority 3 fix)

All `MSG_*` constants are defined in both `game.js` and `main.tsx`. Never use raw strings.

**Host → Webview:** `MSG_SET_USERNAME`, `MSG_SET_SESSION`, `MSG_SET_WEATHER`, `MSG_SET_PLAYER_AVATAR`, `MSG_SET_WORLD_STATE`, `MSG_SET_PRESENCE`, `MSG_SET_FLOOD`, `MSG_WORM_CLAIMED`

**Webview → Host:** `MSG_READY`, `MSG_SAVE_SESSION`, `MSG_WORLD_UPDATE`, `MSG_PRESENCE_UPDATE`, `MSG_PLAYER_DIED`, `MSG_REQUEST_PRESENCE`, `MSG_CLAIM_WORM`, `MSG_JOIN_QUEUE`, `MSG_FLOOD_ACK`, `MSG_UNCLAIMED_WORM_DIED`

### KV Store Keys
```
worm:{username}     — per-player session (position, HP, gut, cocoons, score, karma)
world:{postId}      — shared bin state (tLvl, pooled, castingEnrichment, scrapsLevel)
cocoons:{postId}    — all players' cocoons in this bin
week:{postId}       — { weekStartTs, pot, contributors }
queue:{postId}      — pending worm queue
```

### Session Persistence Rule (Priority 2 fix — DONE)
**All session mutations go through `saveSession()`** (dual-writes localStorage + postToHost).  
Never call `localStorage.setItem(SESSION_KEY, ...)` directly outside `saveSession()`.  
6 rogue calls were fixed in Session 2. Only 2 intentional writes remain.

---

## ⚠️ DEVVIT MOBILE BRIDGE — CRITICAL KNOWLEDGE (Session 7)

### How the bridge works on each platform

| Platform | How messages travel (webview → host) | How messages travel (host → webview) |
|---|---|---|
| **Reddit web (desktop)** | `window.parent.postMessage(obj, '*')` — structured clone, objects OK | `webView.postMessage(obj)` → arrives as `{ type: 'devvit-message', data: { message: obj } }` |
| **Reddit mobile app** | `window.ReactNativeWebView.postMessage(string)` — **MUST be a JSON string** | Same envelope — but arrives with `e.origin === ""` (null/empty) |

### The three mobile bridge bugs found and fixed (Session 7 commit 92ff99c)

**Bug 1 — `postToHost` was sending raw objects on mobile, silently failing.**  
`window.ReactNativeWebView.postMessage` only accepts strings. Passing a JS object results in `"[object Object]"` which Devvit's `onMessage` can't parse. Fix: JSON.stringify all messages on the RN path.

**Bug 2 — `postToHost` never reached `window.ReactNativeWebView`.**  
On mobile there is no parent iframe, so `window.parent === window`. The old fallback was `window.postMessage(msg, '*')` which does NOT reach the React Native host layer. Fix: check for `window.ReactNativeWebView` first.

**Bug 3 — `if (!e.origin) return` was dropping all incoming messages on mobile.**  
React Native WebView delivers host messages with an empty/null `e.origin`. The old guard silently blocked every `setUsername`, `setSession`, `setPlayerAvatar`, etc. Fix: remove the guard entirely; rely on message type/structure validation instead.

### Correct `postToHost` implementation (live in game.js since Session 7)

```js
function postToHost(msg) {
  try {
    // Mobile: Reddit app is React Native — use injected RN bridge, must stringify
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      return;
    }
    // Web/iframe: use structured clone (no stringify needed)
    var target = (window.parent && window.parent !== window) ? window.parent : window;
    target.postMessage(msg, '*');
  } catch(e) {}
}
```

### Correct message listener (live in game.js since Session 7)

```js
window.addEventListener('message', function(e) {
  // DO NOT gate on e.origin — mobile RN WebView delivers empty/null origin
  // Rely on message type/structure for safety instead
  var msg = e.data;
  if (msg && msg.type === 'devvit-message' && msg.data && msg.data.message) {
    msg = typeof msg.data.message === 'string'
      ? JSON.parse(msg.data.message)
      : msg.data.message;
  }
  if (!msg || !msg.type) return;
  // ... handlers
```

### main.tsx onMessage — already handles both paths correctly

```ts
async onMessage(rawMessage: any) {
  let message: any;
  if (rawMessage?.type === 'devvit-message' && rawMessage?.data?.message) {
    // Devvit wraps messages in this envelope on both web and mobile
    message = typeof rawMessage.data.message === 'string'
      ? JSON.parse(rawMessage.data.message)   // ← handles JSON.stringify'd mobile messages
      : rawMessage.data.message;
  } else {
    message = rawMessage;
  }
```

### Things that were tried and DON'T fix the mobile bridge

- Removing `window.parent !== window` guard only
- Adding `document.addEventListener('message', ...)` alongside `window.addEventListener`
- Adding `window.ReactNativeWebView.postMessage` as a fallback WITHOUT `JSON.stringify` (wrong — must stringify)
- Removing the `isInIframe` check
- Retrying `ready` every 500ms (good practice but not the root fix)

---

## World Layout — The Bin

Y increases downward. `H` = tier height in pixels (from `resizeCanvas()`).

```
y = 0   ..  H     Tier 0 — Scraps & blanket  (food, no tunnels)
y = H   ..  2H    Tier 1 — Active soil        (main worm zone, no tunnels)
y = 2H  ..  3H    Tier 2 — Castings/compost   (DENSE — tunnels live here)
y = 3H            cSurf() — compost floor / sump top
y = 3H+ ..        Sump   — worm tea reservoir (tLvl drives fill height)
```

**Geometry helpers:**
```js
getTier(wy)       // 0–3
cSurf()           // 3*H
tSurf()           // liquid surface Y in sump
inCompost(wy)     // true if 2H <= wy < 3H
compostDepth(wy)  // 0.0 at compost top, 1.0 at bottom
getBinCached()    // {cx, bw, bw2, lw} — cached bin dims
```

`addPoint()` only carves tunnel points when `ti >= 2`. Tiers 0 and 1 leave no path trace.

---

## Key Global State (game.js)

### World / Shared (synced via KV + Realtime)
```js
var tLvl = 0;              // 0–1 sump tea fill — shared all players
var pooled = 0;            // 0–1 compost moisture saturation
var castingEnrichment = 0; // 0–1 compost richness — built by pooping, decays slowly
var scrapsLevel = 1.0;     // 0–1 trash density in tier 0
var floodActive = false;   // flood event — server-authoritative via setFlood message
```

### Player Worm
```js
var pHP = 1.0;             // health 0–1
var pGut = 0;              // current gut fill 0..pGutMax
var pGutMax = 8;           // always 4 currently (pSR locked at 4)
var pEaten = 0;            // lifetime items eaten
var pSR = 4;               // worm radius — LOCKED at 4
var pSEG = 4;              // segment count 4–20 max
var karma = 0;
var generation = 0;        // increments on natural death
var pSegs = [];            // [{x,y}] body — head = index 0
var pHist = [];            // position history for segment trailing
var pAcid = 0;             // 0–1 acid buildup from acidic scraps
var pSleeping = false;
var playerState = 'playing'; // 'playing'|'dead'|'queued'|'claiming'
```

### Multiplayer (Session 4 overhaul)
```js
var otherPlayers = [];
// Shape: {username, x, y, targetX, targetY, sleeping, size, segs, generation, hp, gut, avatarUrl, avatarImg, hist, lastSeen}
// Pruned after 90s without presence update
// Rendered via drawWorm(opp.segs, opp.size, getGenColor(opp.generation), opp.sleeping, 0, opp.hp)
// Alpha now 1.0 — real worms, not ghosts
// Presence broadcast sends real pSegs (capped 20 pts) + generation, hp, gut
```

### Tunnel System
```js
var pPath = [];      // flat array: path point objects + null segment separators
var MAX_PPATH = 2000;
```

**pPath point properties:**
| Property | Type | Meaning |
|---|---|---|
| `x, y` | number | World coordinates |
| `r` | number | Radius at carve time (= pSR) |
| `ti` | number | Tier (always 2) |
| `alpha` | 0–1 | Tunnel visibility/decay — 0 = collapsed |
| `clog` | 0–1 | Poop blockage. ≥0.55 blocks tea; ≥0.3 blocks at sumpExit |
| `clogTs` | frame | Frame of last poop deposit (30s hold before decay) |
| `sumpExit` | bool | Drain connection point at y=3H |
| `junctionTarget` | index | pPath index of connected drain segment |

---

## Drain System

### Down Drain
1. Worm digs tier 2 → sump (y=3H)
2. Holds still `JUNCTION_HOLD_FRAMES = 90` (~1.5s), `_hmoved < 0.25`
3. Stamps `{sumpExit:true}` at y=3H, pushes `null` (seals segment)
4. Sets `window._sumpHadDown = true`

### Up Drain
1. Requires `_sumpHadDown === true`
2. Returns to sump, holds still `_hmoved < 0.12` (tighter)
3. Stamps `{sumpExit:true}` at y=3H — segment stays open
4. Digs upward → `head.y <= 2*H` fires +100 karma bonus
5. Seals with null, resets `_upDrainBonusFired`

### ⚠️ NAMING GOTCHA
`sumpExit: true` marks y=3H for **both** drain types.  
Down-drain: `!nextAfterExit` → tea flows to sump (this IS the exit).  
Up-drain: `nextAfterExit` → sets `d.upDrain = true` (this is the ENTRY).  
Always check `nextAfterExit` to tell them apart.

---

## Game Loop — Post Session 9 Refactor

`draw()` is now 13 lines — calls 8 subfunctions:
```js
drawSky()           drawBinBg()       drawTunnels()    drawScraps()
drawSump()          drawBinLid()      drawWorms()      drawHUD()
```

`updatePhysics()` is now 6 lines — calls 4 subfunctions:
```js
updateTunnelDecay()   updateDebris()   updateDrops()   updateFlood()
```
`dropSegStart()` / `dropSegEnd()` are now module-level (no longer inner functions).

`updatePlayer()` is now 12 lines — calls 6 subfunctions:
```js
updatePlayerDeath()    updatePlayerSleep()     updatePlayerVitals()
updatePlayerEating()   updatePlayerMovement()  updatePlayerDrains()
```

---

## Naming Conventions (ENFORCED)

- `camelCase` for all functions and variables
- `ALL_CAPS_SNAKE_CASE` for constants
- **No `_underscore` prefix** — 11 functions renamed in Session 4 (Priority 8 complete)
- `p` prefix = player vars (`pHP`, `pGut`, `pSEG`, `pSR`, `pPath`, `pSegs`)
- `MSG_` prefix = all message type constants (both files)
- `KV_` / `RT_` prefix = KV key and Realtime channel helpers (main.tsx only)
- Segment boundary = `null` in `pPath`

**Renamed in Session 4** (use new names only):
`registerPendingWorm`, `findPendingWorm`, `toCanvas`, `cancelLP`, `snooEaseOut`, `snooEaseIn`, `dBoot`, `dropSegStart`, `dropSegEnd`, `clickInBtn`, `touchInBtn`

**Shared Snoo helpers** (Session 2 — use these, not inner copies):
`snooSvgX`, `snooSvgY`, `snooHeadGrad`, `snooIrisGrad`, `snooSmilePath`

---

## Audit Priority Status

| # | Task | Status |
|---|---|---|
| 1 | Extract duplicate Snoo SVG helpers | ✅ DONE Session 2 |
| 2 | Route all localStorage through saveSession() | ✅ DONE Session 2 |
| 3 | Add MSG_* constants to game.js | ✅ DONE Session 2 |
| 4 | Hash DEBUG_PASSWORD | ⏳ Deferred to pre-launch |
| 5 | Fix global/local variable shadows (starving, head, now) | ✅ DONE Session 3 |
| 6 | Delete dead code (_refreshBin, drawGenDebugPanel, blendEnrichCol) | ✅ DONE Session 3 |
| 7 | Tag nearestPathIdx as reserved for otherPlayers pathfinding | ✅ DONE Session 4 |
| 8 | Rename _underscore functions to camelCase (11 functions) | ✅ DONE Session 4 |
| 9 | Split draw(), updatePhysics(), updatePlayer() | ✅ DONE Session 5 |
| 10 | Convert var loop vars to let | ⏳ DEFERRED — low payoff |
| 11 | Fix mobile bridge (postToHost + origin guard) | ✅ DONE Session 7 |

**Remaining open:** Priority 4 only (DEBUG_PASSWORD — defer to pre-launch).

---

## Safe Editing Protocol

1. **Fetch fresh from GitHub via github-sync** — never edit from stale uploads
2. Copy to `/home/claude/` before modifying (uploads dir is read-only)
3. Check `GAME_ARCHITECTURE.md` for current function line numbers before touching anything
4. Use `str_replace` with unique surrounding context — never line numbers
5. After edits, grep for changed function name to verify no duplicates
6. All session writes through `saveSession()` only
7. New message types: add `MSG_*` constant to BOTH `game.js` AND `main.tsx`
8. After pushing: user must `git pull` in Codespace before `devvit upload`

---

*Last updated: 2026-06-18 after Session 7 — mobile bridge fix. Repo: https://github.com/Cal-Starfur/Wigglers_Room*
