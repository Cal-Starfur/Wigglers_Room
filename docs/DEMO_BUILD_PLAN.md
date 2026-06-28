# Demo Build Plan — `demo-game.js`
> **Branch:** `main` | **File:** `docs/demo-game.js` (to be created)
> **Philosophy:** The demo IS the tutorial. Every system extracted verbatim from `game.js` — no rewrites, no fresh art. Tutorial curriculum is baked in from T-07 onward, not layered on top.

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

## Skills — Every Ticket

Load these at the start of **every** ticket session, in this order:

**1. session-health** — verify HEAD SHA, catch out-of-band commits before patching
```python
python3 << 'START'
import urllib.request, json, base64
TOKEN = "YOUR_PAT"
headers = {"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github.v3+json", "User-Agent": "WR/1.0"}
url = "https://api.github.com/repos/Cal-Starfur/Wigglers_Room/git/refs/heads/main"
req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as r:
    data = json.loads(r.read())
print("HEAD SHA:", data["object"]["sha"])
START
```

**2. github-sync** — bootstrap push scripts (needed before any stage/push)
```python
python3 << 'BOOTSTRAP'
import urllib.request, json, base64
from pathlib import Path
TOKEN = "YOUR_PAT"
headers = {"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github.v3+json", "User-Agent": "GHSync/1.0"}
base = "https://api.github.com/repos/Cal-Starfur/claude-skills/contents/skills/github-sync/scripts"
scripts = {
    "tools/github_client.py": "github_client.py",
    "scripts/propose_commit.py": "propose_commit.py",
    "scripts/sync_from_github.py": "sync_from_github.py",
}
for local_path, remote_name in scripts.items():
    url = f"{base}/{remote_name}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
        code = base64.b64decode(data["content"]).decode("utf-8")
    target = Path(f"/tmp/github-sync/{local_path}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(code)
    print(f"✓ {local_path}")
import json as j
Path('/tmp/github-sync/memory').mkdir(parents=True, exist_ok=True)
Path('/tmp/github-sync/memory/github_config.json').write_text(j.dumps({
    'token': TOKEN, 'owner': 'Cal-Starfur', 'repo': 'Wigglers_Room', 'branch': 'main'
}, indent=2))
print('✓ Token set')
BOOTSTRAP
```

**3. contractor** — mindset for every ticket: one system, surgical extract, nothing extra
> Loaded from `/mnt/skills/user/contractor/SKILL.md`

**4. session-summary** — run after the final push of each ticket session
> Loaded from `Cal-Starfur/claude-skills/skills/session-summary/SKILL.md`
> Trigger: after last push, ask "want a summary?" — generates plain-English wrap with next ticket callout

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
| `deathScreen` / `deathFade` / `deathCause` | Replaced by demo death screen (T-00) |
| `drawGenBadge()` / `generation` / `getGenColor()` / `getGenName()` | Generation system — Devvit-only |
| `drainBonusPopups` / `weeklyContrib` / `triggerWeeklyDrain()` | Weekly drain economy — Devvit-only |
| `COCOON_KARMA_REQ` / `clitellumReady` / cocoon draw | Tutorial only needs `tryLayCocoon()` latch |
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
var username          = 'You';
var karma             = 0;
var generation        = 0;
var castingEnrichment = 0;
var deathScreen       = false;
var snooScene         = null;
var snooPhase         = 'done';
var drainScene        = false;
var valveOpen         = false;
var otherPlayers      = [];
var pendingWorms      = [];
var drainBonusPopups  = [];
var weekStartTs       = 0;
var weeklyContrib     = 0;
var tapReady          = false;
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

---

### T-00 — Demo Death Screen
**Status:** `[x] DONE — in local artifact, not yet pushed`
**Skills:** every-ticket skills above only

**What it is:** A demo-specific death overlay — not the Devvit death/respawn system. When `pHP <= 0` the game pauses and shows a canvas-drawn card encouraging the player to try again. The only path to the end screen is finishing the tutorial.

**Death detection — in `demo-game.js` `updatePlayer()`:**
```js
if (pHP <= 0 && !_demoDead) {
  _demoDead = true;
  _demoDeadFade = 0;
}
```
`_demoDead` is a demo-only flag. When true: `updatePlayer()` and `updatePhysics()` skip all logic — world freezes. `draw()` still runs so the frozen bin is visible behind the overlay.

**Death screen draw — in `draw()`, screen-space, after HUD:**
- Full-viewport dark overlay (same `--preview-bg` bg + `rgba(8,4,1,0.88)` tint as intro/end screens)
- Title in Fredoka One with amber gradient: **"Your worm didn't make it."**
- Body copy (`--text` color):
  - `"The bin is unforgiving at first."`
  - `"Every worm gets better with practice."`
- Amber-bordered restart button: **"Try Again"** → calls `_restartDemo()` (reload)
- Fade-in driven by `_demoDeadFade` (0→1 over ~40 frames)

**`_demoDeadFade` increment — in `loop()` before `draw()`:**
```js
if (_demoDead && _demoDeadFade < 1) _demoDeadFade = Math.min(1, _demoDeadFade + 0.025);
```

**Tap/click on restart button — in mouse + touch handlers:**
```js
if (_demoDead) { /* hit-test Try Again rect → _restartDemo() */ }
```

**Gate on end screen** — `showDemoEnd()` only fires from `_tutFinish()`. Death never calls it.

**New vars at top of `demo-game.js`:**
```js
var _demoDead     = false;
var _demoDeadFade = 0;
var _demoDeadBtn  = null; // {x,y,w,h} set each frame death screen draws, used for hit-test
```

**Result:** Die → frozen bin + "Your worm didn't make it." overlay + Try Again. Finish tutorial → end screen only.

---

### T-01 — Canvas, Bin, Worm Movement
**Status:** `[x] DONE — in local artifact, not yet pushed`
**Skills:** every-ticket skills + `wigglers-architecture` (reference for `pPath`, `getBin`, tier geometry)

**Load wigglers-architecture:**
```python
python3 << 'ARCH'
import urllib.request, json, base64
TOKEN = "YOUR_PAT"
headers = {"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github.v3+json", "User-Agent": "WR/1.0"}
url = "https://api.github.com/repos/Cal-Starfur/claude-skills/contents/skills/wigglers-architecture/SKILL.md"
req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as r:
    data = json.loads(r.read())
print(base64.b64decode(data["content"]).decode("utf-8"))
ARCH
```

**Extracts from `game.js` (pin to HEAD SHA before fetching):**
- Lines 1–60: canvas bootstrap, shims, `W/H/camY/camX/centreOffsetX/viewMode/viewCamY/mX/mY/frame`
- Lines 44–60: `getRealDayTime()`, `dayTime`, `TIERS`
- Lines 761–791: `getBin()`, `getTier()`, `cSurf()`, `tSurf()`, `inCompost()`, `compostDepth()`
- Lines 3187–3218: `WORLD_W`, `resizeCanvas()`
- Lines 665–696: `pPath[]`, `pLastX/Y`, `MAX_PPATH`, `_pPathBuckets`, bucket helpers
- Lines 796–870: `nearestPathIdx()`, `addPoint()`
- Lines 103–160: array vars — `trashChunks[]`, `scraps[]`, `debris[]`, `drops[]`, `bugs[]`, `castings[]`, `tLvl`, `pooled`, `teaSplashes[]`, `scrapsLevel`, `scrapsEmpty`, `karma`
- Lines 727–744: player state — `pSleeping`, `pSleepX/Y`, `pSleepCurl`, `pZzz[]`, `pAcid`, `pHP`, `pHunger`, `pSegs[]`, `pHist[]`, `pSR`, `pSEG`, `pEaten`, `pGut`, `pGutMax`, `pPooping`
- Lines 2979–2989: `initPlayer()`
- Lines 3239–3260: `setup()` skeleton — `resizeCanvas()`, zero arrays, `initPlayer()`, `spawnScraps()` stub, `loop()`
- Lines 5094–5215: `drawWorm()` — verbatim, acid tint + HP pale logic included
- Lines 5409–5431: `skyCol()`, `_starPos`
- Lines 5433–6030: `draw()` trimmed — sky, tier bands, bin lid/walls/stand/sump chamber, worm call, HP + gut bars. **Skip**: Snoo cinematic, garden/blades, other-player ghosts, drain bonus, weather HUD, gen badge, queue HUD, conflict overlay, death screen draw (replaced by `_demoDead` overlay)
- Lines 8026–8054: `loop()` — rAF, `frame++`, `updatePlayer()`, `updatePhysics()`, `draw()`, view-mode camera lerp
- Lines 8299–8327: `_toCanvas()`, mouse steering
- Lines 8480–8530: touch start — steering only

**Stubs declared here:** full stubs table from above + `_demoDead`/`_demoDeadFade`/`_demoDeadBtn`

**Result:** Blank bin, worm spawns mid-bin, steers on tap/click, sky + tiers visible. No food yet.

---

### T-02 — Tier-1 Scraps + Eat Logic + Gut System
**Status:** `[ ] TODO`
**Skills:** every-ticket skills + `wigglers-architecture` (eat loop, `pGut`/`pHunger` semantics)

**Extracts from `game.js`:**
- Lines 70–119: `TRASH_TYPES[]`, `MAX_SCRAPS`, `scrapsPush()`
- Lines 120–137: `dropsPush()`
- Lines 1613–1838: `drawDebrisFragment()`
- Lines 2744–2919: `spawnScraps()` — full field spawn (fallback; tutorial overrides in T-07)
- Lines 3563–3714: eat + chunk-nibble section of `updatePlayer()` — scrap proximity, `pGut` fill, `pHunger` bleed, debris spawn, liq drop spawn, `pAcid` from acid scraps, `pSEG`/`pEaten` growth gating
- Lines 6230–6265: draw tier-1 scraps in `draw()`

**Result:** Scraps appear, worm eats them, gut bar fills, debris falls.

---

### T-03 — Tier-0 Acid Chunk + Nibble + `pAcid`
**Status:** `[ ] TODO`
**Skills:** every-ticket skills + `wigglers-architecture` (chunk nibble, `hpFrac`, `weatherQueue`)

**Extracts from `game.js`:**
- Lines 138: `weatherQueue[]` — declared as `[]`; accumulates harmlessly (no `updateWeatherSim`)
- Lines 871–911: `_prerenderTrashChunk()`, `_invalidateChunkImg()`
- Lines 912–1612: `drawTrashChunk()` — **verbatim, zero edits** (~700 lines canvas art)
- Lines 6028–6160: draw trash chunks in `draw()` — z-order passes, acid glow, eggshell glow
- Lines 3629–3714: chunk nibble in `updatePlayer()` — `hpFrac` reduction, debris spawn, `weatherQueue` push
- Lines 4157–4210: debris physics in `updatePhysics()`
- `ACID_HP_DRAIN` constant + acid HP bleed in `updatePlayer()`

**Skip:** `updateWeatherSim()` — `weatherQueue` declared but never processed. Safe.

**Result:** Overripe fruit chunk in tier-0 pile, worm nibbles it, `pAcid` rises, worm tints green.

---

### T-04 — Poop System + Castings
**Status:** `[ ] TODO`
**Skills:** every-ticket skills + `wigglers-architecture` (poop deposit, `castingEnrichment`, `inCompost`)

**Extracts from `game.js`:**
- Lines 8227–8297: `tryPoop()`
- `pPooping`, `pLastPoop`, `POOP_COOLDOWN`, `pLastPoopScore` (declared T-01)
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
**Skills:** every-ticket skills + `wigglers-architecture` (drop physics, sump, tunnel decay, bucket index)

**Extracts from `game.js`:**
- Lines 122–137: `drops[]`, `MAX_DROPS`, `dropsPush()`
- Lines 4071–4074: `_segConnBuf`, `TUNNEL_DECAY`, `TUNNEL_DECAY_UNCONNECTED`
- Lines 4075–4742: `updatePhysics()` — drop physics, tube alpha decay, sump logic. **Skip**: flood trigger, oversaturation HP pressure, valve drain, weekly drain check
- Lines 4945–4992: `drawPath()`
- Lines 6266–6420: draw sump chamber, tea level, drops, splashes in `draw()`
- Lines 3868–4069: junction/drain hold in `updatePlayer()` — `drainDownTimer`, `drainUpTimer`, `_atSump`, `_sumpHadDown`, junction stamp
- `drainDownTimer`, `drainUpTimer`, `drainDownCooldown` vars
- `_downDrainDone` latch: `if (tutorial.scene) tutorial._downDrainDone = true;`
- `_upDrainArmed` latch: `if (tutorial.scene) tutorial._upDrainArmed = true;`

**Re-apply perf fixes (were in deleted `demo-game.js`, absent from `game.js`):**
- `_bucketEntryPool` — GC-churn fix on bucket entry allocation
- `_pPathBucketsDirty` — ensures drops attach to drain correctly
- `pathRegistry` rebuild — prevents unbounded accumulation
- `trashChunks` compaction + `weatherQueue` index remap

**Skip:** `triggerWeeklyDrain()`, `drainBonusPopups`, `valveOpen` tap, flood/oversaturation systems.

**Result:** Worm leaves `pPath` tubes. Drops flow down to sump. Tea level rises. Down/up drain hold beats fire.

---

### T-06 — Cocoon + Sleep + View Mode
**Status:** `[ ] TODO`
**Skills:** every-ticket skills + `wigglers-architecture` (sleep state, `viewMode`, cocoon geometry)

**Extracts from `game.js`:**
- Lines 697–705: `cocoons[]`, `COCOON_MAX`, `lastCocoonLaid`
- Lines 8121–8159: `tryLayCocoon()` — remove karma gate (`karma >= COCOON_KARMA_REQ`), keep geometry + latch
- Lines 727–731: `pSleeping`, `pSleepX/Y`, `pSleepCurl`, `pZzz[]` (declared T-01)
- Lines 8191–8226: `trySleep()`
- Lines 3438–3500: sleeping update in `updatePlayer()` — curl animation, ZZZ particles, view mode seed
- Lines 7391–7435: draw ZZZ particles in `draw()`
- Lines 8536–8612: touch handlers for view drag + tap-to-wake
- Swipe-up gesture → `tryLayCocoon()` / Press-and-hold or `S` → `trySleep()` / `E` → `tryLayCocoon()`
- `_cocoonDone` latch: `if (tutorial.scene) tutorial._cocoonDone = true;` in `tryLayCocoon()`

**Skip:** cocoon draw / clitellum indicator / `updateCocoons()` — tutorial only needs the latch.

**Result:** Swipe up / E lays cocoon (latch fires). Press-hold / S sleeps in compost. Drag scrolls bin. Cocoon + sleep + viewscroll beats all fire.

---

### T-07 — Tutorial Wire-Up (Integration)
**Status:** `[ ] TODO`
**Skills:** every-ticket skills + `wigglers-room-tutorial-builder` (hook call sites, step machine, eat-gate)

**Load wigglers-room-tutorial-builder:**
```python
# Loaded from local mounted skill
# Path: /mnt/skills/user/wigglers-room-tutorial-builder/SKILL.md
```

**What this ticket does:**
- Restore `_enterBin()` in `demo.html` to inject `tutorial-module.js` then `demo-game.js` dynamically with `?v=` cache-bust
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
- Set `tutorial.scene = true` and `tutorial.active = true` as hard defaults in `demo-game.js` init

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
14. **Demo death screen** — `_demoDead` overlay + Try Again button ← T-00 (drawn last, covers everything)

**Skipped from `game.js` draw():** garden/blades, Farmer Snoo cinematic, drain cinematic, other-player ghosts, gen badge, queue HUD, conflict overlay, Devvit death screen, weather HUD, drain bonus popups, weekly drain toast.

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
- T-00 ships before T-01 — death screen is designed before any game code exists
- T-01 through T-06 each result in a working demo at that capability level
- T-07 is the integration ticket — by that point every system the tutorial touches exists
- After every push: lead with cache-busted demo URL `https://cal-starfur.github.io/Wigglers_Room/demo.html?v=SHA`

---

## Session Log

### Session — 2026-06-28
**Completed:** T-00 + T-01 built and iterated locally as self-contained `wigglers-demo-t01.html`

**Bugs fixed during build:**
- `draw()` skip ranges cutting through open brace blocks (valve tap range 6722–6768 had delta=-1)
- `getLowestScrapY()` stub `H*2` capping worm to tier 1 — fixed to `H*0.5`
- Camera missing `camX` + wrong lerp rate (0.08→0.04)
- Cursor dot in skip range — re-added in screen space
- `function draw()` duplicated, `updatePlayer` declared inside `draw()` — brace counting fixed
- Sleeping/seg-hist extract ranges off by 1 line each

**Design decisions:**
- Demo worm color: `#ff4d8f` (hot pink) — intentional tutorial deviation from game.js gen palette
- `spawnScraps()` stubbed empty — tutorial replaces with `spawnTutorialScene()` in T-07
- `drawPath()` pulled in T-01 (not T-05 as planned) — tunnels visible immediately

**Next:** Push T-01 as `docs/demo-game.js` + wire `demo.html` _enterBin(), then start T-02
