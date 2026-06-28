# Demo Build Plan — `demo-game.js`
> **Branch:** `main` | **File:** `docs/demo-game.js` (to be created)
> **Philosophy:** The demo IS the tutorial. Every system extracted verbatim from `game.js` — no rewrites, no fresh art. Tutorial curriculum is baked in from T-08 onward, not layered on top.

---

## Architecture Principles

- `demo-game.js` is built by **extracting chunks from `game.js`**, not rewriting them
- Art, colors, worm, bin, draw functions — **all verbatim copies** from `game.js`
- No Devvit code: no `postToHost`, no `localStorage`, no `saveSession/loadSession`, no `deathScreen`
- Those are replaced with **lightweight stubs** (empty functions or no-ops)
- `tutorial-module.js` is loaded separately via `<script>` in `demo.html` before `demo-game.js`
- `spawnTutorialScene()` replaces `spawnScraps()` in `setup()` — the tutorial scene IS the field
- Each ticket is **one push**, demo must be playable (or at minimum loadable) after every push
- All tickets are **default-ON** in the demo (no URL params needed for tutorial) except perf/debug flags

---

## Tutorial Curriculum Reference

Steps built by `spawnTutorialScene()` in `tutorial-module.js`:

| # | Kind | Target | What the player does |
|---|------|--------|----------------------|
| 1 | `eat` | `_starter` (lettuce, close) | First bite — worm spawns mid-bin |
| 2 | `eat` | `_lettuce` | Eat to grow |
| 3 | `eat` | `_melon` (watermelon) | Juicy scrap drips into tea |
| 4 | `acidfull` | `_ac` (overripe_fruit chunk) | Nibble until gut is stuffed + acid rises |
| 5 | `pooprelief` | null | Two-finger tap to poop — relieve constipation |
| 6 | `cure` | `_egg1` + `_egg2` | Eat eggshell until green fades |
| 7 | `refuel` | `_refuel` + `_refuel2` | Eat both scraps to refuel HP |
| 8 | `poop` | `_poopSpot` (zone beacon) | Dive to compost tier 2, poop for bonus |
| 9 | `downdrain` | `_downSpot` (sump beacon) | Hold at sump floor — down drain fires |
| 10 | `cocoon` | `_cocoonSpot` (sump beacon) | Swipe up / E to lay cocoon |
| 11 | `updrain` | `_upSpot` (sump beacon) | Hold on dot — up drain arms |
| 12 | `eat` | `_surface` (bread_crust) | Climb up and eat to refuel |
| 13 | `freeplay` | null | 90s free exploration |
| 14 | `sleep` | `_sleepSpot` (zone beacon) | Hold / S to sleep in compost |
| 15 | `viewscroll` | null | Drag to scroll while sleeping |

---

## Systems the Tutorial Needs (by step)

| Steps | System Required |
|-------|----------------|
| 1–3, 6–7, 12 | Tier-1 scraps (`scraps[]`), eat logic, gut fill, `scrapsPush()` |
| 4 | Tier-0 trash chunk (`trashChunks[]`), nibble, `pAcid`, worm tints green |
| 5 | `tryPoop()`, `castings[]`, `_reliefPooped` latch |
| 8 | Compost zone beacon, `poop` in tier-2, `_compostPooped` latch |
| 9, 11 | `pPath[]`, `drops[]`, sump hold, `_downDrainDone` / `_upDrainArmed` |
| 10 | `tryLayCocoon()`, `_cocoonDone` latch |
| 13 | Free movement (already present) |
| 14 | `trySleep()`, `pSleeping`, `viewMode` |
| 15 | `viewCamY`, drag-scroll gesture |

---

## Ticket Backlog

### T-01 — Canvas, Bin, Worm Movement
**Status:** `[ ] TODO`
**Extracts from `game.js`:**
- Lines 1–60: canvas bootstrap, shims, `W/H/camY/camX/viewMode/mX/mY/frame`, `getRealDayTime()`
- Lines 761–791: `getBin()`, `getTier()`, `cSurf()`, `tSurf()`, `inCompost()`, `compostDepth()`
- Lines 3187–3237: `WORLD_W`, `resizeCanvas()`, `_buildBladeCanvas()`
- Lines 2979–2989: `initPlayer()`
- Lines 3239–3260: `setup()` skeleton (no `loadSession`, stubs for Devvit calls)
- Lines 5094–5215: `drawWorm()`
- Lines 5217–5365: `drawSnoo()` (avatar above worm head)
- Lines 5409–5431: `skyCol()`, `_starPos`
- Lines 5433–5630: `draw()` — sky, garden, bin lid, walls, stand legs, sump chamber, worm call
- Lines 8026–8054: `loop()` skeleton
- Lines 8299–8327: mouse/touch steering (`_toCanvas`, `mousemove`, `mousedown`)
- Lines 8480–8700: touch gesture handlers (steering only — poop/sleep/cocoon come later)
- **Stubs:** `saveSession(){}`, `loadSession(){return null;}`, `postToHost(){}`, `spawnScraps(){}` (empty — tutorial replaces it in T-08)
- **Result:** Blank bin, worm spawns mid-bin, steers on tap/click, sky renders. No food yet.

---

### T-02 — Tier-1 Scraps + Eat Logic + Gut System
**Status:** `[ ] TODO`
**Extracts from `game.js`:**
- Lines 70–119: `TRASH_TYPES[]`, `scraps[]`, `MAX_SCRAPS`, `scrapsPush()`
- Lines 120–137: `debris[]`, `dropsPush()`
- Lines 2744–2919: `spawnScraps()` — full field spawn (used as fallback; tutorial replaces with `spawnTutorialScene()`)
- Lines 1613–1838: `drawDebrisFragment()`
- Lines 6230–6265: draw scraps (tier-1 fragments) in `draw()`
- Lines 3563–3830 (eat section of `updatePlayer()`): scrap proximity, `pGut` fill, `pHunger`, debris spawn, liq drops
- `pGut`, `pGutMax`, `pHunger`, `pEaten`, `pPooping`, `pSEG`, growth gating
- **Result:** Scraps appear in bin, worm eats them, gut bar fills.

---

### T-03 — Tier-0 Acid Chunk + Nibble + `pAcid`
**Status:** `[ ] TODO`
**Extracts from `game.js`:**
- Lines 103–107: `trashChunks[]`
- Lines 138: `weatherQueue[]`
- Lines 871–911: `_prerenderTrashChunk()`, `_invalidateChunkImg()`
- Lines 912–1612: `drawTrashChunk()` — full verbatim (900 lines of canvas art, do not touch)
- Lines 6028–6160: draw trash chunks in `draw()` (z-order passes, acid glow, eggshell glow)
- Lines 3629–3714: chunk nibble logic in `updatePlayer()` — HP damage, `hpFrac`, `debris` spawn, `weatherQueue` push
- `pAcid`, `ACID_HP_DRAIN`, acid tint in `drawWorm()` (already extracted in T-01)
- Lines 4157–4210: `debris[]` physics in `updatePhysics()`
- **Result:** Overripe fruit chunk appears in tier-0 pile, worm nibbles it, `pAcid` rises, worm tints green.

---

### T-04 — Poop System + Castings
**Status:** `[ ] TODO`
**Extracts from `game.js`:**
- Lines 8227–8297: `tryPoop()`
- Lines 143: `castings[]`
- `pPooping`, `pLastPoop`, `POOP_COOLDOWN`, `pLastPoopScore`
- Lines 4780–4820: castings physics / moisture in `updatePhysics()`
- Lines 6479–6491: draw castings in `draw()`
- Two-finger tap gesture hook → `tryPoop()` (from touch handler)
- Space key → `tryPoop()` (keyboard handler)
- `_reliefPooped` latch: `if (tutorial.scene) tutorial._reliefPooped = true;` in poop logic
- `_compostPooped` latch: `if (tutorial.scene) tutorial._compostPooped = true;` in poop logic (tier-2 check)
- **Result:** Two-finger tap / Space poops. Castings deposit. Tutorial poop beats can fire.

---

### T-05 — Drops, pPath Tubes, Sump, Drain System
**Status:** `[ ] TODO`
**Extracts from `game.js`:**
- Lines 122–137: `drops[]`, `MAX_DROPS`, `dropsPush()`
- Lines 665–696: `pPath[]`, `pLastX/Y`, `MAX_PPATH`, `_pPathBuckets`, `_pPathBucketKey/Insert/Rebuild()`
- Lines 796–870: `nearestPathIdx()`, `addPoint()`
- Lines 4071–4074: `_segConnBuf`, `TUNNEL_DECAY` constants
- Lines 4075–4742: `updatePhysics()` — full drop physics, tube decay, sump logic, flood basics
- Lines 4945–4992: `drawPath()`
- Lines 6266–6420: draw sump chamber, tea level, drops, splashes in `draw()`
- Lines 3868–4069: junction/drain hold logic in `updatePlayer()` — `drainDownTimer`, `drainUpTimer`, `_atSump`, `_sumpHadDown`, junction stamp
- `drainDownTimer`, `drainUpTimer`, `drainDownCooldown`, `valveDrips[]`, `teaSplashes[]`, `tLvl`, `pooled`
- `_downDrainDone` latch: `if (tutorial.scene) tutorial._downDrainDone = true;`
- `_upDrainArmed` latch: `if (tutorial.scene) tutorial._upDrainArmed = true;`
- **Stub/skip:** `triggerWeeklyDrain()`, `drainBonusPopups`, `valveOpen` tap — not needed for tutorial
- **Result:** Worm leaves pPath tubes. Drops flow. Sump fills. Down/up drain beats can fire.

---

### T-06 — Cocoon System
**Status:** `[ ] TODO`
**Extracts from `game.js`:**
- Lines 697–705: `cocoons[]`, `COCOON_KARMA_REQ`, `COCOON_MAX`, `lastCocoonLaid`, `clitellumReady`
- Lines 8121–8159: `tryLayCocoon()`
- Lines 6933–6989: draw cocoons in `draw()`
- Lines 7089–7122: clitellum indicator draw in `draw()`
- Swipe-up gesture hook → `tryLayCocoon()` (from touch handler)
- `E` key → `tryLayCocoon()` (keyboard handler)
- `_cocoonDone` latch: `if (tutorial.scene) tutorial._cocoonDone = true;`
- **Karma stub:** `karma` var exists but no persistence — just a number that increments
- **Result:** Swipe up / E lays cocoon in deep compost. Tutorial cocoon beat fires.

---

### T-07 — Sleep + View Mode + Drag Scroll
**Status:** `[ ] TODO`
**Extracts from `game.js`:**
- Lines 727–731: `pSleeping`, `pSleepX/Y`, `pSleepCurl`, `pZzz[]`
- Lines 8191–8226: `trySleep()`
- Lines 3438–3500: sleeping update in `updatePlayer()` — curl animation, ZZZ particles, view mode seed
- Lines 7391–7435: draw ZZZ particles in `draw()`
- Lines 8026–8054: `loop()` view mode camera lerp (already in T-01 skeleton, fill in now)
- Lines 8536–8560: touch handlers for view drag, tap-to-wake
- `viewMode`, `viewCamY`, press-and-hold / `S` key → `trySleep()`
- `_viewStartY` latch for `viewscroll` beat (in `_tutStepDone`)
- **Result:** Press-hold / S sleeps worm in compost. Drag scrolls the bin. Tutorial sleep + viewscroll beats fire.

---

### T-08 — Tutorial Wire-Up (Integration)
**Status:** `[ ] TODO`
**What this ticket does:**
- `demo.html` already loads `tutorial-module.js` before `demo-game.js` (wire in `_enterBin`)
- Apply all 13 HOOKS MANIFEST hooks into `demo-game.js`:
  - `setup()`: `if (tutorial.scene) { spawnTutorialScene(); } else { spawnScraps(); }`
  - `updatePlayer()` pre-move: `tutorialStep();` + leash clamp via `tutorialClampTarget()`
  - `updatePlayer()` sleeping: `tutorialStep();`
  - `updatePlayer()` HP floor: `if (tutorial.active && pHP < 0.08) pHP = 0.08;`
  - Eat logic: scrap-lock gate + `_tutStepNow` + `_refuelTut` latch
  - Down-drain fire: `tutorial._downDrainDone = true`
  - Up-drain fire: `tutorial._upDrainArmed = true`
  - `updatePhysics()`: `if (tutorial.active) { castingEnrichment = 0; }`
  - `draw()`: `drawTutorialHighlight(); drawTutorialPanel(); drawTutorialDone();`
  - Cocoon-lay: `tutorial._cocoonDone = true`
  - Sleep/wake: tutorial done → `_tutFinish()`
  - Poop relief: `tutorial._reliefPooped = true`
  - Poop compost: `tutorial._compostPooped = true`
  - Gesture tap (x2): `if (tutorial.done) { _tutFinish(); return; }`
- Set `tutorial.scene = true` and `tutorial.active = true` as **defaults** in `demo-game.js` init (not URL-param gated — the demo always runs the tutorial)
- **Result:** Full tutorial runs end-to-end. Pulsing amber ring, panels, leash, eat-gate, completion screen all live.

---

## Stubs (Devvit code replaced in demo)

```js
function postToHost(msg) {}          // no-op
function saveSession() {}            // no-op
function loadSession() { return null; }  // always fresh start
var username = 'You';                // no Reddit auth
var karma = 0;                       // local only, no persistence
var generation = 0;                  // local only
var castingEnrichment = 0;           // no enrichment accumulation in tutorial
```

---

## draw() Call Order (from `game.js` — preserve exactly)

1. Sky (gradient + stars/sun/moon)
2. Background ground + garden tufts + flowers
3. Farmer Snoo cinematic (skip in demo — stub `snooScene = null`)
4. Tier bands (tier 0 air, tier 1+compost gradient, pool)
5. Bin interior (lid, walls, handle, vents, stand legs)
6. Trash chunks (z-order passes 5,2,4,1,3,0)
7. Debris fragments
8. Tier-1 scraps
9. Sump chamber + tea level + drops + splashes
10. Castings
11. Path tubes (`drawPath`)
12. Worm (`drawWorm`)
13. Snoo avatar above head (`drawSnoo`)
14. HUD (HP bar, gut bar) — minimal in demo
15. **Tutorial overlays** — `drawTutorialHighlight()`, `drawTutorialPanel()`, `drawTutorialDone()` ← T-08

---

## Files

| File | Role |
|------|------|
| `docs/demo.html` | Shell — loads `tutorial-module.js` then `demo-game.js` on Enter Bin click |
| `docs/demo-game.js` | The demo game — extracted from `game.js`, tutorial-native |
| `docs/tutorial-module.js` | Tutorial state, step machine, draw functions, `spawnTutorialScene()` |
| `docs/game.js` | Production file — **read-only source**, ISS-19 freeze, do not touch |

---

## Session Notes

- `game.js` HEAD SHA at plan creation: `84343c0680375386ebf2c4842980f2061c71af2c`
- `drawTrashChunk()` is ~700 lines of canvas art — extract verbatim, zero edits
- `updatePhysics()` is ~700 lines — extract in T-05, remove flood/valve/weekly-drain sections not needed for tutorial
- All perf fixes (`_bucketEntryPool`, `pathRegistry`, `_pPathBucketsDirty`, alpha quantization) were in the deleted `demo-game.js` — **re-apply in T-05** when `pPath` and drops are wired
- After every push: lead with cache-busted demo URL `https://cal-starfur.github.io/Wigglers_Room/demo.html?v=SHA`
