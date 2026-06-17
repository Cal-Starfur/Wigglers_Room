# GAME_ARCHITECTURE.md
*Source of truth. Updated every session. Never delete entries — only add or mark deprecated.*
*Last updated: 2026-06-16 Session 12 — ARC-1 live world is #1 priority*

---

## Identity
- **Game:** Wigglers Room
- **Platform:** Devvit / Vanilla Canvas
- **Game Type:** Persistent multiplayer worm bin composting simulation
- **Current Version:** V20
- **Stable Baseline:** Session 11 — SHA `34e941e` (game.js) / `fda110c` (main.tsx) — 8,397 lines

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
Weather fetch (planned)
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
y = H*0.5           Lid — world Y = H*0.5, screen Y = H*0.5 - camY
y = H*0.5 .. H      Tier 0 — Scraps & blanket (food, no tunnels)
y = H    .. 2H      Tier 1 — Active soil (main worm zone)
y = 2H   .. 3H      Tier 2 — Castings/compost (tunnels live here)
y = 3H              cSurf() — compost floor / sump top
y = 3H+             Sump — worm tea reservoir
```

camY starts at 0. Default view shows lid at screen centre.

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
var pHP = 1.0;             // health 0–1
var pGut = 0;              // current gut fill 0..pGutMax
var pGutMax = 8;
var pSR = 4;               // worm radius
var pSEG = 4;              // segment count 4–20
var karma = 0;
var generation = 0;        // increments on natural death
var pSegs = [];            // [{x,y}] body — head = index 0
var pAcid = 0;             // 0–1 acid buildup
var pSleeping = false;
var playerState = 'playing'; // 'playing'|'dead'|'queued'|'claiming'
var username = 'u/You';    // set by MSG_SET_USERNAME from Devvit auth
```

### Multiplayer
```js
var otherPlayers = [];
// { username, x, y, targetX, targetY, sleeping, size, segs, generation, hp, gut,
//   avatarUrl, avatarImg, hist, lastSeen }
// Pruned after 90s. Real worm rendering — gen color, real HP, real segs when available.
// Queue entries (no x/y) filtered out in setPresence handler.
```

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

## Game Loop (Monolithic — Do Not Split)

```
loop() each frame:
  updateSnoo()
  updateSnooDrain()
  updatePlayer()       — movement, vitals, eating, drains, death
  updatePhysics()      — drops, tea, flood, pPath decay
  draw()               — sky, bin bg, tiers, tunnels, scraps, sump, lid, worms, HUD
```

⚠️ **Session 5 split these into subfunctions — broke movement on Reddit. Root cause never isolated. Do not attempt again.**

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

## 🔥 Live World Architecture — ARC-1 (TOP PRIORITY)

**Cal's directive:** The world must run 24/7 independent of any player's open tab. This is the #1 goal. No gameplay bugs are worked on until ARC-1A + ARC-1B are shipped.

### Current problem
The game loop runs entirely on `requestAnimationFrame`. Browsers pause/throttle rAF when a tab is hidden. Result: worm physics, HP drain, gut digestion, and all world physics freeze when the player switches tabs. There is no server-side simulation.

### Three-phase plan

| Phase | What | File(s) | Status |
|---|---|---|---|
| ARC-1A | Delta-time refactor + `visibilitychange` fallback to `setInterval` | game.js | ⏳ Next |
| ARC-1B | Devvit Scheduler server-side world tick every 60s | main.tsx | ⏳ After ARC-1A |
| ARC-1C | Per-worm offline death via server (replaces applyOfflineDrain cap) | main.tsx + game.js | ⏳ After ARC-1B |

### ARC-1A — Client-side tab fallback
When tab hidden: switch from rAF → `setInterval(tick, 500)` (~2fps equivalent).  
Requires: `var dt = (now - lastTickMs) / (1000/60)` multiplier on ALL drain rates in `updatePlayer()` and `updatePhysics()`.  
`draw()` is skipped when tab is hidden (no canvas needed). Only physics ticks.  
On tab restore: clear interval, restart rAF.

### ARC-1B — Devvit Scheduler
Add `scheduler: true` to `Devvit.configure()`.  
Register `Devvit.addSchedulerJob('world-tick', ...)` — runs every 60s on Devvit servers.  
Job: read `world:{postId}` from KV → advance tLvl/pooled/castingEnrichment/scrapsLevel → write back → broadcast via `RT_WORLD`.  
World state evolves with zero players open.  
**Race condition rule:** Server tick wins. Client `MSG_WORLD_UPDATE` is still accepted but next server broadcast overwrites client drift.

### ARC-1C — Server-side worm drain
Once ARC-1B exists: scheduler job also reads `worm:{username}` KVs, applies hunger drain formula, marks dead if HP → 0, posts Reddit comment via `MSG_PLAYER_DIED`. Removes `MAX_OFFLINE_DRAIN = 0.85` cap in `game.js`.

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

## Changelog

### V20 Session 1 — 2026-06-15
First GitHub pull + full automated audit. 228 issues found.

### V20 Session 2 — 2026-06-15
- 5 duplicate Snoo helpers extracted to module-level
- 6 rogue `localStorage.setItem` calls routed through `saveSession()`
- 24 `MSG_*` constants added. All raw strings replaced.
- Lines: 8,401 → 8,432

### V20 Session 3 — 2026-06-15
- `var starvingHUD` shadow rename
- Dead code deleted (`_refreshBin`, `drawGenDebugPanel`, `blendEnrichCol`)
- Lines: 8,432 → 8,371. Commit: `77c4fef`

### V20 Session 4 — 2026-06-16
- 11 `_underscore` → camelCase renames attempted
- `otherPlayers` overhaul attempted
- **BROKE MOVEMENT on Reddit** — missed call sites on `_dropSegStart`/`_dropSegEnd`; `try/catch` swallowed the `ReferenceError` silently
- Reverted

### V20 Session 5 — 2026-06-16
- Split `draw()`, `updatePhysics()`, `updatePlayer()` into subfunctions
- **BROKE MOVEMENT on Reddit** — root cause never fully isolated
- Reverted

### V20 Sessions 6–10 — 2026-06-16
- Various fixes attempted then reverted
- Session 10: confirmed Session 3 (`bab2e46`) as stable baseline
- Session 10: solved deploy friction — `devvit install wigglers_room_dev` added, no more manual portal click

### V20 Session 11 — 2026-06-16
- **Root cause of Session 4 movement bug found:** `_dropSegStart`/`_dropSegEnd` had 7 call sites — missed 2 during rename. Error caught silently by `try/catch` in game loop.
- All 11 underscore renames applied with full call-site audit — confirmed clean
- `otherPlayers` real worm rendering restored: gen color, real segs, real HP
- `main.tsx` bug fixed: `player:{}` → `players:[{}]` — other worms were invisible since launch
- Queue entries filtered from `otherPlayers` (had no x/y, rendered as phantom worms at origin)
- **LESSON LEARNED:** Always hard-refresh Reddit after deploy. Stale cache caused phantom "duplicate bin" bug chase — code was fine, Reddit was serving old version.
- Commits: `34e941e` (game.js) / `fda110c` (main.tsx) — 8,397 lines

### V20 Session 12 — 2026-06-16
**Current baseline: `34e941e` / `fda110c` — 8,397 lines — confirmed working on Reddit**
- Hard-refresh confirmed: no duplicate bin, movement works
- Full live-world architecture audit conducted (Session 12)
- **ARC-1 identified as #1 priority** — world freezes when tab is hidden (rAF stops in background tabs)
- Three-phase plan documented: ARC-1A (client fallback) → ARC-1B (Devvit Scheduler) → ARC-1C (server worm drain)
- All gameplay bug fixes deferred until ARC-1A + ARC-1B shipped
- WIGGLERS_AUDIT_V20.md + GAME_ARCHITECTURE.md updated with full ARC-1 spec

*Wigglers Room V20 — Cal-Starfur/Wigglers_Room*

