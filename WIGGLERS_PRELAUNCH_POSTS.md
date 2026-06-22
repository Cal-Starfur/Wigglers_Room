# 🪱 Wigglers Room — Pre-Launch Reddit Post Calendar
### Daily posts starting June 22, 2026 | Written for Cal-Starfur to copy-paste and post manually

---

## HOW TO USE THIS
- One post per day, copy the text, post manually from your Reddit account
- Each post is written for a specific subreddit — don't cross-post identical content
- You can skip days or reorder — just don't post to the same subreddit twice in a row
- Reply to comments personally — this is relationship building, not broadcasting

---

## DAY 1 — June 22 | r/indiegaming
**Title:** I've been building a multiplayer worm game that lives inside a Reddit post. Here's what that actually means.

**Body:**
For the past few months I've been building something I couldn't find anywhere else — a persistent multiplayer composting sim that runs inside a Reddit post. No app. No download. No login beyond your Reddit account. You just open the post and your worm is there.

The game is called Wigglers Room. Each player controls an earthworm living in a shared compost bin. The bin has four layers — scraps at the top, active soil, deep compost, and a worm tea sump at the bottom. Your worm eats, digs tunnels, poops (which enriches the soil), and eventually dies. Then you come back as your own offspring.

The world is genuinely shared — the tea level fills all week from everyone's contributions and drains every 7 days. When it overflows, everyone's worm takes damage. When someone drains it in time, everyone benefits. You can see other worms moving around in real time.

I'm a solo dev. The whole thing is vanilla JS + HTML5 Canvas running inside Reddit's Devvit platform. The game.js file is sitting at about 9,000 lines right now.

Launch is a few weeks out. Happy to answer any questions about how it works under the hood.

**Subreddit note:** Genuine dev post, not a promo. Answer all comments personally.

---

## DAY 2 — June 23 | r/devvit
**Title:** Building a persistent multiplayer game on Devvit — lessons from 25 sessions and ~9,000 lines of game.js

**Body:**
I've been building Wigglers Room on Devvit for a few months and wanted to share some hard-won lessons for anyone else building on the platform.

**The things that bit me that aren't in the docs:**

`webView.mount()` only works inside `onPress` — if you call it in the render body it fires on every render and crashes. Took me an embarrassingly long time to figure that out.

Devvit wraps your `webView.postMessage()` calls in an envelope: `{ type: 'devvit-message', data: { message: ... } }`. The origin of host→webview messages is NOT `https://www.reddit.com` — if you put a strict origin check in your webview you'll never receive anything.

Channel names in `useChannel` must be `[a-zA-Z0-9_]` only. Colons crash the render silently.

External `fetch()` to non-Reddit domains silently fails. The sandbox blocks it and you get nothing — no error, no timeout, just silence.

Old posts go read-only after you re-upload. Always create a new post to test a new version, never rely on the old one updating.

**The workflow I settled on:**
Claude pushes to GitHub → CI runs typecheck + lint + build → a bridge script in my Codespace handles `git pull && devvit upload` automatically. No manual deploy steps.

Happy to share more if anyone's building on Devvit. It's a genuinely interesting platform and the community is still small enough that you can actually stand out.

**Subreddit note:** Pure technical content, no game promo. This is the Devvit developer community.

---

## DAY 3 — June 24 | r/gamedev
**Title:** I accidentally built my entire game development workflow around AI — here's what that actually looks like

**Body:**
I didn't plan to build a game using Claude as my primary dev partner. It just kind of happened, and now I can't imagine going back.

Here's the actual workflow:

I open a new Claude conversation, paste my GitHub token, and it bootstraps itself — pulls the architecture doc and audit log fresh from the repo, reads the current state of the codebase, and picks up exactly where the last session left off. Every session starts from a verified snapshot of reality, not from memory.

When I want to make a change, Claude proposes it, shows me a diff, and waits for my approval before pushing anything to GitHub. It never touches the repo without me saying go. After the push, a bridge script in my Codespace handles the deploy automatically.

The thing that made this work was treating the docs as the source of truth, not the code. We maintain a `GAME_ARCHITECTURE.md` that gets updated every session — naming conventions, deploy rules, what's broken, what must never be touched again. Claude reads it cold every session and knows exactly what's going on.

The failures were instructive too. We lost good code twice chasing bugs that turned out to be Reddit's cache serving old versions. We reverted working code because we thought it was broken. Those failures drove the "always hard-refresh after deploy" rule that's now in the architecture doc.

The game I'm building is a multiplayer worm composting sim that runs inside Reddit posts. But the workflow is the interesting part. Happy to go deeper on any of it.

**Subreddit note:** Focus is the workflow, not the game. This community cares about process.

---

## DAY 4 — June 25 | r/composting
**Title:** I made a worm bin simulator — and the composting mechanics are more real than you'd expect

**Body:**
I keep worms. I also make games. A few months ago I combined those interests in a way that made complete sense to me and probably sounds completely unhinged to everyone else.

Wigglers Room is a multiplayer composting sim. Players control earthworms living in a shared bin. The bin has real composting mechanics — not gamified approximations, actual composting logic.

Coffee grounds and citrus damage your worm's health because they're too acidic. Eggshells act as an antidote because they neutralize pH. Wet, dense compost slows your movement. If the moisture level gets too high the whole bin floods. Worm castings (poop) deposited deep in the bin enrich the soil and increase fragment spawn rates. Tunnels you dig persist and decay over time. Tea collects in the bottom reservoir all week and drains on a real 7-day cycle.

I did not make the acid mechanic up — I learned about it from my actual worm bin.

The game runs inside Reddit posts via the Devvit platform. No download, no app, just open the post and start digging. Launch in a few weeks.

If you're into vermiculture you'll probably find the mechanics familiar. Happy to answer any questions about how I translated the real thing into gameplay.

**Subreddit note:** Lead with authenticity. These people know their composting. Don't oversell it.

---

## DAY 5 — June 26 | r/vermiculture  
**Title:** Built a worm bin game — the red wiggler people here will either love or roast the mechanics

**Body:**
I maintain a red wiggler bin and I've been building a composting game for the past few months. I'm genuinely curious whether the mechanics hold up to people who actually know worms.

The things I tried to get right:
- Acid foods (coffee, citrus) damage the worm. Eggshells neutralize it.
- Moisture matters — too wet and the worm takes damage, too dry and fragment spawn rates drop
- Worm castings deposited deep in the bin enrich the soil — better castings = faster decomposition rate, more food fragments
- Cocoons take 7 real-world days to hatch
- The tea collects in a sump at the bottom and drains on a weekly cycle

The things I simplified or invented:
- The worm has a "gut" bar instead of a realistic gut transit time
- Tunnels glow (they don't do that)
- There's a farmer character named Snoo who tips in new scraps

It's a multiplayer game running inside Reddit posts, launching in a few weeks. But honestly I posted here because I want to know if the mechanics are embarrassing to anyone who actually keeps worms.

**Subreddit note:** Ask for feedback, not attention. This community will respect honesty about what's real vs gamified.

---

## DAY 6 — June 27 | r/incremental_games
**Title:** I built a persistent idle game where your worm keeps living (and dying) when you close the tab

**Body:**
Wigglers Room is the game I wanted to play but couldn't find.

Your worm has a gut that drains while you're away. Come back after 8 hours and you'll be very hungry but still alive (the game caps offline drain at 85%). Come back after too long and you might be in trouble.

The idle mechanics:
- Tunnel decay — your tunnels slowly collapse while you're away
- Tea accumulates in the sump all week from everyone's contributions, not just yours
- Worm castings you deposited before logging off continue to enrich the soil
- Cocoons mature on real-world time — 7 days, regardless of whether you're playing

The active mechanics:
- You dig tunnels through compost to create drainage networks
- You eat scraps to fill your gut, poop in the deep zone to contribute castings
- You drain the tea sump to avoid floods
- Other players' worms are visible moving around in real time

It runs inside a Reddit post via the Devvit platform. No install, no download. The whole shared bin persists between sessions on Reddit's servers. Tea level is the same for everyone.

Launching in a few weeks. Happy to answer questions about the persistence model.

**Subreddit note:** This audience cares about the idle/clicker loop. Speak their language.

---

## DAY 7 — June 28 | r/InternetIsBeautiful
**Title:** Someone built a persistent multiplayer game that lives inside a Reddit post and the worm tea drains every 7 days

**Body:**
Wigglers Room — a multiplayer worm composting sim that runs inside Reddit posts.

Your earthworm lives in a shared bin with other players' worms. The bin has a tea reservoir at the bottom that fills all week from everyone's activity. Every 7 days it drains automatically and the top contributors get a karma bonus. If it overflows before the drain, the bin floods and everyone's worm takes damage.

No download. No app. Just open the post. Your worm is still there when you come back.

Launching in a few weeks. When it goes live it'll be linked here.

**Subreddit note:** This is your shortest post. r/InternetIsBeautiful works best with punchy, link-first content. Keep it tight.

---

## DAY 8 — June 29 | r/webgames
**Title:** I'm building a multiplayer game that runs inside Reddit posts — here's the weird tech behind it

**Body:**
Wigglers Room runs inside Reddit via their Devvit platform — custom posts that can run actual web apps inside the Reddit feed. The game is vanilla JS + HTML5 Canvas, about 9,000 lines, talking to a TypeScript host layer via postMessage.

Persistence is handled by Reddit's KV store — your worm state, the shared world state, and the tea level are all stored server-side. Multiplayer presence is via Reddit Realtime — other players broadcast their position and health roughly once per second, and you see them as translucent ghost worms.

The weirdest technical constraint: external fetch() calls are silently blocked by the Devvit sandbox. No error, no timeout, nothing. This killed my plan to pull real weather data in the early builds.

The game itself: you're an earthworm in a shared compost bin. You eat, dig tunnels, poop, and die. The bin is shared — tea level fills from everyone's activity and drains weekly. Launch is a few weeks out.

**Subreddit note:** Technical detail is the hook here. This community wants to know how it works.

---

## DAY 9 — June 30 | r/outside (or r/mildlyinteresting)
**Title:** I've been building a worm composting game and the most realistic mechanic in it is that you have to poop strategically

**Body:**
Wigglers Room is a composting simulator. You control an earthworm. The strategic depth I'm most proud of is the poop system.

You poop by tapping with two fingers. Where you poop matters — deep in the compost zone, your castings enrich the soil and increase food spawn rates. Poop near the surface and you're just making a mess. Poop into existing tunnels and the deposits create clogs that block your drainage network.

The game is real in the ways you'd expect: acid food damages your worm, the moisture level affects movement, cocoons take 7 real days to hatch. But the strategic pooping was the thing I'm genuinely proud of that took the longest to get right.

Multiplayer composting game inside Reddit posts. Launching in a few weeks.

**Subreddit note:** This is a lighter, more humorous angle. r/outside is absurdist outdoor/nature content — "strategic pooping" will land there.

---

## DAY 10 — July 1 | r/gamedev (follow-up)
**Title:** The localStorage race condition that broke our multiplayer — and how we finally found it

**Body:**
We've been chasing a bug in Wigglers Room for weeks. Players would load the game and see stale world state — other players' positions from a previous session, tea levels that didn't match reality, tunnels that shouldn't exist anymore.

The root cause turned out to be a localStorage race condition. The game was reading from localStorage on init before the Devvit host had finished sending the authoritative server state. The localStorage load was winning the race and populating the world with stale cached data before the fresh KV store values arrived.

The fix is to completely remove localStorage as an initialization source for world state. Server is authoritative, full stop. If the server data hasn't arrived yet, you wait. localStorage is only for UI preferences, never for game state.

We didn't find this for weeks because it only manifested in production — the Devvit message timing is different in playtest mode. We were testing in an environment that never showed the bug.

The game is a multiplayer worm composting sim running inside Reddit posts. July 1st is the day we're cleared to touch the main branch again and ship this fix. Felt like the right day to write it up.

**Subreddit note:** Pure post-mortem format. Developers love a good war story.

---

## SUBREDDIT QUICK REFERENCE

| Day | Subreddit | Angle |
|-----|-----------|-------|
| 1 | r/indiegaming | Game overview, solo dev |
| 2 | r/devvit | Platform gotchas, technical |
| 3 | r/gamedev | AI-assisted dev workflow |
| 4 | r/composting | Real composting mechanics |
| 5 | r/vermiculture | Authenticity check, worm people |
| 6 | r/incremental_games | Idle/persistence mechanics |
| 7 | r/InternetIsBeautiful | Short punchy hook |
| 8 | r/webgames | Tech stack deep dive |
| 9 | r/mildlyinteresting | Humor angle (strategic pooping) |
| 10 | r/gamedev | Bug post-mortem (localStorage race) |

---

## RULES FOR POSTING
1. Copy the text, read it once, make it sound like you — not a press release
2. Reply to every comment personally within a few hours if possible
3. Never mention this is part of a marketing plan
4. If a post flops (< 5 upvotes in 2 hours), don't sweat it — move to the next one
5. If a post pops off, lean in — spend time in the comments, that's where the real audience builds

