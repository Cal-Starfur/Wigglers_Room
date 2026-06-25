# Session Manifest — Wigglers Room
Session: 29 | Branch: main | Devvit: 0.0.180 | Updated: 2026-06-25

## Blocked
- ISS-19 (localStorage race condition) — P1, code freeze until shipped
- No game.js / main.tsx changes this sprint (demo-game.js / demo-teaser.html only)

## Session 29 — In-canvas tutorial (the demo intro). Tutorial code in docs/demo-game.js; activation + cache-bust loader in docs/demo-teaser.html
- 7e265bf — NPC sleep tunnel fade fix (sleeping NPC tubes now fill in fast like the player's)
- 25100dc — Commit 1: Director skeleton + single move-target clamp hook (tutorialClampTarget); ?leash=1 proof; default OFF
- 302650a — Cache-bust loader: demo-teaser.html mirrors page ?v= onto the demo-game.js <script> (busts HTML+JS; mobile Safari has no hard-refresh)
- 4b13120 — Commit 2: spawnTutorialScene() staged scene + ambient freeze (updateScrapsLevel early-return); ?tut=1
- 50bcef5 — NPC food protection (tutProtected; both NPC scrap loops skip it) — NPCs were eating the staged food
- ac99cfa — Commit 3: drawTutorialHighlight() (ring + arrow)
- 69e6f6d — Commit 4: ordered progression + worm-anchored arrow; removed dim; eat-gate ordering
- 498d407 — Commit 5: explicit tutorial.steps list + drawTutorialPanel() data cards
- b8f048c — Eggshell repositioned to original 3rd-scrap spot
- fef6888 — Removed per-step leash (NO auto-steer; order enforced by eat-gate + ring/arrow/panel)
- 76c4203 — Removed old #demo-overlay step-cards + gutted _demoTick stage gates (they conflicted w/ tutorial). Pushed by Sir from the mobile app.
- 924fe1f — Added TUTORIAL_ARCHITECTURE.md (repo root): build log, step-machine architecture, add-a-step recipe, merge plan (§12), function index. Also produced a loadable SKILL.md "Wigglers Room Tutorial Builder" (presented for Save Skill; not committed).

Tutorial state: 4-beat curriculum lettuce -> watermelon -> acid (pile chunk) -> eggshell, end-to-end. Activate ?tut=1 (default OFF; free roam unchanged). Order via eat-gate, guidance via ring/arrow/panel, no auto-steer. Full reference: TUTORIAL_ARCHITECTURE.md.

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
- **Tutorial polish backlog:** make the tutorial the DEFAULT (flip tutorial.scene on without ?tut=1; decide if the right-side teaser guide panel stays); "you've got it — explore!" completion beat; optional poop step (add a _tutStepDone kind); free-play windows between beats; tune panel copy/positions/tints on device.
- **Merge plan (run tutorial OVER the live game)** documented in TUTORIAL_ARCHITECTURE.md §12 — keep spawnScraps() + inject curriculum items additively, tighten eat-gate to ALL scraps, suppress only camera-hijack cinematics during the lesson, add an HP-floor safety, no tutorial->free-roam seam. Medium-sized; ?tut=1-gated.
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
