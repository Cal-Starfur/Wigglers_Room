# SESSION MANIFEST — Wigglers Room

## HEAD SHA
`f530942` (last push — T-09 ticket added to DEMO_BUILD_PLAN.md)

## Active Work
- `wigglers-demo-t07.html` — self-contained single-file demo, **local only, not yet pushed to repo**
- `docs/demo.html` — shell only, not yet wired
- `docs/demo-game.js` — does not exist in repo yet

## Current Demo State (`wigglers-demo-t07.html`)

### Ticket Status
- T-00 Demo Death Screen: ✅ DONE
- T-01 Canvas, Bin, Worm Movement: ✅ DONE
- T-02 Tier-1 Scraps + Eat + Gut: ✅ DONE
- T-03 Acid Chunk + Nibble + pAcid: ✅ DONE
- T-04 Poop + Castings: ✅ DONE
- T-05 Drops + pPath Tubes + Drain: ✅ DONE
- T-06 Cocoon + Sleep + View Mode: ✅ DONE
- T-07 Tutorial Wire-Up: ✅ DONE — **all tickets complete, demo is feature-complete locally**

### What's working
- Full bin render: sky, tiers, lid (now tracks pile top, see below), walls, stand legs, sump chamber
- Worm steers to mouse/touch with smooth camera follow (X + Y)
- Worm spawns as a collapsed point and unfurls into its body on first steering input (eyes suppressed until real body extent exists)
- Tunnel carving in compost, drawPath renders tunnels
- Tier-0 trash chunk pile, nibble → debris → tier-1 scraps
- Eat tier-1 scraps, gut/hunger/acid/HP system, HP + gut HUD bars
- Poop drops + castings physics, sump drain fills tLvl, tea render
- Junction detection + drain charge timers, now with a visible progress ring (ported from `game.js`, was previously silent)
- Karma HUD (top-left) + real-time clock HUD (top-center), ported from `game.js`. Karma was a dead variable until this session — wired up actual accrual matching `game.js`'s amounts at every eat/nibble/junction/drain/poop action
- Tea drops are now blocked by the compost border unless a carved tunnel actually reaches the sump — pool locally bucket-by-bucket into a visible gradient puddle instead of seeping through on their own (T-09 in the build plan covers building a real drain for this standing pool)
- Worm fades out of visibility per-segment as it goes deep into compost, tunnels fade to match — see "Worm fade / tunnel-match visual system" below
- Cocoon system fully visible: lemon-shaped sac render, clitellum readiness band on the worm body, fading feedback message — all ported from `game.js`, adapted to drop the karma/maturity/multiplayer parts the demo doesn't have
- Sleep + view-scroll: drag-to-scroll while asleep now actually moves the camera (was silently broken — see Bugs Fixed)
- Death screen: "Your worm didn't make it." + Try Again
- Worm color: `#e88aaa` (dusty rose-pink) — **note:** an earlier session note called for `#ff4d8f` hot pink; that was tried and explicitly reverted this session, `#e88aaa` is correct, please disregard the old note
- **Tutorial fully wired and tutorial-native** — runs by default (`tutorial.scene = true; tutorial.active = true; tutorial.live = true;`), no `?tut=` param needed. Built on the REAL field (full trash pile + ambient scraps), not a stripped scene
- **Procedural curriculum** — every tutorial scrap (except eggshell, see below) and the acid pile chunk pick randomly from type pools each spawn, with small position jitter. Panel titles read dynamically off whichever type got picked
- **Desktop input added** — `E` lays a cocoon, `S` sleeps/wakes, alongside the existing `Space` for poop and the touch gestures

### Compost + Tier-1 depth both cut to 1/3 (this session)
- Compost (tier 2) cut from a full `H` tall to `H/3`
- Tier 1 (the "active worm layer") also cut to `H/3`
- Sump kept its own `H*0.25` margin unchanged in absolute size — just relocated to sit under the now-shorter layers
- New boundary functions: `tier1Bot()` (tier1/compost boundary) and `cSurf()` (compost/sump boundary, now derives from `tier1Bot()` instead of a literal `2*H`)
- Total bin depth is down ~41% from original; camera scroll range correspondingly shorter
- This required touching every place that hardcoded `2*H`/`3*H` as a boundary (tier classification, camera clamps, drain detection, cocoon depth gate, tutorial beacon positions) **and** every place that assumed tier1's height equaled a flat `H` (all 8 tutorial food Y-positions, `spawnScraps()`'s ambient tier-1 scrap count/placement, the worm's default spawn Y, the lid's pile-tracking math) — see `DEMO_DELTA.md` for the full list

### Bugs fixed this session
- Tutorial panel was off-center on mobile — was being drawn in screen space but using a formula meant for world-translated space (`camX`-dependent offset with no corresponding transform active)
- Two-finger poop-charge gesture was dragging the steering point — `touchmove` updated `mX`/`mY` from `touches[0]` regardless of finger count, so a second finger landing (which shifts the first finger slightly) yanked the worm
- Eggshell chunk glow had no off-screen culling (acid glow did) — was running two full ellipse-stroke draws per eggshell chunk per frame regardless of visibility; likely the main lag source once the full live field came back
- Acid + eggshell chunk glow simplified from per-shape bezier-traced outlines (drawn twice each, once per glow pass) to a single-arc two-stroke ring — same lightweight pattern as the tutorial highlight ring
- Cocoon system was completely invisible — `cocoons[]` populated and the latch fired correctly, but nothing in `draw()` ever rendered the cocoon shape, the clitellum band, or the feedback message (`window._cocoonMsg` was being set but never drawn)
- Cocoon depth gate (`tryLayCocoon()`) was hardcoded to `head.y < 2.7*H`, assuming compost was a full `H` tall — after the compost depth cut this became unreachable (past where the worm's own clamp allows), permanently blocking cocoon-laying. Fixed to scale off the actual compost height
- Long-press-to-sleep drift-cancellation compared world-space `mX` against screen-space `lpStartX`, causing near-instant false cancellation whenever the camera had scrolled (`camX != 0`, i.e. most of the time on a narrow mobile screen once the worm moves off-center)
- Swipe-up-to-cocoon thresholds loosened (400ms→600ms window, 60px→90px horizontal tolerance) for more reliable real-device triggering
- Sleep view-scroll drag updated `viewCamY` correctly and the tutorial's completion check read it correctly, but nothing ever applied `viewCamY` to the actual rendering `camY` — dragging while asleep had zero visual effect. Now `camY` follows `viewCamY` (clamped to the normal scroll range) while in view-scroll mode
- Combined tier-1+compost dirt gradient used hardcoded color-stop fractions (`0.444`, `0.889`) tuned for the old tier proportions — after the depth cuts, tier 1 occupies a different fraction of that visual band, so the dirt visually turned "compost-dark" in the wrong spot relative to where `getTier()` actually flips. Now computed dynamically from the real tier boundaries
- Duplicate `scrapsPush()`/`trashChunks`/`scraps`/`MAX_SCRAPS` declarations (leftover from the original extraction) consolidated to one shared definition
- Drain charge progress ring and clitellum readiness band were both silently never rendering — gated behind a worm-visibility check that's guaranteed false at the exact depths those elements activate (drain charging happens at near-max compost depth, clitellum gates at 70% depth — both past where the worm's own fade completes at 25%). Ungated both since they're gameplay feedback, not part of the worm's body
- Tea-pooling "is there a tunnel here" check accepted any nearby carved point, including incidental carve marks left by the worm just passing through compost for unrelated reasons (sleeping, pooping, laying a cocoon). None of those lead anywhere, but the check didn't verify that — tea was bypassing the pool almost as soon as compost had been touched at all. Now requires the candidate's carved segment to actually reach the sump (a `sumpExit` stamp or a point near `cSurf()`) before counting as a real tunnel
- Compost tunnels visually poked out above the actual compost border — a round line-cap artifact on the topmost tunnel point, not a data issue (`addPoint()` already rejects anything above the border). Fixed with a hard clip at the border line rather than changing cap style everywhere
- Digestion-based HP regen was real but running on `game.js`'s multi-day persistent-bin pacing (5 minutes for a full gut to digest) — practically invisible within a short demo session. Sped up ~15x (full gut now digests in ~20s), same total regen amount per gut digested, just compressed into a visible window

### Worm fade / tunnel-match visual system (new this session)
- Worm now fades out **per-segment** based on each point's own depth as it crosses into compost (gradient-stroke technique, not a single whole-body alpha) — head leads the disappearance going down, leads the reappearance coming back up, matching each segment's actual position
- Compost tunnels fade from the original two-tone look to flat dark using the *same* depth zone as the worm's fade, so both effects read as one consistent "going underground" system
- Tea puddle visual reworked twice: first replaced the flat fill with a gradient (glossy top → soil-blend base) using a single shared gradient across all puddles; then fixed it to scale **per-puddle** to that puddle's own actual height, since the shared fixed-range version made small young puddles only sample an almost-invisible sliver near the bottom of a much taller range

### ⚠ Needs re-verification next session
- The "Constipation" tutorial card was triggering with inaccurate text when the previous beat (turning green from acid) completed before the gut was actually full. Fix: split the old single `acidfull` beat into two — `acidfull` (turn green, unchanged) and a new `gutfull` (keep eating the acid chunk until genuinely constipated) — so the Constipation card is now gated on real gut fullness, not just acid level. **This edit was flagged by Sir immediately after ("you are looking at the old game file") but we did not get clarification before session wrap — verify this change is actually correct/wanted before building further on top of it.**

### Known missing
- None blocking — `trySleep()`, `tryLayCocoon()`, `triggerSnoo()`, `triggerDrainTap()`, `closeDrainTap()` are all implemented (the last two remain no-op stubs by design, no valve mechanic in the demo)

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
| `DEMO_DELTA.md` | repo root | ✅ Updated this session |
| `DEMO_BUILD_PLAN.md` | `docs/DEMO_BUILD_PLAN.md` | ✅ In repo, all tickets marked DONE this session |
| `wigglers-demo-t07.html` | local / Claude outputs | ⚠ Local only — supersedes the old t05 reference, not yet pushed |
| `game.js` | `docs/game.js` @ SHA `84343c0` | ✅ Read-only source |
| `tutorial-module.js` | `docs/tutorial-module.js` | ✅ In repo — **stale**: the local t07 build folded this fully into native locations rather than keeping it as a separate module; repo copy still reflects the old standalone-module shape |
| `demo.html` | `docs/demo.html` | ✅ In repo (shell only, not yet wired to t07) |

## Next Session Start
0. **Re-verify the `acidfull`/`gutfull` split** (see "Needs re-verification" above) — Sir flagged it immediately after the edit and we wrapped before getting clarification on what was wrong
1. Bootstrap github-sync + set token
2. Decide: push `wigglers-demo-t07.html` to repo as `docs/demo-game.js` + wire `demo.html`'s `_enterBin()` to load it with `?v=` cache-bust
3. If pushing: `docs/tutorial-module.js` is now redundant (its contents are folded directly into the t07 demo file) — decide whether to delete it or leave as historical reference
4. Live-test on an actual mobile device — this session's fixes (gesture handling, depth cuts, cocoon system, view-scroll, worm-fade, tea pooling) have not been tested outside of static code/math verification
5. Production port candidates worth a look: the long-press coordinate-space bug and the "tracked variable never applied to camera" pattern (view-scroll) may exist in `game.js` too — worth checking
6. T-09 (Tea Drain System) is ready to build whenever — design fully captured in `docs/DEMO_BUILD_PLAN.md`
7. Update `DEMO_DELTA.md` with any new divergences before updating this manifest

## PAT Note
Token set this session — rotate if needed (GitHub → Settings → Developer settings)
