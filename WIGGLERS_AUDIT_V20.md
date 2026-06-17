# Wigglers Room — Audit Log V20
> Last updated: 2026-06-17 end of day (Session 14 full)
> Current state: V60 base + all Session 14 fixes

---

## Session 14 — 2026-06-17 (Full Day)

### Commits Shipped
| SHA | Fix |
|-----|-----|
| `1a58fae` | Snoo drain invisible on mobile — `drainCamTarget` derived from `drainSnooStopY` not fixed `2.53*H` |
| `b68d383` | Loading screen icon restored — 512px full-bleed, soil brown bg, icon is tap target |
| `81d2049` | Snoo push-down/push-up during cinematic — snap `camY` at trigger, `STOP_Y = H * 0.58` screen space |
| `ee574a2` | Death headstone comment posted to Reddit thread on `playerDied` |
| `eca5080` | Headstone date format `M/YY` |
| `2b49f28` | `bornTs` stamped on worm spawn, sent with `playerDied` |
| `fe8d0b2` | Headstone uses real `bornTs`/`diedTs` — actual join and death dates |
| `5887af4` | Loading screen icon centered on mobile — `zstack` + 256px |
| `ea8f791` | Lock Create Wigglers Room to moderators only (`forUserType: 'moderator'`) |
| `1641bbe` | Preview background — trash chunk wallpaper using real game draw code |
| `04ad8ac` | `preview-bg.png` added to assets (all 27 trash items on dark soil, vignette) |
| `6580e10` | Re-pushed preview-bg.png as clean binary (was corrupted in first push) |

### What We Built
- **Snoo drain cinematic fully working on mobile** — was completely invisible due to hardcoded camera formula calibrated for desktop
- **Death headstone comments** — real RIP posts to Reddit thread with cause, karma, real dates
- **Loading screen** — 512px worm icon on soil brown, tap to enter
- **Preview card wallpaper** — all 27 trash items rendered via real `drawTrashChunk()` code, scattered on dark soil with vignette

### Root Cause Analysis: Why the Full Revert Happened
S13 attempted ARC-1A (tab-hidden physics + dt refactor) causing blank screen on load.
Revert went to "original V60" — wiping Sessions 2–9 code health work alongside S13.

The drain cinematic was broken from the very first upload because:
- `drainCamTarget = 3*H + H*0.25 - H*0.72 = 2.53*H` was calibrated on desktop (H≈800px)
- Reddit mobile webview H≈400–500px → Snoo rendered 8–108px below canvas bottom
- Camera formula needed to derive from `drainSnooStopY` not a fixed H multiple

---

## Devvit Platform Lessons Learned (CRITICAL — read before every session)

### Asset Rules
- ✅ **PNG only** — Devvit asset uploader rejects GIF, JPG, any non-PNG
- ✅ **Push binary files via GitHub API directly** — the github-sync script corrupts binary files during push (base64 encoding issue). Always use direct `urllib` PUT with proper `base64.b64encode(bytes)` for images
- ✅ **Verify PNG after push** — check `bytes[:8] == b'\x89PNG\r\n\x1a\n'` on the GitHub copy before uploading to Devvit
- ✅ **Assets folder** — put all images in `/assets/`, referenced by filename only (e.g. `"icon.png"`, `"preview-bg.png"`)

### Devvit Blocks (Preview UI) Rules
- ✅ **No HTML/CSS/canvas** — preview is declarative Blocks UI only
- ✅ **No z-index** — use `<zstack>` for layering
- ✅ **`<image onPress>` works** — can put `onPress` on an image to make it a tap target
- ✅ **`backgroundColor` goes on the stack element** — not on image
- ✅ **Animated GIFs not supported** — rejected by asset uploader
- ✅ **`webView.render()` does not exist** — `UseWebViewResult` only has `mount()`, `unmount()`, `postMessage()`
- ✅ **Auto-mounting webview breaks UX** — calling `webView.mount()` in render body fires on every render, not just on tap. Only call inside `onPress`
- ✅ **Render must always return valid JSX** — even when webview is active

### Post Lifecycle Rules
- ✅ **Old posts go read-only after re-upload** — every `devvit upload` invalidates existing custom posts. Must create a new post to test new builds
- ✅ **`forUserType: 'moderator'`** — gates menu items to mods only. Required for production so users can't spam bin posts
- ✅ **`devvit install <subreddit>` required after every upload** — upload alone doesn't activate the new version on the sub

### Git / Codespace Rules
- ✅ **Always `git pull` before `devvit upload`** — or files from Claude's pushes will be missing
- ✅ **`git config pull.rebase true`** — set once, prevents the MERGE_MSG dialog forever
- ✅ **Divergent branches** — caused by Claude pushing directly to GitHub while Codespace has local commits. Rebase resolves it cleanly

### TypeScript Rules
- ✅ **Run `tsc --noEmit` locally before every push** — catches errors before CI fails
- ✅ **Always check `UseWebViewResult` type** — Devvit's hook types are narrow, don't assume methods exist
- ✅ **Type annotations in template literals** — `Record<string, [string, string]>` works fine in tsx

### Rendering / Asset Generation
- ✅ **Playwright + Chromium available in container** — use for headless canvas rendering
- ✅ **Canvas → PNG via `toDataURL`** — reliable, produces valid PNG bytes
- ✅ **Verify PNG signature before pushing** — `bytes[:8] == b'\x89PNG\r\n\x1a\n'`
- ✅ **Use real game draw code for assets** — extract `drawTrashChunk()` and render via Playwright for pixel-perfect consistency with in-game visuals

---

## Priority Queue — Next Session

### P1 — Weekly Drain Wiring (main.tsx) — ~40 lines
Three bugs prevent weekly drain from ever firing automatically:

1. **`weeklyDrain` flag silently dropped** — `MSG_WORLD_UPDATE` handler ignores `weekStartTs` and `weeklyDrain: true` from game
2. **`KV_WEEK` never read** — each player runs independent 7-day clock, never synced
3. **New players never get shared `weekStartTs`** — always resets to `Date.now()` on first load

**Fix:** Read `KV_WEEK` on open → send `weekStartTs` in `setWorldState` → handle in game → on drain completion write new `weekStartTs` to `KV_WEEK` + broadcast via Realtime

### P2 — Re-apply S2–S5 Code Health (game.js)
All reverted in the V60 wipe. Safe, non-breaking, apply in order:

| Task | What |
|------|------|
| S2a | 18 raw message strings → `MSG_*` constants matching main.tsx |
| S2b | 5 duplicate Snoo SVG helper pairs → shared functions |
| S3  | Delete 4 dead functions (`_refreshBin`, `blendEnrichCol`, `drawGenDebugPanel`, `nearestPathIdx`) |
| S4  | Rename 17 `_underscore` functions → camelCase |
| S5  | Split `draw()` (2,022 lines) into 8 subfunctions |
| S5  | Split `updatePhysics()` (815 lines) into 4 subfunctions |
| S5  | Split `updatePlayer()` (646 lines) into 6 subfunctions |

### P3 — Deferred to Pre-Launch
- Hash `DEBUG_PASSWORD` (currently plaintext `'wigglers2025'`)

---

## Known Issues (Open)

| ID | Issue | Priority |
|----|-------|----------|
| ISS-1 | Weekly drain never fires in Devvit (3 root causes) | P1 |
| ISS-2 | `KV_WEEK` defined but never read or written | Part of ISS-1 |
| ISS-3 | 17 `_underscore` function names | P2 |
| ISS-4 | `draw()` 2,022 line monolith | P2 |
| ISS-5 | 5 duplicate Snoo SVG helper pairs | P2 |
| ISS-6 | 18 raw message strings in game.js | P2 |
| ISS-7 | 4 dead functions in codebase | P2 |
| ISS-8 | `DEBUG_PASSWORD` plaintext | P3 |
| ISS-9 | `bornTs` not stamped on cocoon hatch respawn | Low |

---

## Closed Issues

| Fix | Session |
|-----|---------|
| Snoo drain invisible on mobile (camera formula) | S14 |
| Snoo push-down/push-up during cinematic | S14 |
| Loading screen icon lost in revert | S14 |
| Loading screen icon not centered on mobile | S14 |
| Death never posted to thread | S14 |
| Headstone dates were fake (1920s) | S14 |
| Headstone dates simulated from pEaten | S14 |
| Any user could create a bin post | S14 |
| Preview card had plain brown background | S14 |
| Preview-bg.png corrupted on first push | S14 |
| GIF/JPG rejected by Devvit asset uploader | S14 |
| webView.render() doesn't exist | S14 |
| Auto-mounting webview broke UX | S14 |

---

## Session 14 — Post-Lunch (2026-06-17 afternoon)

### Commits Shipped
| SHA | Change |
|-----|--------|
| `eb25d3b` | Multiplayer attempt 1 — BROKE all rooms (crashed render) |
| `c663232` | REVERT — restored working state |
| `eb25d3b` | Multiplayer attempt 2 — fixed RT_ channel names, added useChannel subs, fixed player→players |
| `83aa0b3` | (earlier bad attempt — reverted) |
| `5b7548b` | Increased startup fallback timeout 400ms → 2000ms |
| `4b0ac87` | Added Devvit message envelope unwrap in game.js |
| `b7089f4` | Removed strict origin check (www.reddit.com was wrong) |

### What's Working
- Multiplayer channels wired up — `useChannel` subscriptions for presence, world, flood
- `player` → `players: []` array fix in presenceUpdate broadcast
- RT_ channel names use underscores not colons (Devvit requirement)

### ISS-10 — u/You instead of real username (OPEN — P1 next session)

**Symptom:** Game always shows `u/You` instead of the player's real Reddit username.

**What we tried:**
1. Increased fallback timeout 400ms → 2000ms — no effect
2. Added Devvit envelope unwrap (`devvit-message` → inner message) — no effect  
3. Removed strict origin check (`www.reddit.com`) — no effect

**Current diagnosis — still unconfirmed:**
The `MSG_SET_USERNAME` message may never be reaching the game's `window.addEventListener('message')` handler. Three possible reasons still to investigate:

1. **Wrong envelope structure** — we assumed `{ type: 'devvit-message', data: { message: ... } }` but the actual structure from `webView.postMessage()` in this Devvit version may differ. Need to add `console.log(JSON.stringify(e.data))` at the very top of the listener (before any filtering) and read the Codespace logs to see raw payloads.

2. **`postToHost` direction confusion** — `postToHost` uses `window.parent.postMessage` but Devvit webview may require `window.top.postMessage` or a specific Devvit bridge function. If `postToHost` is sending to the wrong frame, the host never receives `ready` and never sends `setUsername`.

3. **`ready` message never received by host** — if game.js sends `ready` before the Devvit webview bridge is fully initialised, the message is lost and the `MSG_READY` handler in main.tsx never fires — so `getCurrentUser()` is never called and no username is ever sent.

**Next session investigation plan:**
```javascript
// Add at very top of window.addEventListener('message', ...) in game.js:
console.log('[msg]', JSON.stringify({origin: e.origin, type: e.data?.type, keys: Object.keys(e.data||{})}));

// Add at very top of postToHost() in game.js:
console.log('[postToHost]', JSON.stringify(msg));
```
Then check Codespace logs after opening the game. This will tell us:
- Whether ANY messages are arriving from the host
- What origin they're coming from
- Whether `ready` is being sent and received

---

## Devvit Platform Lessons Learned — UPDATED

### Realtime / useChannel (NEW — learned this session)
- ✅ **`useChannel` names must be `[a-zA-Z0-9_]` only** — colons throw immediately, crashing the entire render. `presence:${postId}` → `presence_${safeId(postId)}`
- ✅ **`useChannel` is the subscription mechanism** — `realtime.send()` publishes but nothing receives unless `useChannel` + `.subscribe()` is called on every viewer's render instance
- ✅ **Declare `useChannel` after `useWebView`** — hooks must run in consistent order; channels that reference `webView` need it in scope
- ✅ **`channel.send()` vs `realtime.send()`** — `useChannel` has its own `.send()` method; `realtime.send()` uses a different internal channel format
- ✅ **`presenceUpdate` sends `player: {}` but game expects `players: []`** — was silently dropped; fixed to `players: [{ ... }]`

### Message Bridge (NEW — partially understood)
- ✅ **Devvit wraps `webView.postMessage()` in an envelope** — structure: `{ type: 'devvit-message', data: { message: ... } }` — game.js must unwrap before reading `.type`
- ⚠️ **Origin of host→webview messages is NOT `https://www.reddit.com`** — strict origin check blocks all messages; removed. Exact Devvit origin still unknown.
- ❌ **`u/You` bug not yet fixed** — messages may still not be arriving despite envelope unwrap and origin fix. Need console logging to confirm.
