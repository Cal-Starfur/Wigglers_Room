# GAME_ARCHITECTURE.md
*Source of truth. Updated every session. Never delete entries — only add or mark deprecated.*
*Last updated: 2026-06-16 Session 13 — Sleep contract documented, ARC-1A coded*

---

## Identity
- **Game:** Wigglers Room
- **Platform:** Devvit / Vanilla Canvas
- **Game Type:** Persistent multiplayer worm bin composting simulation
- **Current Version:** V20
- **Stable Baseline:** Session 11 — SHA `34e941e` (game.js) / `fda110c` (main.tsx) — 8,397 lines
- **ARC-1A branch:** Session 13 — game.js modified locally, not yet pushed

---

## Core Design Philosophy

### The Sleep Contract
The worm bin is a living world. It runs whether you are watching or not.

**The only safe way to leave is to put your worm to sleep in deep compost (tier 2).**

- Sleeping worm: HP recovers slowly, gut digests at reduced rate. Safe indefinitely.
- Any other state when you close the tab:
  - **Starving** → HP bleeds to 0 → worm dies
  - **Constipated** → HP bleeds to 0 → worm dies  
  - **Acid buildup > 0.5** → HP bleeds to 0 → worm dies
  - **Flooding active** → worm drowns → worm dies
- Death posts a Reddit comment: username, cause, karma, generation
- Death opens a queue slot for the next waiting worm
- Offline death is real and intentional — `MAX_OFFLINE_DRAIN` cap removed

This is not a bug to fix. It is the game.

---

## Repo Structure

```
Wigglers_Room/
├── src/main.tsx              — Devvit host (KV, Realtime, auth, message routing)
├── webroot/
│   ├── game.js               — All game logic — vanilla JS + Canvas
│   ├── index.html            — Webview shell
│   └── style.css
├── .github/workflows/
│   └── deploy.yml            — tsc + devvit build on every push — NO auto-upload
├── GAME_ARCHITECTURE.md      — This file
├── WIGGLERS_AUDIT_V20.md     — Bug tracker + feature backlog + Cal's decisions
├── devvit.yaml
└── README.md
```

---

## Deploy Workflow

1. Claude pushes code to GitHub via github-sync skill
2. GitHub Actions runs build check (~52s) — `tsc + devvit build`
3. Claude fires deploy via bridge3.js: `git pull && devvit upload --just-do-it && devvit install wigglers_room_dev`
4. **Always hard-refresh Reddit after deploy** — close and reopen the post. Never trust first load.

**If bridge isn't running:** user runs `node ~/bridge3.js` in Codespace once per session.

---

## Architecture: Two-Process Split

```
Reddit Host (main.tsx)              Webview (game.js)
────────────────────────────        ─────────────────────────────
Devvit KV Store                     Canvas 2D rendering
Realtime broadcast                  Physics / game loop
Anti-cheat clamping                 Player input
Reddit auth + avatar                localStorage fallback (dev mode)
Scheduler jobs (ARC-1B, planned)
          │   postMessage bridge    │
          └────────────────────────┘
```

---

## Message Constants

**Host → Webview:** `MSG_SET_USERNAME`, `MSG_SET_SESSION`, `MSG_SET_WEATHER`, `MSG_SET_PLAYER_AVATAR`, `MSG_SET_WORLD_STATE`, `MSG_SET_PRESENCE`, `MSG_SET_FLOOD`, `MSG_WORM_CLAIMED`

**Webview → Host:** `MSG_READY`, `MSG_SAVE_SESSION`, `MSG_WORLD_UPDATE`, `MSG_PRESENCE_UPDATE`, `MSG_PLAYER_DIED`, `MSG_REQUEST_PRESENCE`, `MSG_CLAIM_WORM`, `MSG_JOIN_QUEUE`, `MSG_FLOOD_ACK`, `MSG_UNCLAIMED_WORM_DIED`

---

## KV Store Keys
```
worm:{username}     — per-player session (position, HP, gut, cocoons, score, karma)
world:{postId}      — shared bin state (tLvl, pooled, castingEnrichment, scrapsLevel)
cocoons:{postId}    — all players' cocoons
week:{postId}       — { weekStartTs, pot, contributors }
queue:{postId}      — pending worm queue
```

---

## World Layout

Y increases downward. `H` = viewport height in pixels.

```
y = 0    .. H*0.5   Sky / outside bin (above lid)
y = H*0.5           Lid — world Y = H*0.5
y = H*0.5 .. H      Tier 0 — Scraps & blanket (food, no tunnels)
y = H    .. 2H      Tier 1 — Active soil (main worm zone)
y = 2H   .. 3H      Tier 2 — Castings/compost (tunnels live here) ← SLEEP ZONE
y = 3H              cSurf() — compost floor / sump top
y = 3H+             Sump — worm tea reservoir
```

**Sleep zone:** Tier 2 (deep compost) is where sleeping is safe. Surface sleeping (tiers 0–1) provides no protection.

---

## Key Global State

### World / Shared
```js
var tLvl = 0;              // 0–1 sump tea fill
var pooled = 0;            // 0–1 compost moisture saturation
var castingEnrichment = 0; // 0–1 compost richness
var scrapsLevel = 1.0;     // 0–1 trash density in tier 0
var floodActive = false;   // server-authoritative
```

### Player Worm
```js
var pHP = 1.0;             // health 0–1 — reaches 0 → worm dies, Reddit comment posted
var pGut = 0;              // current gut fill 0..pGutMax
var pGutMax = 8;
var pSR = 4;               // worm radius — locked at 4
var pSEG = 4;              // segment count 4–20
var karma = 0;
var generation = 0;        // increments on natural death
var pSegs = [];            // [{x,y}] body — head = index 0
var pAcid = 0;             // 0–1 acid buildup — >0.5 causes HP drain
var pSleeping = false;     // TRUE = safe to leave; FALSE = worm at risk offline
var playerState = 'playing'; // 'playing'|'dead'|'queued'|'claiming'
var username = 'u/You';    // set by MSG_SET_USERNAME from Devvit auth
```

### Offline Drain Constants
```js
var OFFLINE_DRAIN_PER_SEC = 1 / (24 * 3600); // matches live drain rate exactly
// MAX_OFFLINE_DRAIN cap REMOVED (was 0.85) — real death is intentional
// Gen 2+ perk: drain *= 0.85 (−15% offline drain rate)
```

### Tab-Hidden Loop (ARC-1A — coded, pending deploy)
```js
var lastTickMs = 0;    // timestamp of previous tick — for delta-time
var loopRafId  = null; // rAF handle — cancelled when switching to interval
var loopIntId  = null; // setInterval handle — cancelled when returning to rAF
var tabHidden  = false;

// visibilitychange: hidden → clearRaf, startInterval(16ms)
//                  visible → clearInterval, startRaf
// hiddenTick() runs at 16ms — full-speed physics, no draw()
// dt = elapsed / (1000/60) — all drain rates multiplied by dt
```

### Multiplayer
```js
var otherPlayers = [];
// { username, x, y, targetX, targetY, sleeping, size, segs, generation, hp, gut,
//   avatarUrl, avatarImg, hist, lastSeen }
// Pruned after 90s. Real worm rendering — gen color, real HP, real segs.
// Queue entries (no x/y) filtered out in setPresence handler.
```

---

## Game Loop (Monolithic — Do Not Split)

```
startLoop() → requestAnimationFrame(loop)

loop() each frame (tab visible):
  physicsTick(dt)    — all physics + player updates
  viewMode camera
  draw()             — full canvas render

hiddenTick() each 16ms (tab hidden):
  physicsTick(dt)    — all physics + player updates
  [no draw()]        — canvas not visible

physicsTick(dt):
  updateCocoons()
  updateSnoo()
  updateSnooDrain()
  updatePendingWorms()
  updatePlayer(dt)   — movement, vitals, eating, drains, death
  updatePhysics(dt)  — drops, tea, flood, pPath decay
```

⚠️ **Session 5 split draw/updatePhysics/updatePlayer into subfunctions — broke movement on Reddit. Root cause never isolated. Do not attempt again.**

⚠️ **ARC-1A added physicsTick(dt) as a shared wrapper — this is NOT a split of the internal functions. updatePlayer() and updatePhysics() remain monolithic internally.**

---

## Death System

```
pHP → 0 (any cause: starvation, constipation, acid, flood, natural)
  ↓
updatePlayer() fires deathScreen = true
  ↓
postToHost({ type: 'playerDied', cause, karma, generation, pEaten, username })
  ↓
main.tsx posts Reddit comment: "u/username's worm died of [cause] after earning [karma] karma (gen [N])"
  ↓
main.tsx opens queue slot, broadcasts pendingWorm to waiting players
```

**Offline path (tab never opened):**
```
applyOfflineDrain() on next load:
  - Computes elapsed seconds since last save
  - Drains pGut proportionally (no cap)
  - If pGut → 0, bleeds pHP
  - If pHP → 0, death screen fires on first updatePlayer() tick
  - Reddit comment posts via same postToHost() path
```

---

## Drain System

### Down Drain
1. Worm digs tier 2 → sump (y=3H), holds still `JUNCTION_HOLD_FRAMES = 90`
2. Stamps `{sumpExit:true}` at y=3H, pushes `null` (seals segment)

### Up Drain
1. Requires `_sumpHadDown === true`. Returns to sump, holds still.
2. Stamps `{sumpExit:true}` at y=3H. Digs upward → `head.y <= 2*H` fires +100 karma.

⚠️ `sumpExit: true` marks y=3H for BOTH drain types. Check `nextAfterExit` to distinguish them.

---

## 🔥 Live World Architecture — ARC-1 Plan

| Phase | What | File(s) | Status |
|---|---|---|---|
| ARC-1A | Delta-time + `visibilitychange` fallback to `setInterval(16ms)` | game.js | ⏳ Coded, push next |
| ARC-1B | Devvit Scheduler server-side world tick every 60s | main.tsx | ⏳ After ARC-1A |
| ARC-1C | Per-worm offline death fully server-authoritative | main.tsx + game.js | ⏳ After ARC-1B |

---

## Safe Editing Protocol

1. Fetch fresh from GitHub via github-sync — never edit from stale context
2. Copy to `/home/claude/` before modifying
3. Use `str_replace` with unique surrounding context — never line numbers
4. Grep every call site before renaming any function
5. All session writes through `saveSession()` only
6. New message types: add `MSG_*` constant to BOTH `game.js` AND `main.tsx`
7. After pushing: fire deploy via bridge, hard-refresh Reddit to test

---

## Naming Conventions

- `camelCase` — all functions and variables
- `ALL_CAPS_SNAKE_CASE` — constants
- `p` prefix — player vars (`pHP`, `pGut`, `pSEG`, `pSR`, `pPath`, `pSegs`)
- `MSG_` prefix — all message type constants (both files)
- `KV_` / `RT_` — KV key and Realtime channel helpers (main.tsx only)
- No `_underscore` prefix on functions — except `_svgX`/`_svgY` in `drawSnooDrain` (FIX-2 pending)
- Segment boundary = `null` in `pPath`

---

## Changelog

### V20 Session 1 — 2026-06-15
First GitHub pull + full automated audit. 228 issues found.

### V20 Session 2 — 2026-06-15
- 5 duplicate Snoo helpers extracted to module-level
- 6 rogue `localStorage.setItem` calls routed through `saveSession()`
- 24 `MSG_*` constants added. All raw strings replaced.

### V20 Session 3 — 2026-06-15
- `var starvingHUD` shadow rename
- Dead code deleted (`_refreshBin`, `drawGenDebugPanel`, `blendEnrichCol`)
- Lines: 8,432 → 8,371. Commit: `77c4fef`

### V20 Session 4 — 2026-06-16
- 11 `_underscore` → camelCase renames attempted — **BROKE MOVEMENT on Reddit**
- Reverted

### V20 Session 5 — 2026-06-16
- Split `draw()`, `updatePhysics()`, `updatePlayer()` into subfunctions — **BROKE MOVEMENT on Reddit**
- Reverted

### V20 Sessions 6–10 — 2026-06-16
- Various fixes attempted/reverted
- Session 10: confirmed Session 3 (`bab2e46`) as stable baseline
- Solved deploy friction — `devvit install wigglers_room_dev` added

### V20 Session 11 — 2026-06-16
- Root cause of Session 4 movement bug found: 7 call sites on `_dropSegStart`/`_dropSegEnd`, missed 2
- All 11 underscore renames applied cleanly with full call-site audit
- `otherPlayers` real worm rendering restored
- `main.tsx` bug: `player:{}` → `players:[{}]` — other worms invisible since launch fixed
- Queue entries filtered from `otherPlayers`
- Commits: `34e941e` (game.js) / `fda110c` (main.tsx) — 8,397 lines

### V20 Session 12 — 2026-06-16
- Hard-refresh confirmed clean: no duplicate bin, movement works
- ARC-1 identified as #1 priority — world freezes when tab hidden
- Three-phase plan documented: ARC-1A → ARC-1B → ARC-1C

### V20 Session 13 — 2026-06-16
- **Design intent clarified:** sleep contract documented as core mechanic
- **ARC-1A coded in game.js** (not yet pushed):
  - `physicsTick(dt)`, `hiddenTick()`, `startLoop()`, `visibilitychange` listener
  - All drain rates multiplied by `dt` — full-speed physics when hidden
  - `setInterval(16ms)` fallback — NOT throttled to 2fps (would break sleep contract)
- **`MAX_OFFLINE_DRAIN` cap removed** — real offline death is intentional
- Both .md docs rewritten to reflect correct design goals
- Lines: 8,397 → 8,459

*Wigglers Room V20 — Cal-Starfur/Wigglers_Room*
