# Wigglers Room — Systems & Design Expansion Doc
> Created: 2026-06-19 Session 19
> Purpose: Map every existing system, identify gaps, and tie future feature ideas to each system as natural extensions.
> This is a living design document — update alongside GAME_ARCHITECTURE.md each session.

---

## How to Read This Doc

Each section = one game system.
- **What it does** — current implementation in plain English
- **What's missing** — gaps vs. genre expectations
- **Extensions** — concrete ideas that grow naturally from this system

---

## 1. Worm Movement & Steering

**What it does:** Touch/mouse input steers the worm head. A segment chain follows the head using position history. Speed and turn radius are fixed. Worm is confined to the bin.

**What's missing:**
- No speed variation — worm always moves at the same pace regardless of condition
- No terrain resistance — compost feels identical to tier 0 airspace

**Extensions:**
- Speed tied to gut fill — well-fed worm moves faster, starving worm slows
- Compost resistance — moving through dense compost costs slightly more gut
- Tunnel highways — worm moves faster inside its own tunnels (already dug = clear path)

---

## 2. Hunger & Gut

**What it does:** `pGut` fills when eating, bleeds at a fixed rate over time. When gut empties completely the worm starves. `pHunger` is derived each frame as `1 - (pGut/pGutMax)`. Offline drain applied on session load.

**What's missing:**
- No hunger visibility to other players — ghost worms show no hunger state
- Offline drain is purely punitive — no positive offline mechanic

**Extensions:**
- Gut bar visible on ghost worm (size proxy) — multiplayer awareness
- Offline feeding — cocoons or sleeping worms slowly absorb ambient moisture/castings
- Hunger stages with visual feedback — healthy green → pale → gaunt segments

---

## 3. HP & Damage Sources

**What it does:** `pHP` (0–1) drained by: acid chunks, oversaturation (`pooled > 0.6`), flood (`tLvl` too high), starvation. Death triggers headstone + queue.

**What's missing:**
- No HP recovery mechanic beyond just "stop taking damage"
- No visible HP feedback on worm body itself
- Only negative pressure — no healing items or safe zones

**Extensions:**
- Eggshell eating restores HP (antidote already has a glow signal — wire it up)
- Deep compost rest — sleeping in tier 2 slowly heals HP
- Moisture sweet spot — `pooled` 0.3–0.5 gives a passive HP regen tick

---

## 4. Eating — Trash Chunks (Tier 0)

**What it does:** 27 trash types in tier 0. Worm nibbles on contact. Each chunk has HP that degrades on nibble. Acid variants (coffee grounds, citrus) deal HP damage. Passive weathering degrades chunks over time independent of worm.

**What's missing:**
- No food preference or specialization — all food is equivalent
- Acid is a threat but no upside — risky food should have a reward
- No food chain — some scraps should unlock others (compost cascade)

**Extensions:**
- Acid food gives a speed boost or gut efficiency bonus if eaten with high enough HP buffer
- Food combos — eating banana peel after coffee neutralizes acid (eggshell = antidote, already signaled)
- Rare scraps — occasional golden item drops that give big karma or temporary stat buff
- Chunk discovery log — first time eating each of 27 types unlocks a "field notes" entry

---

## 5. Eating — Tier 1 Debris Scraps

**What it does:** Small fragments that fall from tier 0 into tier 1 compost. Worm eats on contact. These are the primary food source in the compost layer.

**What's missing:**
- Visually indistinct from ambient particles
- No size variation in rewards — all fragments identical

**Extensions:**
- Fragment size = reward size — larger debris = bigger gut fill
- Fragment type carries parent chunk's properties — coffee debris still slightly acid
- Rich compost produces more fragments (castingEnrichment already drives regen rate — show this to players)

---

## 6. Tunnel System (pPath)

**What it does:** Worm digs a channel through compost as it moves. Path stored as `pPath[]` with null segment boundaries. Tunnels decay over time. Drops follow tunnels.

**What's missing:**
- No tunnel map or visibility — player can't see their tunnel network from above
- Tunnels are single-player — other players' tunnels invisible
- No strategic reason to dig specific shapes

**Extensions:**
- Tunnel network mini-map overlay (small, corner HUD, opt-in tap)
- Other players' tunnels shown as faded channels — cooperative infrastructure
- Named tunnel segments — junction naming ("Main drain", "East branch")
- Tunnel age visible — fresh tunnels bright, old tunnels faded = know what's about to decay

---

## 7. Down Drain

**What it does:** Hold still over compost → charges a timer → stamps a `sumpExit` point → tea drops now flow downward through tunnel to sump. Karma reward on successful drop delivery.

**What's missing:**
- No feedback on how many drops are flowing through
- No visible "drain is active" indicator beyond the progress ring charging
- Player doesn't know if the drain connected until drops actually arrive

**Extensions:**
- Drain flow counter in HUD — "12 drops drained this session"
- Active drain glows in tunnel render — bright line when drops are flowing through it
- Drain efficiency rating — longer tunnel = slower flow, short vertical drain = fast

---

## 8. Up Drain

**What it does:** Second hold after down drain exists → stamps second `sumpExit` at compost bottom → drops travel upward to compost top, enriching upper layers.

**What's missing:**
- Extremely unintuitive — players likely don't discover this
- No HUD signal that up drain is possible/ready
- No visible difference in compost enrichment from up drains vs down drains

**Extensions:**
- Up drain tutorial trigger — first time compost hits saturation threshold, hint appears
- Up drain visible as upward-flowing green channel in render
- Up drain generates "moisture recycling" bonus karma distinct from down drain

---

## 9. Junction System

**What it does:** Worm holds still over an existing tunnel → charges junction timer → stamps a junction point connecting two separate tunnel segments.

**What's missing:**
- Almost certainly undiscovered by players
- Junction indicator shows a ring but no explanation of what it does
- No reward for building complex networks

**Extensions:**
- Junction bonus karma — building a network pays off
- Junction count shown in HUD ("Network: 3 junctions")
- Junction map becomes a post-level trophy — "you built a 5-node network this life"

---

## 10. Clog System

**What it does:** Poop deposits clog at tunnel points. Clogs block tea drops. Clogs decay over time (faster in rich compost). Decayed clogs burst back into poop drops. Strong clogs at `sumpExit` block drain entirely.

**What's missing:**
- No player feedback when a drain is clogged vs. just slow
- Clog is purely negative — no mechanic that makes clogs useful
- No way to actively clear a clog (digging through it?)

**Extensions:**
- Clog indicator on drain mouth — "🪱 Drain blocked" HUD when a sumpExit clog is detected
- Worm can dig through clog — passing over a clogged point clears it faster
- Clog as fertilizer — high-clog compost with rich castings = food spawns faster there

---

## 11. Compost Saturation / pooled (ISS-13 — BROKEN)

**What it does (intended):** `pooled` (0–1) tracks moisture level in compost. High moisture slows worm, damages HP above 0.6, triggers flood visuals. Should decrease when player drains tunnels to sump.

**Current bugs:** See `WIGGLERS_AUDIT_V20.md → ISS-13`. Draining doesn't reduce it. Evaporation drains it silently. Ghost value from KV_WORLD for new players.

**What's missing (post-fix):**
- No moisture sweet spot reward — only punishment for too much
- No visible moisture gradient in compost (wet at bottom, dry at top)
- No player tool to add moisture intentionally (why would you want more water?)

**Extensions (post-fix):**
- Moisture sweet spot (`pooled` 0.3–0.5) gives passive gut efficiency bonus
- Moisture gradient — upper compost drier, lower wetter, displayed as color gradient
- Intentional watering — rain events or player can "invite rain" via karma spend
- Dry compost penalty — `pooled < 0.1` slows fragment spawn, worm moves sluggishly

---

## 12. Castings Enrichment

**What it does:** `castingEnrichment` (0–1) built by poop drops reaching the sump floor. Drives tunnel regen rate, clog decay speed, and fragment spawn rate. Decays slowly over time.

**What's missing:**
- Completely invisible to players — no HUD indicator
- No player-facing name for this mechanic
- No payoff moment — enrichment just makes things marginally faster

**Extensions:**
- Enrichment HUD indicator — soil quality icon or color shift in compost layer
- Enrichment tiers — "Poor Soil → Active Compost → Rich Humus" with visible label
- Enrichment milestone rewards — reaching 0.8 triggers a Snoo visit or rare scrap drop
- Enrichment exported as "Compost Readiness" — bin reaches 100% and the post celebrates

---

## 13. Sump Tea Level / tLvl

**What it does:** `tLvl` (0–1) fills as drops hit tea surface (each drop +0.001). Drains via player valve or weekly Snoo drain. High tLvl triggers flood. Full sump = weekly karma bonus.

**What's missing:**
- Tea level visible but its meaning isn't — players don't know 0.9 = flood
- No shared progress toward filling it — each player contributes but sees no collective progress
- No reason to care about tea level between floods

**Extensions:**
- Tea level % shown in HUD with flood warning threshold marked
- Shared fill bar — "Bin tea: 67% — drain in 2 days" visible to all players
- Tea quality — castingEnrichment at drain time affects karma bonus multiplier
- Players can see their % contribution to current tea level ("you added 23% this week")

---

## 14. Flood System

**What it does:** When `tLvl ≥ 0.9`, flood activates. Worm takes HP damage in the sump zone. Server broadcasts flood state to all players. Player valve drain can relieve it.

**What's missing:**
- No warning before flood hits — it just happens at 0.9
- Flood feels punitive with no cooperative angle
- No flood history — how many times has this bin flooded?

**Extensions:**
- Flood warning at 0.75 — "⚠ Tea rising — drain soon!" HUD message
- Flood relief karma bonus — player who drains flood gets bonus karma + Reddit flair
- Flood history visible on post — "This bin has flooded 3 times"
- Flood triggers cooperative race — all online players get the valve UI simultaneously

---

## 15. Weekly Drain Cycle

**What it does:** 7-day real-time timer. When it fires, Snoo cinematic plays, sump drains, karma bonus shared based on `tLvl` and `weeklyContrib`. Triggers feed cinematic after.

**What's missing:**
- Players don't know when the weekly drain is coming
- No way to see how much of the karma bonus is yours
- No ceremony or announcement when it fires — just a cinematic

**Extensions:**
- Countdown shown in HUD (already exists — "🪣 Refresh in 5d 14h") ✅ extend with tea level context
- Pre-drain announcement on Reddit post — mod comment "Drain fires in 24 hours"
- Karma breakdown at drain — popup showing each contributor's share
- Weekly drain as a community event — players try to fill sump before drain fires

---

## 16. Feed Cinematic / Scraps Refill

**What it does:** When scraps are empty, Snoo tips a food basket in and refills tier 0 trash chunks. Chains from weekly drain.

**What's missing:**
- No anticipation — scraps just run out and Snoo appears
- No player agency in timing the refill
- No variation in what gets refilled

**Extensions:**
- Scraps warning when density drops below 20% — "🗑 Bin getting empty"
- Food diversity — different Snoo visits bring different scrap types (coffee week, fruit week)
- Player can "request early refill" by spending collective karma — community decision

---

## 17. Emergency Delivery

**What it does:** Collective karma pot fills when players contribute. When it hits 50 karma, Snoo makes an emergency delivery.

**What's missing:**
- Players can't see the collective pot or their contribution
- 50 karma threshold is invisible — no UI showing progress
- Fires silently — no announcement that it's possible

**Extensions:**
- Emergency pot progress bar visible in HUD to all players
- Players choose what gets delivered (vote via two-finger tap on item type)
- Emergency delivery gives extra rare scraps not available in normal refill

---

## 18. Weather Simulation

**What it does:** Simulated temp, humidity, precip. Seasonal baselines. Weather events (rainstorm, dry spell, heat wave). Drives evap rate and rain drops. Displayed in HUD.

**What's missing:**
- Weather is visible but its gameplay effect is unclear — players don't know it affects anything
- No player response to weather — you just watch it
- Seasonal baseline is real calendar month but players don't know this

**Extensions:**
- Weather effect tooltips — "Hot & dry: compost drying faster"
- Rain = free moisture top-up — players learn to value rainstorms
- Heat wave = acid food more dangerous — temp affects food chemistry
- Seasonal announcements — "🍂 Autumn — slower decomposition this month"

---

## 19. Karma

**What it does:** Earned from eating, pooping deep, drain bonuses, weekly tea bonus. Spent on death buyback (50 karma). Persisted across generations.

**What's missing:**
- One spend option (buyback) — no decisions, no shop
- No visible karma economy across the bin — what are other players earning?
- Karma carries across generations but has no generation-specific meaning

**Extensions:**
- **Karma shop:** spend karma on temporary buffs (gut efficiency, speed boost, acid resistance)
- Bin upgrades purchaseable with collective karma (bigger lid, better drainage — visual + mechanical)
- Karma leaderboard on Reddit post — weekly top contributor
- Generation karma bonus — each gen adds a flat karma multiplier (gen 5 worm earns 1.5x)

---

## 20. Generation System

**What it does:** `generation` increments on natural death. Each gen gets a unique color palette and name. Displayed above worm. Cocoon hatching also increments gen.

**What's missing:**
- Generations feel cosmetic — no meaningful mechanical difference
- No generation history visible — what did your previous worms accomplish?
- No community record — who is on the highest generation on this post?

**Extensions:**
- Generation traits — each gen inherits a random minor buff from parent (acid resistance, gut size, tunnel speed)
- Generation lineage card — Reddit comment on natural death shows gen history summary
- Gen milestone rewards — gen 5 unlocks a worm skin, gen 10 gets a permanent title
- Community gen record displayed on post — "Highest generation: Gen 12 (u/username)"

---

## 21. Cocoon System

**What it does:** 2800 karma threshold → swipe-up gesture → lay cocoon (max 3). Matures after 7 days real time. Hatches into an unclaimed worm. Player must open the game to claim it.

**What's missing:**
- No tending mechanic — you lay it and ignore it
- No risk — cocoon can't fail, can't be damaged
- No community visibility — other players don't see your cocoons
- Hatch notification requires player to check the game

**Extensions:**
- Cocoon moisture dependency — needs `pooled` in a healthy range to mature on time (tie to saturation fix)
- Cocoon visible to all players — other worms can "tend" a cocoon by staying near it
- Cocoon hatches early if bin conditions are excellent
- Reddit DM / post comment when your cocoon hatches — "🥚 Your cocoon hatched! Come claim it"

---

## 22. Death & Respawn

**What it does:** 6 death causes. Headstone comment posted to Reddit thread with real dates, generation, karma, cause. Death screen with buyback option. Queue system for next worm.

**What's missing:**
- Headstone is posted but buried in comment thread — no in-game graveyard
- Death cause affects nothing in next life
- No eulogy or player-written epitaph

**Extensions:**
- In-game graveyard — tap the compost wall to browse past headstones
- Death cause shapes next gen trait — died of acid? next gen is slightly acid resistant
- Player can write a short epitaph (1 line) shown on headstone comment
- Weekly "In Memoriam" post lists all worms that died that week

---

## 23. Multiplayer Presence

**What it does:** Other players shown as ghost worms via Realtime. Position, size, sleep state broadcast every ~1s. Pruned after 90s without update.

**What's missing:**
- Ghost worms are visual only — no interaction
- No way to communicate with other players
- No cooperative action beyond sharing the same bin

**Extensions:**
- Worm emotes — tap another worm to send a quick emoji (👋 🫸 💩)
- Cooperative drain — two worms holding in the same spot charges the junction faster
- Bump interaction — worms briefly nudge each other on collision (purely cosmetic)
- Player count badge — "3 worms in the bin right now"

---

## 24. Queue & Pending Worm System

**What it does:** On death, player enters queue. Next slot opens when current occupant dies or buys back. Unclaimed worms (from cocoons) starve if not claimed within the hatch window.

**What's missing:**
- Queue position not shown to waiting players
- No idle experience while queued — just a wait screen
- No reason to rush back when your slot opens

**Extensions:**
- Queue position HUD — "You're #2 in line — ~12 min estimated wait"
- Queued players can watch the bin as observers (view mode exists for sleeping — extend it)
- Queue notification on Reddit — comment on post when your slot opens
- Queue karma trickle — earn a small amount of karma passively while waiting

---

## 25. Sleep System

**What it does:** Long-press → worm locks in place. Stops hunger drain briefly. Worm can be woken by tap.

**What's missing:**
- Sleep is mostly used to park — no active gameplay incentive
- Sleep location matters for nothing except not dying

**Extensions:**
- Safe sleep zones — sleeping in deep compost (tier 2) restores HP slowly
- Sleep depth bonus — longer sleep in good conditions = wake up with gut partially filled
- Sleep stance — worm coils visually during sleep (cosmetic but satisfying)

---

## 26. Poop System

**What it does:** Two-finger tap → deposits poop drop at worm position. Poop drops fall through compost, deposit clogs at tunnel points, eventually reach sump and add to castingEnrichment.

**What's missing:**
- Timing of poop relative to location matters but nothing signals the right moment
- No reward for strategic pooping (deep = better, but is this communicated?)
- Poop is a tap action but most players will discover it by accident

**Extensions:**
- Depth poop bonus karma — poop deeper = bigger bonus, visible popup feedback
- Poop streak — consecutive deep poops within a time window give a multiplier
- Poop HUD hint — when gut is very full, brief indicator suggesting poop action

---

## 27. Player Valve Drain

**What it does:** Tap on the valve → opens drain → sump tea drains at `VALVE_DRAIN_RATE` per frame. Karma reward on close. Used for flood relief.

**What's missing:**
- Valve location not obvious to new players
- No indication that the valve exists or what it does
- Flood relief is the only context where players find it

**Extensions:**
- Valve tutorial trigger — first time tLvl hits 0.5, a brief HUD hint points to it
- Valve upgrade — spend karma to increase drain rate permanently (bin upgrade)
- Valve visible glow when tLvl is high enough to be worth draining

---

## 28. Offline Hunger Drain

**What it does:** Time-away calculated on session load. Gut drained proportionally. Capped at 0.85 drain so worm arrives very hungry but never quite dead from offline time alone.

**What's missing:**
- Offline time is purely punitive — no positive offline mechanic
- No offline narrative — just "you were away X hours, gut drained"

**Extensions:**
- Offline passive earning — sleeping worm in rich compost slowly earns karma ticks
- Offline scrap summary — "while you were away, 3 scraps decomposed and 1 cocoon grew"
- Offline healing — HP recovers slowly while offline if conditions were good when you left

---

## 29. HUD & Feedback

**What it does:** HP+gut merged bar, karma display, weather HUD, bin refresh countdown, progress rings, clitellum indicator, acid glow, eggshell glow, drain bonus popups, death screen.

**What's missing:**
- No new player onboarding — zero tutorial or contextual hints
- Many systems have no HUD presence at all (enrichment, tunnel health, tea %)
- No achievement / milestone popups

**Extensions:**
- First-session contextual hints — one hint per new mechanic discovered (eat, poop, drain, sleep)
- Enrichment soil color shift — compost layer visibly darkens as castingEnrichment rises (may already partially exist)
- Tea level % badge on sump wall
- Milestone popups — "First drain! 🪱", "100 karma earned", "Gen 2 unlocked"

---

## 30. Reddit Integration

**What it does:** Headstone comments on death. Post creation (mod-only). Realtime channels per post. Username + Snoovatar from Reddit auth.

**What's missing:**
- One-way integration — game writes to Reddit but Reddit writes nothing back to game
- No in-game awareness of comment activity
- No community stats visible in-game

**Extensions:**
- Weekly recap comment — automated post comment every Monday with bin stats (top earner, most drains, deaths, highest gen)
- Community milestone announcements — "🎉 This bin hit Gen 10 for the first time!"
- In-game comment preview — tap a headstone to see replies to that comment
- Mod tools — mod can trigger a special event from a Reddit comment command

---

## Summary — Highest Impact Additions

| Priority | Feature | System it extends | Effort |
|----------|---------|-------------------|--------|
| 🔴 P1 | Fix ISS-13 (saturation) | #11, #7, #8 | S20 |
| 🟠 P2 | Enrichment HUD + soil color | #12 | Low |
| 🟠 P2 | Tea level % + flood warning | #13, #14 | Low |
| 🟠 P2 | Drain active glow in tunnel | #7, #8 | Low |
| 🟡 P3 | Moisture sweet spot reward | #11, #3 | Medium |
| 🟡 P3 | Karma shop (2–3 items) | #19 | Medium |
| 🟡 P3 | Generation traits | #20 | Medium |
| 🟡 P3 | Cocoon moisture dependency | #21, #11 | Medium |
| 🟢 Future | In-game graveyard | #22 | High |
| 🟢 Future | Weekly recap Reddit comment | #30 | High |
| 🟢 Future | Worm emotes | #23 | Medium |
| 🟢 Future | Cooperative drain charge | #23, #7 | High |

