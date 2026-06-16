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
- **Claude handles the full deploy automatically via the devvit-pipeline skill bridge — no manual steps needed**
- Full deploy command (runs via bridge3.js in Codespace):
  `git pull && devvit upload --just-do-it && devvit install wigglers_room_dev`
- `devvit install wigglers_room_dev` bumps r/wigglers_room_dev to the new version — no button click on the developer portal
- **Never tell the user to manually upload or click the update button — Claude does it all**

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
7. After pushing: Claude runs the full deploy via bridge — `devvit upload --just-do-it && devvit install wigglers_room_dev` — no manual steps

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
- (Superseded by Session 8: devvit-pipeline skill bridge now handles deploy directly)

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

### V20 Session 8 — 2026-06-16
- FIX-1: Deleted orphan duplicate Snoo helper block (lines 1682–1725). One canonical block remains.
- FIX-2: Renamed `_svgX`/`_svgY` → `svgX`/`svgY` inside `drawSnooDrain`. No underscore locals remain.
- FIX-3: Already cleaned in prior session — no action needed.
- ISS-2: Removed `drawGenBadge()` call from `drawWorms()`. Function retained for future use.
- ISS-1: Local player label now shows real Reddit `username`. Hidden in local dev (`u/You`).
- ISS-8: Saturation system — weekly drain bleeds `pooled * 0.3`, valve close bleeds `drained * 0.25`, oversaturation warning visual (blue-green sheen intensifies above 0.5).
- Deploy: GAME_ARCHITECTURE.md updated — devvit-pipeline skill bridge now handles deploy.
- Commit: `ca9ee0b`. Lines: 8,491 → 8,459

### V20 Session 9 — 2026-06-16
- Attempted ISS-3 (offline death), ISS-5 (live weather), ISS-7 (weekly leaderboard).
- Game broke on Reddit after Session 9 push. Reverted to Session 8 (`ca9ee0b`) — still broken.
- Full rollback to pre-today baseline: commit `ccef105` (June 15, end of Session 2).
- Restored via GitHub API (commit `f50c474`). Game confirmed working on Reddit after rollback.
- **LESSON:** Session 5 subfunction split (`69496a9`) and/or Session 4 otherPlayers rewrite (`43fd1a2`) introduced the movement bug. Session 8 restore was not far enough back.
- Lines restored: 8,432 (June 15 baseline)

### Emergency Restore Protocol — Documented Here
If the game breaks on Reddit and restoring one session back doesn't fix it:
1. Run `sync_from_github.py history webroot/game.js` to see all commits with dates
2. Identify the last commit from **before today** (different date)
3. `gh.get_file('webroot/game.js', branch='<that_sha>')` to fetch it
4. Stage + push via propose_commit.py
5. Claude runs full deploy via bridge: `devvit upload --just-do-it && devvit install wigglers_room_dev`

### V20 Session 10 — 2026-06-16
- Restored game.js to Session 3 baseline (77c4fef, 8,371 lines) — Sessions 4+5 confirmed broken on Reddit
- Discovered Session 4 (otherPlayers rewrite) and Session 5 (subfunction split) both introduced movement bug
- Confirmed Session 3 is current stable baseline
- Solved deploy friction: `devvit install wigglers_room_dev` added to deploy command — no more manual button click on developer portal
- Updated GAME_ARCHITECTURE.md and devvit-pipeline SKILL.md to reflect full auto-deploy
- Subreddit: r/wigglers_room_dev

### V20 Session 11 — 2026-06-16
**Commit A: game.js (211a919) + main.tsx (a40636a) — 8,371 → 8,396 lines**
- Full forensic diff of Session 3 vs Session 4 — root cause identified: `_dropSegStart`/`_dropSegEnd` renames in Session 4 had missed call sites; `try/catch` in game loop silently swallowed the `ReferenceError`, freezing physics
- FIX: All 11 `_underscore` → camelCase renames with full call-site audit before each edit
- otherPlayers now draw as real worms: gen color, real HP paleness, full alpha, real seg data when available
- Pre-existing bug fixed: `main.tsx` was sending `player:{}` not `players:[...]` — other worms were invisible to all clients
- hist buffer 10 → 20 entries
- **Next: deploy to Reddit, test movement. If stable → remaining checklist items**

### V20 Session 12 — Next Session
**Current baseline: Session 11 Commit A (211a919 / a40636a, 8,396 lines)**
- Deploy and verify movement still works on Reddit
- If stable: continue checklist — FIX-2 (_svgX rename), FIX-3 (onload dead code), ISS-2 (drawGenBadge call), ISS-1 (username labels), ISS-8 (saturation bleed)

*This file is maintained by the Lead Dev skill. Update every session.*
