# Wigglers Room — Game Architecture
> Last updated: 2026-06-17 after Session 14 (post-V60 revert + fixes)
> Repo: https://github.com/Cal-Starfur/Wigglers_Room | Branch: main

---

## Repo Structure

```
Wigglers_Room/
├── src/main.tsx              — Devvit host (KV, Realtime, auth, message routing) — ~415 lines
├── webroot/
│   ├── game.js               — All game logic — vanilla JS + Canvas — ~8410 lines
│   ├── index.html            — Webview shell (loads game.js + style.css)
│   └── style.css             — Minimal reset + canvas positioning
├── assets/
│   └── icon.png              — 512px worm icon (also used as loading screen button)
├── .github/workflows/
│   └── deploy.yml            — Build check (tsc + devvit build) on every push — NO auto-upload
├── GAME_ARCHITECTURE.md      — This file
├── WIGGLERS_AUDIT_V20.md     — Bug log and priority queue
├── devvit.yaml               — App config (redis, realtime, redditAPI, kvStore)
└── README.md
```

### Deploy Workflow (CRITICAL)
- CI only runs `tsc + devvit build` — does NOT run `devvit upload`
- Upload is always manual: `git pull` in Codespace first, then `devvit upload`
- **Always `git pull` before `devvit upload`** or files will be missing

---

## Architecture: Two-Process Split

```
Reddit Host (main.tsx)              Webview (game.js)
────────────────────────────        ─────────────────────────────
Devvit KV Store                     Canvas 2D rendering
Realtime broadcast                  Physics / game loop
Anti-cheat clamping                 Player input
Reddit auth + avatar                localStorage fallback (dev mode)
Death comment posting               bornTs / diedTs tracking
Weather fetch (Open-Meteo)
          │   postMessage bridge    │
          └───────────────────────-─┘
```

---

## Message Constants

All `MSG_*` constants are defined in `main.tsx`. **game.js currently uses raw strings** (S2 dedup work was reverted — re-applying is a known priority).

**Host → Webview:** `MSG_SET_USERNAME`, `MSG_SET_SESSION`, `MSG_SET_WEATHER`, `MSG_SET_PLAYER_AVATAR`, `MSG_SET_WORLD_STATE`, `MSG_SET_PRESENCE`, `MSG_SET_FLOOD`, `MSG_WORM_CLAIMED`

**Webview → Host:** `MSG_READY`, `MSG_SAVE_SESSION`, `MSG_WORLD_UPDATE`, `MSG_PRESENCE_UPDATE`, `MSG_PLAYER_DIED`, `MSG_REQUEST_PRESENCE`, `MSG_CLAIM_WORM`, `MSG_JOIN_QUEUE`, `MSG_FLOOD_ACK`, `MSG_UNCLAIMED_WORM_DIED`

---

## KV Store Keys

```
worm:{username}     — per-player session (position, HP, gut, cocoons, score, karma, bornTs)
world:{postId}      — shared bin state (tLvl, pooled, castingEnrichment, scrapsLevel)
cocoons:{postId}    — all players' cocoons in this bin
week:{postId}       — { weekStartTs, pot, contributors }  ← DEFINED but NOT YET READ/SENT TO CLIENT
queue:{postId}      — pending worm queue
```

---

## Session Persistence

`saveSession()` dual-writes localStorage + postToHost on every meaningful state change.
Fields saved: `ts, bornTs, karma, pEaten, pSR, pSEG, generation, pHP, pGut, pX, pY, pSleeping, pSleepX, pSleepY, cocoons, lastCocoonLaid, weekStartTs, weeklyContrib, emergencyKarmaPot, emergencyRequested, tLvl, pooled, castingEnrichment, drops`

`bornTs` — timestamp when the current worm life began. Stamped on:
- Baby respawn (`respawnPlayer` with `pEaten = 0`)
- First load if no saved session (falls back to `Date.now()` in `loadSession`)

---

## World Layout — The Bin

Y increases downward. `H` = tier height in pixels (from `resizeCanvas()`).

```
y = 0   ..  H     Tier 0 — Scraps & blanket  (food, no tunnels)
y = H   ..  2H    Tier 1 — Active soil        (main worm zone)
y = 2H  ..  3H    Tier 2 — Castings/compost   (tunnels live here)
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

---

## Key Global State (game.js)

### World / Shared
```js
var tLvl = 0;              // 0–1 sump tea fill — shared all players
var pooled = 0;            // 0–1 compost moisture saturation
var castingEnrichment = 0; // 0–1 compost richness
var scrapsLevel = 1.0;     // 0–1 trash density in tier 0
var floodActive = false;   // flood event — server-authoritative
```

### Player Worm
```js
var pHP = 1.0;             // health 0–1
var pGut = 0;              // current gut fill 0..pGutMax
var pGutMax = 8;           // always 4 currently (pSR locked at 4)
var pEaten = 0;            // lifetime items eaten (0–300,000)
var pSR = 4;               // worm radius — LOCKED at 4
var pSEG = 4;              // segment count 4–20 max
var karma = 0;
var generation = 0;        // increments on natural death
var bornTs = 0;            // wall-clock ms when this worm life began
var pSegs = [];            // [{x,y}] body — head = index 0
var pHist = [];            // position history for segment trailing
var pAcid = 0;             // 0–1 acid buildup
var pSleeping = false;
var playerState = 'playing'; // 'playing'|'dead'|'queued'|'claiming'
var deathCause = '';       // 'starvation'|'hunger'|'constipation'|'acidity'|'flood'|'drowning'|'natural'
```

### Tunnel System
```js
var pPath = [];      // flat array: path point objects + null segment separators
var MAX_PPATH = 2000;
```

**pPath point properties:** `x, y, r, ti, alpha, clog, clogTs, sumpExit, junctionTarget`

---

## Drain System

### Weekly Drain (Snoo Cinematic)
Fires when `nowW - weekStartTs >= WEEK_DRAIN_MS` inside `updatePhysics()`.
Triggers `triggerSnooDrain()` → Snoo slides in, opens valve, tea drains, slides out.

**⚠️ KNOWN BUG:** `weekStartTs` is per-player in session KV, not shared world state.
`KV_WEEK` exists but is never read or sent to the game. Weekly drain only fires for
players who have been logged in for 7 real days — not a true shared world event.
Fix planned: read `KV_WEEK` on load, include `weekStartTs` in `setWorldState`.

### Drain Cinematic State Machine
Phases: `floatin → pause → openvalve → draining → closevalve → floatout`

**Camera:** Snapped to `drainSnooStopY - H * 0.58` instantly at trigger time (`triggerSnooDrain`).
`STOP_Y` is hardcoded to `H * 0.58` in screen space — never re-derived from world coords during scene.
This prevents the push-down/push-up jitter caused by per-frame camera easing.

### Down/Up Drain (Player Tap)
- Down: worm digs tier 2 → sump (y=3H), holds still → stamps `sumpExit:true`
- Up: requires `_sumpHadDown`, returns to sump → digs upward → +100 karma bonus

**⚠️ NAMING GOTCHA:** `sumpExit: true` marks y=3H for BOTH drain types.
Down-drain: `!nextAfterExit` → tea flows to sump.
Up-drain: `nextAfterExit` → sets `d.upDrain = true`.

---

## Death System

When `pHP <= 0`, game sends `MSG_PLAYER_DIED` to host with:
```js
{ type, cause, karma, generation, pEaten, username, bornTs, diedTs }
```

`main.tsx` handler:
1. Saves `pHP = 0` + `deathCause` to `KV_WORM_SESSION`
2. Posts a headstone comment to the Reddit thread via `context.reddit.submitComment()`

**Headstone format:**
```
⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛
🪦
HERE LIES
u/Username's worm
Gen I · 1st life
🌱 6/26 — 6/26 🌱
Starved to death
"The gut ran dry."
☯ 14 karma earned in life
Ate 11,240 / 300,000 bites · 4% of a full life
⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛
```

Dates are real wall-clock: `bornTs` (when worm spawned) → `diedTs` (moment of death), formatted as `M/YY`.

---

## Loading Screen

`main.tsx` preview block (shown before webview mounts):
```tsx
<vstack width="100%" height="100%" alignment="center middle" backgroundColor="#3B1F0A">
  <image url="icon.png" imageWidth={512} imageHeight={512} resizeMode="fit"
         onPress={() => webView.mount()} />
</vstack>
```
Full-bleed soil-brown background. The 512px worm icon IS the button — tap anywhere to enter.

---

## Game Loop

`draw()` — 2,022 lines (monolith — S5 split was reverted, re-split is a known priority)
`updatePhysics()` — 815 lines (monolith)
`updatePlayer()` — 646 lines (monolith)

---

## Naming Conventions

- `camelCase` for all functions and variables
- `ALL_CAPS_SNAKE_CASE` for constants
- `p` prefix = player vars (`pHP`, `pGut`, `pSEG`, `pSR`, `pPath`, `pSegs`)
- `MSG_` prefix = all message type constants (main.tsx only — game.js uses raw strings, known debt)
- `KV_` / `RT_` prefix = KV key and Realtime channel helpers (main.tsx only)
- Segment boundary = `null` in `pPath`

**⚠️ _underscore functions still present** (17 functions — S4 rename was reverted):
`_cancelLP, _clickInBtn, _dBoot, _dropSegEnd, _dropSegStart, _findPendingWorm, _mkIrisGrad, _mkSnooGrad, _refreshBin, _registerPendingWorm, _smilePath, _snooEaseIn, _snooEaseOut, _svgX, _svgY, _toCanvas, _touchInBtn`

---

## Multiplayer

```js
var otherPlayers = [];
// Shape: {username, x, y, targetX, targetY, sleeping, size, segs, generation, hp, gut, avatarUrl, avatarImg, hist, lastSeen}
// Pruned after 90s without presence update
```

---

## Debug Keys (requires DEBUG_MODE = true via localStorage)

| Key | Action |
|-----|--------|
| `` ` `` | Open debug password prompt |
| T | Trigger drain cinematic (sets tLvl=0.8) |
| W | Trigger feed cinematic |
| G | Trigger emergency cinematic |
| K | Force natural death (pEaten = 300,000) |
| F | Force flood |
| D | Force clogged drain flood |
| A | Toggle acid at 0.8 |
| `]` / `[` | Increment / decrement generation |
| Shift+C | Wipe session and reload |
