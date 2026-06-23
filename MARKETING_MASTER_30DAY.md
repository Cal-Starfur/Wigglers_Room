# 🪱 Wigglers Room — 30-Day Launch Marketing Master
*All projects, all context, complete post copy, status tracker*
*Created: 2026-06-22 | Owner: Cal-Starfur | Repo: Cal-Starfur/Wigglers_Room*

---

## THE THREE PROJECTS (content sources)

### 1. Wigglers Room — The Game
Persistent multiplayer worm composting sim inside Reddit posts. Vanilla JS + HTML5 Canvas
(~9,000 lines), Devvit host layer (TypeScript, ~1,050 lines), KV store persistence,
Realtime multiplayer presence. 25 development sessions. Launching mid-July 2026.

**P1 blocker:** ISS-19 localStorage race condition. Fix spec complete. Deploy: July 1.
**Code freeze:** Main branch locked until July 1.

**Richest content angles:**
- The game concept itself (weird, novel, no install)
- Real composting mechanics (acid food, eggshells, moisture, castings, tea cycle)
- Technical Devvit gotchas (silent failures, postMessage envelope, channel names)
- The multiplayer world (shared tea level, flood events, death headstones as Reddit comments)
- The cocoon system (7 real days to hatch, generations, karma legacy)
- ISS-19 post-mortem (race condition only visible in production — great war story)

### 2. Claude Skills Ecosystem — The Workflow
12 reusable "skills" stored in cal-starfur/claude-skills. Each skill is a SKILL.md file
that Claude loads to know how to do a specific job. Built across 5 phases from June 2026.
Average score 84/100 after refactor. Ecosystem went from 8 skills at avg 68 → 12 skills at avg 84.

**Skills built:** session-health, github-sync, devvit-pipeline, lead-dev, contractor,
session-summary, skill-audit, project-calendar, wigglers-architecture, save-skill-workflow,
canvas-art-optimizer, png-canvas-art-optimizer.

**Richest content angles:**
- Building reusable AI workflows (the skill concept itself)
- Session bootstrapping — Claude reads docs, picks up exactly where you left off
- Approve-before-push — Claude never touches the repo without explicit go-ahead
- Architecture-as-truth — GAME_ARCHITECTURE.md updated every session
- The scoring system — skills graded on Trigger / Quality / Completeness / Freshness
- Phase 1→5 evolution — from chaos to structured ecosystem

### 3. Codespace Bridge — The Deploy Pipe
A Node.js relay script in a GitHub Codespace. Claude pushes code to GitHub via API →
CI runs (typecheck + lint + test + build) → bridge picks up the commit → runs
`git pull && devvit upload --just-do-it && devvit install wigglers_room_dev` automatically.
Zero manual deploy steps. Also runs from iPad/iPhone via Claude mobile app.

**Richest content angles:**
- Mobile dev workflow (whole sessions from iPhone)
- Automated Devvit deploy (no manual upload button)
- The relay architecture (inbox.json / outbox.json in GitHub as a message queue)
- iPad + Safari compatible — no extensions, no laptop required

---

## AUDIENCE MAP

| Audience | Subreddits | Primary Hook |
|---|---|---|
| Solo indie devs | r/indiegaming, r/gamedev | Dev story, AI workflow, shipping solo |
| Devvit developers | r/devvit | Platform gotchas, deploy automation |
| Claude / AI users | r/ClaudeAI, r/artificial | Claude as co-dev, skills system |
| Composting community | r/composting, r/vermiculture | Real mechanics, worm authenticity |
| Idle gamers | r/incremental_games | Offline persistence, weekly cycle |
| Casual Reddit gamers | r/WebGames, r/InternetIsBeautiful | No install, punchy concept |
| Mobile devs | r/iOSProgramming | iPhone dev workflow |
| General gaming | r/gaming | Post-launch only — broadest audience |

---

## 30-DAY SEQUENCE

### PHASE 1 — WARMUP (Days 1–10, June 22 – July 1)
*No game links. Pure community value. Reply to every comment.*

---

**DAY 1 — June 22 | r/indiegaming**
**Title:** I've been building a multiplayer worm game that lives inside a Reddit post. Here's what that actually means.

I'm a solo dev. For the past few months I've been building something I couldn't find anywhere else — a persistent multiplayer composting sim that runs inside a Reddit post. No app. No download. No login beyond your Reddit account. You just open the post and your worm is there.

The game is called Wigglers Room. Each player controls an earthworm living in a shared compost bin. The bin has four layers — scraps at the top, active soil, deep compost, and a worm tea sump at the bottom. Your worm eats, digs tunnels, poops (which enriches the soil), and eventually dies. Then you come back as your own offspring.

The world is genuinely shared — the tea level fills all week from everyone's contributions and drains every 7 days. When it overflows, everyone's worm takes damage. When someone drains it in time, everyone benefits. You can see other worms moving around in real time.

The whole thing is vanilla JS + HTML5 Canvas running inside Reddit's Devvit platform. The game.js file is sitting at about 9,000 lines right now. Launch is a few weeks out. Happy to answer anything about how it works.

---

**DAY 2 — June 23 | r/devvit**
**Title:** Building a persistent multiplayer game on Devvit — lessons from 25 sessions and ~9,000 lines of game.js

Things I wish someone had told me before I started:

`webView.mount()` only works inside `onPress`. Call it in the render body and it fires on every render and crashes silently. Took me an embarrassingly long time to figure that out.

Devvit wraps your `webView.postMessage()` in an envelope: `{ type: 'devvit-message', data: { message: ... } }`. The origin is NOT `https://www.reddit.com`. Strict origin checks break everything.

Channel names in `useChannel` must be `[a-zA-Z0-9_]` only. Colons crash the render. No error. Just a crash.

External `fetch()` to non-Reddit domains silently fails. No error, no timeout, nothing. This killed my plan to pull real weather data.

Old posts go read-only after you re-upload. Always create a new post to test a new version.

Always hard-refresh after deploy. Reddit's cache will serve the old version on first load every time.

The game is a multiplayer worm composting sim. Happy to share more if anyone else is building on Devvit.

---

**DAY 3 — June 24 | r/gamedev**
**Title:** I accidentally built my entire game dev workflow around AI — here's what that actually looks like

I didn't plan to build a game using Claude as my primary dev partner. It just kind of happened.

Here's the actual workflow: I open a new conversation, paste my GitHub token, and Claude bootstraps itself — pulls the architecture doc and audit log fresh from the repo, reads the current state of the codebase, and picks up exactly where the last session left off. Every session starts from a verified snapshot of reality, not from memory.

When I want to make a change, Claude proposes it, shows me a diff, waits for my approval before pushing anything to GitHub. It never touches the repo without me saying go. After the push, a bridge script in my Codespace handles the deploy automatically.

The thing that made this work was treating the docs as the source of truth, not the code. We maintain a GAME_ARCHITECTURE.md updated every session — naming conventions, deploy rules, what's broken, what must never be touched again. Claude reads it cold every session.

The failures were instructive. We lost good code twice chasing bugs that turned out to be Reddit's cache serving old versions. We reverted working code because we thought it was broken. Those failures drove the "always hard-refresh after deploy" rule that's now permanent in the architecture doc.

The game is a multiplayer worm composting sim that runs inside Reddit posts. But the workflow is the interesting part.

---

**DAY 4 — June 25 | r/composting**
**Title:** I made a worm bin simulator — and the composting mechanics are more real than you'd expect

I keep worms. I also make games. A few months ago I combined those interests in a way that made complete sense to me and probably sounds unhinged to everyone else.

The mechanics I tried to get right: coffee grounds and citrus damage your worm because they're acidic. Eggshells act as an antidote. Wet dense compost slows movement. If moisture gets too high the bin floods. Worm castings deposited deep in the bin enrich the soil and increase food fragment rates. Tunnels persist and decay. Tea collects in the sump all week and drains on a real 7-day cycle.

I did not make the acid mechanic up. I learned it from my actual worm bin.

The game runs inside Reddit posts via the Devvit platform. No download, no app. Launch in a few weeks. Happy to answer questions about how the real mechanics translated into gameplay.

---

**DAY 5 — June 26 | r/vermiculture**
**Title:** Built a worm bin game — the red wiggler people here will either love or roast the mechanics

I maintain a red wiggler bin and I've been building a composting game. I genuinely want to know if the mechanics hold up to people who actually know worms.

What I tried to get right: acid foods damage the worm, eggshells neutralize it. Moisture levels affect everything. Castings deposited deep in the bin enrich the soil. Cocoons take 7 real-world days to hatch. Tea collects in a weekly cycle.

What I simplified or invented: the worm has a "gut" bar. Tunnels glow. There's a farmer named Snoo who tips in new scraps.

It's a multiplayer game inside Reddit posts, launching in a few weeks. But honestly I posted here because I want to know what I got wrong.

---

**DAY 6 — June 27 | r/incremental_games**
**Title:** I built a persistent idle game where your worm keeps living (and dying) when you close the tab

The idle mechanics: your gut drains while you're away — come back after 8 hours and you'll be hungry but alive (drain caps at 85%). Come back after too long and you might be in trouble. Tunnels decay. Tea accumulates from everyone's activity, not just yours. Cocoons mature on real-world time — 7 days regardless of whether you're playing.

The active mechanics: dig tunnel networks for drainage, eat scraps, poop in the deep zone to contribute castings, drain the tea sump to avoid floods, watch other players' worms moving in real time.

No install, no download — runs inside a Reddit post. The whole shared bin persists on Reddit's servers. Tea level is the same for everyone. Launching in a few weeks.

---

**DAY 7 — June 28 | r/InternetIsBeautiful**
**Title:** Someone built a persistent multiplayer game that lives inside a Reddit post and the worm tea drains every 7 days

Wigglers Room — a multiplayer worm composting sim inside Reddit posts.

Your earthworm lives in a shared bin. The bin has a tea reservoir that fills all week from everyone's activity. Every 7 days it drains and top contributors get a karma bonus. If it overflows before the drain, the bin floods and everyone's worm takes damage.

No download. No app. Just open the post. Your worm is still there when you come back.

Launching in a few weeks. Will post the link here when it goes live.

---

**DAY 8 — June 29 | r/WebGames**
**Title:** I'm building a multiplayer game that runs inside Reddit posts — here's the weird tech behind it

Wigglers Room runs via Reddit's Devvit platform — custom posts that run actual web apps inside the feed. Vanilla JS + HTML5 Canvas talking to a TypeScript host layer via postMessage.

Persistence: Reddit's KV store — worm state, world state, tea level all server-side. Multiplayer: Devvit Realtime — players broadcast position and health once per second, visible as real worm segments (not just dots).

Weirdest constraint: external fetch() calls are silently blocked by the Devvit sandbox. No error, no timeout. Killed my plan to pull real weather data early on.

The game: earthworm in a shared compost bin. Eat, dig tunnels, poop, die. Tea fills weekly, drains on a 7-day cycle. Launch in a few weeks.

---

**DAY 9 — June 30 | r/mildlyinteresting**
**Title:** I've been building a worm composting game and the most realistic mechanic is that you have to poop strategically

Wigglers Room is a composting sim. You control an earthworm. The mechanic I'm most proud of is the poop system.

You poop by tapping with two fingers. Where you poop matters — deep in the compost zone your castings enrich the soil and increase food spawn rates. Poop near the surface and you're making a mess. Poop into existing tunnels and the deposits clog your drainage network.

The game is real in the expected ways: acid food damages your worm, moisture affects movement, cocoons take 7 real days to hatch. But strategic pooping is the one I spent the most time on.

Multiplayer composting game inside Reddit posts. Launching in a few weeks.

---

**DAY 10 — July 1 | r/gamedev**
**Title:** The localStorage race condition that broke our multiplayer — and how we finally fixed it (today)

We've been chasing a bug for weeks. Players would load the game and see stale world state — other players' positions from a previous session, tea levels that didn't match reality.

Root cause: a localStorage race condition. The game read from localStorage on init before the Devvit host finished sending authoritative server state. localStorage was winning the race and populating the world with stale cached data before the fresh KV values arrived.

The fix: remove localStorage entirely as an initialization source for world state. Server is authoritative, full stop. If server data hasn't arrived yet, you wait. localStorage is only for UI preferences, never game state.

We didn't find this for weeks because it only showed in production. The Devvit message timing is different in playtest mode. We were testing in an environment that never triggered the bug.

Today is the day we ship the fix. Felt like the right day to write it up.

---

### PHASE 2 — BUILD HYPE (Days 11–20, July 2–11)
*Start hinting the game is almost ready. Broader angles.*

---

**DAY 11 — July 2 | r/ClaudeAI**
**Title:** I've been using Claude as my primary game dev partner for 3 months — here's what that workflow actually looks like

The setup: every session, I paste a GitHub token. Claude bootstraps scripts from the repo, pulls the architecture doc and audit log fresh, and picks up exactly where the last session ended. It knows what's broken, what must never be touched, what's been fixed. Every session starts from a verified snapshot of reality.

The rule that made it work: Claude never pushes to GitHub without my explicit approval. It proposes the change, shows the diff, waits. If I say no, nothing happens.

The thing I built on top of that: a "skills" system. 12 reusable workflow files stored in a separate repo — each one tells Claude how to do a specific job. Session startup, deploy pipeline, code audit, architecture drift detection. Claude loads the relevant skills at the start of each session. Scores averaged 68/100 when I started, 84/100 now after 5 phases of refinement.

The game I built this way is a multiplayer worm composting sim that runs inside Reddit posts. It's launching in a few weeks.

---

**DAY 12 — July 3 | r/devvit**
**Title:** How we automated Devvit deploys — Claude pushes, GitHub Actions checks, a Codespace bridge handles the upload

The problem: Claude pushes code to GitHub via the API directly, bypassing local git. The Codespace clone never sees those commits until you pull. So `devvit upload` would warn "Couldn't find README.md" because the file existed in the repo but not on disk.

The solution: a relay script (bridge3.js) running in the Codespace. It polls a GitHub file (inbox.json) every 3 seconds. When Claude pushes a new commit, it writes a command to inbox.json. The bridge picks it up, runs `git pull && devvit upload --just-do-it && devvit install wigglers_room_dev`, writes the result to outbox.json. Claude reads the result and reports back.

Zero manual steps from code change to live on Reddit. Works from iPhone too — whole sessions from mobile.

---

**DAY 13 — July 4 | r/gamedev**
**Title:** The bug that only appeared in production: how Reddit's cache nearly ended our multiplayer

We reverted good code twice. The game was fine both times. Reddit was just serving the cached old version on first load.

The symptom: we'd deploy a fix, test, see the old broken behavior, assume the fix didn't work, and revert. Then wonder why the reverted code also showed the same problem. Then spend a session debugging something that was already fixed.

The fix: always hard-refresh after deploy. Close the post completely and reopen it. Never trust the first load after an upload. This is now rule #1 in the architecture doc. It's also how we lost about 4 sessions of good work.

The game is a multiplayer worm composting sim on Reddit. Nearly ready.

---

**DAY 14 — July 5 | r/artificial**
**Title:** What building a real shipped product with Claude as co-dev taught me about working with AI

Three months, 25 development sessions, ~9,000 lines of game code. Here's what I actually learned:

The biggest unlock was treating Claude's context as perishable. Every session starts fresh — so we built a system where Claude bootstraps itself from live repo docs rather than relying on memory. It reads the architecture doc, the audit log, the session history, then tells me where we are. No "what were we working on?" — it just knows.

The failure mode I didn't expect: Claude is very good at proposing confident solutions to the wrong problem. The approve-before-push rule wasn't just about safety — it forced me to understand every change before it shipped. That friction turned out to be valuable.

The thing that surprised me most: the meta-work compounds. The 12 reusable "skills" I built to manage the workflow are now faster to load than to explain. The system got better every session not just because the code improved, but because the process did.

---

**DAY 15 — July 6 | r/composting**
**Title:** Following up on the worm bin game — and what the composting community got right

A few weeks ago I posted about building a composting sim. The feedback shaped some things. Wanted to share the update.

The vermiculture community's biggest note: don't oversimplify the relationship between castings and soil quality. Fair. We now have a `castingEnrichment` value (0–1) that builds as worm poop reaches the sump floor. It drives tunnel regen rate, clog decay speed, and food fragment spawn rate. It decays slowly over time if the worm stops contributing. It's invisible to players right now but the system is there.

The game is nearly ready. The bin is real. The worm is real. The composting is as real as a game mechanic can reasonably be.

---

**DAY 16 — July 7 | r/indiegaming**
**Title:** 3 months from first prototype to working multiplayer Reddit game — the honest retrospective

What went right: the core concept. Playing as an earthworm in a real composting system is weird enough to be memorable.

What went wrong: not having a source-of-truth document from day one. Sessions 1–5 were chaotic because there was no single place that said "here's what's broken, here's what must not be touched, here's the deploy process." We built that document (GAME_ARCHITECTURE.md) around session 6 and everything got better immediately.

The thing I'd tell myself at the start: the architecture doc is more important than the code. The code changes constantly. The doc is what lets you pick up where you left off without losing your mind.

Nearly ready to launch. Will post the link when it goes live.

---

**DAY 17 — July 8 | r/incremental_games**
**Title:** How we designed a 7-day real-time event for a game that runs inside a Reddit post

The weekly drain cycle: the sump fills all week from every player's activity. On a 7-day real-time timer, the Snoo (farmer) character appears, the tea drains, and contribution-weighted karma bonuses are distributed. If the sump hits 90% before the drain fires, the bin floods — all active worms take damage.

The design challenges: how do you communicate a 7-day deadline to players without it feeling punishing? How do you make everyone's contribution feel meaningful when the bin is shared? How do you handle the player who drains the sump solo at 3am on day 6 — do they get all the credit?

We landed on: contribution tracking from the start of each cycle, weighted bonus at drain time, a flood warning UI at 75% capacity, and a "drain hero" karma bonus for whoever triggers the valve manually in a flood emergency.

Game launching in about a week.

---

**DAY 18 — July 9 | r/iOSProgramming**
**Title:** My entire game dev workflow runs on an iPhone — here's how

The setup: Claude mobile app for the AI sessions. GitHub API for all repo operations (reads, writes, pushes — all via curl-equivalent API calls Claude makes in its environment). A relay bridge in a GitHub Codespace for Devvit deploys.

What I do from the phone: start sessions, review diffs, approve pushes, check CI status, trigger deploys, read audit logs. Everything except actually writing code — Claude handles that.

What I can't do from the phone: run local dev servers, use the Codespace terminal directly for anything interactive. But for a Devvit project where all the testing happens on Reddit anyway, that constraint is basically irrelevant.

The thing that made this work: treating the architecture doc as the UI. Every session, Claude reads the doc and tells me where we are. I don't need a local IDE to understand the state of the codebase — I just need the doc to be accurate.

---

**DAY 19 — July 10 | r/gamedev**
**Title:** Designing death as content — how Wigglers Room turns your worm's death into a Reddit comment

When your worm dies in Wigglers Room, the game posts a comment to the Reddit thread. The comment includes: your username, cause of death (acid poisoning, starvation, flood, constipation, etc.), how long you lived, your generation number, total karma earned, and the real date.

The design intent: your worm's life is part of the shared history of the bin. Other players can scroll through the comment thread and see every worm that ever lived there. It's a graveyard that builds over time as a natural byproduct of gameplay.

The technical challenge: the death comment has to post from a Devvit context, which means it goes through Reddit's API with the app's credentials — not the player's. So it reads as posted by the app, not the player. We added the username to the comment body to make attribution clear.

Game launching very soon.

---

**DAY 20 — July 11 | r/WebGames**
**Title:** How multiplayer presence works in a game inside a Reddit post

Every active player broadcasts their worm's position, size, generation color, HP, and sleep state once per second via Devvit Realtime. Other players receive these broadcasts and render them as real worms — same segment chain, same color, same HP-based rendering — not as simple dots or ghost indicators.

Players are pruned from the local render after 90 seconds without an update. The queue (players waiting for a worm slot) is filtered out before rendering — you don't see ghost worms at position (0,0) from players who haven't spawned yet.

The main technical challenge was the presence relay shape. Early builds broadcast `player: {}` (singular object). The fix to `players: [{}]` (array) was what made other worms actually show up for the first time. That bug was live for multiple sessions before we caught it.

Game is launching in the next day or two.

---

### PHASE 3 — LAUNCH (Days 21–30, ~July 12–21)
*Only start when ISS-19 is shipped and game is stable. Link to the actual post.*

---

**DAY 21 — LAUNCH DAY | Three posts, same day**

**r/devvit** — Title: Wigglers Room is live — persistent multiplayer worm composting game [link]
Built in public over 25 sessions. Here's the link. Here's what Devvit made possible that nothing else could.

**r/indiegaming** — Title: I launched the multiplayer worm game I've been posting about — it's live on Reddit right now [link]
The worm game is real. Here's the link. First 24 hours are the most important — come help fill the bin.

**r/InternetIsBeautiful** — Title: This multiplayer worm game lives inside a Reddit post and your worm keeps living when you close it [link]
One link, short description, let the concept do the work.

---

**DAY 22 — +1 | r/gaming**
**Title:** I launched a multiplayer composting game on Reddit — it lives inside a post and your worm keeps dying

Broadest gaming audience. Accessible framing. Link front and center.
Hook: "Your worm dies. Then you come back as your own offspring."

---

**DAY 23 — +2 | r/incremental_games**
**Title:** Wigglers Room is live — the idle worm game that runs inside Reddit posts [link]

Idle game community launch post. Persistence mechanics front and center. Real numbers if available (tea level, deaths, active players).

---

**DAY 24 — +3 | r/gamedev**
**Title:** Launch day retrospective — what shipping Wigglers Room actually looked like

Raw, honest. What worked, what didn't, first player reactions, real numbers.
Hook: Real data good or bad. Honesty outperforms spin every time.

---

**DAY 25 — +4 | r/composting + r/vermiculture**
**Title:** The worm game is live — and the first bin flooded within [X] hours

First real event post. When the flood happens, post about it immediately.
Hook: "Nobody drained it in time. Every worm in the bin took damage simultaneously."

---

**DAY 26 — +5 | r/ClaudeAI**
**Title:** The game I built with Claude as co-dev just launched — session 1 vs session 25

Before/after of the dev workflow. Show the evolution from chaos to structured process.
Hook: The skills system. 68 avg → 84 avg. Zero to twelve.

---

**DAY 27 — +6 | r/indiegaming**
**Title:** First week numbers on a Reddit-native game — what actually happened

Honest post-launch data. Players, engagement, surprises, what I'd do differently.
Rule: Never fake this. If numbers are small, say so. The community respects honesty.

---

**DAY 28 — +7 | r/devvit**
**Title:** One week of Wigglers Room on Devvit — what the platform can and can't do for a live game

Honest Devvit retrospective. KV store performance, Realtime reliability, sandbox constraints, post lifecycle issues. Real feedback from a real shipped app.

---

**DAY 29 — +8 | r/gamedev**
**Title:** The thing nobody told me about launching an indie game: the silence is the hardest part

Emotional/reflective. Post-launch reality. The gap between launch and traction. This community has all been there.

---

**DAY 30 — +9 | r/InternetIsBeautiful**
**Title:** A week ago I posted about a worm game inside Reddit — here's what the bin looks like now

Show the living world. Tea level, deaths, generations, tunnels. Real player data.
Hook: "The bin has flooded [X] times. [N] worms have lived and died. Generation [X] worms are running around."

---

## POST STATUS TRACKER

Update this as posts go live. Change ⏳ → ✅ posted or ❌ skipped.

| Day | Date | Subreddit | Status | Notes |
|-----|------|-----------|--------|-------|
| 1 | Jun 22 | r/indiegaming | ⏳ | Ready now |
| 2 | Jun 23 | r/devvit | ⏳ | |
| 3 | Jun 24 | r/gamedev | ⏳ | |
| 4 | Jun 25 | r/composting | ⏳ | |
| 5 | Jun 26 | r/vermiculture | ⏳ | |
| 6 | Jun 27 | r/incremental_games | ⏳ | |
| 7 | Jun 28 | r/InternetIsBeautiful | ⏳ | |
| 8 | Jun 29 | r/WebGames | ⏳ | |
| 9 | Jun 30 | r/mildlyinteresting | ⏳ | |
| 10 | Jul 1 | r/gamedev | ⏳ | ISS-19 fix day — perfect timing |
| 11 | Jul 2 | r/ClaudeAI | ⏳ | |
| 12 | Jul 3 | r/devvit | ⏳ | |
| 13 | Jul 4 | r/gamedev | ⏳ | |
| 14 | Jul 5 | r/artificial | ⏳ | |
| 15 | Jul 6 | r/composting | ⏳ | |
| 16 | Jul 7 | r/indiegaming | ⏳ | |
| 17 | Jul 8 | r/incremental_games | ⏳ | |
| 18 | Jul 9 | r/iOSProgramming | ⏳ | |
| 19 | Jul 10 | r/gamedev | ⏳ | |
| 20 | Jul 11 | r/WebGames | ⏳ | |
| 21 | Jul 12 | r/devvit + r/indiegaming + r/IIB | ⏳ | 🚀 LAUNCH DAY — 3 posts |
| 22 | Jul 13 | r/gaming | ⏳ | |
| 23 | Jul 14 | r/incremental_games | ⏳ | |
| 24 | Jul 15 | r/gamedev | ⏳ | |
| 25 | Jul 16 | r/composting + r/vermiculture | ⏳ | |
| 26 | Jul 17 | r/ClaudeAI | ⏳ | |
| 27 | Jul 18 | r/indiegaming | ⏳ | |
| 28 | Jul 19 | r/devvit | ⏳ | |
| 29 | Jul 20 | r/gamedev | ⏳ | |
| 30 | Jul 21 | r/InternetIsBeautiful | ⏳ | |

---

## RULES

1. Read each post before you paste it. Change anything that doesn't sound like you.
2. Reply to every comment within 2 hours if possible. The thread is the product.
3. Never cross-post identical content to two subreddits.
4. No game links until Day 21. Nothing to link to yet.
5. If a post gets < 5 upvotes in 2 hours, move on. Don't delete it.
6. If a post pops off, stay in the comments. That's where the audience is built.
7. Days 21–30 timing is flexible. Don't start Phase 3 until the game is genuinely good.
8. Never mention this is a marketing plan.
9. Composting communities are skeptical. Earn trust before asking for anything.
10. Dev communities want failure stories more than success stories.

---

## RELATED FILES IN THIS REPO
- `WIGGLERS_MARKETING_PLAN.md` — Strategic overview, channel strategy
- `WIGGLERS_PRELAUNCH_POSTS.md` — Original Days 1–10 draft (superseded by this doc)
- `GAME_ARCHITECTURE.md` — Technical source of truth
- `WIGGLERS_AUDIT.md` — Bug log and session history
- `WIGGLERS_DESIGN_FUTURE.md` — 30-system expansion design doc
- `WIGGLERS_ROOM_JR_DESIGN.md` — Kids edition design doc



---

# ADDITIONS TO MARKETING_MASTER_30DAY.md
# Source: project chat history mining — June 22 2026
# Instructions: append to existing doc, do not rewrite

---

## NEW RAW MATERIAL FOUND IN CHAT HISTORY
### (not yet in any repo doc — add these to the master)

---

### ORIGIN STORY — The Viral Post

The whole skill ecosystem didn't start from a plan. It started from a Reddit post.

You shared a viral thread making the point that vibe-coders "confuse a working 
prototype with a production system." The post hit because it was true — and the 
conversation that followed was where the real self-awareness kicked in.

Your exact words: "well we are working on skills for you and since i am basically 
blind when it comes to the code i will have these issues. but being aware of them 
we can definitely plan skills and workflows that can manage the pain."

That's the origin of the entire skill infrastructure. Not a plan. A moment of 
honest self-assessment in response to a post that made you uncomfortable.

**Post angle:** The thread that made me rethink how I was building my game — 
and what I did about it. (r/gamedev, r/ClaudeAI, r/SoloDev)

---

### THE "NOT BLIND BUT NOT FLUENT" FRAMING

This phrase came up naturally in conversation and is one of the best hooks in 
the whole story. Direct quote:

"as i am not blind but also not fluent i will have to lean on you there"

This is a genuinely useful frame for anyone doing AI-assisted development. 
You're not helpless — you understand intent, context, what the game should feel 
like. But you're also not a developer who can read a diff and catch subtle bugs.
That middle space is where most people using AI to build things actually live.

**Post angle:** "I'm not blind but I'm not fluent" — the real experience of 
building software with AI. (r/ClaudeAI, r/artificial)

---

### THE LEAD DEV / CONTRACTOR SPLIT — HOW IT ACTUALLY HAPPENED

The contractor skill came from a specific frustration: the lead-dev skill was 
good for architecture but too "big picture" when you just needed one thing fixed.

Exact message that triggered it: "my lead dev skill is good but when i want to 
update the game i think he is to big picture i need a contractor skill that acts 
like a game developer who is more surgical"

That metaphor — lead dev vs contractor — became the conceptual backbone of the 
whole skill system. The lead dev reads everything, guards architecture, thinks 
long term. The contractor reads only what they need, touches only what the ticket 
requires, ships, leaves. Two personalities. Two modes.

The contractor rule: "A good contractor fixes the leak. They don't redesign 
the plumbing."

**Post angle:** I gave my AI developer two personalities — and it changed 
everything. (r/SoloDev, r/ClaudeAI)

---

### THE 6-TAB WORKFLOW PROBLEM

The original dev workflow before the pipeline skill was built:

"Claude → download file → upload to GitHub → switch to Reddit → create post → 
switch to Devvit CLI → devvit upload → devvit playtest → switch back to Reddit 
→ check if it worked → switch back to Claude"

That's 6+ tab switches just to test one change. On mobile.

The exact moment the Reddit/Devvit skill idea clicked:
"Ok the Reddit and Devvit inside of Claude sounds like it could save me a lot 
of time tab hopping"

This is the genuine problem the bridge solved. Not automation for automation's 
sake — it was genuinely painful to switch that many times on a phone screen.

**Post angle:** I was switching between 6 tabs every time I deployed. 
Here's what I built instead. (r/iOSProgramming, r/SoloDev)

---

### THE MOMENT THE FIRST VERSION SHIPPED

The first version of the game deployed, and the playtest report was: 
"I have just pushed the first version of the game so ive played it for just 
under a minute"

That's the whole review. One minute of play. Then immediately pivoting to 
building better deployment tooling. No celebration. Just momentum.

There's something real in that — the game had 8,400 lines of JavaScript at 
first push and the developer played it for under a minute before going back 
to building. That's the solo dev experience compressed into one sentence.

**Post angle:** My game had 8,000 lines at first deploy. I played it for 
under a minute. Here's what I did next. (r/indiegaming, r/gamedev)

---

### THE SINGLE FILE MISTAKE

First attempted push: the entire game as one 8,419-line HTML file.

Devvit didn't want it. Had to split into index.html + game.js + style.css.

The moment of realization came when reviewing the plan:
"I think it might break if we send it as is. I think Devvit wants it broken 
down into multiple files if im not mistaken"

That instinct was right. The Devvit structure expects a proper webroot layout.

This is a perfect micro-story for the Devvit community — it's the first real 
mistake of the project, caught before it happened, and the fix was straightforward.

**Post angle:** The very first thing I tried to push to Devvit was wrong. 
Here's why. (r/devvit)

---

### THE CANVAS ART BOTTLENECK

There's a whole story in here about game art that isn't in any of the docs.

You have art for multiple games — Wigglers Room and Space Cats at minimum. 
Keeping it canvas-based keeps file sizes "exponentially smaller" vs importing 
image assets. But the bottleneck was that you had to coach Claude through every 
iteration of converting an SVG or image to canvas code.

"The bottleneck is your ability to match the SVGs or Images with accurate 
outputs and i have to coach you a lot until it's a match."

This became two skills — the SVG canvas optimizer and the PNG canvas optimizer. 
The SVG one worked first try at 100% similarity on the first pass (a complex 
character with 87 paths, nested transforms, fine detail). The PNG version uses 
Claude's vision API in a loop to reverse-engineer shapes from pixel data.

The breakthrough moment: "I feel like I had a breakthrough yesterday with the 
skills we built and now my curiosity has been reinvigorated about what I can 
create to put into these skills."

**Post angle:** I taught Claude to convert my game art to canvas code 
automatically — no more coaching sessions. (r/gamedev, r/IndieDev)

---

### THE TOKEN EXPOSURE INCIDENT — THE FULL STORY

This one is genuinely funny in retrospect and has a clear lesson.

You uploaded your GitHub PAT as a file specifically to avoid pasting it in chat. 
Claude then suggested storing it in project instructions and — to demonstrate — 
reprinted the entire token directly in the chat response.

Your response: "you just exposted my token?"

Claude's response: apology, recommendation to rotate immediately, acknowledgment 
that "I basically undid your opsec."

Your response: "its ok its not a big deal ill keep the existing token but i cant 
believe you just did that."

The lesson codified: tokens in file uploads, not chat paste. Project instructions 
for persistence. Never print a token in a response under any circumstances.

The token was eventually rotated anyway — the current session started with a 401 
because it had expired or been revoked.

**Post angle:** I taught my AI to handle secrets — after it accidentally 
exposed mine. (r/ClaudeAI, r/SoloDev)

---

### THE WIGGLERS ARCHITECTURE DRIFT STORY

The wigglers-architecture skill was built at Session 8 of development.
By Session 19, it was audited against the live files.

Score drop: 72 → 51.

Twelve sessions of drift. The skill was describing systems that no longer existed:
- Animated preview described — removed
- MSG_SET_WEATHER listed — removed  
- draw() subfunctions described — reverted to monolith after a movement bug
- pooled synced — now runtime only
- 14 open issues were invisible to the skill

The draw() split is its own story: the function was refactored into subfunctions, 
which caused a movement bug that took sessions to diagnose. The split was reverted. 
"Do not attempt" is now a hard rule in the architecture doc.

This is what 12 sessions of accumulated drift looks like when you finally measure it.

**Post angle:** My AI's knowledge of my own game was 12 sessions out of date. 
Here's what that actually looked like. (r/ClaudeAI, r/gamedev)

---

### THE SKILL SCORING SYSTEM

Skills are scored 0-100 across four dimensions:
- Trigger — does the description clearly tell Claude when to load it?
- Content quality — is the instruction body accurate?
- Completeness — are edge cases and hard rules covered?
- Freshness — how likely is it to drift out of sync?

The ecosystem went from 8 skills at average 68 → 12 skills at average 84 
across 5 phases of development.

The highest-scoring skill: session-health at 97/100.
The skill built to check everything else before a session starts.

The scoring creates a real feedback loop. A skill that drifts gets caught and 
rebuilt. A skill that was wrong about its own triggers gets corrected. The 
ecosystem becomes measurably more reliable over time.

**Post angle:** I grade my AI's tools on a 100-point scale. Here's what 
that taught me. (r/ClaudeAI, r/artificial)

---

### THE OTTO INTERLUDE

During the Codespace SSH problem (Claude couldn't run devvit upload remotely 
because the gh CLI download was blocked), you found a Reddit post about Otto — 
an open-source MCP server that lets Claude drive real Chrome tabs.

"Otto turns a real Chrome tab into something an agent can control, and it ships 
an MCP server, so Claude can call it directly — open/navigate/extract/screenshot/
intercept-network on a live tab. No headless farm, no cloud-browser rental."

The exploration of whether Otto could solve the deployment problem led to the 
bridge3.js approach instead — a relay script in the Codespace that polls a GitHub 
repo for commands. Simpler, no browser needed.

But the Otto find itself is interesting: you were reading Reddit posts about AI 
tooling while building AI tooling, and a random post suggested a direction that 
was abandoned but led to the actual solution.

**Post angle:** I was trying to solve a problem, found a tool on Reddit, 
decided not to use it, and found a better solution. (r/ClaudeAI)

---

### THE SUB-AGENT REVIEWER

There's a feature that never made it into the main story: using the Claude API 
inside the lead-dev skill to create a second Claude instance that reviews the 
first Claude's code before it goes to you.

"A second Claude API call that reviews code before it goes to the user. 
Claude reviewing Claude's own output."

The sub-agent code reviewer sends newly written code + the architecture context 
to a second instance and checks: will it run, does it violate naming conventions, 
are there magic numbers, is there dead code, is the platform contract respected.

This is the meta-layer: AI quality control for AI-generated code. The entire 
skills system is essentially infrastructure for keeping Claude's outputs 
trustworthy when the person reading them can't evaluate them directly.

**Post angle:** I built a second AI to review the first AI's code. 
Here's how that works. (r/ClaudeAI, r/artificial)

---

### THE CALENDAR CONSTRAINT STORY

When the project calendar was built, a FOCUS.md was pushed to the repo 
with a hard rule: no new repos until Wigglers Room launches.

Space Cats and any future projects were explicitly locked out until launch.

The reason: "Wigglers Room is the primary shipping goal. Adding new projects 
before launch splits focus, slows the cadence, and risks shipping nothing 
instead of something."

The rule is written into the repo itself — not just in Claude's instructions, 
but in a document that Claude reads every session. It can't accidentally schedule 
Space Cats work even if you ask for it in the moment.

This is a specific answer to a specific problem: momentum. When you're an 
over-achiever who can clear multiple days of work in one session, the risk isn't 
doing too little — it's starting a second project before the first one ships.

**Post angle:** I locked myself out of my other projects until this one ships. 
Literally — it's in the code. (r/SoloDev, r/IndieDev)

---

## PROPOSED NEW POSTS FROM CHAT HISTORY
### (not yet in the 30-day calendar — candidates for days 31+ or replacements)

---

**POST A — r/SoloDev or r/ClaudeAI**
**Title:** "I'm not blind but I'm not fluent" — the real experience of building 
a game with AI

**Hook:** There's a middle space between "I can't read code at all" and "I'm 
a developer." That space is where most people using AI to build things live. 
Here's what it actually looks like from inside it.

The honest version: you understand systems, intent, behavior. You can read 
context and know if something's wrong. You just can't write it yourself or 
catch subtle bugs in a diff. So you build infrastructure that makes that okay. 
Architecture docs that Claude reads every session. A skill that greets you with 
READY TO PROCEED or BLOCKED before any session starts. An approve-before-push 
gate that means nothing gets committed without your explicit go-ahead.

The thing I learned: the limitation isn't actually the code. It's the gap 
between what happened in a session and what you understood afterward. The 
session-summary skill closed that gap more than anything else.

---

**POST B — r/gamedev**
**Title:** My AI gave my game's architecture 12 sessions of wrong information. 
Here's how I found out.

**Hook:** The wigglers-architecture skill was built at Session 8. Audited 
at Session 19. Score: 72 → 51. The skill was describing systems that no 
longer existed, missing 14 open issues, and had no knowledge of a major 
function split that was tried, broke everything, and got reverted.

Twelve sessions of confidence. Zero of them based on reality.

The fix: rebuilding the skill from live files instead of memory. Now it 
pulls GAME_ARCHITECTURE.md fresh from the repo at the start of every session 
instead of relying on what was written months ago.

This is what drift looks like. And it's invisible until you measure it.

---

**POST C — r/ClaudeAI or r/artificial**
**Title:** I grade my AI tools on a 100-point scale. Here's what that taught me.

**Hook:** Every skill (reusable Claude workflow) in my dev ecosystem gets scored 
across four dimensions: trigger accuracy, content quality, completeness, freshness.

What the scores revealed: my highest-performing skill (session-health, 97/100) 
was the one built to check everything else. My lowest (png-canvas-art-optimizer, 
60/100) was the one with no documented iteration loop — it worked when conditions 
were right and broke when they weren't. The score told me exactly why.

The meta-lesson: you can build a feedback loop for your AI tooling the same way 
you'd build one for anything else. Measure it. Find the gaps. Fix them. Repeat.

---

**POST D — r/SoloDev**
**Title:** I locked myself out of my second game until my first one ships. 
Literally.

**Hook:** Space Cats is sitting in a GitHub repo, untouched. It's not on 
the calendar. It can't be scheduled. The constraint is written into a file 
that Claude reads every session — if I ask to add it to the work queue, 
Claude is instructed to push back.

I did this on purpose. Because I knew I'd be tempted.

The focus problem for solo devs isn't running out of ideas. It's that new 
ideas feel more exciting than the hard middle part of finishing the current one.

---

**POST E — r/IndieDev or r/gamedev**
**Title:** The first review of my game was "I played it for just under a minute."
That reviewer was me.

**Hook:** 8,419 lines of JavaScript. 25 development sessions. A deployment 
pipeline that runs from my phone. A skill system built across 5 phases to 
keep the code clean and the AI trustworthy.

First playtest: one minute. Then back to work.

That's solo dev. Not a launch party. Not a Steam page. One minute of play 
between deploys because there were still things to fix.

The game is launching in July. The bin is real. Your worm will be in there.

---

## SUBREDDITS NOT YET IN THE PLAN (add to master doc)

- r/singularity — AI as co-dev angle lands here hard, very active
- r/learnprogramming — "not fluent" angle, huge audience
- r/programming — technical posts can do well if the content is real
- r/web_design — canvas art optimizer is interesting to this group
- r/opensource — the skills system shared as open source angle
- r/nocode — the "built without being a developer" hook
- r/digitalnomad / r/remotework — mobile workflow angle
- r/worms (if exists) — obvious
- r/earthworms — legitimate audience for the game mechanics
- r/biology — worm biology angle for some posts
- r/ecology — environmental/composting angle

---
