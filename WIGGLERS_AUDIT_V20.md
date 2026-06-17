# Wigglers Room — Lead Dev Audit Report
**File:** `webroot/game.js`  
**Repo:** `Cal-Starfur/Wigglers_Room` (branch: `main`)  
**Current stable baseline:** Session 11 — SHA `34e941e`, 8,397 lines  
**Platform:** Devvit / Vanilla Canvas  
**Deploy:** `devvit upload --just-do-it && devvit install wigglers_room_dev` — via bridge3.js in Codespace. Always hard-refresh Reddit after deploy (close and reopen post).

---

## ⚠️ Session Rules
- **ONE fix per deploy. Test on Reddit after each. Hard refresh every time.**
- Always fetch fresh from GitHub before editing — never work from stale context
- Deploy via bridge. If bridge isn't running: `node ~/bridge3.js` in Codespace first

---

## 🔴 Code Quality Fixes (game.js only)

### FIX-2 — `_svgX` / `_svgY` Still Underscore Named
**Where:** `drawSnooDrain` — lines 2422–2423  
**Detail:** Two local shorthands inside `drawSnooDrain` still use `_underscore` prefix. Only underscore functions left in the file. Rename to `svgX` / `svgY` — purely local scope, zero collision risk.  
**Status:** ⏳ Next

### FIX-3 — `onload` Dead Code
**Where:** Line 282  
**Detail:** `img.onload = function() { playerAvatarImg = img; }` — this is actually live code for avatar loading, NOT dead. Do not delete. Re-examine before touching.  
**Status:** 🔍 Needs re-examination — may not be a bug

---

## 🎮 Gameplay Issues & Feature Backlog


### ISS-9 — T-Key Drain Cinematic: Snoo Invisible on Mobile / Short Viewports
**Where:** `updateSnooDrain()` — `drainCamTarget` formula + `drawSnooDrain()` coordinate system  
**Root cause (suspected):** `drainCamTarget = 3*H + H*0.25 - H*0.72` is a fixed formula that assumes a specific canvas height. On short or mobile viewports, this puts the camera below where Snoo actually renders, so the canvas shows but Snoo is off-screen.  
**Attempted fix:** Session 12 — changed `drainCamTarget = drainSnooStopY - H*0.58` (derived from Snoo's locked world-Y). Reverted after blank screen report — cause of blank screen not confirmed to be this fix.  
**What to do next time:**
1. Add a `DEBUG_MODE` overlay in `updateSnooDrain` that prints `drainSnooStopY`, `camY`, `H`, and `drainCamTarget` on screen
2. Trigger on device, read the values — confirm whether Snoo is off-screen or not rendering at all
3. Fix based on actual data, not guesswork  
**Status:** ⏳ Pinned — do not attempt blind again. Needs debug overlay first.

### ISS-2 — Remove `drawGenBadge()` from Local Player
**Where:** Line 6478 — `drawGenBadge(pSegs[0].x, phsy - pSR - 2, generation)`  
**Cal's decision:** Gen identity shown via worm color. Badge is clutter. Remove the call. Keep the function — used elsewhere.  
**Status:** ⏳ Next

### ISS-1 — Username Labels Above All Worms
**Where:** Local player draw (avatarMode === 1 currently shows 'u/You' placeholder). otherPlayers already show username.  
**Cal's decision:** Show real `u/username` above every worm. In local dev (`username === 'u/You'`) show nothing.  
**Status:** ⏳ Next — local player label needs fixing (currently hardcoded 'u/You' not real username)

### ISS-8 — Saturation System
**Cal's concern:** Draining tea doesn't relieve saturation — disconnected feeling.  
**What exists:** `pooled` only bleeds via evaporation of stalled drops. `triggerWeeklyDrain()` explicitly does NOT touch `pooled`.  
**Fixes needed:**
1. Weekly drain bleeds `pooled`: in `triggerWeeklyDrain()` add `pooled = Math.max(0, pooled - tLvl * 0.3)`
2. Valve tap bleeds `pooled`: in `closeDrainTap()` add `pooled = Math.max(0, pooled - window._valveDrainedTotal * 0.25)`
3. Oversaturation warning visual before damage kicks in at `pooled > 0.6`  
**Status:** ⏳ Next

### ISS-3 — Offline Death + Comment Post
**Cal's decision:** Worms can die offline. Post a Reddit comment when they do.  
**What exists:** `applyOfflineDrain()` drains gut but `MAX_OFFLINE_DRAIN = 0.85` hardcap prevents death.  
**Missing:** Remove cap, simulate acid/constipation offline, `MSG_PLAYER_DIED` → `main.tsx` posts comment.  
**Status:** ⏳ Backlog

### ISS-4 — Sound / Audio
**Status:** ⏳ Intentionally deferred — return when gameplay stable

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
| `applyOfflineDrain()` base gut drain | ✅ Works, needs expansion (ISS-3) |
| Cocoon persistence + server clamps | ✅ |
| `otherPlayers` real worm rendering | ✅ Real segs, gen color, HP, stale fade — fixed Session 11 |
| Presence relay `players: [{}]` array shape | ✅ Fixed Session 11 |
| Queue entries filtered from otherPlayers | ✅ Fixed Session 11 |
| Poop enrichment depth bonus | ✅ |
| Valve + weekly drain mutual exclusion | ✅ |
| `pooled` shared world state + Realtime sync | ✅ |
| Soil color blending | ✅ Looks great |

---

## ✅ Resolved — Full History

| # | Fix | Session | Notes |
|---|---|---|---|
| FIX-1 | Duplicate Snoo helper block | Sess 3 | Deleted orphan block |
| — | `var starvingHUD` shadow rename | Sess 3 | |
| — | Dead code (`_refreshBin` etc) | Sess 3 | |
| — | `MSG_*` constants throughout | Sess 2 | |
| — | `localStorage` through `saveSession()` | Sess 2 | |
| — | 11 `_underscore` → camelCase | Sess 11 | Root cause of Sess 4 movement bug was missed call sites — fixed properly this time |
| — | `player:{}` → `players:[{}]` in presence relay | Sess 11 | Other worms were invisible since launch |
| — | Queue entries rendered as worms at (0,0) | Sess 11 | Guard added in `setPresence` handler |
| — | Auto-deploy via bridge | Sess 10 | `devvit install wigglers_room_dev` — no manual click |

---

## 🚫 Do Not Attempt Again

| What | Why |
|---|---|
| Split `draw()` / `updatePhysics()` / `updatePlayer()` into subfunctions | Session 5 — caused movement bug on Reddit. Root cause never fully isolated. |
| Batch multiple renames without grepping every call site first | Session 4 — missed `_dropSegStart`/`_dropSegEnd` call sites, `try/catch` swallowed the error silently |
| Fix Snoo drain camera blind (without debug overlay) | Session 12 — multiple reverts, blank screen reported, root cause unconfirmed. Always add debug overlay first. |

---

## Session Checklist — Work Through In Order

| # | Task | File(s) | Status |
|---|---|---|---|
| ISS-9 | Snoo drain invisible — needs debug overlay first, do not attempt blind | game.js | ⏳ Pinned |
| FIX-2 | Rename `_svgX`/`_svgY` inside `drawSnooDrain` | game.js | ⏳ Next |
| FIX-3 | Re-examine `onload` line 282 — is it actually dead? | game.js | 🔍 Next |
| ISS-2 | Remove `drawGenBadge()` call line 6478 | game.js | ⏳ Next |
| ISS-1 | Fix local player username label (real username, not 'u/You') | game.js | ⏳ Next |
| ISS-8 | Saturation: weekly drain + valve bleed `pooled` + warning visual | game.js | ⏳ Next |
| ISS-3 | Offline death: remove cap, simulate damage, comment post | game.js + main.tsx | ⏳ Backlog |
| ISS-5 | Live weather: Open-Meteo, KV cache, `MSG_SET_WEATHER` | main.tsx + game.js | ⏳ Backlog |
| ISS-7 | Weekly leaderboard pinned comment | main.tsx | ⏳ Backlog |

*Wigglers Room V20 — Cal-Starfur/Wigglers_Room — Session 12 — Snoo drain pinned (ISS-9)*
