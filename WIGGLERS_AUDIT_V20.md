# Wigglers Room — Audit Log V20
> Last updated: 2026-06-17 after Session 14
> Current state: V60 base + Session 14 fixes

---

## Session 14 — 2026-06-17 (Today)

### Shipped
| SHA | Fix |
|-----|-----|
| `1a58fae` | Snoo drain invisible on mobile — `drainCamTarget` now derived from `drainSnooStopY` instead of fixed `2.53*H` |
| `b68d383` | Loading screen icon restored — 512px full-bleed, soil brown bg, icon is the tap target |
| `81d2049` | Snoo push-down/push-up during cinematic — snap `camY` at trigger, `STOP_Y = H * 0.58` (screen space) |
| `ee574a2` | Death headstone comment posted to Reddit thread on `playerDied` |
| `eca5080` | Headstone date format changed to `M/YY` |
| `2b49f28` | `bornTs` stamped on worm spawn, sent with `playerDied` |
| `fe8d0b2` | Headstone uses real `bornTs`/`diedTs` — actual join and death dates |

### Root Cause Analysis: Why the Revert Happened
S13 attempted ARC-1A (full-speed tab-hidden physics + dt refactor). This caused a blank screen on load.
The revert went all the way to "original V60" — wiping Sessions 2–9 of code health work alongside S13.
The Snoo drain cinematic was broken from the start because the camera formula `3*H + H*0.25 - H*0.72 = 2.53*H`
was calibrated for desktop (H≈800px). On Reddit mobile webview (H≈400–500px) Snoo rendered 8–100px below the canvas bottom.

---

## Priority Queue — Next Session

### P1 — Weekly Drain Wiring (main.tsx) — ~40 lines
The weekly drain cinematic never fires automatically in Devvit. Three bugs:

1. **`weeklyDrain` flag silently dropped** — `main.tsx` `MSG_WORLD_UPDATE` handler strips `weekStartTs` and `weeklyDrain` from the payload. When the drain completes and game sends `postToHost({ type: 'worldUpdate', ..., weekStartTs, weeklyDrain: true })`, main.tsx ignores both fields.

2. **`KV_WEEK` never read** — The shared week clock has no server-side home. Every player runs their own independent 7-day clock from first load. They'll never drain together.

3. **New players never get the shared `weekStartTs`** — New player flow: `setSession` arrives null → `weekStartTs` stays 0 → first physics frame sets it to `Date.now()` → their personal 7-day clock starts now.

**Fix plan:**
- On `MSG_WORLD_UPDATE` with `weeklyDrain: true`: write new `weekStartTs` to `KV_WEEK`, broadcast to all via Realtime
- On post open: read `KV_WEEK`, include `weekStartTs` in `setWorldState` message
- In `game.js` `setWorldState` handler: restore `weekStartTs` from message

### P2 — Re-apply S2 Code Health (game.js) — safe, non-breaking
All reverted in the V60 wipe. Re-apply in order:

| # | Task | What it does |
|---|------|-------------|
| S2a | Add `MSG_*` constants to `game.js` | 18 raw strings → named constants matching main.tsx |
| S2b | Deduplicate Snoo SVG helpers | 5 duplicate function pairs → shared `snooSvgX` etc. |
| S2c | Route all localStorage through `saveSession()` | No direct `localStorage.setItem` outside saveSession |
| S3 | Delete 4 dead functions | `_refreshBin`, `blendEnrichCol`, `drawGenDebugPanel`, `nearestPathIdx` |
| S4 | Rename 17 `_underscore` functions to `camelCase` | Naming convention enforcement |
| S5 | Re-split `draw()` into 8 subfunctions | 2,022 line monolith → clean subfunction calls |
| S5 | Re-split `updatePhysics()` into 4 subfunctions | 815 lines |
| S5 | Re-split `updatePlayer()` into 6 subfunctions | 646 lines |

### P3 — Deferred to Pre-Launch
- Hash `DEBUG_PASSWORD` — currently plaintext `'wigglers2025'`

---

## Known Issues (Open)

| ID | Issue | Status |
|----|-------|--------|
| ISS-1 | Weekly drain never fires in Devvit (3 root causes) | P1 next session |
| ISS-2 | `KV_WEEK` defined but never read or written | Part of ISS-1 fix |
| ISS-3 | 17 `_underscore` function names (naming violation) | P2 — low risk |
| ISS-4 | `draw()` 2,022 line monolith | P2 — after wiring fixes |
| ISS-5 | 5 duplicate Snoo SVG helper pairs | P2 |
| ISS-6 | 18 raw message type strings in game.js | P2a |
| ISS-7 | 4 dead functions still in codebase | P2 — easy cleanup |
| ISS-8 | `DEBUG_PASSWORD` plaintext | P3 — pre-launch |
| ISS-9 | `bornTs` not stamped on cocoon hatch respawn (only baby respawn) | Low — headstone birth date slightly off for hatch respawns |

---

## Closed Issues (Sessions 1–14)

| ID | Fix | Session |
|----|-----|---------|
| — | Snoo drain invisible on mobile (camera formula) | S14 |
| — | Snoo push-down/push-up during cinematic | S14 |
| — | Loading screen icon lost in revert | S14 |
| — | Death never posted to thread | S14 |
| — | Headstone dates were fake (1920s) | S14 |
| — | Headstone dates simulated from pEaten | S14 |
| — | Duplicate Snoo SVG helpers | S2 (reverted S13) |
| — | Raw localStorage writes outside saveSession | S2 (reverted S13) |
| — | MSG_* constants in game.js | S2 (reverted S13) |
| — | Variable shadows (starving, head, now) | S3 (reverted S13) |
| — | Dead code removed | S3 (reverted S13) |
| — | _underscore → camelCase renames | S4 (reverted S13) |
| — | draw() / updatePhysics() / updatePlayer() split | S5 (reverted S13) |
| — | otherPlayers real worm rendering | S4 (reverted S13) |
