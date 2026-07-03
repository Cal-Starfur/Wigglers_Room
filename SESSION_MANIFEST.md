# SESSION MANIFEST — Wigglers Room

## HEAD SHA
`f39b6bac4107d9e65d3fbba23c7b76a036d46644`

## Active Work File
`docs/wigglers-demo-t09-v19.html` — local only, not yet pushed

## Ticket Status
- T-00 Demo Death Screen: ✅ DONE
- T-01 Canvas, Bin, Worm Movement: ✅ DONE
- T-02 Tier-1 Scraps + Eat + Gut: ✅ DONE
- T-03 Acid Chunk + Nibble + pAcid: ✅ DONE
- T-04 Poop + Castings: ✅ DONE
- T-05 Drops + pPath Tubes + Drain: ✅ DONE
- T-06 Cocoon + Sleep + View Mode: ✅ DONE
- T-07 Tutorial Wire-Up: ✅ DONE
- T-08 Cocoon Hatch → NPC Helper Worm (v1 simple AI): ✅ DONE
- T-09 Tea Drain System: `[~] IN PROGRESS` — v19, not pushed
- T-10 NPC Helper — Full Simulation: `[ ] TODO`
- T-11 View-Scroll X/Y/Diagonal: `[ ] TODO`

## What Shipped This Session

Working file: `wigglers-demo-t09-v19.html` (built on top of `wigglers-demo-t08-v3.html`).
**Not yet pushed to repo.** Push at start of next session after final smoke test.

### T-09 Tea Drain System — Work Completed This Session

**Job A — Pool Drain Logic** (v1)
- Added `POOL_DRAIN_RATE = 0.04` constant
- Per-bucket drain loop in `updatePhysics()`: checks each bucket for sump-connected
  tunnel via forward scan to `sumpExit` stamp (not proximity fudge), drains at rate,
  re-emits as drops

**Job B — Blob Visual** (v2→v3)
- Replaced hard-edged polygon fill with overlapping-circle particle stack (castings
  technique) — 4 circles per entry, alpha/radius tapered toward crown
- Fixed radius scale: was `_blobBw * 0.82` (~36px, dwarfing the 14px pool height),
  capped to `POOL_MAX_H * 0.55`

**Sleep hold ring** (v1)
- Added blue arc ring around worm head while long-press is charging
- Gated: `inCompost()` only, 200ms dead zone before ring appears, hidden when sleeping

**Drain charge ring** — confirmed already present and correct

**T-09c — Pool Drain Follows pPath** (v4)
- Drain-emitted drops now carry `pathIdx` pointing to tunnel mouth entry point
- Point-to-point steering block in drop loop: steers toward `pPath[pathIdx]`, advances
  to next deeper point, exits at `sumpExit`, detaches on lost path

**T-09d — Tea Freefall + Splash** (v5)
- `pathIdx` exit: hands drop to `inSump = true` freefall instead of instant kill
- `inSump` drops fall freely through sump chamber air, detect `_teaSurfWorldY`
- `teaSplashes[]` push on tea surface impact: 44-frame crown + cavity + ripple rings
- `window._teaSurfWorldY` already written in draw() at sump tea fill block

**T-09e — Liquid Tea Flow** (v6)
- `_drainAccum[]` per-bucket accumulator — burst-emits 2–4 drops at threshold
- `surfaceFlow` phase: drops slide from pool blob X to tunnel mouth X at 1.8px/frame
- Tunnel-entry ripple: small splash push (20 frames) at drain mouth
- Size pulse in draw: tunnel drops scale with `d.vy`

**ISS-09g — sumpExit gate tightened** (v7)
- Removed `|| tq.y >= cSurf() - 20` proximity fudge from all three scan sites
- Tea no longer drains into incomplete tunnels — `sumpExit` stamp is the only gate

**ISS-09h — tLvl double-credit** (v8→v9)
- Removed duplicate `d.y += d.vy` in `inSump` block
- Added `continue` guard so `inSump` drops never fall through to floor tLvl credit
- Moved tLvl credit to drain time: `tLvl += _drained / SUMP_FILL_H`
- Volume conservation: pool-px → sump level is now 1:1 via `SUMP_FILL_H = 140`
- Drops are visual only — arrival never touches tLvl

**ISS-09k — Abolish poolBuckets grid** (v10→v12)
- 09k-1: Removed `poolBuckets[]`, `poolLandX[]`, `_drainAccum[]`, `POOL_BUCKETS`,
  `POOL_MAXH`, `SUMP_FILL_PX` — replaced with `teaPool[]` positional array
- 09k-2: Drop absorption: scan `teaPool[]` for entry within `POOL_MERGE_R`, merge h,
  no centroid drift. New entry at exact landing X if none found.
- 09k-3: Blob draw iterates `teaPool[]` at `entry.x` — no grid, no snap
- 09k-4: Drain loop iterates `teaPool[]`, splices dry entries, burst-emits from `entry.x`
- 09k-5: `resizeCanvas()` remaps `teaPool[i].y *= _hRatio`

**ISS-09j — Drop landing snap** (v13→v17)
- Gate tightened: `tier1Bot() - 2` → `tier1Bot()` exactly, plus `!d.surfaceFlow`,
  `!d.inSump`, `d.pathIdx == null` guards
- Two-frame absorption: drop stays active one frame after absorbing so draw() renders
  it at the surface before deactivating
- Pool absorption splash (v14): small `teaSplashes` push on landing — crown visible
  above pool blob confirms drop arrived
- Blob draw threshold: `0.3` → `0.05` so single drop renders immediately (v15)
- Centroid drift removed (v17): merge only grows `h`, pool stays anchored where formed

**ISS-09m — Eggshell tutorial fixes** (v18→v19)
- Cure step: `target: _egg1` → `target: null, matchType: 'egg_shell'` — any eggshell
  completes the step (v18)
- Removed `extras: _eggExtras` and entire `_ambientEggs`/`_egg1`/`_eggExtras` dead
  code block — white highlight circles gone (v19)

## Open T-09 Issues (carry to next session)

- **ISS-09f** — sumpExit stamp Y misaligns with actual sump visual entry (ticket written,
  not built) — `y: cSurf()` should be `y: Math.max(head.y, cSurf())`
- **ISS-09l** — Pool centroid drifts instead of growing (ticket written, partially fixed
  in v17 by removing centroid drift — verify on device)
- **Pool moving vs growing** — needs device test to confirm v17 fix holds
- **Tea drain visual tuning** — blob radius, step count, alpha values may need device
  tuning pass once flow is confirmed correct

## T-09 Continuation Tickets (next session)

### T-09-P0 — Push v19 + Smoke Test (first thing)
Push `wigglers-demo-t09-v19.html` as `docs/wigglers-demo-t09.html`. Smoke test on
device: pool grows in place, tea flows down tunnel, splash fires, no tLvl overflow.
Then build P1–P6 in order.

---

### T-09-P1 — Pool Art: Flat Puddle That Grows Horizontally

Replace the current vertical circle stack with a true puddle shape:

- Pool renders as a flat-bottomed shape anchored to `tier1Bot()`
- Width = `entry.h * POOL_SPREAD_RATIO` (e.g. `4.0` — a full 14px pool spreads 56px wide)
- Shape: flat bottom at `tier1Bot()`, elliptical crown on top scaled to current width/height
- Draw: `ctx.beginPath()`, flat line across bottom, arc for crown — filled with amber
  gradient (dark base soaking into compost, lighter amber at crown)
- Single drop: tiny dot. Ten drops: small puddle. Fifty drops: wide flat pool
- Adjacent entries whose widths overlap blend visually into one continuous body
- Replaces the current `_STEPS` circle stack entirely

---

### T-09-P2 — Wobble on Drop Impact

When a new drop absorbs into an existing `teaPool` entry:
- Push `entry.wobble = 1.0` on absorption
- Each frame: `entry.wobble *= 0.88` (decays in ~20 frames)
- In draw: crown arc Y oscillates by `Math.sin(frame * 0.8) * entry.wobble * 3`
- Crown bounces up then settles — reads as surface tension responding to impact
- One extra field on the entry object, no new arrays or systems

---

### T-09-P3 — Drain Triggers on Pool Edge Contact

Replace point proximity check with horizontal extent overlap:
- Each entry's drain-check width: `_poolW = entry.h * POOL_SPREAD_RATIO`
- Pool X extent: `[entry.x - _poolW/2, entry.x + _poolW/2]`
- Tunnel mouth X only needs to fall within that extent to trigger drain
- Drain drops emit from the edge of the pool nearest the tunnel mouth, not the centroid
- Visually: the puddle drains from whichever side is touching the drain opening

---

### T-09-P4 — Up-Drain Pumps Tea Back to Surface

Wire `tutorial._upDrainArmed` / up-drain `sumpExit` stamps into the pool system:
- When up-drain is armed and a reverse tunnel exists (sumpExit stamp whose segment
  runs from sump up to `tier1Bot()`): each frame `tLvl -= UP_DRAIN_RATE` (e.g. `0.002`)
- Emit a drop at sump surface with `pathIdx` pointing to up-drain tunnel entry
- Drop steers upward through carved path to `tier1Bot()`
- On reaching `tier1Bot()`: absorbs into `teaPool` at tunnel exit X instead of dying
- `window._upDrainBonusFired` set true once `tLvl` reaches 0 or tunnel decays

---

### T-09-P5 — Down-Drain Connection Check

Ensure that the pool drain loop correctly identifies down-drain tunnels separately from
up-drain tunnels. Currently both stamp `sumpExit: true` on `pPath`. The drain loop
should confirm the segment runs downward (entry point near `tier1Bot()`, exit near
`cSurf()`) before treating it as a valid down-drain for the pool. Up-drain segments
run the other direction and should only be activated via T-09-P4, not the pool drain loop.

---

### T-09-P6 — Tea Color Shift Through Compost Tunnel

Drops entering a tunnel at `tier1Bot()` are amber (`#d4aa10`). By sump exit they should
be tea green (`rgb(180,230,80)`). Transition happens progressively through the tunnel:

- `_depthFrac = (d.y - tier1Bot()) / (cSurf() - tier1Bot())` clamped 0–1
- Lerp each RGB channel: amber at 0, green at 1
- Computed at draw time from `d.y` — no new state on the drop
- `surfaceFlow` drops (haven't entered compost yet): stay amber
- `inSump` freefall drops (exited tunnel): stay full green throughout freefall
- Splash crown and rings already `rgba(180,230,80,...)` — no change needed
- Scope: drop draw loop only, one lerp per tunnelled drop per frame

---

## Next Session Start
1. Bootstrap github-sync + set token
2. T-09-P0: push v19, smoke test on device
3. Build T-09-P1 → P2 → P3 → P4 → P5 → P6 in order
4. Each patch gets its own version number (v20 onward)

## Demo URL
`https://cal-starfur.github.io/Wigglers_Room/wigglers-demo-t09.html` (after push)

## PAT Note
Token active this session — rotate if needed (GitHub → Settings → Developer settings)
