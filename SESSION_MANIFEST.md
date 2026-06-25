# Session Manifest — Wigglers Room
Session: 28 | Branch: main | Devvit: 0.0.180 | Updated: 2026-06-24

## Blocked
- ISS-19 (localStorage race condition) — P1, code freeze until shipped
- No game.js / main.tsx changes this sprint (demo-game.js / demo-teaser.html only)

## Session 28 — NPC worms feel like real players (all commits to docs/demo-game.js)
- e750f83 — Dig-to-sump state machine (forage→dig→drain→return) replacing waypoint wandering
- 6141c75 — Forage in tier-1 food layer + seek nearest scrap; tender/driller roles, Poisson-desynced
            dig commitment; ZZZ fix (drift/fade moved into loop() so it runs every frame, not only
            while player sleeps) + NPC z's matched to player style
- 5a1c672 — Spawn spacing: remap spawn x from viewport fraction (xr*W) to actual bin interior
            (WORLD_W=1194, centered) so worms spread across the whole bin on narrow screens
- afcc0f6 — PERF: cap NPC tunnels at MAX_NPC_PATH=280 (player MAX_PPATH=2000) + debounce the shared
            bucket-index rebuild to once/frame (dirty flag in updatePhysics) — killed rebuild storm
- ffb0752 — PERF: NPC + player junction scans switched to spatial bucket index (O(local), not
            O(all tunnel points)); NPC _jcool now resets on MISS too so it can't fire every carve
- d3728f6 — NPC personalities seeded from username (mulberry32 over string hash) via _npcPersonality():
            traits speed/dig/appetite/sleepy/wiggle/restless/turf. Replaced binary role; threads through
            forage range, dig cadence, drain linger, idle pauses, move speed, wiggle, nap rhythm
- 09a87d6 — Fix stuck tea + drop lag: clogStalled drops were only un-stalled inside a branch they
            couldn't reach (frozen forever, piled toward cap). Added periodic clog-stall recovery
            (~every 40 frames) so tea re-routes onto player tube / drains when blockage or NPC tube
            clears; throttled resting pooled drops to re-scan ~1/8 frames. Tea hands off NPC->player
            tubes (verified for vertical tubes); per-frame drop cost flat even with tea near cap.

## OPEN / NEXT SESSION
- **HUD HP/gut bar bug (REPORTED, NOT YET DIAGNOSED — session ended before fix).** Player HP/gut
  bar in the side-panel "game HUD" has "gotten frozen"; per Sir it "should track with the screen y."
  The only player HP/gut bar found in demo-game.js is the screen-fixed top-left bar at ~line 7315
  (_barX=10,_barY=50, no camY). Did NOT locate a separate side-panel HP/gut bar in demo-game.js —
  NEXT: check docs/demo-teaser.html for an HTML/DOM side-panel HP/gut readout (or a canvas HUD that
  uses camY / a world Y) whose update may have stalled. Sir asked to stop before any change.
- **ghostERR: line still needed.** Per-NPC try/catch guard (commit 81460e4, ~lines 6900s) is masking
  a ghost-worm render crash; the green NPCdbg overlay (top-left) is also still live. Both stay until
  Sir reports the `ghostERR:` value from the console — then fix root cause + remove guard + overlay.
- Possible follow-up if lag persists: add live drops=/clogs= readout to the green debug overlay to
  confirm whether tea/clog backup is still accumulating in the real game.

## Tooling notes
- Edits: Python with assert content.count(old)==1, then `node --check demo-game.js`. Working copy /tmp/demo-game.js.
- Headless harness pattern (/tmp/harness*.js): first 62 lines of harness.js = browser stubs + load;
  drives updateNPCSims/updatePhysics (NOT loop()/draw()), so pZzz fade and HUD draw are NOT exercised there.
- Push: stage -> summarize -> wait for "Push"/"Push it" -> push --approved. demo-teaser.html (~1.5MB) needs
  two-step fetch (Contents API SHA -> raw blob); raw fetch via raw.githubusercontent.com with token works.
