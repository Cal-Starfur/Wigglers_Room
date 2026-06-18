# Wigglers Room — Game Architecture
> Last updated: 2026-06-18 Session 17 (canvas resize + desktop/fullscreen layout fixed)
> Repo: https://github.com/Cal-Starfur/Wigglers_Room | Branch: main

---

## Repo Structure

```
Wigglers_Room/
├── src/main.tsx              — Devvit host (KV, Realtime, auth, message routing) ~500 lines
├── webroot/
│   ├── game.js               — All game logic — vanilla JS + Canvas — ~8644 lines
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
Post creation (mod-only)               Simulated weather system
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

**Host → Webview:** `MSG_SET_USERNAME`, `MSG_SET_SESSION`, `MSG_SET_PLAYER_AVATAR`, `MSG_SET_WORLD_STATE`, `MSG_SET_PRESENCE`, `MSG_SET_FLOOD`, `MSG_WORM_CLAIMED`

**Webview → Host:** `MSG_READY`, `MSG_SAVE_SESSION`, `MSG_WORLD_UPDATE`, `MSG_PRESENCE_UPDATE`, `MSG_PLAYER_DIED`, `MSG_REQUEST_PRESENCE`, `MSG_CLAIM_WORM`, `MSG_JOIN_QUEUE`, `MSG_FLOOD_ACK`, `MSG_UNCLAIMED_WORM_DIED`

`MSG_SET_WEATHER` removed — weather is fully simulated in game.js, no external data needed.

⚠️ **game.js uses raw strings** — `MSG_*` constants not yet applied (S2 work reverted). Re-applying is P2.

---

## KV Store Keys (main.tsx)

```
KV_WORM_SESSION(username)  — per-player session (position, HP, gut, karma, bornTs, weekStartTs...)
KV_WORLD(postId)           — shared bin state (tLvl, pooled, castingEnrichment, scrapsLevel)
KV_COCOONS(postId)         — all players' cocoons
KV_WEEK(postId)            — { weekStartTs, pot, contributors } ← P1 persistence target (see below)
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

## Bin Persistence — Weekly Drain (P1 Target — Session 16)

The bin's weekly drain cycle must persist independently of any player being logged in.
Current state: `weekStartTs` lives in per-player `KV_WORM_SESSION` — each player runs their own 7-day clock.
Target state: `KV_WEEK` is the single source of truth for the bin's week epoch. All players share it.

### Four-move implementation plan

**Move 1 — Read `KV_WEEK` on open, send `weekStartTs` to game** *(main.tsx, ~15 lines)* ✅ SHIPPED S16
**Move 2 — game.js receives `weekStartTs` from `setWorldState`** *(game.js, 1 line)* ✅ SHIPPED S16
**Move 3 — Persist new `weekStartTs` when drain fires** *(main.tsx, ~8 lines)* — blocked on ISS-12
**Move 4 — Broadcast new `weekStartTs` via Realtime on drain** *(main.tsx, ~2 lines)* — blocked on ISS-12

### Data flow after all four moves
```
Player opens post
  → main.tsx reads KV_WEEK → gets shared weekStartTs
  → sends setWorldState { ..., weekStartTs }
  → game.js sets weekStartTs = server value

7 real days pass (bin clock ticks while any player is open)
  → updatePhysics() fires triggerSnooDrain()
  → game.js sends worldUpdate { weeklyDrain: true, tLvl: 0, ... }
  → main.tsx writes new KV_WEEK { weekStartTs: now }
  → main.tsx broadcasts RT_WORLD { weekStartTs: now } to all viewers
  → all open clients reset their local weekStartTs

Next player opens (days later)
  → reads KV_WEEK → correct epoch → correct drain timing
```

---

Y increases downward. `H` = canvas height. `WORLD_W = 1194` = fixed world width (iPad Pro 11" landscape).

```
y = 0   .. H     Tier 0 — Scraps & blanket   (food drops here)
y = H   .. 2H    Tier 1 — Active soil         (main worm zone)
y = 2H  .. 3H    Tier 2 — Castings/compost    (tunnel zone)
y = 3H           cSurf() — compost floor / sump top
y = 3H+          Sump    — worm tea reservoir (tLvl 0–1)
```

**Bin width:** `getBin()` always uses `WORLD_W * 0.88 ≈ 1051px` regardless of viewport.
**Camera:** `camY` scrolls vertically, `camX` scrolls horizontally on narrow viewports only.

---

## Coordinate System

```
World coords:  (x, y) — absolute position in the game world
Screen coords: (x - camX + centreOffsetX, y - camY) — what appears on canvas
```

**`centreOffsetX`** — global, computed each frame in `draw()`:
```js
centreOffsetX = W > WORLD_W ? Math.floor((W - WORLD_W) / 2) : 0;
```
On mobile/narrow: `0` (no effect). On desktop where `W > WORLD_W`: shifts world right so bin is centred.

**`ctx.translate(centreOffsetX - camX, 0)`** at start of draw() — combines centring + camera scroll.

**`camX`** is always `>= 0`. On wide screens it is locked to `0` (no scroll needed — bin fits).

**`_toCanvas(clientX, clientY)`** converts pointer events to screen coords (subtracts root offset).
**All mX/mY assignments** use `screenX - centreOffsetX + camX` to convert screen → world X.
**`ctx.restore()`** before HUD elements — karma, weather, death screen are screen-space.

---

## Canvas / Viewport Architecture

```
WORLD_W = 1194px  — fixed logical world width (iPad Pro 11" landscape)
W = viewport width — varies per device; updated every resize
H = viewport height — fills screen vertically; updated every resize

On desktop (W > WORLD_W):  centreOffsetX = (W-WORLD_W)/2, camX = 0 (no scroll)
On iPad Pro 11" landscape: W ≈ WORLD_W, centreOffsetX ≈ 0
On mobile (390px wide):    centreOffsetX = 0, camX range ≈ 700px (worm scrolls bin)
```

**resizeCanvas():** Always updates W/H and canvas.width/height on every call. No one-time guard.
**getBin():** Uses `WORLD_W` not `W` — bin is always 1194px wide.
**camX clamp (narrow screens only):** `binLeft - 20` to `binRight - W + 20`

### Background Drawing Rules (CRITICAL)
All sky/ground/detail elements belong to the **world** and use `WORLD_W`, not `W`:
- Sky `fillRect`: `fillRect(-centreOffsetX, 0, WORLD_W, H)`
- Ground `fillRect`: `fillRect(-centreOffsetX, gTop, WORLD_W, gH)`
- Sun/moon clip rect: `ctx.rect(0, 0, WORLD_W, skyHeight)`
- Stars: `_starPos[si][0] * WORLD_W`
- Sun X: `WORLD_W * (0.15 + sunT * 0.70)`
- Moon X: `WORLD_W * (0.12 + moonT * 0.76)`
- Grass tufts: `gt.xf * WORLD_W`
- Blade fringe: `bladeCount = WORLD_W / 4`, `gbx = gi * 4 + (gi % 3)`
- Flowers: `fd.xf * WORLD_W`

**Rule of thumb:** If it's part of the sky, ground, or garden — use `WORLD_W`. Only HUD elements and canvas-clearing operations use `W`.

---

## Avatar System

**Player Snoovatar:** Fetched via `user.getSnoovatarUrl()` in main.tsx MSG_READY handler.
Sent as `MSG_SET_PLAYER_AVATAR`. In game.js: pre-rendered to offscreen canvas at 44px height
on load (eliminates per-frame scaling flicker). Drawn full-body upright above worm head.

**Avatar toggle:** 3-finger tap cycles `avatarMode` 0→1→2→0 (no flash label):
- `0` = Snoovatar (or drawn Snoo if no avatar loaded)
- `1` = Username text (`u/username`)
- `2` = Hidden / immersive

**Other players:** Avatar URLs broadcast via Realtime presence. Drawn at worm head (simple Image load, no offscreen pre-render).

---

## Weather System (Fully Simulated — No External API)

Weather integration via Open-Meteo was abandoned — Devvit sandbox blocks external HTTP.
Weather is now a self-contained simulation in game.js. No main.tsx involvement.

```js
var WEATHER_SEASONS = [ /* 12 monthly baselines */ ];
var weather = { humidity, temp, precip }; // 0–1 internal values
var _weatherTarget = { ... };   // drift target
var _weatherEvent  = null;      // active event (rain/dry/heat) or null
```

**Update cycle:**
- `tickWeather()` — every frame, lerps weather toward target (rate 0.0008)
- `updateWeatherSim()` — every 600 frames (~10s), reads real calendar month for seasonal baseline, rolls for weather events

**Weather events** (checked every 10s when no event active):
- Rainstorm (18% chance): high precip + humidity, lasts 20–60 game-minutes
- Dry spell (12%): low precip + lower humidity, lasts 1–2 hours
- Heat wave (8%): high temp, lasts 2–4 hours

**HUD:** Upper right corner — date (`M/D/YYYY`), temp (`72°F`), humidity (`RH 68%`), rain indicator (`☂` when precip > 0.10).

**Gameplay effects:** humidity + temp drive `getEvapRate()` (affects bin moisture/flooding). precip spawns rain drops into bin top.

**`weatherTempF()`:** Converts internal 0–1 temp to Fahrenheit: `20 + temp * 90`.

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

### Camera / Viewport
```js
var camY = 0;              // vertical scroll — follows worm Y
var camX = 0;              // horizontal scroll — always >= 0. 0 on wide screens.
var centreOffsetX = 0;     // pixels to shift world right so bin is centred on wide screens
var WORLD_W = 1194;        // fixed world width — never changes
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

**S16 status:** Moves 1+2 shipped — all players now share `weekStartTs` from `KV_WEEK`. Moves 3+4 (persist+broadcast on drain) blocked on ISS-12.

**⚠️ ISS-12 — Drain Snoo positioning (unresolved S16)**
Drain Snoo does not land correctly at the tap. Multiple approaches failed — see Session 16 in audit.

Key facts for next session:
- Feed Snoo works: `snooSY = lidSY3 - bodyH - legH - bootH*0.5` where `lidSY3 = H*0.5 - camY`, recalculated every frame. Camera eases to `targetCam = H*0.5 - H*0.65`.
- Drain tap: `TAP_SY = bsy + 8` where `bsy = 3*H + H*0.25 - camY` — same in `drawSnooDrain` and `drawSump`.
- Snoo body: `SC=H*0.16`, `bodyH=SC*0.270`, `legH=SC*0.225`, `bootH=SC*0.058`, `armLen=SC*0.165`
- Right hand from torso `sy`: `sy + bodyH*0.10 + armLen*0.50 + armLen*0.42`
- `drainSnooStopX = b.cx - SC*0.127` (stable — bin never scrolls horizontally)
- **Next session fix:** Measure exact offset from torso anchor `sy` to tap in `drawSnooDrain`. Set `STOP_Y = TAP_SY - measured_offset`. Snap camY at trigger so slide-in is stable. No two-step world-Y math.

### Drain Cinematic Phases
`floatin → pause → openvalve → draining → closevalve → floatout`
Durations: `{floatin:55, pause:30, openvalve:35, draining:0, closevalve:30, floatout:60}` frames

---

## Game Loop Structure (current — monolith state post-revert)

| Function | Lines | Notes |
|----------|-------|-------|
| `draw()` | ~2,022 | Monolith — S5 split reverted, P2 to re-split |
| `updatePhysics()` | ~815 | Monolith — S5 split reverted |
| `updatePlayer()` | ~646 | Monolith — S5 split reverted |
| `drawTrashChunk()` | ~698 | 27 trash item renderers — used for wallpaper too |
| `updateWeatherSim()` | ~60 | Simulated weather events — runs every 600 frames |
| `drawWeatherHUD()` | ~30 | Upper right — date, °F, RH%, rain indicator |

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

---

## Message Bridge (game.js ↔ main.tsx) — CRITICAL

### Host → Webview (main.tsx → game.js)
`webView.postMessage(obj)` in main.tsx arrives in game.js wrapped in a Devvit envelope:
```js
{
  type: 'devvit-message',
  data: {
    message: { type: 'setUsername', username: 'u/...' }  // or JSON string
  }
}
```
game.js must unwrap before reading `.type`.

### Webview → Host (game.js → main.tsx)
`window.parent.postMessage(msg, '*')` in game.js arrives at main.tsx wrapped.
main.tsx already unwraps this correctly in the `onMessage` handler.

### Origin of host messages
NOT `https://www.reddit.com`. Strict origin check removed from game.js.

---

## Realtime Multiplayer Architecture

```
Player A presses right
  → game.js sends presenceUpdate via postToHost()
  → main.tsx MSG_PRESENCE_UPDATE handler fires
  → realtime.send(RT_PRESENCE(roomId), { type: 'setPresence', players: [{...}] })
  → Devvit Realtime broadcasts to all subscribers on that channel
  → Player B's main.tsx presenceChannel.onMessage fires
  → webView.postMessage({ type: 'setPresence', players: [{...}] })
  → Player B's game.js receives setPresence, updates otherPlayers[]
  → Player B sees Player A's worm move
```

### Channel Names (must be `[a-zA-Z0-9_]` only — NO colons)
```ts
const safeId   = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_');
const RT_WORLD    = (postId: string) => `world_${safeId(postId)}`;
const RT_PRESENCE = (postId: string) => `presence_${safeId(postId)}`;
const RT_FLOOD    = (postId: string) => `flood_${safeId(postId)}`;
```

### useChannel Pattern (main.tsx)
```ts
const presenceChannel = useChannel({
  name: RT_PRESENCE(roomId),
  onMessage: (msg: any) => {
    try { webView.postMessage(msg); } catch (_) {}
  },
});
presenceChannel.subscribe();
```
Declared **after** `useWebView` so `webView` is in scope.
