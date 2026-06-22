

# Wigglers Room — Game Architecture
> Last updated: 2026-06-22 Session 25 | Devvit 0.0.201 | Next P1: FEAT-2 — device conflict overlay (debug build live, deploy July 1)
> Repo: https://github.com/Cal-Starfur/Wigglers_Room | Branch: main

---

## Repo Structure

```
Wigglers_Room/
├── src/main.tsx              — Devvit host (KV, Realtime, auth, message routing) ~1039 lines
├── webroot/
│   ├── game.js               — All game logic — vanilla JS + Canvas — ~8894 lines
│   ├── index.html            — Webview shell (minimal — just loads game.js + style.css)
│   └── style.css             — Reset + canvas positioning (minimal)
├── assets/
│   ├── icon.png              — 500x500 worm icon (preview card tap target)
│   └── preview-bg.png        — 512x512 trash wallpaper reference (position guide for animated preview)
├── .github/workflows/
│   ├── deploy.yml            — CI pipeline (4 jobs): typecheck → lint → test → build
│   └── notify-calendar.yml   — triggers calendar sync in claude-skills on push to main
├── GAME_ARCHITECTURE.md      — This file
├── WIGGLERS_AUDIT.md     — Bug log, lessons learned, priority queue
├── devvit.yaml               — App config (redis, realtime, redditAPI, kvStore)
└── README.md
```

## CI Pipeline (Layer 1 — added 2026-06-20)

Every push to `main` runs 4 parallel jobs via `.github/workflows/deploy.yml`:

| Job | Command | Blocks build? |
|---|---|---|
| Typecheck | `tsc --noEmit` | ✓ yes |
| Lint | `eslint src --ext .ts,.tsx` | ✓ yes |
| Tests | `vitest run` | ✓ yes |
| Build | `tsc --noEmit && devvit build` | — (runs last) |

**Rules:**
- Build only runs if Typecheck + Lint + Tests all pass
- Lint is strict: `@typescript-eslint/recommended-requiring-type-checking`
- Tests use `passWithNoTests: true` — add `.test.ts` files to `src/` to activate
- Unused vars must be prefixed `_` or removed — no silent dead code
- Empty catch blocks must have a comment — no silent swallows
- `!=` is banned — use `!==` always

**Files added this session:**
- `.eslintrc.json` — strict TypeScript ESLint config
- `vitest.config.ts` — test runner config
- `.github/workflows/notify-calendar.yml` — calendar sync trigger




## GitHub Improvement Roadmap

| Layer | Description | Status |
|---|---|---|
| 1 | CI quality gates (typecheck + lint + test + build) | ✅ Done — 2026-06-20 |
| 2 | Branch protection on main | ❌ Not needed — GitHub commit history + API rollback covers this |
| 2b | Auto CHANGELOG workflow | ❌ Not needed — redundant with native GitHub commit log (queryable via API) |
| 3 | Auto-versioning on merge | ❌ Not needed — Devvit auto-bumps version; audit log tracks sessions |
| 4 | Auto-create issues on build failure | ❌ Not needed — CI failures caught and fixed same session |
| 5 | Scheduled calendar sync every Monday 7am Pacific | ✅ Done — 2026-06-21 |
| 6 | Cross-repo status dashboard | ✅ Done — built into calendar header 2026-06-21 |

**Roadmap complete — 2026-06-21.**

**Rollback approach:** Use GitHub commit API to query history by date/message, identify target SHA, revert via API or direct push. No branch protection needed — Claude can pinpoint and restore any commit on demand.


---

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

## Preview Card (Devvit Blocks — Animated)

Shown before user taps to enter. Lives entirely in `main.tsx` render function.
**Animated SVG** — 33 trash items falling on loop via `useInterval` at 100ms. NOT a static image.

```tsx
const [bgUrl, setBgUrl] = useState<string>(() => buildBgDataUrl(0));
const anim = useInterval(() => {
  setTick((t: number) => { const next = t + 1; setBgUrl(buildBgDataUrl(next)); return next; });
}, 100);
anim.start();
return (
  <zstack width="100%" height="100%" alignment="center middle" onPress={() => webView.mount()}>
    <image url={bgUrl} imageWidth={512} imageHeight={512} resizeMode="cover" />
    <image url="icon.png" imageWidth={256} imageHeight={256} resizeMode="fit" />
  </zstack>
);
```

- `buildBgDataUrl(tick)` generates `data:image/svg+xml` per tick — dark bg + 33 falling SVG trash items + amber glow baked in
- `FALL_SPEED = 2` px/tick, `TILE_H = 512`, 100ms interval = 20px/s. Three copies per item prevent bottom clip.
- Glow baked into bg SVG — only ONE animated `<image>` element, halves re-renders vs two intervals
- `webView.mount()` on `<zstack onPress>` — never in render body (fires every render = crash)
- Assets must be PNG. GIF/JPG rejected by Devvit uploader.
- Push binary assets via direct GitHub API — sync script corrupts binaries.
- `preview-bg.png` is a position reference only — NOT the live preview source

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
KV_WORLD(postId)           — shared bin state (tLvl, castingEnrichment, scrapsLevel)
                             ✅ ISS-18 Phase 1+2 S25 — authoritative, not stomped by session restore
                             ⚠️ pooled REMOVED S20 — runtime-only, not synced
KV_COCOONS(postId)         — all players' cocoons
KV_WEEK(postId)            — { weekStartTs, pot, contributors } ← P1 persistence target (see below)
KV_QUEUE(postId)           — pending worm queue
```

---

## Session Persistence

`saveSession()` dual-writes localStorage + `postToHost(MSG_SAVE_SESSION)` on every meaningful change.

Fields: `ts, bornTs, karma, pEaten, pSR, pSEG, generation, pHP, pGut, pAcid, pX, pY, pSleeping, pSleepX, pSleepY, cocoons, lastCocoonLaid, weekStartTs, weeklyContrib, emergencyKarmaPot, emergencyRequested, tLvl, castingEnrichment, drops`
⚠️ `pooled` removed from session S20 — runtime-only. `pAcid` added S20 (ISS-14 fix).
Save-on-exit added S20: `visibilitychange` listener calls `saveSession()` on hide.

**`bornTs`** — real wall-clock ms when the current worm life began. Stamped on:
- `respawnPlayer()` — baby respawn or first ever spawn
- `loadSession()` fallback — if no saved session, defaults to `Date.now()`

---

## Bin Persistence — Weekly Drain

The bin's weekly drain cycle persists independently of any player being logged in.
`KV_WEEK` is the single source of truth for the bin's week epoch. All players share it.

### Four-move implementation plan

**Move 1 — Read `KV_WEEK` on open, send `weekStartTs` to game** *(main.tsx, ~15 lines)* ✅ SHIPPED S16
**Move 2 — game.js receives `weekStartTs` from `setWorldState`** *(game.js, 1 line)* ✅ SHIPPED S16
**Move 3 — Persist new `weekStartTs` when drain fires** *(main.tsx, ~8 lines)* ✅ SHIPPED S19
**Move 4 — Broadcast new `weekStartTs` via Realtime on drain** *(main.tsx, ~2 lines)* ✅ SHIPPED S19

### Data flow (all four moves)
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

## Drain System

### Weekly Drain (Snoo Cinematic) ✅ FULLY WORKING as of S18

Fires in `updatePhysics()` when `nowW - weekStartTs >= WEEK_DRAIN_MS`.

### Cinematic Phases
`floatin → pause → openvalve → draining → closevalve → floatout`
Durations: `{floatin:55, pause:30, openvalve:35, draining:0, closevalve:30, floatout:60}` frames

### Drain Snoo Positioning (ISS-12 — CLOSED S18)

**The fix:** `drawSnooDrain()` is called **inside** `ctx.translate(centreOffsetX - camX, 0)`, the same world transform that draws the valve. World-space coords (`b.cx`, `bsy`) work natively — no screen-space conversion needed.

**Why feed Snoo always nailed it:** `drawFarmerSnoo()` was always inside the world transform. Drain Snoo was mistakenly called after `ctx.restore()` (in screen space), causing X misalignment of up to 400px on mobile where `camX > 0`.

**Key geometry (H=800):**
```
camY snap at trigger  = round(3*H + H*0.25 - H*0.45)  → sump floor at 45% down screen
TAP_SY (pipe top)     = bsy + 8   ≈ 46% down
Spout tip             = TAP_SY + 22  ≈ 49% down
STOP_Y (torso top)    = TAP_SY + 137 - SC*0.1788  ≈ 60% down
Snoo head top         ≈ 52% down screen
Snoo boots bottom     ≈ 68% down screen
drainSnooStopX        = b.cx - SC*0.127  (world X — works inside world transform)
```

**Critical rule for all Snoo cinematics:**
> Always call `drawSnoo*` functions **inside** `ctx.translate(centreOffsetX - camX, 0)`. Never after `ctx.restore()`. World coords work natively; screen-space conversion is wrong and breaks on mobile.

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
**camX lerp rate:** `0.04` — matches camY exactly. No deadzone. Updated S21 (was `0.06`, no deadzone — felt jittery vs vertical follow).

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
- Dry spell (12%): lower humidity, lasts 1–2 hours
- Heat wave (8%): high temp, lasts 2–4 hours
⚠️ Rainstorm event removed S20 — precip stripped from all weather code

**HUD:** Upper right corner — date (`M/D/YYYY`), temp (`72°F`), humidity (`RH 68%`), rain indicator (`☂` when precip > 0.10).

**Gameplay effects:** humidity + temp affect worm comfort. Rain was removed S20 — `getEvapRate()` deleted, `precip` stripped from events and HUD. Saturation (`pooled`) is now driven only by food drops.

**`weatherTempF()`:** Converts internal 0–1 temp to Fahrenheit: `20 + temp * 90`.

---

## Key Global State (game.js)

### World / Shared
```js
var tLvl = 0;              // 0–1 sump tea fill — shared all players via KV
var pooled = 0;            // 0–1 compost moisture — RUNTIME ONLY (not saved, not synced — S20)
var castingEnrichment = 0; // 0–1 compost richness — synced via KV
var scrapsLevel = 1.0;     // 0–1 trash density tier 0
var floodActive = false;   // server-authoritative flood event
var weekStartTs = 0;       // server epoch for weekly drain — synced via KV_WEEK on open
```

### Player Worm
```js
var pHP = 1.0;             // health 0–1 — now saved/restored (ISS-14 fixed S20)
var pGut = 0;              // gut fill 0..pGutMax
var pAcid = 0;             // 0–1 acid buildup — now saved/restored (ISS-14 fixed S20)
var pEaten = 0;            // lifetime bites (0–300,000 = full life)
var pSR = 4;               // worm radius — LOCKED at 4
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


---

## Priority Queue — Next Session

### 🔴 P1 — START HERE: FEAT-2 — Device conflict overlay not triggering

Two devices with the same username both reach the playing state independently, diverging karma and world state. The conflict overlay code exists and renders — but `setDeviceConflict` is not reliably reaching game.js, or the `useState` guard is still not holding.

**Blocked on Codespaces** (resets 2026-07-01). Debug build is live at Devvit 0.0.201.

**Session 26 plan:**
1. Open game on desktop browser → backtick → `wigglers2025` → read `conflict=` field in debug overlay
2. Open same post on mobile — read `conflict=` on both screens
3. That single field tells us if `setDeviceConflict` is being sent at all
4. Fix the failing layer, remove debug overlay, redeploy

See `WIGGLERS_AUDIT.md → Session 25` for full investigation log.

### ✅ ISS-18 — KV_WORLD authoritative — SHIPPED S24/S25

Bin state (`tLvl`, `castingEnrichment`, `scrapsLevel`) separated from worm session. No longer stomped by per-user session restore. Message ordering fixed (world state arrives before session triggers setup). Self-ghost worm fixed. Commits: `c83c6ea`, `78b3c58`, `21bf577`, `39b54a5`, `3db1a2d`

### ✅ PERF-1–4 — All shipped S21/S22

PERF-1 (trash chunk pre-render), PERF-2 (pPath Y-bucket), PERF-3 (blade fringe), PERF-4 (debris cap). See closed issues table below.

### P2 — After FEAT-2 resolves

| Task | What |
|------|------|
| ISS-15 | Tea/pPath direction bug — arch analysis required before any fix attempt |
| FEAT-4 | Long-press drain/tunnel placement + sleep scoping + drain unification |
| S2a | 18 raw message strings → `MSG_*` constants |
| S2b | 5 duplicate Snoo SVG helper pairs → shared functions |
| S3  | Delete 4 dead functions |
| S4  | Rename 17 `_underscore` functions → camelCase |
| S5  | Split `draw()`, `updatePhysics()`, `updatePlayer()` monoliths |

### P3 — Pre-Launch
- Remove `drawDebugOverlay()` call and function (added S25, DEBUG_MODE only but should be cleaned)
- Hash `DEBUG_PASSWORD` (currently plaintext `'wigglers2025'`)

### Future
- FEAT-1: Cross-player tunnel clogging
- FEAT-3: Passive bridge version capture
- ISS-11: Drain fires without a player open

---

## Known Issues (Open)

| ID | Issue | Priority |
|----|-------|----------|
| PERF-1 | Trash chunks: offscreen pre-render | ✅ SHIPPED S21 (67fff0c) |
| PERF-2 | pPath nested scans: Y-bucket index | ✅ SHIPPED S22 (8ce6daf) |
| PERF-3 | Blade fringe: 1,788 canvas calls/frame | ✅ SHIPPED S22 (25093f9) |
| PERF-4 | Debris cap + rotate skip | ✅ SHIPPED S22 (5af0fa6) |
| ISS-13 Bug A | Verify tunnel drain decrements pooled at _teaHit | ✅ CLOSED S22 |
| ISS-15 | Tea exits tube through compost — needs arch analysis | P2 |
| ISS-3 | 17 `_underscore` function names (S4 reverted) | P2 |
| ISS-4 | `draw()` 2,022 line monolith (S5 reverted) | P2 |
| ISS-5 | 5 duplicate Snoo SVG helper pairs | P2 |
| ISS-6 | 18 raw message strings in game.js (S2 reverted) | P2 |
| ISS-7 | 4 dead functions in codebase | P2 |
| ISS-8 | `DEBUG_PASSWORD` plaintext `'wigglers2025'` | P3 |
| FEAT-4 | Long-press drain/tunnel placement + sleep scoping + drain unification | P2 |
| ISS-9 | `bornTs` not stamped on cocoon hatch respawn | Low |
| ISS-10 | `weeklyContrib` client-authoritative | P3 |
| ISS-11 | Drain only fires while a player is open | Future |

