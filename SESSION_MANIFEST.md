# Session Manifest — Wigglers Room
Session: 31 | Branch: main | Devvit: 0.0.180 | Updated: 2026-06-26

## Blocked
- ISS-19 (localStorage race condition) — P1, code freeze until shipped
- No game.js / main.tsx changes this sprint (demo-game.js / demo.html only)

## Session 31 — Geometry halve + castings cleanup + tea re-attach + tutorial merge mode (all docs/demo-game.js)
- 7814978 — Refuel beat 4->2 scraps (4 force-fed the small ~4-unit gut straight back to full) AND removed all
            demo debug instrumentation: green NPCdbg/build-up overlay + per-phase ms-timing + per-phase perf
            clocks in loop(). KEPT the loop try/catch guards and the per-NPC ghost-worm crash guard.
- a2c90fb — Refuel gate opens only when BOTH scraps are eaten (no dive shortcut); eating the first keeps the
            second ringed/open. Panel: "Eat both scraps to move on."
- 58e76e6 — GEOMETRY: compost depth HALVED. cSurf() (sump line / compost bottom / horizon) moved 3H->2.5H;
            compost band is now [2H..2.5H]. All 45 literal 3*H (every one = the sump line) routed through
            cSurf(); depth-band-dependent values rescaled to the new band (compostDepth/depthT normalizers,
            tea stallDepth, cocoon deep thresholds, tutorial poop beacon centre + _zoneR). tier2Bot / horizon
            / sump / drains / camera / worm-clamp all track cSurf().
- 8624639 — Removed the "castings" name + the never-populated castings array (collision/sink/draw no-op loops).
            Label "castings & compost" -> "compost"; sleep warning "castings layer" -> "compost layer". KEPT
            the castingEnrichment mechanic in full (pooping still enriches compost).
- 420a03e — RENDER fix: soil/compost gradient colour stops were hardcoded fractions of the OLD H..3.25H span,
            so after the halve they sat ~0.5H too high. Now computed from cSurf() so the compost/sump colour
            bands line up with the new geometry.
- b15c11a — TEA re-attach fix. A detached drop now requires its re-attach point to be >= ~0.6 worm-radii BELOW
            it: breaks the "re-grab the same lowest point" loop (a wiggle neighbour looked deeper) while still
            letting the drop catch a genuinely lower tube. Supersedes a9addf0 (whole-segment exclusion — too
            broad: a long tunnel is ONE segment, so it also blocked re-joining the same tunnel lower down).
            Routing can't be tested here — confirm on phone.
- 7ec7a6d — TUTORIAL MERGE MODE (TUTORIAL_ARCHITECTURE.md s12). New tutorial.live flag (?tut=2) runs the SAME
            11-step curriculum OVER the live game: spawnScraps() builds the real field + NPCs + ambient and the
            lesson items inject on top (no field wipe), no ambient freeze, eat-gate locks ALL non-target scraps
            (not just injected ones), HP floor 0.08 so a teaching beat can't end in death. Fully gated on
            tutorial.live -> ?tut=1 staged scene and free-roam are byte-identical.

Tutorial gap audit (Session 31): all PLAYER mechanics are now covered; clog is treated as an advanced poop
mechanic (covered). Not taught, by choice: weekly Snoo-drain cinematic, weather, bugs, multiplayer presence.

## Session 30 — Per-poop lag fix + tutorial constipation/refuel arc (all docs/demo-game.js, ?tut=1)
- 4a581ec — PERF: per-poop mobile lag fixed. Root cause: the clog render block ran a per-clogged-point
            tube-outline clip every frame (segment-boundary walk + offset-polygon rebuild + ctx.clip()).
            More poop -> more clogged points -> more clips. Replaced with a direct tube-width capsule
            stroke (clog already sits in the tube on straight/curved runs). +7/-64. Verify smooth on phone.
- 7bc41b3 — Tutorial CONSTIPATION arc. Overripe-fruit beat now HOLDS until the gut is full (acid rides
            up to ~0.3-0.4, under the 0.5 damage line) -> Constipation card (relief poop, any tier) ->
            Eggshell cure (2 shells to clear the higher acid) -> Refuel (HP recovers via digestion) ->
            Compost-bonus poop. New gates acidfull/pooprelief/cure in _tutStepDone; relief latch in
            tryPoop; eggshells open during the cure beat.
- 7a878a9 — Refuel beat spawns 4 scraps; reworded HP line to "comes back as you digest"; multi-item
            beats (cure eggshells, refuel scraps) ring EVERY target circle and re-point the arrow to the
            next remaining item as you eat (tutorial.extras + tutorialStep re-point).
- 01af76b — Compost-poop target is a big ZONE ring (centre 2.5H, _zoneR = H*0.48) that nearly touches
            the tier-1/2 line (2H) and the sump line (3H) — "get in this layer and poop", no aim-dot.
            Refuel beat now stays OPEN (all 4 scraps edible) until the worm DIVES into the compost
            (gate = head y >= 2H), so you can fill up as much as you want before moving on.

Tutorial order (11 beats): lettuce -> watermelon -> overripe fruit (hold til full) -> constipation/relief
poop -> eggshell cure (x2) -> refuel (4 scraps, dive to advance) -> compost-bonus poop (big zone ring) ->
down drain -> cocoon -> up drain -> surface & eat. Activate ?tut=1 (default OFF). NOT yet device-confirmed.

## Session 29 — In-canvas tutorial (the demo intro). Tutorial code in docs/demo-game.js; activation + cache-bust loader in docs/demo.html
- 7e265bf — NPC sleep tunnel fade fix (sleeping NPC tubes now fill in fast like the player's)
- 25100dc — Commit 1: Director skeleton + single move-target clamp hook (tutorialClampTarget); ?leash=1 proof; default OFF
- 302650a — Cache-bust loader: demo.html mirrors page ?v= onto the demo-game.js <script> (busts HTML+JS; mobile Safari has no hard-refresh)
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
- **Confirm ?tut=2 (tutorial-over-live-game, 7ec7a6d) loads clean on device:** lesson items readable in the
  real cluttered pile, eat-gate blocks ambient scraps, HP floor holds on the constipation beat. THEN:
  - Commit B: suppress the weekly Snoo-drain cinematic (triggerSnooDrain, ~line 5311) during the live lesson.
  - Commit C: flip ?tut=1 onto live mode (set tutorial.live when scene is on) and retire the staged scene.
- **Device-confirm the tea re-attach fix (b15c11a):** detached drops should connect to a lower tube, not pool
  or loop. If still wrong, add a tiny temporary on-screen readout of one drop's pathIdx/detach/attach.
- **Device-confirm the geometry halve (58e76e6 + 420a03e):** compost band [2H..2.5H] reads right; gradient
  colour bands line up; worm clamp / drains / cocoon depths all sit correctly in the shallower compost.
- **Tune the constipation/refuel arc on device** (refuel is now 2 scraps, both-eaten gate): overripe-fruit
  hold reaches ~98% gut; 2 eggshells fully clear the green; compost zone ring sits between the layer lines.
- **HUD HP/gut bar bug (REPORTED, NOT DIAGNOSED).** Likely a demo.html DOM/canvas side-panel readout
  that stalled (only a screen-fixed top-left bar exists in demo-game.js).
- **ghostERR: value still needed.** Per-NPC try/catch (81460e4) masks a ghost-worm render crash; the green
  NPCdbg overlay was REMOVED (7814978), so the value now has to come from the browser console.
- ISS-19 (localStorage race) — P1, still open.

## Tooling notes
- Edits: Python with assert content.count(old)==1, then `node --check demo-game.js`. Working copy /tmp/demo-game.js.
- Headless harness pattern (/tmp/harness*.js): first 62 lines of harness.js = browser stubs + load;
  drives updateNPCSims/updatePhysics (NOT loop()/draw()), so pZzz fade and HUD draw are NOT exercised there.
- Push: stage -> summarize -> wait for "Push"/"Push it" -> push --approved. demo.html (~1.5MB) needs
  two-step fetch (Contents API SHA -> raw blob); raw fetch via raw.githubusercontent.com with token works.
