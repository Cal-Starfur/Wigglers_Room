# Wigglers Room — Lead Dev Audit Report
**File:** `webroot/game.js`  
**Repo:** `Cal-Starfur/Wigglers_Room` (branch: `main`)  
**Current stable baseline:** Session 11 — SHA `34e941e`, 8,397 lines  
**Platform:** Devvit / Vanilla Canvas  
**Deploy:** `devvit upload --just-do-it && devvit install wigglers_room_dev` — via bridge3.js in Codespace. Always hard-refresh Reddit after deploy (close and reopen post).\

---

## ⚠️ Session Rules
- **ONE fix per deploy. Test on Reddit after each. Hard refresh every time.**
- Always fetch fresh from GitHub before editing — never work from stale context
- Deploy via bridge. If bridge isn't running: `node ~/bridge3.js` in Codespace first

---

## 🎮 Core Design Intent (Cal's Vision — DO NOT CONTRADICT)

> The worm bin is a living world. It runs whether you're watching or not.
> Your worm lives and dies on its own terms. Leaving is a real decision.

### The Sleep Contract
- **Sleeping in deep compost (tier 2) = the only safe way to leave.**
- If you log off with a healthy sleeping worm, it rests safely. HP recovers slowly. Gut digests at reduced rate.
- **If you leave in any other state, your worm keeps dying in real time:**
  - Starving → HP bleeds to 0
  - Constipated → HP bleeds to 0
  - Acid buildup → HP bleeds to 0
  - Flooding → drowns
- **Death while offline posts a Reddit comment** referencing the player by username, stating cause of death, karma earned, generation. This opens a queue slot for the next waiting worm.
- `applyOfflineDrain()` cap of 0.85 has been **removed**. Worms can and do die offline.
- Gen 2+ perk: −15% offline drain rate (slight survival advantage for veteran worms)

### The World Runs 24/7
- World physics (tLvl, pooled, castingEnrichment, scrapsLevel) should evolve continuously, even with zero players online.
- This is the goal of ARC-1B (Devvit Scheduler). Not yet implemented.
- Until ARC-1B lands, world state is driven by the last active player's client.

---

## 🔥 HIGH PRIORITY — Live World Architecture (ARC-1)

### ARC-1A — Tab-hidden physics fallback ✅ CODED, NEEDS DEPLOY
**What it does:** When player hides/switches tab, browser throttles `requestAnimationFrame` to ~1fps or pauses it entirely. ARC-1A switches to `setInterval(16ms)` so physics keep running at full speed. `draw()` is skipped (no canvas needed). On tab restore, switches back to rAF.

**Why full speed matters:** The game design requires that a starving/constipated/acidic worm dies in real time even when the tab is hidden. Slowing physics when hidden would break the core sleep contract — the only way to safely leave is to sleep first.

**What changed in game.js:**
- Added `lastTickMs`, `loopRafId`, `loopIntId`, `tabHidden` vars
- Added `startLoop()` — canonical entry point, replaces all `loop()` direct calls
- Added `physicsTick(dt)` — shared physics body used by both rAF and interval paths
- Added `hiddenTick()` — fires every 16ms when hidden; physics only, no draw
- Added `visibilitychange` listener — switches between rAF and setInterval
- All per-frame drain rates multiplied by `dt` (delta-time): pHP bleed, gut digestion, acid decay, castingEnrichment decay, tunnel decay, valve drain
- `dt` clamped 0.25–4.0 to prevent insta-kill on first tick after resume
- `MAX_OFFLINE_DRAIN = 0.85` cap **removed** from `applyOfflineDrain()`
- `applyOfflineDrain()` HP bleed now allows pHP → 0

**Status:** ⏳ Ready to push — needs staging + deploy

---

### ARC-1B — Devvit Scheduler server-side world tick
**What it does:** Add a `Devvit.addSchedulerJob('world-tick', ...)` in `main.tsx` that fires every 60 seconds on Devvit servers. Job reads `world:{postId}` from KV, advances tLvl/pooled/castingEnrichment/scrapsLevel, writes back, broadcasts via Realtime. World evolves 24/7 with zero players open.

**Files:** `main.tsx`  
**Complexity:** High — world physics currently lives only in game.js. Must mirror tick formulas into main.tsx.  
**Steps:**
1. Add `scheduler: true` to `Devvit.configure()`
2. Extract world-tick formulas from `updatePhysics()` into pure function in main.tsx
3. Register `Devvit.addSchedulerJob('world-tick', ...)` — runs every 60s
4. Job: read `world:{postId}` → advance state → write back → broadcast `RT_WORLD`
5. Webview receives Realtime update, applies to local `tLvl`/`pooled`/`castingEnrichment`

**Race condition rule:** Server tick wins. Client `MSG_WORLD_UPDATE` accepted but overwritten by next server broadcast.

**Status:** ⏳ After ARC-1A confirmed working on Reddit

---

### ARC-1C — Server-side worm drain + offline death post
**What it does:** Once ARC-1B exists, scheduler job also reads `worm:{username}` KVs, applies hunger drain formula, marks worm dead if HP → 0, posts Reddit comment via main.tsx Reddit API.

**Dependency:** ARC-1B must exist first  
**Status:** ⏳ Backlog — blocked on ARC-1B

---

## 🔴 Code Quality Fixes (game.js only)

### FIX-2 — `_svgX` / `_svgY` Still Underscore Named
**Where:** `drawSnooDrain` — lines ~2422–2423  
**Detail:** Two local shorthands inside `drawSnooDrain` still use `_underscore` prefix. Rename to `svgX` / `svgY`.  
**Status:** ⏳ Deferred — do after ARC-1A confirmed

### FIX-3 — `onload` Line 282
**Where:** Line ~282  
**Detail:** `img.onload = function() { playerAvatarImg = img; }` — live code for avatar loading, NOT dead. Do not delete.  
**Status:** 🔍 Not a bug — leave alone

---

## 🎮 Gameplay Issues & Feature Backlog

> All items below are LOWER PRIORITY than ARC-1A and ARC-1B.

### ISS-9 — T-Key Drain Cinematic: Snoo Invisible on Mobile / Short Viewports
**Root cause (suspected):** `drainCamTarget` formula assumes a specific canvas height. On short/mobile viewports, camera ends up below where Snoo renders.  
**What to do:** Add a `DEBUG_MODE` overlay in `updateSnooDrain` that prints `drainSnooStopY`, `camY`, `H`, `drainCamTarget` on screen. Trigger on device. Fix from actual data, not guesswork.  
**Status:** ⏳ Pinned — do NOT attempt blind. Debug overlay first.

### ISS-2 — Remove `drawGenBadge()` from Local Player
**Where:** Line ~6478 — `drawGenBadge(pSegs[0].x, phsy - pSR - 2, generation)`  
**Cal's decision:** Gen identity shown via worm color. Badge is clutter on local player. Remove the call. Keep the function — used for other players.  
**Status:** ⏳ Deferred

### ISS-1 — Username Labels Above All Worms
**Cal's decision:** Show real `u/username` above every worm. In local dev (`username === 'u/You'`) show nothing.  
**Status:** ⏳ Deferred

### ISS-8 — Saturation System
**Cal's concern:** Draining tea doesn't relieve saturation — disconnected feeling.  
**Fixes needed:**
1. Weekly drain bleeds `pooled`: in `triggerWeeklyDrain()` add `pooled = Math.max(0, pooled - tLvl * 0.3)`
2. Valve tap bleeds `pooled`: in `closeDrainTap()` add `pooled = Math.max(0, pooled - window._valveDrainedTotal * 0.25)`
3. Oversaturation warning visual before damage kicks in at `pooled > 0.6`  
**Status:** ⏳ Deferred

### ISS-3 — Offline Death + Reddit Comment (client path)
**What exists:** `applyOfflineDrain()` now has no cap. pHP can reach 0.  
**Missing:** When `pHP <= 0` on load (set by `applyOfflineDrain`), the death screen fires and `postToHost({type:'playerDied',...})` triggers — this should already work via the existing death check in `updatePlayer()`. Needs verification on Reddit.  
**Note:** Full server-side path becomes ARC-1C once ARC-1B exists.  
**Status:** ⏳ Verify after ARC-1A deploy

### ISS-4 — Sound / Audio
**Status:** ⏳ Intentionally deferred — return when live world is stable

### ISS-5 — Live Weather Integration
**Cal's decision:** Real weather via Open-Meteo (free, no key). `main.tsx` on MSG_READY fetches, caches in KV 1hr, sends `MSG_SET_WEATHER`.  
**Status:** ⏳ Backlog

### ISS-6 — Trash Type Names
**Status:** ✅ By design — no change needed

### ISS-7 — Weekly Leaderboard as Pinned Reddit Comment
**Cal's decision:** On weekly drain, sort `weeklyContrib`, post + pin formatted leaderboard comment.  
**Status:** ⏳ Backlog

---

## ✅ What's Confirmed Working (Don't Touch)

| System | Notes |
|---|---|
| Movement / physics | Stable in Session 11 baseline |
| `draw()` / `updatePhysics()` / `updatePlayer()` | Monolithic — do NOT split again (caused Session 5 movement bug) |
| `main.tsx` message constants + KV namespacing | ✅ |
| `postToHost()` wrapper | ✅ Safe no-op in local dev |
| `saveSession()` dual-write | ✅ |
| All message handlers | ✅ Present and wired |
| `applyOfflineDrain()` base gut drain | ✅ Works — cap now removed, real death possible |
| Cocoon persistence + server clamps | ✅ |
| `otherPlayers` real worm rendering | ✅ Real segs, gen color, HP, stale fade — fixed Session 11 |
| Presence relay `players: [{}]` array shape | ✅ Fixed Session 11 |
| Queue entries filtered from otherPlayers | ✅ Fixed Session 11 |
| Poop enrichment depth bonus | ✅ |
| Valve + weekly drain mutual exclusion | ✅ |
| `pooled` shared world state + Realtime sync | ✅ |
| Soil color blending | ✅ |

---

## ✅ Resolved — Full History

| # | Fix | Session | Notes |
|---|---|---|---|
| FIX-1 | Duplicate Snoo helper block | Sess 3 | Deleted orphan block |
| — | `var starvingHUD` shadow rename | Sess 3 | |
| — | Dead code (`_refreshBin` etc) | Sess 3 | |
| — | `MSG_*` constants throughout | Sess 2 | |
| — | `localStorage` through `saveSession()` | Sess 2 | |
| — | 11 `_underscore` → camelCase | Sess 11 | Root cause of Sess 4 movement bug was missed call sites — fixed properly |
| — | `player:{}` → `players:[{}]` in presence relay | Sess 11 | Other worms were invisible since launch |
| — | Queue entries rendered as worms at (0,0) | Sess 11 | Guard added in `setPresence` handler |
| — | Auto-deploy via bridge | Sess 10 | `devvit install wigglers_room_dev` — no manual click |
| — | `MAX_OFFLINE_DRAIN` cap removed | Sess 13 | Real offline death — aligns with sleep contract design |
| — | ARC-1A delta-time + tab fallback coded | Sess 13 | Full-speed physics when tab hidden — awaiting deploy |

---

## 🚫 Do Not Attempt Again

| What | Why |
|---|---|
| Split `draw()` / `updatePhysics()` / `updatePlayer()` into subfunctions | Session 5 — caused movement bug on Reddit. Root cause never isolated. |
| Batch multiple renames without grepping every call site first | Session 4 — missed `_dropSegStart`/`_dropSegEnd` call sites, `try/catch` swallowed silently |
| Fix Snoo drain camera blind (without debug overlay) | Session 12 — multiple reverts, blank screen. Always add debug overlay first. |
| Slow down physics when tab is hidden | Breaks sleep contract — worms must die at real speed when unsafe |

---

## Session Checklist — Work Through In Order

| # | Task | File(s) | Priority | Status |
|---|---|---|---|---|
| ARC-1A | Deploy delta-time + visibilitychange fallback | game.js | 🔥 TOP | ⏳ Ready to push |
| ISS-3 | Verify offline death → Reddit comment fires on load | game.js | 🔥 HIGH | ⏳ Verify after ARC-1A |
| ARC-1B | Devvit Scheduler server-side world tick | main.tsx | 🔥 HIGH | ⏳ After ARC-1A confirmed |
| ARC-1C | Per-worm offline death via server | main.tsx + game.js | 🔥 HIGH | ⏳ After ARC-1B |
| ISS-9 | Snoo drain invisible — debug overlay first | game.js | 🟡 Med | ⏳ Pinned |
| FIX-2 | Rename `_svgX`/`_svgY` inside `drawSnooDrain` | game.js | 🟢 Low | ⏳ Deferred |
| ISS-2 | Remove `drawGenBadge()` call from local player | game.js | 🟢 Low | ⏳ Deferred |
| ISS-1 | Fix local player username label | game.js | 🟢 Low | ⏳ Deferred |
| ISS-8 | Saturation: weekly drain + valve bleed `pooled` | game.js | 🟢 Low | ⏳ Deferred |
| ISS-5 | Live weather: Open-Meteo | main.tsx + game.js | 🟢 Low | ⏳ Backlog |
| ISS-7 | Weekly leaderboard pinned comment | main.tsx | 🟢 Low | ⏳ Backlog |

*Wigglers Room V20 — Cal-Starfur/Wigglers_Room — Session 13 — ARC-1A coded, sleep contract documented*
