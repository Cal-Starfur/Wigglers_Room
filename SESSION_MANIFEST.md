# SESSION MANIFEST — Wigglers Room

## HEAD SHA
`08f9815` (last push — DEMO_DELTA.md created)

## Active Work
- `wigglers-demo-t05.html` — self-contained single-file demo, local only (not yet pushed to repo)
- `docs/demo.html` — shell only, not yet wired
- `docs/demo-game.js` — does not exist in repo yet

## Current Demo State (`wigglers-demo-t05.html`)

### Ticket Status
- T-00 Demo Death Screen: ✅ DONE
- T-01 Canvas, Bin, Worm Movement: ✅ DONE
- T-02 Tier-1 Scraps + Eat + Gut: ✅ DONE
- T-03 Acid Chunk + Nibble + pAcid: ✅ DONE
- T-04 Poop + Castings: ✅ DONE (poop mechanic overhauled this session)
- T-05 Drops + pPath Tubes + Drain: ✅ DONE
- T-06 Cocoon + Sleep + View Mode: [ ] TODO
- T-07 Tutorial Wire-Up: [ ] TODO

### What's working
- Full bin render: sky, tiers, lid, walls, stand legs, sump chamber
- Worm steers to mouse/touch with smooth camera follow (X + Y)
- Tunnel carving in compost, drawPath renders tunnels
- Tier-0 trash chunk pile, nibble → debris → tier-1 scraps
- Eat tier-1 scraps, gut/hunger/acid/HP system, HP + gut HUD bars
- Poop drops + castings physics, sump drain fills tLvl, tea render
- Junction detection + drain charge timers
- Death screen: "Your worm didn't make it." + Try Again
- Worm color: `#ff4d8f` hot pink (tutorial-specific)

### Worm movement overhaul (this session)
- Worm body is now a **smooth quadratic curve** (midpoint Chaikin smoothing) — no more sharp angles on turns
- **Peristaltic stretch**: `_wormStretch = 1.0` permanently; spacing swings +55% longer, width thins by −40%
- `_wormMoving` global drives stretch — wiggle runs always
- On stopped→moving transition, `pHist` is flushed and rebuilt from current segment positions to prevent sideways snap
- Segment placement: moving = lerp 0.18 toward history; stopped = lerp 0.06 toward behind-head rest position
- Known open issue: resting worm collapses too small — fix not yet landed cleanly

### Poop mechanic overhaul (this session)
- Two-finger **hold** to charge (0→1 over ~1.5s), release to fire
- Tap = tiny single drop, full hold = large multi-lump dump
- Gut bar shows amber pulsing charge overlay with `💩 42%` → `💩 MAX!` label while charging
- Gut drain scales with charge (0.15→0.65 of pGut)
- Spacebar = full charge on desktop

### Known missing stubs (called but not defined — will throw on use)
- `trySleep()`, `tryLayCocoon()`, `triggerSnoo()`, `triggerDrainTap()`, `closeDrainTap()`
- These are Devvit-side features not needed for demo — need no-op stubs added

### Bugs fixed this session
- `ctx.restore()` missing after `drawWorm()` — HUD bars and cursor drew in world space, went invisible
- `isMoving` defined inside `drawWorm()` but referenced in `updatePlayer()` — ReferenceError on load
- Worm renderer switched from polyline to per-segment circles (T-05 regression) — reverted to polyline + quadratic smoothing

## Delta Tracking Process

Every session, any change to the demo that diverges from `game.js` must be logged
in `DEMO_DELTA.md` at the repo root. This file is the source of truth for what
needs to be ported back to production when the demo is retired.

**Rules:**
- New globals → add an entry with name, purpose, and port risk
- Changes to existing game.js functions → note the function, what changed, and port notes
- Demo-only stubs → listed under the Stubs section, explicitly flagged do-not-port
- Open design questions → added to the Open Questions section at the bottom

**When to update DEMO_DELTA.md:**
- Any time a new feature is added to the demo
- Any time a game.js function is modified in the demo
- At session wrap, before updating this manifest

`DEMO_DELTA.md` is updated BEFORE the manifest so the manifest can reference the latest delta SHA.

## Key Files
| File | Location | Status |
|------|----------|--------|
| `SESSION_MANIFEST.md` | repo root | ✅ This file |
| `DEMO_DELTA.md` | repo root | ✅ Created this session |
| `DEMO_BUILD_PLAN.md` | `docs/DEMO_BUILD_PLAN.md` | ✅ In repo |
| `wigglers-demo-t05.html` | local / Claude outputs | ⚠ Local only |
| `game.js` | `docs/game.js` @ SHA `84343c0` | ✅ Read-only source |
| `tutorial-module.js` | `docs/tutorial-module.js` | ✅ In repo |
| `demo.html` | `docs/demo.html` | ✅ In repo (shell only) |

## Next Session Start
1. Bootstrap github-sync + set token
2. Add no-op stubs: `trySleep`, `tryLayCocoon`, `triggerSnoo`, `triggerDrainTap`, `closeDrainTap`
3. Fix resting worm size — should settle to a visible compact body, not a dot
4. Decide: push `wigglers-demo-t05.html` to repo as `docs/demo-game.js` + wire `demo.html`
5. Start T-06 — Cocoon + Sleep + View Mode
6. Update `DEMO_DELTA.md` with any new divergences before updating this manifest

## PAT Note
Token set this session — rotate if needed (GitHub → Settings → Developer settings)
