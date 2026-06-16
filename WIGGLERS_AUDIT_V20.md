# Wigglers Room — Lead Dev Audit Report
**File:** `webroot/game.js`  
**Repo:** `Cal-Starfur/Wigglers_Room` (branch: `main`)  
**Last full audit:** 2026-06-16 (Session 7) — SHA `8d4064c`, 8,492 lines, 230 issues  
**Current stable baseline:** Session 3 — SHA `bab2e46`, 8,371 lines  
**Platform:** Devvit / Vanilla Canvas  
**Deploy:** `devvit upload --just-do-it && devvit install wigglers_room_dev` — fully automatic via bridge, no manual steps

---

## 🔴 Code Quality Fixes (game.js only)

### FIX-1 — Duplicate Snoo Helper Block (Re-emerged)
**Lines:** 1643–1685 (orphan, no header comment)  
**Detail:** `snooSvgX`, `snooSvgY`, `snooHeadGrad`, `snooIrisGrad`, `snooSmilePath`, `SNOO_OX`, `SNOO_OY` all defined twice. The correct block with the `// ── Shared Snoo SVG helpers` header is at 1687. The orphan at 1643 is the duplicate — delete it.  
**Status:** ✅ Already fixed in Session 3 baseline (bab2e46)

### FIX-2 — `_svgX` / `_svgY` Still Underscore Named
**Lines:** inside `drawSnooDrain`  
**Detail:** Two local shorthands inside `drawSnooDrain` still use `_underscore` prefix. Rename to `svgX` / `svgY` — local scope, no global collision.  
**Status:** ⏳ Next — safe, low risk

### FIX-3 — `onload` Dead Code
**Line:** 282  
**Detail:** `onload` function defined but never called. Leftover from old HTML inline pattern. Safe to delete.  
**Status:** ⏳ Next — safe, low risk

---

## 🎮 Gameplay Issues & Feature Backlog

### Issue 1 — Username Labels Above Worms
**Status:** ⏳ Not implemented  
**Cal's decision:** Show `u/username` above every worm — local player and all `otherPlayers`. Must use the real Reddit username from Devvit auth (already arrives via `MSG_SET_USERNAME` → `username` var). In local dev where `username === 'u/You'`, show nothing.  
**Where:** `drawWorms()` — add label above head segment for local player and each `otherPlayers` entry.  
**Notes:** Small font, semi-transparent, positioned above head segment. Same style for all worms.

### Issue 2 — Remove `drawGenBadge()` from Local Player
**Status:** ⏳ Not done  
**Cal's decision:** Generation identity is now shown via worm color and lives count color. The badge is visual clutter. Remove the call at line 6553 inside `drawWorms()`. Keep the `drawGenBadge` function itself — may be useful for other players later.  
**Where:** `drawWorms()` line 6553 — delete the `drawGenBadge(pSegs[0].x, phsy - pSR - 2, generation)` call.

### Issue 3 — Offline Death + Comment Post
**Status:** ⏳ Partially implemented — gaps confirmed  
**Cal's decision:** Worms should be able to die offline if starving/acidic/constipated long enough. When a worm dies offline, post a comment to the Reddit thread.  
**What exists:** `applyOfflineDrain()` drains `pGut` based on elapsed time but `MAX_OFFLINE_DRAIN = 0.85` hardcap prevents death. Toast display works. Flood-while-offline detected.  
**What's missing:**
- Remove or raise `MAX_OFFLINE_DRAIN` cap so worm can actually die
- Simulate offline acid buildup and constipation damage in `applyOfflineDrain()`
- On offline death: `postToHost({ type: MSG_PLAYER_DIED, cause: 'offline_starvation', username })`
- In `main.tsx`: on `MSG_PLAYER_DIED` with offline cause, call `context.reddit.submitComment()` to post to thread
- Comment format: `💀 u/CalStarfur's worm starved while they were away...`  
**Files:** `game.js` (`applyOfflineDrain`) + `main.tsx` (comment post handler)

### Issue 4 — Sound / Audio
**Status:** ⏳ Intentionally deferred — annoying during active development  
**Cal's decision:** Return to this when gameplay is stable. Web Audio API available in Devvit webviews.  
**Future sounds list:**
- Crunch/munch on eating
- Drip for tea drops entering sump
- Valve open/close click
- Weekly drain gurgle + Snoo cinematic fanfare
- Cocoon hatch pop
- Death screen ambient

### Issue 5 — Live Weather Integration
**Status:** ⏳ Not implemented — Nashville permanently hardcoded  
**Cal's decision:** Integrate real live weather via Open-Meteo (free, no API key).  
**What exists:** `weather` object and `getEvapRate()` reads it. Handler for `MSG_SET_WEATHER` exists in `game.js`. But `main.tsx` never fetches weather or sends the message.  
**Plan:**
1. In `main.tsx` on `MSG_READY`, call Open-Meteo: `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,precipitation`
2. Map real values to 0–1 range, send `MSG_SET_WEATHER`
3. Cache result in KV for 1 hour so all viewers don't hammer the API
4. Add visual feedback: rain shimmer overlay when `precip > 0.3`, warmth shift when `temp > 0.7`  
**Files:** `main.tsx` (fetch + KV cache + send) + `game.js` (visual feedback)

### Issue 6 — Trash Type Names
**Status:** ✅ By design — no change needed  
**Cal's decision:** Names like `pizza`, `banana_peel` are code-only identifiers. Not shown to players. Happy with this. Revisit later if hover/tooltip is wanted.

### Issue 7 — Weekly Leaderboard as Pinned Reddit Comment
**Status:** ⏳ Not implemented  
**Cal's decision:** Post and pin a weekly leaderboard comment to the Reddit thread when weekly drain fires.  
**What exists:** `weeklyContrib` tracked per player, broadcast via `MSG_WORLD_UPDATE`. `week:{postId}` KV key stores `{ weekStartTs, pot, contributors }` but contributor data never formatted or posted.  
**Plan:**
1. On `MSG_WORLD_UPDATE` with `weeklyContrib` in `main.tsx`, update `week:{postId}` KV: add/update `{ username, contrib, lastUpdate }`
2. On weekly drain (`weeklyDrain: true`): sort contributors, format leaderboard, call `context.reddit.submitComment()`
3. Pin via `context.reddit.distinguishComment()` if permissions allow
4. Comment format:
```
🌿 Weekly Worm Tea Harvest — Week of Jun 16

🥇 u/CalStarfur — 847 pts
🥈 u/SoilKing42 — 612 pts  
🥉 u/WiggleWorm — 391 pts

Total tea drained: 94% 🫗  Next harvest in 7 days.
```
**Files:** `main.tsx` only

### Issue 8 — Saturation System
**Status:** ⏳ Needs fixing  
**Cal's concern:** Soil turns green (working, looks great ✅) but draining the tea doesn't relieve the saturation — it feels disconnected.  
**What's confirmed from code read:**
- `pooled` (0–1) = compost moisture. Gains from tea drops stalling in compost (+0.005 each). Loses only via evaporation of stalled drops (weather-driven).
- `tLvl` (0–1) = sump tea level. Drains via weekly Snoo cinematic or manual valve tap.
- **`triggerWeeklyDrain()` explicitly does NOT touch `pooled`** — comment says "compost saturation is independent of sump drain". This is the disconnect.
- `window._moisture` lerps toward `pooled` → drives soil color via `getSoilGradStops(castingEnrichment, _moisture)` → green sheen overlay at `alpha = mw * 0.13`
- Oversaturation: at `pooled > 0.6`, worm silently takes drowning damage in compost  

**Fixes to make:**
1. **Weekly drain bleeds `pooled`** — in `triggerWeeklyDrain()`, add: `pooled = Math.max(0, pooled - tLvl * 0.3)` (partial relief, compost retains some moisture)
2. **Valve tap bleeds `pooled`** — in `closeDrainTap()`, add: `pooled = Math.max(0, pooled - window._valveDrainedTotal * 0.25)`
3. **Oversaturation visual warning** — before the worm takes damage at `pooled > 0.6`, show intensifying blue-green sheen so player has warning to move
4. **Evap rate tuning** — test whether `getEvapRate() * 10` multiplier is responsive enough or needs raising to `* 20`  
**Files:** `game.js` (`triggerWeeklyDrain`, `closeDrainTap`, `updateFlood`)

---

## ✅ Resolved Issues

| # | Issue | Session |
|---|---|---|
| 1 | Extract duplicate Snoo SVG helpers to shared module-level | Sess 2 |
| 2 | Route all `localStorage.setItem` through `saveSession()` | Sess 2 |
| 3 | Add `MSG_*` named constants to `game.js` | Sess 2 |
| 4 | `DEBUG_PASSWORD` plaintext | ⏳ Deferred to pre-launch |
| 5 | Global/local variable shadows (`starving` → `starvingHUD`) | Sess 3 |
| 6 | Dead code (`_refreshBin`, `drawGenDebugPanel`, `blendEnrichCol`) | Sess 3 |
| 7 | `nearestPathIdx` comment corrected | Sess 4 — **REVERTED** (Sess 4 broke movement) |
| 8 | `_underscore` → camelCase (11 functions) | Sess 4 — **REVERTED** (Sess 4 broke movement) |
| 9 | Split `draw()`, `updatePhysics()`, `updatePlayer()` | Sess 5 — **REVERTED** (Sess 5 broke movement) |
| 10 | Devvit upload README.md warning | Sess 6 |
| 11 | Auto-deploy: `devvit install wigglers_room_dev` — no more manual button | Sess 10 |
| — | `var` → `let` conversion | ⏳ Deferred — low payoff |

---

## ✅ What's Working Well (Don't Touch)

| System | Status |
|---|---|
| `main.tsx` message constants + KV namespacing | ✅ |
| `main.tsx` anti-cheat clamps | ✅ |
| `postToHost()` wrapper | ✅ Safe no-op in local dev |
| `saveSession()` dual-write | ✅ |
| All message handlers | ✅ Present and wired |
| `applyOfflineDrain()` base gut drain | ✅ Works, needs expansion (Issue 3) |
| Cocoon persistence + server clamps | ✅ |
| `otherPlayers` real worm rendering | ✅ Real segs, gen color, HP, stale fade |
| `draw()` / `updatePhysics()` / `updatePlayer()` decomposition | ✅ |
| Poop enrichment depth bonus | ✅ |
| Valve + weekly drain mutual exclusion (`drainOwner`) | ✅ |
| `pooled` shared world state + Realtime sync | ✅ |
| Soil color blending (`blendWet` → `getSoilGradStops`) | ✅ Looks great |

---

## Full Session Checklist — Work Through In Order

⚠️ **Rule: ONE fix per deploy. Test on Reddit after each. Do not batch.**

| # | Task | File(s) | Status |
|---|---|---|---|
| FIX-1 | Delete orphan Snoo block | game.js | ✅ In baseline |
| FIX-2 | Rename `_svgX`/`_svgY` inside `drawSnooDrain` | game.js | ⏳ Next |
| FIX-3 | Delete `onload` dead code line 282 | game.js | ⏳ Next |
| ISS-2 | Remove `drawGenBadge()` call from `drawWorms()` | game.js | ⏳ Next |
| ISS-1 | Add `u/username` label above all worms | game.js | ⏳ Next |
| ISS-8 | Saturation: weekly drain + valve bleed `pooled` + warning visual | game.js | ⏳ Next |
| ISS-3 | Offline death: remove cap, acid/constipation sim, comment post | game.js + main.tsx | ⏳ Backlog |
| ISS-5 | Live weather: Open-Meteo, KV cache, `MSG_SET_WEATHER`, visuals | main.tsx + game.js | ⏳ Backlog |
| ISS-7 | Weekly leaderboard pinned comment | main.tsx | ⏳ Backlog |
| — | Sessions 4+5 work (underscore renames, subfunction split, otherPlayers rewrite) | game.js | 🚫 Blocked — caused movement bug, root cause unknown |

*Generated by Lead Dev skill — Wigglers Room V20 — Cal-Starfur/Wigglers_Room*
