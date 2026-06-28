# SESSION MANIFEST — Wigglers Room

## HEAD SHA
`dc01e42` (last push this session — DEMO_BUILD_PLAN.md)

## Active Work
- `docs/DEMO_BUILD_PLAN.md` — 8-ticket extraction plan for demo-game.js, skills baked into every ticket
- `docs/demo-game.js` — **DOES NOT EXIST YET in repo** — built locally only (see below)
- `docs/demo.html` — shell only, `_enterBin()` not yet wired to inject demo-game.js

## Local Build State (not yet pushed)
T-01 + T-00 artifact built and iterated locally as `wigglers-demo-t01.html` (self-contained single file).

**What's working in the local artifact:**
- Canvas bootstrap, bin geometry, sky, tier bands, sump chamber
- Bin lid, walls, stand legs (verbatim from game.js)
- `drawWorm()` — verbatim extract, worm steers to mouse/touch
- `drawPath()` — verbatim extract, tunnels render in compost
- Tunnel carving — `addPoint()` fires in compost tier, pPath builds correctly
- Camera follow — Y + X axes, 0.04 lerp rate, matches game.js exactly
- Cursor dot — white dot at mouse/touch position (screen space)
- T-00 death screen — "Your worm didn't make it." overlay + Try Again button
- Demo worm color: `#ff4d8f` (hot pink, tutorial-specific, intentional deviation from game.js)
- Gen colors stubbed to fixed pink (real palette in getGenName/getGenColor stubs)

**Known issues / not yet done:**
- Worm spawns at H*1.4 (tier 1 soil) — compost is ~20s of downward steering away
  → This is correct game.js behavior; tutorial will spawn worm at correct depth via spawnTutorialScene()
- `demo-game.js` not yet split out as separate file in repo
- `demo.html` _enterBin() not yet wired
- T-02 through T-07 not started

## Bugs Found & Fixed This Session
- `draw()` skip ranges cut through open brace blocks — fixed by auditing each skip range's brace delta
- `getLowestScrapY()` stub returned `H*2` → capped worm movement to top tier — fixed to `H*0.5`
- Camera follow missing `camX` update — added verbatim from game.js (lines 4042–4064)
- Camera lerp rate was 0.08 → corrected to 0.04
- Cursor dot was in skip range 6826–7123 — re-added in screen space after ctx.restore()
- Cursor dot screen coords had double centreOffsetX — fixed to `mX - camX`
- `updatePlayer` sections had mismatched brace counts (sleeping +1, seg hist -1) — corrected ranges
- valve tap skip range (6722–6768) had delta=-1 closing outer legs block — fixed to 6722–6763
- `function draw()` duplicated in output — fixed by starting paste from line 5435 not 5434
- `updatePlayer` was declared inside `draw()` — root cause: draw() brace delta was off by 1

## Ticket Status
- T-00 Demo Death Screen: ✅ DONE (in artifact)
- T-01 Canvas, Bin, Worm Movement: ✅ DONE (in artifact, not yet pushed as separate file)
- T-02 Tier-1 Scraps + Eat + Gut: [ ] TODO
- T-03 Acid Chunk + Nibble + pAcid: [ ] TODO
- T-04 Poop + Castings: [ ] TODO
- T-05 Drops + pPath Tubes + Drain: [ ] TODO
- T-06 Cocoon + Sleep + View Mode: [ ] TODO
- T-07 Tutorial Wire-Up: [ ] TODO

## Next Session Start
1. Bootstrap github-sync scripts + set token
2. Decide: push T-01 as `docs/demo-game.js` + wire `demo.html` _enterBin(), OR continue iterating locally
3. Start T-02 — Tier-1 Scraps + Eat Logic + Gut System

## Key Files
| File | Location | Status |
|------|----------|--------|
| `DEMO_BUILD_PLAN.md` | `docs/DEMO_BUILD_PLAN.md` | ✅ In repo |
| `demo-game.js` | `/tmp/demo-build/demo-game.js` + artifact | ⚠ Local only |
| `wigglers-demo-t01.html` | outputs (self-contained artifact) | ⚠ Local only |
| `game.js` | `docs/game.js` | ✅ Read-only source |
| `tutorial-module.js` | `docs/tutorial-module.js` | ✅ In repo |

## PAT Note
GitHub PAT used this session — rotate if needed (GitHub → Settings → Developer settings)
