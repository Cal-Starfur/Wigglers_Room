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
**Status:** `[x] DONE`
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
**Status:** `[x] DONE`
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
**Status:** `[x] DONE`
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
**Status:** `[x] DONE`
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
**Status:** `[x] DONE`
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

**Skip:** `updateCocoons()` maturity logic, karma gate, multiplayer owner filtering. **Update:** cocoon draw + clitellum indicator were originally skipped here but restored later (see Session Log 2026-06-29) — they're needed for player feedback, not just the latch.

**Result:** Swipe up / E lays cocoon (latch fires). Press-hold / S sleeps in compost. Drag scrolls bin. Cocoon + sleep + viewscroll beats all fire.

---

### T-07 — Tutorial Wire-Up (Integration)
**Status:** `[x] DONE`
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

### T-08 — Cocoon Hatch → NPC Helper Worm
**Status:** `[~] IN PROGRESS` — v1 (simple wander/eat/poop AI) shipped in `wigglers-demo-t08-clean.html`. Full simulation version is T-10.
**Skills:** every-ticket skills + `wigglers-room-tutorial-builder`

**What shipped (v1 — simple AI):**
- Cocoon hatches after 30s, spawns a teal helper worm, consumes the cocoon slot
- Cap: 1 NPC alive at a time
- States: `wander → seek → eat → tocompost → poop → wander`
- Earns +1 karma on eat, +2 on poop drop
- Teal color `#7ecfb0`, 12-segment chain-follow body, eyes + "helper" label
- Cocoon glows and shows countdown in the final 10s before hatch
- Tutorial `freeplay` card renamed "Helpers" — explains the mechanic

**Design decisions resolved this session:**
- Helpers are slightly smaller than player (72% of `pSR`) — visually distinct, clearly "not you"
- Each helper has its own independent simulation loop — not shared state
- Helpers can die (starvation, acid poisoning) — investment, not guaranteed
- Cap tied to `COCOON_MAX` (3) — up to 3 helpers alive simultaneously
- Colors: teal / purple / gold — one per slot
- Free-play feature only — tutorial only introduces the mechanic via the cocoon beat

**Result:** Laying a cocoon is a meaningful investment. Full simulation spec lives in T-10.

---

### T-09 — Tea Drain System (Pooled Tea → Tunnel Flow)
**Status:** `[ ] TODO` — design reviewed this session, not implemented yet
**Skills:** every-ticket skills + `wigglers-room-tutorial-builder` if any drain beat needs adjusting

**Concept:**
Build a real drain mechanic for the bucketed tea-pooling system added this session, so
carving a tunnel near a puddle actually drains it instead of only intercepting new
incoming drops. Ported concepts and new design from a full review of `game.js`'s drop
physics (`updatePhysics()`, the `pathIdx`-based tunnel-following system) — see
`DEMO_DELTA.md` for the comparison once this lands.

**What `game.js` has that's directly reusable:**
- The `pPath` data structure already carries everything needed: segments separated by
  `null` markers, `sumpExit` flags on drain termini, `junctionTarget` links. This was
  ported faithfully in T-05; only the "drops actually ride it" half was ever stubbed out.
- The **pathIdx attachment model** — a drop attaches to a specific `pPath` index, advances
  index-by-index toward deeper points each frame (speed scaled by segment angle, steeper
  = faster), hops through junction targets, and either reaches a `sumpExit` or hits a dead
  end. This is the core portable mechanic.
- `game.js`'s spatial bucket index for `pPath` (`_pPathBuckets`) — worth adopting if drain
  checks end up running every frame instead of once per drop, to avoid an O(n) scan over a
  potentially large `pPath` array each time.

**What `game.js` has that we explicitly do NOT want:**
- No hard block at the compost border — `game.js` always lets tea seep into compost and
  settle at a random "percolation stall" depth, tunnel or not. Our demo's new design
  (tea hard-blocked at the surface, visibly pooling in buckets until a tunnel exists) is
  the intended behavior going forward — do not revert to the percolation-stall model.
- The full clog system (poop deposits blocking tunnels, clog%, decay timers, up-drain
  direction-reversal for poop climbing back up a tube) — scoped out. A lot of machinery
  built for multiplayer tunnel-sharing and long-session degradation with no clear payoff
  in a short demo. Flagged here as a deliberate cut, not an oversight, in case it's
  reconsidered later.

**What needs to be invented — no `game.js` equivalent exists for this:**
- Per-bucket (or global — open question below) check for whether a tunnel now exists near
  a given bucket's X position, and logic to start converting that bucket's standing height
  into flowing drops once one does, instead of the bucket staying full forever after a
  tunnel appears nearby.
- A drain rate — how fast a full bucket empties once a tunnel opens under it. Needs to
  feel earned (not instant) without taking so long it never visibly empties in a normal
  session.
- Whether fresh drops landing after a tunnel exists keep bypassing the pool entirely
  (current behavior) while the *already-pooled* liquid separately and more slowly drains
  through the same tunnel — i.e. two coexisting flows rather than one unified system.

**Open questions to resolve before implementation:**
- Per-bucket drain (only buckets with a tunnel actually near them drain; consistent with
  the local-pooling design we just built, but a single down-drain only empties the puddle
  right around it) vs. global drain (any tunnel anywhere lets the whole pool empty —
  simpler, but loses the spatial "puddles build up locally" idea). Leaning per-bucket.
- Target drain rate / how long a full bucket should take to empty once tunnelled.
- Does this connect to `tLvl` (sump tea level) the same way the current bypass-to-sump
  flow does, or does drained pool tea get its own smaller/different contribution?
- Should the visual puddle shrink smoothly as it drains, or step down per "released drop"
  for a more discrete, readable effect?

**Result (when implemented):** Carving a down-drain tunnel near an existing puddle visibly
drains it over time, instead of the puddle just sitting there indefinitely once a tunnel
exists nearby — closes the loop between the pooling system and the drain mechanic.

---

---

### T-10 — NPC Helper Worm — Full Overhaul
**Status:** `[ ] TODO` — v1 shipped in T-08, this ticket is a full overhaul of cocoon/NPC systems
**Skills:** every-ticket skills

**What's broken in v1 (observed with 3 NPCs hatched):**
- NPCs escape the bin — no bin boundary enforcement, seen flying into sky above the lid
- NPCs share the same movement loop — they sync up and move in lockstep, obviously not independent
- All NPCs return to the same spot in compost — no spatial variety, looks robotic
- Cocoon laying logic is loose — timing and conditions need a full review
- With 3 live NPCs the whole system feels unpolished for the demo

**Goals for this ticket:**
1. Bin bounds enforcement — NPCs must be constrained exactly like the player
2. Independent AI per worm — each NPC runs its own state machine and timer, no shared loop state
3. Spatial variety — NPCs seek different targets, rest in different spots, don't clump
4. Cocoon system overhaul — tighten laying conditions and hatch timing for demo feel
5. Full simulation — gut, acid, HP, death — a real worm that happens to be AI-driven

---

**PART 1 — Bin Bounds + Movement Parity**

NPCs must obey the same world boundaries as the player. Apply to every `_npcStep()` call:
- X: clamp to `getBin().x + nw.sr` … `getBin().x + getBin().w - nw.sr`
- Y ceiling: `getLowestScrapY()` or `wormCeiling` equivalent — cannot breach the lid
- Y floor: `cSurf() - nw.sr` — cannot go below the sump floor
- Replace `_npcMoveHead` chain-follow with `_npcStep(nw, tx, ty)` — history-trail segment placement with lerp, mirroring `updatePlayer()` exactly

**PART 2 — Independent AI Per Worm**

Each NPC in `npcWorms[]` must have fully independent state. No shared loop variables.

**Per-worm state object:**
`segs[], hist[], sr, gutMax, gut, hp, acid, path[], lastX, lastY, angle, stateTimer, state, target, sumpHadDown, junctionTimer, junctionTargetIdx, junctionUsedPoints, drainDownTimer, drainUpTimer, drainDownCooldown, junctionCarveOrigin, lastHeadX, lastHeadY, dead, hatchedAt, restX, restY, idleOffset`

Key additions vs v1:
- `restX, restY` — each NPC picks a unique rest position at hatch time (spread across bin X span, randomised Y in tier-1), never shares with another NPC or returns to origin
- `idleOffset` — frame offset (e.g. `hatchedAt % 60`) so wander timers fire at different times and NPCs never move in sync
- All timers (`stateTimer`, `junctionTimer`, etc.) initialised with `idleOffset` applied

**AI states:** `roam | seek | cure | tocompost | pooping | tosump | atsump | ascend | rest`
- `roam`: wanders toward a randomly offset target near `restX/restY`, transitions to `seek` when gut < 60%
- `seek`: finds nearest available scrap not targeted by another NPC (track `nw.targetScrapIdx`, clear on eat)
- `cure`: drops everything, seeks nearest eggshell when `acid > 0.35`
- `tocompost / pooping`: descends to compost, poops, returns to tier-1
- `tosump / atsump`: descends to sump, holds for down drain then up drain
- `ascend`: climbs back up carving tunnel, fires up-drain bonus on clearing tier-1
- `rest`: returns to `restX/restY`, idles for a randomised duration before roaming again

**Scrap competition prevention:** before targeting a scrap, check no other NPC in `npcWorms[]` has the same `targetScrapIdx`. If contested, pick next nearest.

**PART 3 — Cocoon System Overhaul**

Current `tryLayCocoon()` conditions are too loose — review and tighten:
- Minimum gut threshold before laying is allowed (e.g. `pGut > 0.5`) — can't lay on an empty stomach
- Minimum HP threshold (e.g. `pHP > 0.4`) — stressed worms don't lay
- Cooldown between lays — enforce `lastCocoonLaid` gap, no rapid-fire cocoons
- Cap: max `COCOON_MAX` (3) cocoons across `cocoons[]` at any time including unhatched
- Hatch timer: tune for demo feel — 30s may be too fast with 3 NPCs already live; consider scaling hatch time by number of live NPCs (more helpers = longer before next hatch, so the system breathes)
- On hatch: pick `restX` as a spread position — divide bin width into slots by `COCOON_MAX`, assign slot by cocoon index so NPCs start spatially separated

**PART 4 — Survival (per-worm, matching player rates)**
- Gut decay at `5*60*60` base, compost 2.5× multiplier
- Constipation / starvation HP bleed
- Acid HP drain when `nw.acid > 0.5`
- Death at `hp <= 0` — cull from `npcWorms[]`, free the cocoon slot

**PART 5 — Render**

`drawWorm(nw.segs, nw.sr, nw.color, false, nw.acid, nw.hp)` reused directly — acid tint and HP pallor automatic.
- NPC path tunnels drawn in world-translated space with `_fadeAt` depth fade
- HP bar above head when HP < 75%
- Colors: teal `#7ecfb0` / purple `#b08ed4` / gold `#e8c96a` — assigned by slot index, not hatch order

**Critical implementation note — _fadeAt crash:**
`_fadeAt` is defined as a closure inside `drawWorm()`. If NPC tunnel render calls it from `draw()` scope it throws `ReferenceError` on every frame. Before implementing: hoist `_fadeAt` to a top-level function before `drawWorm`. Replace `_gTop`/`_gBot` gradient vars inside `drawWorm` with `tier1Bot() - camY` / `tier1Bot() + (cSurf()-tier1Bot())*0.25 - camY` directly.

---

### T-11 — View-Scroll X/Y/Diagonal Drag
**Status:** `[ ] TODO`
**Skills:** every-ticket skills

**Concept:**
While sleeping in view-scroll mode, extend the current Y-only camera drag to full 2D pan — horizontal, vertical, and diagonal.

**Current behavior:** Only `viewCamY` is updated from finger delta. `camX` is untouched during view-scroll. Diagonal drag impossible.

**Changes needed:**
- Add `viewCamX` state variable alongside `viewCamY`
- `touchmove`: when `viewMode && pSleeping`, read both X and Y delta from finger, update `viewCamX` and `viewCamY`
- `updatePlayer()` sleeping branch: apply `viewCamX` to `camX` (clamped to `_camXMin`/`_camXMax`) alongside existing `viewCamY → camY`
- Desktop: `mousemove` while `_viewDragActive` flag set (on `mousedown` in view mode, cleared on `mouseup`)
- Check for the `_viewDragLastY` stale-anchor bug (fixed in T-06) — apply same fix to X axis: track `_viewDragLastX` and update both together

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

### Session — 2026-06-30
**Documentation only** — added T-08 (Cocoon Hatch → NPC Helper Worm) to the ticket backlog per Sir's request: captured the concept (30s hatch timer, NPC worm eats/poops, contributes karma) and the open design questions that need resolving before implementation. Not built this session — explicitly deferred.

**Also added T-09 (Tea Drain System — Pooled Tea → Tunnel Flow):** full review of `game.js`'s drop-following physics (`pathIdx` attachment, junction hopping, sumpExit handling) against this session's new bucketed tea-pooling system, to scope what's reusable vs. what needs inventing to make carved tunnels actually drain standing puddles. Captured as a ticket with open questions (per-bucket vs. global drain, drain rate, tLvl interaction) rather than implemented — review only, no code changed.

**Continued same day — karma/time HUD, worm-fade-into-compost feature, tea pooling bug fixes, pacing:**
- Ported the karma HUD pill and real-time clock HUD from `game.js`. Discovered `karma` was a dead variable (never incremented anywhere despite every tutorial panel promising rewards) — wired up real accrual matching `game.js`'s amounts at every eat/nibble/junction/down-drain/up-drain/poop action.
- Ported the drain/junction charge progress ring from `game.js` (was completely silent before — timers counted correctly but nothing ever drew feedback).
- New feature: worm fades out **per-segment** as it crosses into compost (gradient-stroke technique — each point fades on its own depth, not one whole-body alpha), with compost tunnels fading to match using the same depth zone, so the worm visually "goes underground" into a dark tunnel.
- Fixed the drain ring and clitellum band silently never rendering — both were gated behind a worm-visibility check that's guaranteed false at the depths those elements actually activate at.
- Fixed tea passing straight through the compost-border block almost immediately — the tunnel-detection check accepted any nearby carve mark, including incidental ones from the worm just passing through compost for unrelated reasons. Now requires the segment to actually reach the sump.
- Tea puddle visual reworked twice — gradient fill (glossy top → soil-blend base) instead of a flat rectangle, then fixed to scale per-puddle to its own actual height after the first pass turned out invisible on small young puddles.
- Sped up digestion-based HP regen ~15x — was running on `game.js`'s multi-day persistent-bin pacing (5 min per full gut), invisible within a short demo session.
- **Constipation card fix, flagged as needing re-verification:** split the single `acidfull` beat into two (`acidfull` = turn green, new `gutfull` = keep eating until genuinely full) so the Constipation card's text is always accurate. Sir flagged this edit immediately after ("you are looking at the old game file") but session wrapped before clarification — **re-verify this is correct before building on top of it.**


### Session — 2026-06-29
**Completed:** T-02 through T-07 all confirmed/completed locally in `wigglers-demo-t07.html` — the full tutorial demo is now feature-complete, not yet pushed to repo.

**T-07 integration:**
- Tutorial folded fully into native code (state/step-machine/render-helpers relocated next to the demo code they belong with, not kept as a separate "module")
- `tutorial.live = true` hard-defaulted alongside `scene`/`active` — tutorial now runs over the REAL field (full pile + ambient scraps), not a stripped scene
- Eat-gate fixed to match the documented merge-mode spec (locks all scraps in live mode, not just `tutProtected` ones)
- Curriculum made procedural — scrap types and positions vary per spawn from category pools, except eggshell (mechanically fixed as the literal acid antidote)

**Major structural change — depth cuts:**
- Compost (tier 2) and tier 1 both cut to 1/3 depth, sump margin unchanged in absolute size
- New `tier1Bot()`/`cSurf()` boundary functions; every hardcoded `2*H`/`3*H` tier reference and every place assuming tier1 height = flat `H` updated to match (tutorial food positions, ambient scrap generation, worm default spawn point, cocoon depth gate, etc.)

**Bugs fixed:** tutorial panel mobile off-center (world/screen coordinate-space mismatch), two-finger poop gesture dragging the steering point, eggshell glow missing off-screen culling (likely lag source), acid/eggshell glow simplified to match the tutorial ring's lightweight pattern, cocoon system fully invisible (latch fired but nothing rendered — now restored with sac/clitellum band/message), long-press-to-sleep coordinate-space bug, sleep view-scroll never actually applying to the camera, tier-1+compost dirt gradient using stale hardcoded color-stop fractions after the depth cuts, duplicate `scrapsPush()`/state declarations consolidated, bin lid repositioned to track the pile instead of floating at a fixed point with a large empty gap.

**Also added:** desktop `E`/`S` key bindings for cocoon/sleep (touch-only before this session), worm now spawns as a collapsed point and unfurls naturally on first movement.

**Not yet done:** live device testing (this session's fixes are verified via static code/math checks only, not played), push to repo, `demo.html` wiring.

**Next:** see `SESSION_MANIFEST.md` Next Session Start.


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
