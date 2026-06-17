# Wigglers Room — Game Architecture
> Last updated: 2026-06-17 end of day (Session 14)
> Repo: https://github.com/Cal-Starfur/Wigglers_Room | Branch: main

---

## Repo Structure

```
Wigglers_Room/
├── src/main.tsx              — Devvit host (KV, Realtime, auth, message routing) ~420 lines
├── webroot/
│   ├── game.js               — All game logic — vanilla JS + Canvas — ~8420 lines
│   ├── index.html            — Webview shell (minimal — just loads game.js + style.css)
│   └── style.css             — Reset + canvas positioning (minimal)
├── assets/
│   ├── icon.png              — 500x500 worm icon (preview card tap target)
│   └── preview-bg.png        — 512x512 trash wallpaper (all 27 items, rendered from game code)
├── .github/workflows/
│   └── deploy.yml            — tsc + devvit build check on every push — NO auto-upload
├── GAME_ARCHITECTURE.md      — This file
├── WIGGLERS_AUDIT_V20.md     — Bug log, lessons learned, priority queue
├── devvit.yaml               — App config (redis, realtime, redditAPI, kvStore)
└── README.md
```

### Deploy Workflow (CRITICAL — read every session)
```
1. Claude pushes to GitHub
2. git pull in Codespace        ← ALWAYS before upload
3. devvit upload --just-do-it
4. devvit install <subreddit>
5. Create new post to test      ← old posts go read-only after re-upload
```

**Never skip step 2.** Divergent branches = broken upload.
**Set once:** `git config pull.rebase true` — prevents MERGE_MSG dialog.

---

## Architecture: Two-Process Split

```
Reddit Host (main.tsx)                 Webview iframe (game.js)
──────────────────────────────         ────────────────────────────
Devvit KV Store (persistence)          Canvas 2D rendering
Realtime broadcast (multiplayer)       Physics / game loop (requestAnimationFrame)
Anti-cheat session clamping            Player input (touch/mouse/keyboard)
Reddit auth + avatar fetch             localStorage fallback (dev/standalone mode)
Death headstone comment posting        bornTs / diedTs tracking
Weather fetch (Open-Meteo API)         saveSession() → postToHost on state change
Post creation (mod-only)
        │         postMessage bridge          │
        └──────────────────────────────────--─┘
```

---

## Preview Card (Devvit Blocks)

Shown before user taps to enter. Lives entirely in `main.tsx` render function.

```tsx
<zstack width="100%" height="100%" alignment="center middle">
  <image url="preview-bg.png" imageWidth={512} imageHeight={512} resizeMode="cover" />
  <image url="icon.png" imageWidth={256} imageHeight={256} resizeMode="fit"
         onPress={() => webView.mount()} />
</zstack>
```

**Rules:**
- Devvit Blocks = declarative native UI. No HTML, CSS, canvas, z-index.
- `<zstack>` for layering. `<image onPress>` for tap targets.
- `webView.mount()` only inside `onPress` — never in render body (fires every render).
- Assets must be PNG. GIF and JPG rejected by Devvit uploader.
- Push binary assets via direct GitHub API with `base64.b64encode(bytes)` — sync script corrupts binaries.

---

## Message Constants (main.tsx)

**Host → Webview:** `MSG_SET_USERNAME`, `MSG_SET_SESSION`, `MSG_SET_WEATHER`, `MSG_SET_PLAYER_AVATAR`, `MSG_SET_WORLD_STATE`, `MSG_SET_PRESENCE`, `MSG_SET_FLOOD`, `MSG_WORM_CLAIMED`

**Webview → Host:** `MSG_READY`, `MSG_SAVE_SESSION`, `MSG_WORLD_UPDATE`, `MSG_PRESENCE_UPDATE`, `MSG_PLAYER_DIED`, `MSG_REQUEST_PRESENCE`, `MSG_CLAIM_WORM`, `MSG_JOIN_QUEUE`, `MSG_FLOOD_ACK`, `MSG_UNCLAIMED_WORM_DIED`

⚠️ **game.js uses raw strings** — `MSG_*` constants not yet applied (S2 work reverted). Re-applying is P2.

---

## KV Store Keys (main.tsx)

```
KV_WORM_SESSION(username)  — per-player session (position, HP, gut, karma, bornTs, weekStartTs...)
KV_WORLD(postId)           — shared bin state (tLvl, pooled, castingEnrichment, scrapsLevel)
KV_COCOONS(postId)         — all players' cocoons
KV_WEEK(postId)            — { weekStartTs, pot, contributors } ← DEFINED, NEVER READ (ISS-2)
KV_QUEUE(postId)           — pending worm queue
```

---

## Session Persistence

`saveSession()` dual-writes localStorage + `postToHost(MSG_SAVE_SESSION)` on every meaningful change.

Fields: `ts, bornTs, karma, pEaten, pSR, pSEG, generation, pHP, pGut, pX, pY, pSleeping, pSleepX, pSleepY, cocoons, lastCocoonLaid, weekStartTs, weeklyContrib, emergencyKarmaPot, emergencyRequested, tLvl, pooled, castingEnrichment, drops`

**`bornTs`** — real wall-clock ms when the current worm life began. Stamped on:
- `respawnPlayer()` — baby respawn or first ever spawn
- `loadSession()` fallback — if no saved session, defaults to `Date.now()`

---

## World Layout — The Bin

Y increases downward. `H` = canvas height / number of tiers.

```
y = 0   .. H     Tier 0 — Scraps & blanket   (food drops here)
y = H   .. 2H    Tier 1 — Active soil         (main worm zone)
y = 2H  .. 3H    Tier 2 — Castings/compost    (tunnel zone)
y = 3H           cSurf() — compost floor / sump top
y = 3H+          Sump    — worm tea reservoir (tLvl 0–1)
```

---

## Key Global State (game.js)

### World / Shared
```js
var tLvl = 0;              // 0–1 sump tea fill — shared all players
var pooled = 0;            // 0–1 compost moisture
var castingEnrichment = 0; // 0–1 compost richness
var scrapsLevel = 1.0;     // 0–1 trash density tier 0
var floodActive = false;   // server-authoritative flood event
```

### Player Worm
```js
var pHP = 1.0;             // health 0–1
var pGut = 0;              // gut fill 0..pGutMax
var pEaten = 0;            // lifetime bites (0–300,000 = full life)
var pSEG = 4;              // segment count 4–20
var karma = 0;
var generation = 0;        // increments on natural death
var bornTs = 0;            // ms when this worm life began
var deathCause = '';       // 'starvation'|'hunger'|'constipation'|'acidity'|'flood'|'drowning'|'natural'
var playerState = 'playing'; // 'playing'|'dead'|'queued'|'claiming'
```

---

## Death System

Game sends `MSG_PLAYER_DIED` with `{ cause, karma, generation, pEaten, username, bornTs, diedTs }`.

`main.tsx` handler:
1. Saves `pHP=0` + `deathCause` to `KV_WORM_SESSION`
2. Posts headstone comment to Reddit thread via `context.reddit.submitComment({ id: roomId, text })`

**Headstone format** (`M/YY` real dates from `bornTs`/`diedTs`):
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

---

## Drain System

### Weekly Drain (Snoo Cinematic)
Fires in `updatePhysics()` when `nowW - weekStartTs >= WEEK_DRAIN_MS`.

**Camera fix (S14):** Snapped instantly to `drainSnooStopY - H * 0.58` at trigger time in `triggerSnooDrain()`.
`STOP_Y = H * 0.58` hardcoded in screen space inside `updateSnooDrain()` — never re-derived from world coords.
This prevents push-down/push-up jitter from per-frame camera easing lag.

**⚠️ ISS-1:** `weekStartTs` is per-player session, not shared. `KV_WEEK` never read/sent. Weekly drain
only fires for players who've been logged in 7 real days — not a true shared world event. Fix is P1.

### Drain Cinematic Phases
`floatin → pause → openvalve → draining → closevalve → floatout`
Durations: `{floatin:55, pause:30, openvalve:35, draining:0, closevalve:30, floatout:60}` frames

---

## Game Loop Structure (current — monolith state post-revert)

| Function | Lines | Notes |
|----------|-------|-------|
| `draw()` | 2,022 | Monolith — S5 split reverted, P2 to re-split |
| `updatePhysics()` | 815 | Monolith — S5 split reverted |
| `updatePlayer()` | 646 | Monolith — S5 split reverted |
| `drawTrashChunk()` | 698 | 27 trash item renderers — used for wallpaper too |

---

## Naming Conventions

- `camelCase` — all functions and variables
- `ALL_CAPS` — constants
- `p` prefix — player vars (`pHP`, `pGut`, `pSEG`, `pEaten`, `pPath`, `pSegs`)
- `MSG_` / `KV_` / `RT_` — message/key/channel constants (main.tsx only)
- `null` in `pPath` — segment boundary marker

⚠️ 17 `_underscore` functions still present (S4 rename reverted — P2)

---

## Multiplayer

```js
var otherPlayers = []; 
// {username, x, y, targetX, targetY, sleeping, size, segs, generation,
//  hp, gut, avatarUrl, avatarImg, hist, lastSeen}
// Pruned after 90s without presence update
```

---

## Debug Keys (requires `DEBUG_MODE = true` via localStorage `'wigglers_debug' = '1'`)

| Key | Action |
|-----|--------|
| `` ` `` | Open debug password prompt (`wigglers2025`) |
| T | Trigger drain cinematic |
| W | Trigger feed cinematic |
| G | Trigger emergency cinematic |
| K | Force natural death |
| F | Force flood |
| D | Force clogged drain flood |
| A | Toggle acid at 0.8 |
| `]` / `[` | Increment / decrement generation |
| Shift+C | Wipe session and reload |

---

## Asset Generation

`preview-bg.png` was generated by:
1. Extracting `drawTrashChunk()` verbatim from `game.js`
2. Writing an HTML page that places all 27 items in a deterministic grid-with-jitter layout
3. Rendering via Playwright + Chromium headless (`playwright.sync_api`)
4. Capturing canvas as `toDataURL('image/png')`
5. Pushing raw bytes via GitHub API `PUT /contents` with `base64.b64encode(bytes)`

Regenerate whenever trash item visuals change in game.
