# Session Manifest — Wigglers Room
Session: 26 | Branch: main | Devvit: 0.0.180 | Updated: 2026-06-24

## Blocked
- ISS-19 (localStorage race condition) — blocked until 2026-07-01
- No game.js / main.tsx changes this sprint

## Active work context
- UX/design work on docs/demo-teaser.html + docs/demo-game.js
- NPC full simulation (Option B) shipped: gut, eat, poop, sleep, waypoints, gen colour, seg chain
- NPC username labels and gen badges removed from ghost worm render
- All guide copy rewritten in Wiggler's voice (Wiggler speaks directly to the player)
- Baseline critique saved: docs/.impeccable/critique/demo-teaser-baseline.md (score: 16/40)
- Marketing sequence executing — Day 3 post due today (r/gamedev)

## Session 26 commits (all to main)
- d245491 docs/demo-game.js — NPC full sim (Option B): gut, eat, poop, sleep, waypoints, gen colour, seg chain + updateNPCSims() + loop hook + new ghost worm draw block
- 419d1a8 docs/demo-teaser.html — Attach .sim to injected NPCs; remove stale _updateNPCPositions from _demoTick
- 2a66e75 docs/demo-game.js — Remove username labels and gen badges from NPC ghost worms
- deb7ed8 docs/demo-teaser.html — Rewrite all guide copy in Wiggler's voice

## Current file SHAs (as of session 26 end)
- docs/demo-game.js: 2a66e75 (GitHub API SHA: 11046ce6)
- docs/demo-teaser.html: deb7ed8 (GitHub API SHA: d4eb46b3)

## Key architecture: NPC simulation
- updateNPCSims() in demo-game.js — drives all otherPlayers entries with .sim
- Called in loop() after updatePlayer(), before updatePhysics()
- .sim objects attached in _injectNPCs() via 50ms setTimeout after setPresence dispatch
- .sim fields: segs, hist, sr, nSeg, gen, gut, gutMax, hp, acid, sleeping, sleepCurl, sleepTimer, wakeTimer, poopTimer, poopFlash, waypoints, wpIdx, wpTimer
- _updateNPCPositions() no longer called from _demoTick — NPCs driven every frame by updateNPCSims()
- NPC HP floors at 0.1 — NPCs never die in the demo

## Skills — load on demand, not upfront

### Always available (fetch when needed, never at session start)
- github-sync → skills/github-sync
  Bootstrap ONLY when ready to push. Not before.

### Load if: design / UX / frontend task
- impeccable → skills/user/impeccable
  Load SKILL.md + whichever reference/*.md the task needs. Not the whole folder.

### Load if: game.js / main.tsx / Devvit task
- lead-dev → skills/lead-dev
- wigglers-architecture → skills/wigglers-architecture
- contractor → skills/contractor
- Pull GAME_ARCHITECTURE.md and WIGGLERS_AUDIT.md fresh from GitHub at that point

### Load if: deploy / upload to Reddit
- devvit-pipeline → skills/devvit-pipeline

### Load if: marketing / post writing
- wigglers-marketing → skills/wigglers-marketing

## Files — pull fresh from GitHub only when the task needs them
- GAME_ARCHITECTURE.md — game.js tasks only
- WIGGLERS_AUDIT.md — game.js tasks only
- docs/demo-teaser.html — design tasks
- docs/demo-game.js — demo tasks
- docs/.impeccable/critique/demo-teaser-baseline.md — design tasks

## Marketing calendar status (Phase 1 — Warmup, no game links)
- Day 1 (June 22): r/SoloDev ✓ posted (confirmed upvote)
- Day 2 (June 23): r/devvit — scheduled
- Day 3 (June 24): r/gamedev — TODAY
- Days 4–10: June 25–July 1 — upcoming
- Days 1–10 = warmup phase, no game links

## Session start checklist (ultra-light)
1. Fetch this file — one API call, raw Python, no scripts
2. Read it. Know the context.
3. That's it. Do not bootstrap anything else until the work requires it.
