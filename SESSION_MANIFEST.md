# Session Manifest — Wigglers Room
Session: 27 | Branch: main | Devvit: 0.0.180 | Updated: 2026-06-24

## Blocked
- ISS-19 (localStorage race condition) — blocked until 2026-07-01
- No game.js / main.tsx changes this sprint

## Active work context
- UX/design work on docs/demo-teaser.html + docs/demo-game.js
- NPC full simulation (Option B) shipped: gut, eat, poop, sleep, waypoints, gen colour, seg chain
- NPC username labels and gen badges removed from ghost worm render
- Guide panel fully rewritten in player voice, stripped to exact approved copy
- Food section replaced with 27-chunk horizontal carousel (2 rows, seamless loop, hover tooltips)
- New docs/trash-chunks.html — standalone asset sheet for all 27 in-game scrap chunks
- Animated HP/Gut stat bars in guide panel with flashing Eat!/Poop! indicators (exact game logic)
- Animated acid worm canvas (pink→green color cycle, exact game color math)
- Layout wrap bug fixed — guide-panel locked to 400px, breakpoint lowered to 700px

## Session 27 commits (all to main)
- 91fadd4 docs/demo-teaser.html — Bin layer guide rewrite: My Bin, simplified 1–4 labels and player-facing descriptions
- 124f0ae docs/demo-teaser.html — Remove "The bin" eyebrow label; sump layer scraps-blue + 50% green tea fill
- e30eb07 docs/demo-teaser.html — layer-desc text #d09090 pink
- b810454 docs/demo-teaser.html — section h2 + layer-name Fredoka One #b06070
- 42f759a docs/trash-chunks.html — NEW: standalone asset sheet, all 27 chunks, size/HP sliders, tooltips
- 0982a80 docs/demo-teaser.html — Food panel emoji → canvas chunks; strip all guide emojis and checkmarks
- 532ebe8 docs/demo-teaser.html — Food carousel: 27 chunks, 2 rows × 4 col window, seamless loop, auto-scroll
- 8eeb5d7 docs/demo-teaser.html — Full guide copy rewrite in approved player voice
- 7c3916c docs/demo-teaser.html — Strip remaining emojis (peace sign, keyboard icons → text labels)
- e524d19 docs/demo-teaser.html — Fix carousel tooltip: scope data-chunk handler, pointer-events on canvas
- f25c6c5 docs/demo-teaser.html — Fix tooltip hide/show on repeat hover (120ms delay, tooltip mouseenter)
- 37bd7ad docs/demo-teaser.html — Strip guide to exact approved copy; remove stat bars/Community/Generations/Quick tips
- 694a475 docs/demo-teaser.html — Strip all ctrl-icon placeholder labels
- 0bb13b5 docs/demo-teaser.html — Fix layout wrap on iPad: guide-panel 400px, breakpoint 700px
- d2d5260 docs/demo-teaser.html — Animated acid worm canvas (pink→green, exact game color math, glow)
- 05bd31b docs/demo-teaser.html — Animated HP/Gut bars: exact game colors, flashing Eat!/Poop! indicators

## Current file SHAs (as of session 27 end)
- docs/demo-teaser.html: 05bd31b (GitHub API SHA: TBD)
- docs/demo-game.js: 2a66e75 (GitHub API SHA: 11046ce6) — unchanged
- docs/trash-chunks.html: 42f759a — NEW this session

## Key architecture: guide panel
- guide-panel is a scrollable right column (400px fixed, overflow-x hidden)
- Food carousel: two .fc-row flex strips, cards duplicated in HTML for seamless -50% loop
- Tooltip: showTooltip()/scheduleHide() with 120ms delay; tooltip has own mouseenter/leave
- Stat bars: rAF loop pulling live pHP/pGut/pGutMax/pAcid when available, demo sine waves otherwise
- Acid worm: standalone canvas, lerpHex() color cycle, 8s sine loop

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
