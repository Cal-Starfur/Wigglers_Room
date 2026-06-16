# 🪱 Wigglers Room

A persistent, multiplayer worm-bin composting simulation built as a Reddit custom post using [Devvit](https://developers.reddit.com/docs/devvit).

Players control earthworms living inside a shared compost bin directly inside a Reddit post — no app install required.

---

## What It Is

Each player gets their own earthworm that lives in a shared bin. The bin is a scrolling canvas world with four vertical tiers:

| Tier | Zone | What Happens Here |
|------|------|-------------------|
| 0 | Scraps & blanket | Food layer — eat to fill your gut |
| 1 | Active soil | Main worm zone — tunnel and move |
| 2 | Castings & compost | Safe sleep zone — poop to enrich the bin |
| 3 | Sump / worm tea | Tea reservoir — fills over time, drains weekly |

Core loop: **eat scraps → fill gut → descend to compost → poop → enrich soil → contribute to the weekly tea harvest.**

---

## Features

- 🪱 **Persistent worm** — leave, come back on any device, your worm is still there
- 🌍 **Shared world** — all players see the same tea level, scrap depletion, and flood events in real time
- 🥚 **Cocoon system** — earn score and karma to lay a cocoon; respawn from it on death
- 💧 **Weekly drain cycle** — the sump fills all week; the tea drains every 7 days and rewards top contributors
- 🌊 **Flood events** — when the sump overflows, the bin floods; sleeping in compost keeps you safe
- 👻 **Other players visible** — see other worms moving in the bin live via Devvit Realtime

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Platform | Reddit via [Devvit](https://developers.reddit.com/docs/devvit) custom post |
| Game engine | Vanilla JS + HTML5 Canvas (single-file, no framework) |
| Host layer | Devvit Blocks (`src/main.tsx`) |
| Persistence | Devvit KV Store (per-player worm state + shared world state) |
| Multiplayer | Devvit Realtime (presence, world sync, flood events) |
| Auth | Reddit identity via `context.reddit.getCurrentUser()` |

---

## Repo Structure

```
Wigglers_Room/
├── src/
│   └── main.tsx          # Devvit host — KV, Realtime, auth, message routing
├── webroot/
│   ├── index.html        # Webview entry point
│   ├── game.js           # All game logic (~8400 lines, vanilla JS + Canvas)
│   └── style.css         # Minimal shell styles
├── .github/workflows/
│   └── deploy.yml        # Build check on every push (tsc + devvit build)
├── devvit.yaml           # App config (redis, realtime, redditAPI, kvStore)
├── package.json
├── tsconfig.json
├── GAME_ARCHITECTURE.md  # Living source of truth — systems map, naming conventions
└── WIGGLERS_AUDIT_V20.md # Ongoing code audit — bugs found, fixes applied, priority queue
```

---

## postMessage Protocol

The webview and Devvit host communicate via `postMessage`. Full spec in `WIGGLERS_AUDIT_V20.md` — section 7.

**Host → Webview:** `setSession`, `setWorldState`, `setPresence`, `setFlood`, `setUsername`, `setPlayerAvatar`, `setWeather`

**Webview → Host:** `saveSession`, `worldUpdate`, `presenceUpdate`, `playerDied`, `requestPresence`, `ready`

---

## KV Store Keys

| Key | Contents |
|-----|----------|
| `worm:{username}` | Per-player worm session (position, health, gut, cocoons, score, karma) |
| `world:{postId}` | Shared bin state (tea level, compost richness, scrap level) |
| `cocoons:{postId}` | All players' cocoons in this bin |
| `week:{postId}` | Weekly drain cycle state (weekStartTs, pot, contributors) |
| `queue:{postId}` | Pending worm queue (players waiting for an unclaimed worm) |

---

## Development Status

Currently in active development. See `WIGGLERS_AUDIT_V20.md` for the full audit trail, bug list, and priority fix queue.

**To deploy:**
```bash
# In your Codespace
devvit upload
```

**Build check runs automatically** on every push to `main` via GitHub Actions.

---

## Contributing

This is a solo dev project by [Cal-Starfur](https://github.com/Cal-Starfur). If you're poking around the code and have questions, the architecture doc and audit log are the best place to start.
