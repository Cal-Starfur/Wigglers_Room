
---

## 18. Tea Drain System — T-09 (this session)

**What changed:**

Full tea drain pipeline built from scratch. See SESSION_MANIFEST for per-version detail.
High-level summary of stable divergences from `game.js`:

**`teaPool[]` positional puddle system (no equivalent in game.js)**
- `game.js` stalls drops at depth inside compost as live drops. Demo instead hard-blocks
  drops at `tier1Bot()` and accumulates them into `teaPool[]` — an array of
  `{x, y, h, drainAccum}` objects at their exact landing X positions.
- Organic blob draw from `teaPool[]`: overlapping-circle stack per entry, centred on
  `entry.x`, radius/alpha tapered toward crown. Adjacent entries blend visually.
- Volume conservation: `tLvl += _drained / SUMP_FILL_H` credited at drain time.
  Drops are visual only on arrival — no `tLvl` increment at sump impact.

**`surfaceFlow` drop phase (demo-only)**
- Drain-emitted drops slide along `tier1Bot()` from `entry.x` to tunnel mouth X
  before entering the tunnel. Gives visible surface flow from puddle to drain.
- Tunnel-entry ripple: small 20-frame splash at drain mouth.

**`pathIdx` tunnel steering (adapted from game.js)**
- Drops carry `pathIdx` pointing into `pPath[]`. Point-to-point steering each frame,
  speed scaled by tunnel angle (steep = fast, shallow = slow).
- On `sumpExit`: hands off to `inSump = true` freefall through sump chamber air.
- `sumpExit` stamp is the only valid tunnel gate — `|| y >= cSurf() - 20` fudge removed.

**`inSump` freefall + tea splash (adapted from game.js)**
- Drops emerging from tunnel fall visibly through sump air before hitting tea surface.
- `teaSplashes[]`: 44-frame crown + cavity + ripple rings on tea surface impact.
- Small landing splash on pool absorption: 18-frame surface pop confirms arrival.

**Tutorial eggshell cure step**
- Changed from `target: _egg1` (specific scrap) to `target: null, matchType: 'egg_shell'`
- Removed `extras: _eggExtras` and all `_ambientEggs`/`_egg1`/`_eggExtras` dead code
- White highlight circles on specific eggshells removed

**Port notes:**
- `teaPool[]` system is demo-specific — `game.js` uses percolation stalls, not surface pooling.
- `surfaceFlow` phase is demo-specific visual.
- `pathIdx` steering and `inSump` freefall are adapted from `game.js` and could inform
  a production drain mechanic if the surface-pool design is ever adopted.
- Tea splash system is a simplified port of `game.js`'s `teaSplashes[]` — could be
  ported back to production as-is.
