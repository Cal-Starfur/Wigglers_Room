# Session Manifest — Wigglers Room
Session: 25 | Branch: main | Devvit: 0.0.180 | Updated: 2026-06-23

## Blocked
- ISS-19 (localStorage race condition) — blocked until 2026-07-01
- No game.js / main.tsx changes this sprint

## Active work context
- UX/design work on docs/demo-teaser.html
- Baseline critique saved: docs/.impeccable/critique/demo-teaser-baseline.md (score: 16/40)
- Marketing sequence execution pending (0 posts published)

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
- docs/demo-teaser.html — design tasks (already cached this session)
- docs/.impeccable/critique/demo-teaser-baseline.md — design tasks

## Session start checklist (ultra-light)
1. Fetch this file — one API call, raw Python, no scripts
2. Read it. Know the context.
3. That's it. Do not bootstrap anything else until the work requires it.
