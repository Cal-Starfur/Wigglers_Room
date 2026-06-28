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

## What We Are NOT Pulling In (audit findings)

These exist in `game.js` but the tutorial never touches them. Cut entirely — do not extract.

| System | Reason cut |
|--------|-----------|
| `drawFarmerSnoo()` / `drawSnooCinematic()` / `updateSnoo()` | Snoo cinematic — stub `snooScene = null`, skip draw |
| `drawSnooDrain()` / `updateSnooDrain()` | Drain cinematic — not a tutorial beat |
| `gardenTufts` / `gardenFlowers` / `_buildBladeCanvas()` | Background garden art — zero tutorial dependency |
| `weatherQueue` / `updateWeatherSim()` / `drawWeatherHUD()` | Weather sim — tutorial never reads it |
| `valveOpen` / `drainScene` / `valveDrips[]` | Valve tap cinematic — not a tutorial beat |
| `otherPlayers` / `pendingWorms` | Multiplayer presence — Devvit-only |
| `deathScreen` / `deathFade` / `deathCause` | No death in demo — stub as no-op |
| `drawGenBadge()` / `generation` / `getGenColor()` / `getGenName()` | Generation system — Devvit-only progression |
| `drainBonusPopups` / `weeklyContrib` / `triggerWeeklyDrain()` | Weekly drain economy — Devvit-only |
| `COCOON_KARMA_REQ` / `clitellumReady` / cocoon draw | Cocoon draw is art — T-06 only needs `tryLayCocoon()` to latch `_cocoonDone` |
| `drawQueueHUD()` / `drawConflictOverlay()` / `drawPendingWorms()` | Queue/conflict UI — Devvit-only |
| `snooScene` / `tapReady` / `snooBucketItems` | Feed cinematic — not needed |
| `updateCocoons()` maturity logic | Cocoon maturation is a Devvit/persistence feature |
| `saveSession()` / `loadSession()` / `applyOfflineDrain()` | Persistence — stubbed as no-ops |
| `postToHost()` | Devvit bridge — stubbed as no-op |

**`bugs[]` stays** — declared as `[]`; `spawnTutorialScene()` clears it explicitly so the var must exist.

---

## Stubs (replace all Devvit code with these)

```js
function postToHost(msg) {}
function saveSession() {}
function loadSession() { return null; }
function applyOfflineDrain() {}
var username      = 'You';
var karma         = 0;
var generation    = 0;
var castingEnrichment = 0;
var deathScreen   = false;
var snooScene     = null;
var snooPhase     = 'done';
var drainScene    = false;
var valveOpen     = false;
var otherPlayers  = [];
var pendingWorms  = [];
var drainBonusPopups = [];
var weekStartTs   = 0;
var weeklyContrib = 0;
var tapReady      = false;
```

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
| 8 | Compost zone beacon, poop in tier-2, `_compostPooped` latch |
| 9, 11 | `pPath[]`, `drops[]`, sump hold, `_downDrainDone` / `_upDrainArmed` |
| 10 | `tryLayCocoon()`, `_cocoonDone` latch |
| 13 | Free movement (already present from T-01) |
| 14 | `trySleep()`, `pSleeping`, `viewMode` |
| 15 | `viewCamY`, drag-scroll gesture |

---

## Ticket Backlog

### T-01 — Canvas, Bin, Worm Movement
**Status:** `[ ] TODO`

**Extracts from `game.js`:**
- Lines 1–60: canvas bootstrap, shims, `W/H/camY/camX/centreOffsetX/viewMode/viewCamY/mX/mY/frame`
- Lines 44–60: `getRealDayTime()`, `dayTime`, `TIERS`
- Lines 761–791: `getBin()`, `getTier()`, `cSurf()`, `tSurf()`, `inCompost()`, `compostDepth()`
- Lines 3187–3218: `WORLD_W`, `resizeCanvas()`
- Lines 796–870: `nearestPathIdx()`, `addPoint()` — needed by `initPlayer()`
- Lines 665–696: `pPath[]`, `pLastX/Y`, `MAX_PPATH`, `_pPathBuckets`, bucket helpers
- Lines 727–744: player state vars — `pSleeping`, `pSleepX/Y`, `pSleepCurl`, `pZzz[]`, `pAcid`, `pHP`, `pHunger`, `pSegs[]`, `pHist[]`, `pSR`, `pSEG`, `pEaten`, `pGut`, `pGutMax`, `pPooping`
- Lines 103–160: array vars — `trashChunks[]`, `scraps[]`, `debris[]`, `drops[]`, `bugs[]`, `castings[]`, `tLvl`, `pooled`, `tapReady`, `teaSplashes[]`, `scrapsLevel`, `scrapsEmpty`, `karma`
- Lines 2979–2989: `initPlayer()`
- Lines 3239–3260: `setup()` skeleton — calls `resizeCanvas()`, zeros arrays, calls `initPlayer()`, calls `spawnScraps()` (stubbed empty — T-08 replaces with `spawnTutorialScene()`), calls `loop()`
- Lines 5094–5215: `drawWorm()` — verbatim, includes acid tint + HP pale logic
- Lines 5409–5431: `skyCol()`, `_starPos`
- Lines 5433–8025: `draw()` — **trimmed**: sky, tier bands, bin lid/walls/stand/sump chamber, worm call, minimal HUD (HP + gut bars only). **Skip**: Snoo cinematic, garden/blades, other-player ghosts, drain bonus popups, weather HUD, gen badge, queue HUD, conflict overlay, death screen draw
- Lines 8026–8054: `loop()` — rAF loop, `frame++`, calls `updatePlayer()`, `updatePhysics()`, `draw()`; view-mode camera lerp
- Lines 8299–8327: `_toCanvas()`, mouse steering (`mousemove`, `mousedown`)
- Lines 8480–8530: touch start handler — steering only (poop/sleep/cocoon gestures come in later tickets)

**Stubs declared here:** all items in the Stubs section above.

**Result:** Blank bin renders, worm spawns mid-bin, steers on tap/click, sky + tiers visible. No food yet.

---

### T-02 — Tier-1 Scraps + Eat Logic + Gut System
**Status:** `[ ] TODO`

**Extracts from `game.js`:**
- Lines 70–119: `TRASH_TYPES[]`, `MAX_SCRAPS`, `scrapsPush()`
- Lines 120–137: `debris[]` (already declared T-01), `dropsPush()`
- Lines 1613–1838: `drawDebrisFragment()`
- Lines 2744–2919: `spawnScraps()` — full field spawn (fallback only; tutorial scene overrides in T-08)
- Lines 3563–3714 (eat + chunk-nibble section of `updatePlayer()`): scrap proximity + `pGut` fill + `pHunger` bleed + debris spawn + liq drop spawn + `pAcid` from acid scraps
- Lines 6230–6265: draw tier-1 scraps in `draw()`
- Growth gating: `pSEG` / `pEaten` increment logic

**Result:** Scraps appear, worm eats them, gut bar fills, debris falls.

---

### T-03 — Tier-0 Acid Chunk + Nibble + `pAcid`
**Status:** `[ ] TODO`

**Extracts from `game.js`:**
- Lines 138: `weatherQueue[]` — declared as `[]`; used only for chunk shed scheduling, safe to include minimal
- Lines 871–911: `_prerenderTrashChunk()`, `_invalidateChunkImg()`
- Lines 912–1612: `drawTrashChunk()` — **verbatim, zero edits** (~700 lines of canvas art)
- Lines 6028–6160: draw trash chunks in `draw()` — z-order passes, acid glow, eggshell glow
- Lines 3629–3714: chunk nibble logic in `updatePlayer()` — `hpFrac` reduction, debris spawn, `weatherQueue` push
- Lines 4157–4210: `debris[]` physics in `updatePhysics()` (partial — debris fall + scrap-to-drop conversion)
- `ACID_HP_DRAIN` constant + acid HP bleed in `updatePlayer()`

**Skip:** `updateWeatherSim()`, weather shed firing — declare `weatherQueue = []` and let it accumulate harmlessly (no shed without `updateWeatherSim` running).

**Result:** Overripe fruit chunk in tier-0 pile, worm nibbles it, `pAcid` rises, worm tints green.

---

### T-04 — Poop System + Castings
**Status:** `[ ] TODO`

**Extracts from `game.js`:**
- Lines 8227–8297: `tryPoop()`
- `pPooping`, `pLastPoop`, `POOP_COOLDOWN`, `pLastPoopScore` (already declared T-01)
- Lines 4780–4820: castings physics / moisture pooling in `updatePhysics()`
- Lines 6479–6491: draw castings in `draw()`
- Two-finger tap gesture → `tryPoop()` (add to touch handler)
- Space key → `tryPoop()` (keyboard handler)
- `_reliefPooped` latch: `if (tutorial.scene) tutorial._reliefPooped = true;` inside `tryPoop()`
- `_compostPooped` latch: `if (tutorial.scene) tutorial._compostPooped = true;` inside `tryPoop()` tier-2 branch

**Result:** Two-finger tap / Space poops. Castings deposit. Tutorial poop beats can fire.

---

### T-05 — Drops, pPath Tubes, Sump, Drain Hold
**Status:** `[ ] TODO`

**Extracts from `game.js`:**
- Lines 122–137: `drops[]`, `MAX_DROPS`, `dropsPush()` (declared T-01, fill in `dropsPush` here)
- Lines 4071–4074: `_segConnBuf`, `TUNNEL_DECAY`, `TUNNEL_DECAY_UNCONNECTED`
- Lines 4075–4742: `updatePhysics()` — drop physics, tube alpha decay, sump logic. **Skip**: flood trigger, oversaturation HP pressure, valve drain, weekly drain check
- Lines 4945–4992: `drawPath()`
- Lines 6266–6420: draw sump chamber, tea level, drops, splashes in `draw()`
- Lines 3868–4069: junction/drain hold logic in `updatePlayer()` — `drainDownTimer`, `drainUpTimer`, `_atSump`, `_sumpHadDown`, junction stamp
- `drainDownTimer`, `drainUpTimer`, `drainDownCooldown` vars
- `_downDrainDone` latch: `if (tutorial.scene) tutorial._downDrainDone = true;`
- `_upDrainArmed` latch: `if (tutorial.scene) tutorial._upDrainArmed = true;`

**Re-apply perf fixes here** (were in deleted `demo-game.js`, not in `game.js`):
- `_bucketEntryPool` — GC-churn fix on bucket entry allocation
- `_pPathBucketsDirty` — ensures drops attach to drain correctly
- `pathRegistry` rebuild — prevents unbounded accumulation
- `trashChunks` compaction + `weatherQueue` index remap

**Skip entirely:** `triggerWeeklyDrain()`, `drainBonusPopups`, `valveOpen` tap, flood/oversaturation systems.

**Result:** Worm leaves `pPath` tubes. Drops flow down to sump. Tea level rises. Down/up drain hold beats fire.

---

### T-06 — Cocoon + Sleep + View Mode
**Status:** `[ ] TODO`

**Extracts from `game.js`:**
- Lines 697–705: `cocoons[]`, `COCOON_MAX`, `lastCocoonLaid` (skip `COCOON_KARMA_REQ` — no karma gate in demo)
- Lines 8121–8159: `tryLayCocoon()` — stripped: remove karma check (`karma >= COCOON_KARMA_REQ`), keep geometry + latch
- Lines 727–731: `pSleeping`, `pSleepX/Y`, `pSleepCurl`, `pZzz[]` (declared T-01)
- Lines 8191–8226: `trySleep()`
- Lines 3438–3500: sleeping update in `updatePlayer()` — curl animation, ZZZ particles, view mode seed
- Lines 7391–7435: draw ZZZ particles in `draw()`
- Lines 8536–8612: touch handlers for view drag + tap-to-wake
- Swipe-up gesture → `tryLayCocoon()` (touch handler)
- Press-and-hold / `S` key → `trySleep()`
- `E` key → `tryLayCocoon()`
- `_cocoonDone` latch: `if (tutorial.scene) tutorial._cocoonDone = true;` in `tryLayCocoon()`

**Skip:** cocoon draw / clitellum indicator / `updateCocoons()` maturity — the tutorial only needs the latch to fire. Cocoon art is nice-to-have, add post-launch if desired.

**Result:** Swipe up / E lays cocoon (latch fires). Press-hold / S sleeps worm in compost. Drag scrolls bin. Tutorial cocoon + sleep + viewscroll beats all fire.

---

### T-07 — Tutorial Wire-Up (Integration)
**Status:** `[ ] TODO`

**What this ticket does:**
- Restore `_enterBin()` in `demo.html` to inject `tutorial-module.js` then `demo-game.js` dynamically
- Apply all hooks from `tutorial-module.js` HOOKS MANIFEST into `demo-game.js`:
  - `setup()`: `if (tutorial.scene) { spawnTutorialScene(); } else { spawnScraps(); }`
  - `updatePlayer()` pre-move: `tutorialStep();` + `var _mt = tutorialClampTarget(mX, mY);`
  - `updatePlayer()` sleeping: `tutorialStep();`
  - `updatePlayer()` HP floor: `if (tutorial.active && pHP < 0.08) pHP = 0.08;`
  - Eat logic: `_tutStepNow` gate + scrap-lock + `_refuelTut` latch
  - Down-drain fire: `if (tutorial.scene) tutorial._downDrainDone = true;`
  - Up-drain fire: `if (tutorial.scene) tutorial._upDrainArmed = true;`
  - `updatePhysics()`: `if (tutorial.active) { castingEnrichment = 0; }`
  - `draw()`: `drawTutorialHighlight(); drawTutorialPanel(); drawTutorialDone();`
  - Cocoon-lay: `if (tutorial.scene) tutorial._cocoonDone = true;`
  - Sleep/wake: `if (tutorial.active && tutorial.scene && tutorial.done) { _tutFinish(); return; }`
  - Poop relief: `if (tutorial.scene) tutorial._reliefPooped = true;`
  - Poop compost: `if (tutorial.scene) tutorial._compostPooped = true;`
  - Gesture tap ×2: `if (tutorial.done) { _tutFinish(); return; }`
- Set `tutorial.scene = true` and `tutorial.active = true` as hard defaults in `demo-game.js` init — demo always runs the tutorial, no URL param needed

**Result:** Full tutorial runs end-to-end. Amber ring, panels, leash, eat-gate, completion screen all live.

---

## draw() Call Order (trimmed for demo — preserve sequence from `game.js`)

1. Sky (gradient + stars/sun/moon)
2. Tier bands (tier-0 air, tier-1+compost gradient, pool)
3. Bin interior (lid, walls, handle, vents, stand legs, sump chamber)
4. Trash chunks (z-order passes 5,2,4,1,3,0)
5. Debris fragments
6. Tier-1 scraps
7. Tea level + drops + splashes
8. Castings
9. Path tubes (`drawPath`)
10. Worm (`drawWorm`)
11. ZZZ particles (sleep)
12. HUD — HP bar + gut bar only
13. **Tutorial overlays** — `drawTutorialHighlight()`, `drawTutorialPanel()`, `drawTutorialDone()` ← T-07

**Skipped from `game.js` draw():** garden/blades, Farmer Snoo cinematic, drain cinematic, other-player ghosts, gen badge, queue HUD, conflict overlay, death screen, weather HUD, drain bonus popups, weekly drain toast.

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
- `updatePhysics()` is ~700 lines — extract in T-05, skip flood/valve/weekly-drain sections
- Perf fixes must be re-applied in T-05 (were in deleted `demo-game.js`, absent from `game.js`)
- T-01 through T-06 each result in a working demo at that capability level
- T-07 is the integration ticket — by that point every system the tutorial touches exists
- After every push: lead with cache-busted demo URL `https://cal-starfur.github.io/Wigglers_Room/demo.html?v=SHA`
