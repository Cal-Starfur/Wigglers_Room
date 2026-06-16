# GAME_ARCHITECTURE.md
*Source of truth. Updated every session. Never delete entries — only add or mark deprecated.*
*Generated: 2026-06-16 | Auto-scanned by Lead Dev skill*

---

## Identity
- **Game:** Wigglers Room
- **Platform:** Devvit / Vanilla Canvas
- **Game Type:** Worm bin composting simulation
- **Current Version:** V20
- **Last Updated:** 2026-06-16
- **Source Files:** `webroot/game.js` (8,492 lines) | `src/main.tsx` (416 lines)

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
├── GAME_ARCHITECTURE.md      — This file. Living systems map + session log
├── WIGGLERS_AUDIT_V20.md     — Bug tracker + feature backlog + Cal's decisions
├── devvit.yaml
└── README.md
```

### Deploy Workflow (CRITICAL)
- CI only runs `tsc + devvit build` — does NOT run `devvit upload`
- Upload is always manual: `git pull` in Codespace first, then `devvit upload`
- After any Claude session that pushes via API: always `git pull` before `devvit upload` (Session 6 fix)

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

## Message Constants — ALL named, no raw strings

**Host → Webview:** `MSG_SET_USERNAME`, `MSG_SET_SESSION`, `MSG_SET_WEATHER`, `MSG_SET_PLAYER_AVATAR`, `MSG_SET_WORLD_STATE`, `MSG_SET_PRESENCE`, `MSG_SET_FLOOD`, `MSG_WORM_CLAIMED`

**Webview → Host:** `MSG_READY`, `MSG_SAVE_SESSION`, `MSG_WORLD_UPDATE`, `MSG_PRESENCE_UPDATE`, `MSG_PLAYER_DIED`, `MSG_REQUEST_PRESENCE`, `MSG_CLAIM_WORM`, `MSG_JOIN_QUEUE`, `MSG_FLOOD_ACK`, `MSG_UNCLAIMED_WORM_DIED`

---

## KV Store Keys
```
worm:{username}     — per-player session (position, HP, gut, cocoons, score, karma)
world:{postId}      — shared bin state (tLvl, pooled, castingEnrichment, scrapsLevel)
cocoons:{postId}    — all players' cocoons in this bin
week:{postId}       — { weekStartTs, pot, contributors }
queue:{postId}      — pending worm queue
```

---

## World Layout — The Bin

Y increases downward. `H` = tier height in pixels.

```
y = 0   ..  H     Tier 0 — Scraps & blanket  (food, no tunnels)
y = H   ..  2H    Tier 1 — Active soil        (main worm zone)
y = 2H  ..  3H    Tier 2 — Castings/compost   (tunnels live here)
y = 3H            cSurf() — compost floor / sump top
y = 3H+ ..        Sump   — worm tea reservoir (tLvl drives fill height)
```

---

## Key Global State

### World / Shared (synced via KV + Realtime)
```js
var tLvl = 0;              // 0–1 sump tea fill — shared all players
var pooled = 0;            // 0–1 compost moisture saturation
var castingEnrichment = 0; // 0–1 compost richness — built by pooping
var scrapsLevel = 1.0;     // 0–1 trash density in tier 0
var floodActive = false;   // flood event — server-authoritative
```

### Player Worm
```js
var pHP = 1.0;             // health 0–1
var pGut = 0;              // current gut fill 0..pGutMax
var pGutMax = 8;
var pSR = 4;               // worm radius
var pSEG = 4;              // segment count 4–20 max
var karma = 0;
var generation = 0;        // increments on natural death
var pSegs = [];            // [{x,y}] body — head = index 0
var pAcid = 0;             // 0–1 acid buildup
var pSleeping = false;
var playerState = 'playing'; // 'playing'|'dead'|'queued'|'claiming'
```

### Multiplayer
```js
var otherPlayers = [];
// {username, x, y, sleeping, size, segs, generation, hp, gut, avatarUrl, hist, lastSeen}
// Pruned after 90s. Rendered via drawWorm() — real worms, alpha 1.0
```

---

## Naming Conventions (ENFORCED)

- `camelCase` — all functions and variables
- `ALL_CAPS_SNAKE_CASE` — constants
- `p` prefix — player vars (`pHP`, `pGut`, `pSEG`, `pSR`, `pPath`, `pSegs`)
- `MSG_` prefix — all message type constants (both files)
- `KV_` / `RT_` — KV key and Realtime channel helpers (main.tsx only)
- No `_underscore` prefix — 11 functions renamed Session 4
- Segment boundary = `null` in `pPath`

---

## Game Loop — Post Session 5 Refactor

```js
draw()              → drawSky, drawBinBg, drawTunnels, drawScraps,
                       drawSump, drawBinLid, drawWorms, drawHUD
updatePhysics()     → updateTunnelDecay, updateDebris, updateDrops, updateFlood
updatePlayer()      → updatePlayerDeath, updatePlayerSleep, updatePlayerVitals,
                       updatePlayerEating, updatePlayerMovement, updatePlayerDrains
```

---

## Drain System

### Down Drain
1. Worm digs tier 2 → sump (y=3H), holds still `JUNCTION_HOLD_FRAMES = 90`
2. Stamps `{sumpExit:true}` at y=3H, pushes `null` (seals segment)

### Up Drain
1. Requires `_sumpHadDown === true`. Returns to sump, holds still.
2. Stamps `{sumpExit:true}` at y=3H. Digs upward → `head.y <= 2*H` fires +100 karma.

### ⚠️ NAMING GOTCHA
`sumpExit: true` marks y=3H for BOTH drain types.
Down: `!nextAfterExit` → tea flows to sump. Up: `nextAfterExit` → sets `d.upDrain = true`.
Always check `nextAfterExit` to tell them apart.

---

## Safe Editing Protocol

1. Fetch fresh from GitHub via github-sync — never edit from stale uploads
2. Copy to `/home/claude/` before modifying (uploads dir is read-only)
3. Use `str_replace` with unique surrounding context — never line numbers
4. After edits, grep for changed function name to verify no duplicates
5. All session writes through `saveSession()` only
6. New message types: add `MSG_*` constant to BOTH `game.js` AND `main.tsx`
7. After pushing: user must `git pull` in Codespace before `devvit upload`

---

## Changelog

### V20 Session 1 — 2026-06-15
- First GitHub pull + full automated audit. 228 issues found.

### V20 Session 2 — 2026-06-15
- Fix 1: Extracted 5 duplicate Snoo helpers to module-level shared functions.
- Fix 2: Routed 6 rogue `localStorage.setItem` calls through `saveSession()`.
- Fix 3: Added 24 `MSG_*` constants. All raw strings replaced.
- Lines: 8401 → 8432

### V20 Session 3 — 2026-06-15
- Fix 5: `var starvingHUD` rename — eliminates shadow.
- Fix 6: Deleted `_refreshBin`, `drawGenDebugPanel`, `blendEnrichCol`.
- Lines: 8432 → 8371. Commit: `77c4fef`

### V20 Session 4 — 2026-06-16
- Fix 8: 11 `_underscore` → camelCase renames.
- `otherPlayers` overhaul: real `pSegs`, gen color, HP. Alpha 0.55 → 1.0.
- Commits: `43fd1a2` (game.js), `37df5a4` (main.tsx). Lines: 8371 → 8398

### V20 Session 5 — 2026-06-16
- Fix 9: Split `draw()` (8 subfuncs), `updatePhysics()` (4 subfuncs), `updatePlayer()` (6 subfuncs).
- Commit: `69496a9`. Lines: 8398 → 8492

### V20 Session 6 — 2026-06-16
- Fixed `devvit upload` README.md warning. Rule: always `git pull` in Codespace after Claude API pushes.

### V20 Session 7 — 2026-06-16
- Full game.js re-read (SHA `8d4064c`). Lead-dev audit run: 230 issues.
- Bug found: Duplicate Snoo helper block re-emerged lines 1643–1685.
- Bug found: `_svgX`/`_svgY` at lines 2424–2425 missed in Session 4 rename pass.
- Bug found: `onload` dead code at line 282 still present.
- Confirmed: `drawGenBadge()` fires on local player line 6553 — Cal wants removed.
- Confirmed: `tLvl` drain has zero effect on `pooled` — saturation and sump are fully independent.
- Confirmed: `main.tsx` never sends `MSG_SET_WEATHER` — Nashville hardcoded.
- Confirmed: `weeklyContrib` never formatted or posted as Reddit comment.
- Cal decisions on Issues 1–8 all recorded in WIGGLERS_AUDIT_V20.md.
- Session notes were incorrectly going into WIGGLERS_AUDIT_V20.md — corrected. Session log belongs here.
- github-sync SKILL.md updated: STEP 2 added — auto-run lead-dev every session, never wait to be asked.

### V20 Session 8 — Next Session
**Work through checklist in order (see WIGGLERS_AUDIT_V20.md):**
1. FIX-1: Delete orphan Snoo block lines 1643–1685 — game.js
2. FIX-2: Rename `_svgX`/`_svgY` lines 2424–2425 — game.js
3. FIX-3: Delete `onload` dead code line 282 — game.js
4. ISS-2: Remove `drawGenBadge()` call line 6553 — game.js
5. ISS-1: Add `u/username` label above all worms — game.js
6. ISS-8: Saturation fixes — game.js
7. ISS-3: Offline death + comment post — game.js + main.tsx
8. ISS-5: Live weather — main.tsx + game.js
9. ISS-7: Weekly leaderboard pinned comment — main.tsx

*This file is maintained by the Lead Dev skill. Update every session.*
