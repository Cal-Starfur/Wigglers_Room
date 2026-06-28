# 🪱 Wigglers Room — Marketing Master Document
### All projects, all context, 30-day launch sequence
*Created: 2026-06-22 | Owner: Cal-Starfur*

---

## PROJECT OVERVIEW

### What We're Launching
**Wigglers Room** — a persistent multiplayer worm composting sim that runs inside Reddit posts via the Devvit platform. No app, no download, no separate login. Players control earthworms in a shared bin that exists continuously on Reddit's servers.

**Wigglers Room Jr.** — a planned kids edition (5–7 year olds), no death, stars instead of karma, educational worm facts. Standalone HTML5 prototype first, then Devvit. Not in active development yet — locked until after main game launch.

**Space-Cats-Game-2026** — a second game project, locked until Wigglers Room ships. No details in this document.

### Development Status (as of June 22, 2026)
- **Game:** Session 25 complete | Devvit v0.0.201 | game.js ~8,950 lines | main.tsx ~1,050 lines
- **P1 blocker:** ISS-19 — localStorage race condition (root cause of all world-sharing bugs). Fix spec ready. **Deploy date: July 1, 2026**
- **Code freeze:** Main branch locked until July 1
- **Launch target:** Mid-to-late July 2026 (after ISS-19 fix + QA)

### The Dev Stack (relevant for content)
- Vanilla JS + HTML5 Canvas — no framework, no build step for game logic
- Devvit (Reddit's developer platform) — TypeScript host layer, KV store, Realtime
- GitHub Actions CI — typecheck + lint + test + build on every push
- Codespace bridge — Claude triggers deploys via a relay script in GitHub Codespace
- Claude as primary dev partner — every session bootstraps from repo docs, proposes changes, waits for approval before pushing

### Hard-Won Lessons (gold for dev content posts)
- `webView.mount()` only works inside `onPress` — silent crash if called in render body
- Devvit wraps postMessage in an envelope — strict origin checks break everything
- Channel names must be `[a-zA-Z0-9_]` — colons crash render silently
- External `fetch()` to non-Reddit domains silently fails — no error, nothing
- Old posts go read-only after re-upload — always create new post to test
- Always hard-refresh after deploy — Reddit cache will serve old version otherwise
- Splitting `draw()` / `updatePhysics()` into subfunctions caused a movement bug that took sessions to diagnose — now a "do not attempt" rule
- The localStorage race condition (ISS-19) only showed in production — never in playtest

### The Claude Dev Workflow (gold for AI/solo dev content posts)
- Every session: paste GitHub token → Claude bootstraps scripts → pulls GAME_ARCHITECTURE.md + WIGGLERS_AUDIT.md fresh → picks up exactly where we left off
- Claude proposes changes, shows diff, waits for approval — never touches repo without go-ahead
- Architecture doc is the source of truth — updated every session
- Skills system: reusable Claude "skills" stored in claude-skills repo — lead-dev, github-sync, session-health, contractor, devvit-pipeline, etc.
- 12 skills built, avg score 84/100 after 5 phases of development
- Bridge script in Codespace: Claude pushes to GitHub → CI runs → bridge triggers `devvit upload` automatically
- Mobile workflow: entire dev sessions run from iPhone using Claude mobile app

---

## AUDIENCE MAP

| Audience | Where on Reddit | Best hook |
|---|---|---|
| Solo indie devs | r/indiegaming, r/gamedev | Dev story + AI workflow |
| Devvit developers | r/devvit | Platform gotchas, real lessons |
| AI/Claude users | r/ClaudeAI, r/artificial, r/singularity | Building a game with Claude as co-dev |
| Composting enthusiasts | r/composting, r/vermiculture | Real mechanics, authentic knowledge |
| Idle/incremental gamers | r/incremental_games | Persistence, offline mechanics |
| Casual Reddit gamers | r/WebGames, r/InternetIsBeautiful | No install, weird concept, punchy hook |
| Parents/educators | r/Parenting (Jr. only — post-launch) | Safe kids game, educational |
| Mobile devs | r/iOSProgramming, r/androiddev | Mobile-first Claude workflow |

---

## 30-DAY LAUNCH SEQUENCE

### PHASE 1 — PRE-LAUNCH WARMUP (Days 1–10, June 22 – July 1)
*Goal: Establish presence, build relationships, generate curiosity before the game exists publicly.*
*Rules: No game links yet (nothing to link to). Pure community value. Reply to every comment.*

---

**Day 1 — June 22 | r/indiegaming**
**Title:** I've been building a multiplayer worm game that lives inside a Reddit post. Here's what that actually means.
**Angle:** Solo dev origin story. What Devvit is. Why the concept is weird. No promo — genuine dev post.
**Hook:** "No app. No download. Your worm is still there when you come back."

---

**Day 2 — June 23 | r/devvit**
**Title:** Building a persistent multiplayer game on Devvit — lessons from 25 sessions and ~9,000 lines of game.js
**Angle:** Pure technical value for the Devvit community. List of hard-won lessons that aren't in the docs.
**Hook:** Silent failures, postMessage envelope, channel name restrictions, external fetch blocked.

---

**Day 3 — June 24 | r/gamedev**
**Title:** I accidentally built my entire game dev workflow around AI — here's what that actually looks like
**Angle:** The Claude workflow. Session bootstrapping, approve-before-push, architecture-as-truth, bridge deploys. Honest about the failures too.
**Hook:** "Every session starts from a verified snapshot of reality, not from memory."

---

**Day 4 — June 25 | r/composting**
**Title:** I made a worm bin simulator — and the composting mechanics are more real than you'd expect
**Angle:** Lead with authenticity. Real keeper knowledge behind the mechanics. Coffee grounds, eggshells, moisture, castings, tea cycle.
**Hook:** "I did not make the acid mechanic up — I learned about it from my actual worm bin."

---

**Day 5 — June 26 | r/vermiculture**
**Title:** Built a worm bin game — the red wiggler people here will either love or roast the mechanics
**Angle:** Explicitly invite criticism. Ask if the mechanics hold up. Be honest about what's real vs invented.
**Hook:** Genuine curiosity from someone who keeps worms. Not a promo.

---

**Day 6 — June 27 | r/incremental_games**
**Title:** I built a persistent idle game where your worm keeps living (and dying) when you close the tab
**Angle:** Speak idle game language. Offline drain, persistence mechanics, weekly drain cycle, cocoon system.
**Hook:** "Come back after too long and you might be in trouble."

---

**Day 7 — June 28 | r/InternetIsBeautiful**
**Title:** Someone built a persistent multiplayer game that lives inside a Reddit post and the worm tea drains every 7 days
**Angle:** Shortest post. Punchy. Let the concept do the work.
**Hook:** The concept is the hook. Don't over-explain.

---

**Day 8 — June 29 | r/WebGames**
**Title:** I'm building a multiplayer game that runs inside Reddit posts — here's the weird tech behind it
**Angle:** Tech stack deep dive. Canvas, postMessage protocol, KV store, Realtime presence.
**Hook:** "External fetch() calls are silently blocked by the Devvit sandbox. No error, no timeout, just silence."

---

**Day 9 — June 30 | r/mildlyinteresting**
**Title:** I've been building a worm composting game and the most realistic mechanic in it is that you have to poop strategically
**Angle:** Humor. Light touch. The poop system is genuinely interesting and also funny.
**Hook:** "Strategic pooping" — writes itself.

---

**Day 10 — July 1 | r/gamedev**
**Title:** The localStorage race condition that broke our multiplayer — and how we finally found it (and fixed it today)
**Angle:** Post-mortem format. ISS-19 diagnosis and fix. Lands perfectly on July 1 — the actual day we ship the fix.
**Hook:** "It only manifested in production. We were testing in an environment that never showed the bug."

---

### PHASE 2 — BUILD HYPE (Days 11–20, July 2–11)
*Goal: AI/workflow angle, more dev stories, start mentioning the game is "almost ready".*

---

**Day 11 — July 2 | r/ClaudeAI**
**Title:** I've been using Claude as my primary game dev partner for 3 months — here's what the workflow actually looks like
**Angle:** Deep dive on the Claude-as-co-dev setup. Skills system, session bootstrapping, the bridge, approve-before-push. This community will love the meta of Claude helping build something.
**Hook:** "I didn't plan to build a game with an AI. It just kind of happened."

---

**Day 12 — July 3 | r/devvit**
**Title:** How we automated Devvit deploys — Claude pushes, GitHub Actions runs, a bridge in Codespace handles the upload
**Angle:** The full deploy pipeline. Practical value for other Devvit devs. Bridge script concept, why it was needed.
**Hook:** Zero manual steps from code change to Reddit.

---

**Day 13 — July 4 | r/gamedev**
**Title:** The bug that only happened in production: how Reddit's cache nearly killed our multiplayer
**Angle:** The ghost bug — reverting working code because Reddit was serving stale versions. The "always hard-refresh" rule.
**Hook:** "We reverted good code twice. The game was fine the whole time."

---

**Day 14 — July 5 | r/artificial**
**Title:** What building a game with Claude as a co-developer actually teaches you about working with AI
**Angle:** Reflective post. What works, what doesn't, what surprised me. Honest assessment.
**Hook:** The skills system — packaging reusable workflows as "skills" Claude loads each session.

---

**Day 15 — July 6 | r/composting**
**Title:** Update: the worm bin game — the composting community's feedback shaped the mechanics
**Angle:** Follow-up to Day 4 post. Reference any comments/feedback received. Shows the community had real influence.
**Hook:** Authenticity + responsiveness = goodwill.

---

**Day 16 — July 7 | r/indiegaming**
**Title:** 6 weeks from concept to working multiplayer Reddit game — what I learned
**Angle:** Timeline retrospective. Key decisions, key mistakes, what I'd do differently.
**Hook:** "The biggest mistake was not having a source-of-truth document from day one."

---

**Day 17 — July 8 | r/incremental_games**
**Title:** The weekly drain cycle — how we designed a 7-day real-time event for an idle game
**Angle:** Deep dive on the tea drain mechanic design. Why 7 days, how contribution tracking works, flood mechanic.
**Hook:** "The bin floods if nobody drains it in time. Everyone's worm takes damage."

---

**Day 18 — July 9 | r/iOSProgramming (or r/androiddev)**
**Title:** My entire game dev workflow runs on an iPhone — here's how
**Angle:** Mobile dev workflow using Claude mobile app. Sessions from phone, GitHub API, no laptop required for many sessions.
**Hook:** "I pushed working code to production from my phone."

---

**Day 19 — July 10 | r/gamedev**
**Title:** The cocoon system — designing persistence and legacy in a game where you always die
**Angle:** Design deep dive. Generations, cocoon hatch, karma persistence, headstone comments on Reddit.
**Hook:** "Your death gets posted as a Reddit comment. Real date, real cause, real karma earned."

---

**Day 20 — July 11 | r/WebGames**
**Title:** The multiplayer is real-time — here's how we built presence in a Reddit post
**Angle:** Devvit Realtime. How presence works, what other players look like (real worm segments, not ghosts), broadcast rate.
**Hook:** Technical + interesting. This community appreciates the detail.

---

### PHASE 3 — LAUNCH (Days 21–30, July 12–21)
*Goal: Announce, drive players, build early community, post-launch momentum.*
*Trigger: Only start Phase 3 when ISS-19 is fixed and deployed and the game is actually playable.*

---

**Day 21 — LAUNCH DAY | r/devvit + r/indiegaming + r/InternetIsBeautiful**
**Title (devvit):** Wigglers Room is live — persistent multiplayer composting game inside a Reddit post [link]
**Title (indiegaming):** I launched the multiplayer worm game I've been posting about — it's live on Reddit right now [link]
**Title (IIB):** This multiplayer worm game lives inside a Reddit post and your worm keeps living when you close it [link]
**Angle:** Three posts same day, different angles for each community. Link to the actual post.
**Rule:** These are the most important posts of the whole sequence. Keep them short and link-first.

---

**Day 22 — July 13 | r/gaming**
**Title:** I launched a multiplayer composting game on Reddit — it lives inside a post and your worm keeps dying
**Angle:** Broader gaming audience. More accessible framing.
**Hook:** "Your worm dies. Then you come back as your own offspring."

---

**Day 23 — July 14 | r/incremental_games**
**Title:** Wigglers Room is live — the idle worm composting game that runs inside Reddit posts [link]
**Angle:** Launch announcement for idle game community. Link to post.
**Hook:** Persistence mechanics front and center.

---

**Day 24 — July 15 | r/gamedev**
**Title:** Launch day retrospective — what shipping Wigglers Room actually looked like
**Angle:** Raw, honest launch day post. What worked, what didn't, first player reactions.
**Hook:** Real numbers if available (players, deaths, tea level after day 1).

---

**Day 25 — July 16 | r/composting + r/vermiculture**
**Title:** The worm game is live — and the first bin flooded within 6 hours
**Angle:** First real event in the game. Flood happened because real players drove the tea level up.
**Hook:** "Nobody drained it in time. Every worm in the bin took damage simultaneously."

---

**Day 26 — July 17 | r/ClaudeAI**
**Title:** The game I built with Claude as co-dev just launched — here's what session 1 vs session 25 looked like
**Angle:** Before/after of the dev workflow. Early chaos vs polished process. Claude community loves this.
**Hook:** Show the evolution of the session startup — from manual to fully automated.

---

**Day 27 — July 18 | r/indiegaming**
**Title:** First week numbers on a Reddit-native game — what actually happened
**Angle:** Honest post-launch data. Players, engagement, what surprised me.
**Hook:** Real data, good or bad. Honesty outperforms spin every time.

---

**Day 28 — July 19 | r/devvit**
**Title:** One week of Wigglers Room on Devvit — what the platform can and can't do for a live game
**Angle:** Honest Devvit retrospective. What worked great (KV, Realtime), what was painful (sandbox restrictions, post lifecycle).
**Hook:** Real feedback from a real shipped app. Gold for the Devvit team.

---

**Day 29 — July 20 | r/gamedev**
**Title:** The thing nobody told me about launching an indie game: the silence is the hardest part
**Angle:** Emotional/reflective post. Post-launch reality check. Real talk for the gamedev community.
**Hook:** Authentic, vulnerable. This community has all been there.

---

**Day 30 — July 21 | r/InternetIsBeautiful**
**Title:** A week ago I posted about a worm game inside Reddit — here's what the bin looks like now
**Angle:** Show the living world. Tea level, deaths, generations, tunnels dug. Real player data.
**Hook:** "The bin has flooded twice. 47 worms have lived and died. Generation 3 worms are running around."

---

## CONTENT RULES (read before every post)

1. **Sound like a person, not a press release.** Read each post once before you paste it. Change anything that doesn't sound like you.
2. **Reply to every comment.** The first 2 hours after posting are critical. Be there.
3. **Never cross-post identical content.** Each post is written for its specific community.
4. **No links until Phase 3.** There's nothing to link to yet. Links before launch look desperate.
5. **If a post flops, move on.** < 5 upvotes in 2 hours = it didn't land. No panic, just next post.
6. **If a post pops, lean in.** Spend time in comments. That's where the actual audience is built.
7. **Never mention this is a marketing plan.** You're a dev sharing your work. That's all.
8. **Composting communities are the most skeptical.** Earn their respect before you ask for anything.
9. **Dev communities want honesty about failure.** Mistakes and bugs make better posts than success stories.
10. **Phase 3 timing is flexible.** Don't launch Day 21 until the game is actually good. A bad launch is worse than a late one.

---

## POST STATUS TRACKER

| Day | Date | Subreddit | Status |
|-----|------|-----------|--------|
| 1 | Jun 22 | r/indiegaming | ⏳ Ready to post |
| 2 | Jun 23 | r/devvit | ⏳ Queued |
| 3 | Jun 24 | r/gamedev | ⏳ Queued |
| 4 | Jun 25 | r/composting | ⏳ Queued |
| 5 | Jun 26 | r/vermiculture | ⏳ Queued |
| 6 | Jun 27 | r/incremental_games | ⏳ Queued |
| 7 | Jun 28 | r/InternetIsBeautiful | ⏳ Queued |
| 8 | Jun 29 | r/WebGames | ⏳ Queued |
| 9 | Jun 30 | r/mildlyinteresting | ⏳ Queued |
| 10 | Jul 1 | r/gamedev | ⏳ Queued — lands on ISS-19 fix day |
| 11 | Jul 2 | r/ClaudeAI | ⏳ Queued |
| 12 | Jul 3 | r/devvit | ⏳ Queued |
| 13 | Jul 4 | r/gamedev | ⏳ Queued |
| 14 | Jul 5 | r/artificial | ⏳ Queued |
| 15 | Jul 6 | r/composting | ⏳ Queued |
| 16 | Jul 7 | r/indiegaming | ⏳ Queued |
| 17 | Jul 8 | r/incremental_games | ⏳ Queued |
| 18 | Jul 9 | r/iOSProgramming | ⏳ Queued |
| 19 | Jul 10 | r/gamedev | ⏳ Queued |
| 20 | Jul 11 | r/WebGames | ⏳ Queued |
| 21 | Jul 12 | r/devvit + r/indiegaming + r/IIB | 🚀 LAUNCH DAY |
| 22 | Jul 13 | r/gaming | ⏳ Post-launch |
| 23 | Jul 14 | r/incremental_games | ⏳ Post-launch |
| 24 | Jul 15 | r/gamedev | ⏳ Post-launch |
| 25 | Jul 16 | r/composting + r/vermiculture | ⏳ Post-launch |
| 26 | Jul 17 | r/ClaudeAI | ⏳ Post-launch |
| 27 | Jul 18 | r/indiegaming | ⏳ Post-launch |
| 28 | Jul 19 | r/devvit | ⏳ Post-launch |
| 29 | Jul 20 | r/gamedev | ⏳ Post-launch |
| 30 | Jul 21 | r/InternetIsBeautiful | ⏳ Post-launch |

---

## RELATED DOCUMENTS IN THIS REPO
- `WIGGLERS_PRELAUNCH_POSTS.md` — Full copy for Days 1–10 (ready to paste)
- `WIGGLERS_MARKETING_PLAN.md` — Strategic overview, audience breakdown, channel strategy
- `GAME_ARCHITECTURE.md` — Technical source of truth
- `WIGGLERS_AUDIT.md` — Bug log and session history
- `WIGGLERS_DESIGN_FUTURE.md` — 30-system expansion design doc
- `WIGGLERS_ROOM_JR_DESIGN.md` — Kids edition design doc

*Next step: Generate full post copy for Days 11–30 in a follow-up session.*
*Update the tracker above as posts go live — change ⏳ to ✅ (posted) or ❌ (skipped).*

