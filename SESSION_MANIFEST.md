# SESSION MANIFEST — Wigglers Room

## HEAD SHA
`TBD — update after push`

## Active Work
- `wigglers-demo-t08-clean.html` — self-contained single-file demo, **local only, not yet pushed to repo**
- `docs/demo.html` — shell only, not yet wired
- `docs/demo-game.js` — does not exist in repo yet

## Current Demo State (`wigglers-demo-t08-clean.html`)

### Ticket Status
- T-00 Demo Death Screen: ✅ DONE
- T-01 Canvas, Bin, Worm Movement: ✅ DONE
- T-02 Tier-1 Scraps + Eat + Gut: ✅ DONE
- T-03 Acid Chunk + Nibble + pAcid: ✅ DONE
- T-04 Poop + Castings: ✅ DONE
- T-05 Drops + pPath Tubes + Drain: ✅ DONE
- T-06 Cocoon + Sleep + View Mode: ✅ DONE
- T-07 Tutorial Wire-Up: ✅ DONE
- T-08 Cocoon Hatch → NPC Helper Worm (v1 simple AI): ✅ DONE
- T-09 Tea Drain System: `[ ] TODO`
- T-10 NPC Helper — Full Simulation: `[ ] TODO`
- T-11 View-Scroll X/Y/Diagonal: `[ ] TODO`

### What's in t08-clean
All T-07 features plus:
- **T-08 v1 NPC helpers**: Cocoon hatches after 30s → teal helper worm. Simple AI: wander → seek food → eat → go to compost → poop → wander. Earns karma passively. 1 NPC alive at a time. Cocoon glows + shows countdown in final 10s.
- **pGutMax restored to 8** (matching game.js — was incorrectly 4 in the demo)
- **Digestion rate restored to `5*60*60`** base (matching game.js 5-minute pacing)
- **Acid chunk repositioned** to `_span * 0.84` — just past the melon in the food chain, no more hard left pull
- **`surfaceeat` beat** (new kind): replaces the single-scrap surface eat step — all scraps open, panel says "Climb up and eat anything — everything is open now.", completes at 50% gut
- **Tutorial step order**: `… downdrain → cocoon → updrain → surfaceeat → freeplay(Helpers) → sleep → viewscroll`
- **Freeplay card renamed "Helpers"**: explains that laying a cocoon hatches a helper worm

### Key constants matching game.js
- `pGutMax = 8` (init) — grows with `pSR` via `4 + floor((pSR-4)/3*4)`
- `digestRate` base = `1/(5*60*60)` — 5 min for a full gut, 2.5× faster in compost
- `ACID_DECAY = 1/(60*180)` — same
- `ACID_HP_DRAIN = 0.0006` — same

### Known missing / next session
- `wigglers-demo-t08-clean.html` is local only — needs to be pushed to repo as the demo file
- T-10: Full NPC simulation (tunnel carving, drains, acid, starvation, death) — spec in DEMO_BUILD_PLAN.md
- T-11: View-scroll X/Y/diagonal drag — spec in DEMO_BUILD_PLAN.md
- T-09: Tea drain system — design in DEMO_BUILD_PLAN.md

### ⚠ Needs re-verification
- `acidfull`/`gutfull` curriculum split — flagged as unverified from a prior session, still outstanding

## Next Session Start
1. Bootstrap github-sync + set token
2. Push `wigglers-demo-t08-clean.html` to repo (decide final filename / path)
3. T-10: Full NPC simulation — read spec in DEMO_BUILD_PLAN.md T-10 section before starting; hoist `_fadeAt` first (see crash note)
4. T-11: View-scroll X/Y — small surgical change, good warmup ticket
5. Update DEMO_DELTA.md with T-08 divergences before next session wrap

## PAT Note
Token active this session — rotate if needed (GitHub → Settings → Developer settings)
