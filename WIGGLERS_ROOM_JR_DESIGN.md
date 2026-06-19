# 🪱 Wigglers Room Jr. — Kids Edition
### Design Document v1.0 · June 2026

---

## The Idea in One Sentence

A safe, joyful worm bin game for ages 5–7 where kids dig tunnels, feed their worm, earn stars, and learn real facts about composting — with **no death, no losing, and no stress**.

---

## How It Relates to the Original

Wigglers Room (the Reddit Devvit game) is for adults — it has karma, death causes, poop clogs, acid buildup, and weekly drain events. Wigglers Room Jr. takes the same **core loop** (dig → eat → grow) and strips everything scary away, wrapping it in an educational, celebratory shell.

| Feature | Wigglers Room (Adult) | Wigglers Room Jr. (Kids) |
|---|---|---|
| Death | Yes — 6 causes | ❌ None ever |
| Karma system | Yes | ❌ Replaced with Stars ⭐ |
| Poop / acid / constipation | Yes | ❌ Removed |
| Worm can get sick | Yes | ❌ Worm always happy |
| Losing state | Yes | ❌ No losing possible |
| Learning facts | No | ✅ Yes — worm fun facts |
| Multiplayer | Yes | ✅ Yes — friendly only |
| Customization | Minimal | ✅ Yes — stickers, colors |
| Badges | No | ✅ Yes — always earnable |
| Age target | Adults | 5–7 year olds |

---

## Core Gameplay Loop

```
Tap to move worm → Worm digs tunnels through the bin
        ↓
Find food scraps (apple cores, banana peels, leaves)
        ↓
Worm eats food → Worm grows longer + gets a STAR ⭐
        ↓
Stars unlock: new worm colors, stickers to place in the bin
        ↓
Fun Fact pops up ("Did you know worms help plants grow?")
        ↓
...keep digging, keep collecting, keep growing
```

**Key design rule:** Every interaction ends with a reward or a smile. Nothing punishes the player.

---

## What Kids Can Do

### 1. Dig Tunnels Freely
- Tap or drag anywhere in the bin → worm follows finger
- Tunnels are permanent and visible (they glow softly)
- The bin fills up with the kid's own tunnel map over time
- No wrong direction. No blocked zones.

### 2. Feed the Worm
- Food scraps fall from the top of the bin slowly
- Kid taps the food to "toss it in" before it reaches bottom
- Worm moves toward food automatically when nearby
- Each food type teaches something:
  - 🍌 **Banana peel** → "Worms love banana peels! They're soft and yummy."
  - 🍎 **Apple core** → "Apple cores have seeds! Worms spit the seeds out."
  - 🥦 **Broccoli leaf** → "Green scraps help make the soil dark and rich."
  - ☕ **Coffee grounds** → "Coffee grounds help worms breathe better!"
  - 🍞 **Bread crust** → "Bread breaks down fast — the worm's favorite snack."

### 3. Earn Stars ⭐
- Stars are earned by: eating food, digging deep, visiting the bottom, filling a zone with tunnels
- Stars are **never taken away**
- Stars unlock cosmetics only — no gameplay advantage
- Star total shown with a big friendly counter top-center
- Every 10 stars: short celebration animation + a worm fact card

### 4. Grow & Customize Your Worm
- Worm starts small (3 segments), grows up to 12 segments max
- At max size: worm stays max size forever (no death resets)
- Stars unlock:
  - **Worm colors:** pink, purple, orange, blue, rainbow gradient
  - **Worm patterns:** stripes, spots, sparkles
  - **Worm accessories:** tiny hat 🎩, flower crown 🌸, sunglasses 😎
- Customization screen: big colorful buttons, no text required to navigate

### 5. Place Stickers in the Bin
- Stars also unlock stickers: mushroom, flower, ladybug, raindrop, snail, gem
- Tap a sticker from the tray → tap anywhere in the bin to place it
- Stickers persist in that kid's bin forever
- Other kids can see stickers when they visit your bin
- Max 20 stickers per bin (prevents clutter)

### 6. See Other Kids' Worms (Multiplayer)
- Other players' worms shown as small friendly worms exploring
- Players' worms are **always shown as healthy and happy**
- No competition — no leaderboard
- Tapping another worm shows: their worm's name + color only
- Worm names are auto-generated safe names (e.g. "Squiggles", "Rosie", "Ziggy") — no usernames shown

---

## Educational Layer

Each play session, the kid sees **3 Worm Fact Cards** at natural moments (after eating, after digging deep, after earning 10 stars).

### Fact Card Design
- Big friendly illustration (worm doing the thing)
- 1 sentence, max 8 words, age 5–7 reading level
- Tap anywhere to dismiss
- No quiz, no test, just delight

### Fact Library (starter set — 20 facts)
1. Worms eat old food and make healthy soil! 🌱
2. A worm's body is 90% water — just like a grape!
3. Worms have no eyes, but they feel light through their skin.
4. One worm can eat half its weight in food every day!
5. Worm poop is called castings — plants love it!
6. Worms breathe through their skin — keep the soil damp!
7. A healthy worm bin smells like fresh rain, not trash!
8. Baby worms hatch from tiny yellow eggs called cocoons.
9. Worms can grow back part of their body if it breaks!
10. Red wiggler worms are the best composting worms.
11. Worms help water soak into soil so plants can drink.
12. Worms make tunnels that let air reach plant roots.
13. One square foot of soil can hold 100 worms!
14. Worms don't have teeth — they swallow food whole.
15. Worm bins can live inside your home — they don't smell bad!
16. Worms work faster in teams — they help each other tunnel.
17. The oldest worm fossil is 500 million years old!
18. Worms move by squeezing tiny muscles in their segments.
19. Putting fruit scraps in a bin keeps food out of the landfill.
20. One pound of worms can turn garbage into compost in a week!

---

## Visual Design

### Palette
| Name | Hex | Use |
|---|---|---|
| Bin Brown | `#6B4226` | Soil background (warm, rich) |
| Soft Soil | `#8B5E3C` | Mid-layer soil |
| Pale Compost | `#C4934A` | Light soil near top |
| Leaf Green | `#5BA85F` | Surface grass strip |
| Worm Pink | `#FF8FAB` | Default worm color |
| Star Gold | `#FFD700` | Stars, rewards |
| Sky Blue | `#AEE6FF` | Above-bin sky strip |
| Cream Card | `#FFF8F0` | Fact cards, UI panels |
| Fun Purple | `#A259D9` | Buttons, accents |

### Typography
- **Display / Labels:** Nunito (rounded, friendly, legible at small sizes)
- **Body / Facts:** Nunito Regular — large size, 1.6 line-height
- **Numbers / Stars:** Nunito Black (bold, chunky)
- Minimum font size anywhere: 18px
- All UI labels use emojis alongside text for pre-readers

### Signature Element
The **tunnel glow** — as kids dig, their tunnels leave a soft warm amber glow behind them that slowly fades over 60 seconds. The bin lights up from the inside as they explore. It looks like the worm is leaving a trail of light through the earth. This is the one thing that makes Wigglers Jr. feel magical and distinctly its own.

---

## UI Layout

```
┌─────────────────────────────────────┐
│  🌤  SKY STRIP (decorative)          │
├─────────────────────────────────────┤
│  ⭐ 24   [worm name: Squiggles]  🎨  │  ← top bar
├─────────────────────────────────────┤
│                                     │
│   ~ ~ ~ S O I L ~ ~ ~ ~ ~ ~ ~ ~ ~  │
│                                     │
│   [food scraps falling slowly]      │
│                                     │
│   [worm digs tunnels here]          │
│   [other kids' worms visible]       │
│   [stickers placed by player]       │
│                                     │
│   ~ ~ ~ D E E P  S O I L ~ ~ ~ ~ ~ │
│                                     │
└─────────────────────────────────────┘
│  [ 🪱 Worm ] [ 🌸 Stickers ] [ 📖 Facts ]  │  ← bottom nav
└─────────────────────────────────────────────┘
```

### Bottom Nav Tabs
- **🪱 Worm** — customize your worm (colors, accessories)
- **🌸 Stickers** — place and manage bin stickers
- **📖 Facts** — browse all worm facts you've discovered

---

## What Is Intentionally Removed

These features from the adult game are **not in Jr.** — by design:

- ❌ Death of any kind
- ❌ HP / health bar
- ❌ Gut fill / constipation
- ❌ Acid buildup
- ❌ Karma (replaced with Stars — always additive)
- ❌ Poop / clog system
- ❌ Weekly drain / Snoo cinematic
- ❌ Flood events
- ❌ Worm queue (waiting to play)
- ❌ Usernames shown in multiplayer
- ❌ Headstone / death posts to Reddit
- ❌ Any timer or time pressure
- ❌ Leaderboards or rankings
- ❌ Competitive elements of any kind

---

## Safety & Kids Design Rules

1. **No usernames displayed** — worms get auto-generated fun names only
2. **No chat** — no text input from kids at all
3. **No social pressure** — no leaderboards, no comparisons
4. **No ads, no purchases** — Stars are earned only through play
5. **No time limits** — kids can play at their own pace forever
6. **Always positive feedback** — every action produces a positive response
7. **Big tap targets** — minimum 48px, ideally 64–80px for primary actions
8. **No small print** — all text 18px minimum
9. **Color is not the only indicator** — always pair color with icon/shape
10. **Reduced motion option** — all animations can be set to gentle/off

---

## Technical Plan

### Platform Options (TBD)
| Option | Pros | Cons |
|---|---|---|
| New Devvit app (separate from Wigglers Room) | Clean slate, own subreddit | More setup work |
| New branch of Wigglers_Room repo | Shares code where possible | Risk of adult game complexity leaking in |
| Standalone HTML5 game | Fully portable, embeddable anywhere | No Reddit-native features |

**Recommendation:** Start as a **standalone HTML5 prototype** to validate the kids experience, then port to Devvit as a separate app once the gameplay is proven.

### Shared with Adult Game (reuse candidates)
- Canvas 2D rendering system
- Tunnel carving math (pPath concept simplified)
- Food scrap drawing functions (`drawTrashChunk`)
- Worm segment drawing system
- Basic physics (movement, following finger)

### New for Jr.
- Star system (replaces karma)
- Fact card system (20+ cards, triggered by events)
- Sticker placement + persistence system
- Worm cosmetics (color, pattern, accessories)
- Safe multiplayer name generator
- Celebration animations (no-death-ever logic)
- Parental-friendly onboarding screen

---

## Session 1 Build Goal

Build a **playable HTML5 prototype** that proves the core loop:
1. Worm follows your tap/drag
2. Food scraps fall — tap to eat
3. Eating gives Stars ⭐
4. Stars trigger a Fact Card
5. The tunnel glow effect looks magical

Everything else (cosmetics, stickers, multiplayer) comes after the core loop feels great.

---

*Document: WIGGLERS_ROOM_JR_DESIGN.md*
*Status: Planning — ready for prototype build*
*Next step: Build Session 1 HTML5 prototype*
