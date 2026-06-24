# Impeccable Critique — `docs/demo-teaser.html`
**Updated · Session 25 · 2026-06-23**
**Target:** `docs/demo-teaser.html`

---

## ⚠️ SECTION LOCKS

### 🔒 START SCREEN — LOCKED. DO NOT TOUCH.

The intro screen (`#intro-screen`) is **finished and signed off**. Do not propose changes to it, do not rewrite it, do not "fix" it, do not suggest alternatives unless Cal explicitly says so.

**Current state (locked):**
- Title: `u/Wigglers_Room` in Fredoka One font
- Colour: radial gradient, pure worm-pink tones (`#d09090` → `#b06070` → `#a05060`) — no amber in the text fill
- Glow: double drop-shadow amber glow on wrapper div matching icon intensity
- Subtitle: "The compost bin that never stops"
- Layout: title → subtitle → floating worm icon (clickable to enter)
- No CTA button — worm image click is intentional and stays

**One pending enhancement (Cal's call, not a fix):**
- Texture overlay on the title font to match the Wiggler worm's skin texture — not scheduled, not a priority item, do not action without explicit instruction

---

## Remaining Open Issues (demo flow only — not start screen)

### [P1] Keyboard controls — RESOLVED
`#kb-hint` now shows immediately when `_enterBin()` fires. ✅

### [P1] `.btn-s` touch target too small
9px padding on end-screen buttons is below 44px minimum touch target. Not yet fixed.

### [P1] `user-scalable=no` breaks accessibility
WCAG 1.4.4 violation in viewport meta. Not yet fixed.

### [P2] `<kbd>` contrast failure
`<kbd>` labels inside `#kb-hint` are 1.22:1 — invisible. Not yet fixed.

### [P0] Step cards — gesture diagrams added ✅
Zone arrows and CSS gesture animations added to `card-eat`, `card-poop`, `card-sump`. ✅

---

## What's Finished and Signed Off

| Area | Status |
|------|--------|
| Start screen design | ✅ LOCKED |
| Step card gesture diagrams | ✅ Done |
| Zone arrows (food ↑ / sump ↓) | ✅ Done |
| `#kb-hint` visibility on entry | ✅ Done |
| Title font (Fredoka One) | ✅ Locked |
| Title colour gradient (worm pink) | ✅ Locked |
| Title glow | ✅ Locked |
| Subtitle copy | ✅ Locked |

---

## Do Not Re-Raise

- Any critique of the intro screen layout, copy, font, or colour
- The "no CTA button" issue — worm click is intentional
- The "controls primer" suggestion — rejected by Cal
- Any suggestion to add a Play button to the intro screen

---

*Updated by Claude · Session 25 · start screen locked per Cal's instruction*
