# Impeccable Critique — `docs/demo-teaser.html`
**Baseline snapshot · Session 25 · 2026-06-23**
**Target:** `docs/demo-teaser.html`
**Score:** 16/40 · P0: 1 · P1: 3 · P2: 1 · P3: 3

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Layer toast fires but keyboard-hint strip only appears during steering — controls are invisible until you're already stuck |
| 2 | Match System / Real World | 3 | Composting metaphor translates well; worm-bin UI vocabulary is consistent |
| 3 | User Control and Freedom | 1 | No pause, no restart, no back. Once the demo runs it just runs. `user-scalable=no` kills browser zoom too. |
| 4 | Consistency and Standards | 2 | `#0a1020` body bg lives outside the token system. `.btn-s` has 9px padding while `.btn-p` has 13px — no shared rhythm. Z-indices are arbitrary (999, 9999). |
| 5 | Error Prevention | 1 | No confirmation before deep-linking to live game. Demo can end with zero feedback if canvas errors silently. `cursor:none` removed on `#root` but replaced with crosshair only. |
| 6 | Recognition Rather Than Recall | 2 | Keyboard controls only appear mid-flow. Zero iconography on step cards. The "what do I do?" question is never answered upfront. |
| 7 | Flexibility and Efficiency | 1 | No way to skip steps, replay, or jump ahead. Single rigid linear flow. No keyboard shortcuts for power users. |
| 8 | Aesthetic and Minimalist Design | 3 | Token palette is strong and restrained. Amber-on-dark soil feel is genuinely atmospheric. Step cards don't over-explain. |
| 9 | Error Recovery | 0 | No error states exist anywhere in the file. Canvas failure = silent white box. |
| 10 | Help and Documentation | 1 | Controls guide link in end screen goes to `demo.html` — a separate file. Nothing contextual in-flow. |
| **Total** | | **16/40** | **Below average — needs structural fixes before polish** |

---

## Anti-Patterns Verdict

**LLM assessment — Does this look AI-generated?**

No — and that's a compliment. The amber-on-soil-dark palette isn't the saturated cream/sand default of AI-made marketing pages. The worm-bin metaphor is committed, not generic. Step cards avoid the "icon + heading + 3-bullet text" grid cliché. The overall composition reads as deliberate. The `wfloat` animation on the worm logo and the amber border HUD feel authored, not templated.

What does feel slightly AI-scaffolded: the KB hint strip only appearing during one phase (classic "progressive disclosure gone wrong"), and the end screen with two ghost buttons that don't carry obvious weight difference beyond colour.

**Deterministic scan — 6 findings:**

| Rule | Severity | Finding |
|------|----------|---------|
| `user-scalable` | 🔴 P1 | `user-scalable=no` in viewport meta — WCAG 1.4.4 |
| `cursor-none` | 🟡 P2 | `cursor:none` on `#root` (replaced w/ crosshair) — WCAG 2.4.7 |
| `z-index-999` | 🟢 P3 | Z-index 999/9999 values — no semantic scale |
| `reveal-gate` | 🔴 P1 | 4× `opacity:0` — step cards are invisible by default; if JS fails or pauses, content is inaccessible |
| `text-wrap` | 🟢 P3 | No `text-wrap:balance` on headings — jagged line breaks on narrow viewports |
| `touch-target` | 🔴 P1 | `.btn-s` at 9px padding — certainly under 44px touch target requirement |

**LLM-only findings (detector missed):**
- `<kbd>` labels inside `#kb-hint` have 1.22:1 contrast ratio — invisible (WCAG 1.4.1 fail)
- No mobile media queries anywhere in the file (no `@media` breakpoints)
- `wfloat` animation defined but not applied to `#intro-worm`
- No `@media (prefers-reduced-motion: reduce)` anywhere

**Browser visualization:** `detect.mjs` unavailable in this environment. Manual source scan used as fallback. No live overlay injection was possible.

---

## Overall Impression

The demo-teaser has genuinely good bones — the colour system is committed, the atmosphere is right, and it doesn't look like a template. But it ships as a **playable black box**: users land, something happens on canvas, and if they don't accidentally discover keyboard controls mid-flow, they might finish having learned nothing about the game. The single biggest opportunity is turning the intro screen into a **real invitation** — one explicit CTA button, one sentence of context — so the demo doesn't just start, it _welcomes_.

---

## What's Working

**1. The colour palette is genuinely earned.** `--soil-dark`, `--amber-glow`, `--leaf` form a coherent world. Every text/bg pair passes WCAG AA (except the KB hint `<kbd>` labels). This is not accidental; someone made real decisions here.

**2. Step-card copy is tight.** Cards don't over-explain. The opacity-based reveal keeps the canvas primary. The pattern is right even if the execution has an accessibility hole (content gated on JS).

**3. The HUD design is purposeful.** `position:fixed`, `backdrop-filter`, amber border — it sits above the canvas without competing with it. The npc-count and layer-toast are contextual and quiet.

---

## Priority Issues

### [P0] Intro screen has no actual CTA button

- **What:** The only call to action is a 0.78rem pulse-animated text string "click/tap to start." No `<button>`, no semantic affordance, no visible hit target.
- **Why it matters:** On mobile (Casey) this is invisible. A first-time player (Jordan) will read the heading and freeze. Zero conversion from landing to play.
- **Fix:** Add `<button class="btn-p">Play the demo →</button>` inside `#intro-screen`. Remove or demote the pulse-text. Apply `wfloat` to `#intro-worm` (currently only on `#end-screen img`).
- **Suggested command:** `/impeccable onboard demo-teaser.html`

### [P1] `.btn-s` is untappable on mobile

- **What:** 9px padding means the "Full controls guide" button on the end screen is ~27–30px tall — well below 44px minimum touch target.
- **Why it matters:** Casey (distracted mobile user) will miss-tap or give up. Core conversion path is broken on the device most likely to receive the Reddit share link.
- **Fix:** `padding: 12px 20px` minimum on `.btn-s`. Add `min-height: 44px` to both button classes.
- **Suggested command:** `/impeccable adapt demo-teaser.html`

### [P1] `user-scalable=no` breaks accessibility

- **What:** Prevents browser zoom entirely.
- **Why it matters:** WCAG 1.4.4 (Resize Text) requires up to 200% zoom without loss of content. Sam (accessibility-dependent user) using browser zoom will get a completely broken experience.
- **Fix:** Remove `user-scalable=no, maximum-scale=1` from viewport meta. Handle canvas scaling via `ResizeObserver` in JS instead.
- **Suggested command:** `/impeccable audit demo-teaser.html`

### [P1] Keyboard controls undiscoverable until it's too late

- **What:** `#kb-hint` has `opacity:0` and only becomes visible during steering. Controls guide only linked from the end screen.
- **Why it matters:** Jordan (first-timer) will watch the demo do something interesting and have no idea they could interact. Discovery requires already knowing what to do.
- **Fix:** Show a one-liner control summary in `card-active` as static text. Or show `#kb-hint` immediately when that card activates, not only during steering.
- **Suggested command:** `/impeccable clarify demo-teaser.html`

### [P2] `<kbd>` labels inside `#kb-hint` have 1.22:1 contrast — invisible

- **What:** `--text` (#f0e8d8) on `rgba(255,255,255,0.10)` ≈ #1a1a1a background = 1.22:1 ratio. Complete WCAG 1.4.1 failure.
- **Why it matters:** Even users who find the hint strip can't read the key labels.
- **Fix:** `kbd { background: rgba(255,255,255,0.25); color: #f0e8d8; }` → passes 4.5:1. Or use `--amber-glow` text on the existing dark background (9.82:1).
- **Suggested command:** `/impeccable audit demo-teaser.html`

---

## Persona Red Flags

### Jordan (First-Timer)

Jordan lands on the intro screen. There's a logo, a heading, and some small amber text that pulses. Jordan waits for something to happen. Nothing does. Jordan taps the logo (not a button). The canvas activates. A step card fades in at the bottom-left. Jordan doesn't notice it because they're watching the worm on canvas. A toast fires. Jordan misses it. The demo ends. Jordan clicks "Open the Real Bin →" without understanding what the game is. **Abandonment likely at intro screen if on mobile; confusion throughout on desktop.**

### Casey (Distracted Mobile User)

Casey opens the demo on iPhone. `user-scalable=no` means pinch-zoom is dead. The canvas renders at desktop dimensions. Step cards at `bottom:20px left:16px` may be cut off. `.btn-s` at 9px padding is a miss-tap waiting to happen. The KB hint strip — built for keyboard users — shows up on a touchscreen with no equivalent gesture prompt. **Casey gets a broken layout with unreachable controls. Likely closes the tab.**

### Sam (Accessibility-Dependent)

Sam uses browser zoom at 150%. `user-scalable=no` kills that. No ARIA roles, no `role="dialog"` on intro/end screens, no `aria-live` regions for the toast or step cards. Canvas has `alt=""` but game state is entirely invisible to VoiceOver. **Sam cannot meaningfully use this demo.**

---

## Minor Observations

- `#0a1020` (body background) not in `:root` token system — should be `--bg-deep` or similar
- Z-indices (501, 600, 700, 999) defined across selectors with no shared scale — create `--z-hud`, `--z-end`, `--z-intro`, `--z-toast` tokens
- `wfloat` keyframe defined but only applied to `#end-screen img`, not `#intro-worm` — both should use it
- No `@media (prefers-reduced-motion: reduce)` anywhere — every animation fires regardless of OS accessibility settings
- Progress dots (`#progress-dots`) are visual only — no ARIA labels, no `role` — silent to screen readers
- End screen `btn-s` links to `demo.html` — verify this file exists on live Devvit deployment or it's a dead link
- No mobile media queries anywhere in the file — layout untested below desktop breakpoints

---

## Questions to Consider

- **The demo ends — then what?** The "Open the Real Bin" CTA goes to a GitHub Pages URL. Is that the live game? If the game requires Reddit, this will bounce users into a broken experience. What's the intended conversion path?
- **Is the demo meant to be played, or watched?** The current design is half-and-half. If it's primarily a viewer experience, remove keyboard controls and let it autoplay. If it's a player experience, surface controls prominently from step one.
- **What does success look like for this demo?** If the goal is "install the Reddit app and play," the end screen doesn't say that. If it's "understand what worm composting is," the step cards aren't doing enough.
- **Why is there no restart button?** Someone who wanted to replay — a journalist, a curious person sharing the link — has to hard-reload. A "Play again" button costs nothing and captures replay value.

---

## Colour Contrast Reference (all pairs tested)

| Pair | Ratio | Status |
|------|-------|--------|
| `--text` on body (#f0e8d8 / #0a1020) | 15.56:1 | ✅ PASS |
| `--text` on step-card bg | 16.34:1 | ✅ PASS |
| `--text-dim` on step-card bg | 5.78:1 | ✅ PASS |
| `--text-dim` on HUD bg | 5.89:1 | ✅ PASS |
| `--amber-glow` on step-card bg | 9.82:1 | ✅ PASS |
| `.btn-p` soil-dark on amber | 6.60:1 | ✅ PASS |
| `.btn-s` text-dim on transparent (end screen) | 5.93:1 | ✅ PASS |
| `npc-count` on HUD bg | 5.89:1 | ✅ PASS |
| Layer toast amber-glow on card | 9.82:1 | ✅ PASS |
| `kb-hint` text-dim on kb-hint bg | 5.78:1 | ✅ PASS |
| **`<kbd>` text on `<kbd>` bg** | **1.22:1** | **❌ FAIL** |

---

*First run for this target. No trend yet.*
*Snapshot written by Claude · Session 25 · impeccable v3.8.0*
