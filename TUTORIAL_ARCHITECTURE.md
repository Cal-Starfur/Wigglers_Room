# Wigglers Room — Tutorial System Architecture & Reference

**Status:** Tutorial skeleton complete, end-to-end (4-beat curriculum).
**File:** all tutorial code lives in `docs/demo-game.js`; activation/loader in `docs/demo.html`.
**Activation:** `?tut=1` (staged tutorial) or `?leash=1` (leash debug proof). Default OFF — free roam unchanged.
**Last updated:** session ending 2026-06-25 (commits `25100dc` → `76c4203`).

This document exists so future sessions can extend the tutorial — especially **add many more steps** — without re-deriving the architecture. Read sections 3, 4, and 6 first; they are the load-bearing ones.

---

## 1. Design philosophy

- **We control the narrative and the flow.** The player is guided, not free, during the lesson — but guidance is by *attraction* (highlight + arrow + panel) and *gating* (only the active target is edible), **not** by forced movement.
- **No auto-steer.** An earlier version leashed the worm to each target; the auto-pull felt heavy-handed and was removed. The leash machinery still exists (section 8) for any future step that genuinely needs movement constraint, but the default food/acid/eggshell steps do **not** use it.
- **Every change ships default-OFF and URL-param-gated**, provable in isolation, so the live demo and free-roam are never broken and every commit has a clean revert boundary.
- **Maximum teaching per beat.** Each step teaches one *distinct* thing. Redundant beats (4 identical "+3 food" panels) were collapsed into a curriculum where every panel adds new information.

---

## 2. Build log (what was built, in order)

| Commit | What | Key idea |
|---|---|---|
| `25100dc` | **Director skeleton + move-target clamp hook** | The single point where the worm reads its steering goal (`tutorialClampTarget`), so movement can be gated in *one* place instead of policing 5 input handlers. |
| (teaser) | **Cache-bust loader** | `demo.html` mirrors the page's `?v=` onto the `demo-game.js` `<script>` via `document.write`, so `?v=SHA` busts both HTML and JS (mobile Safari has no hard-refresh). |
| `4b13120` | **`spawnTutorialScene()` + freeze** | Authored staged scene replaces the random field; `updateScrapsLevel()` early-returns while staged so nothing refills/unlocks. |
| `50bcef5` | **NPC food protection** | Live NPCs were eating the staged food; `tutProtected` flag + both NPC scrap loops skip it. |
| `ac99cfa` | **Highlight/spotlight render** | `drawTutorialHighlight()` — initially dim + ring + edge arrow. |
| `69e6f6d` | **Ordered progression + arrow rework** | Removed the dim; arrow became **worm-anchored** (points from the head at the target); per-target ordering + eat-gate. |
| `498d407` | **Step list + panels** | Explicit `tutorial.steps` list; `drawTutorialPanel()` data card per step. |
| `b8f048c` / `fef6888` | **Tuning** | Eggshell repositioned; **per-step leash removed** (no auto-steer — eat-gate + visuals enforce order). |
| `76c4203` | **Old demo overlay removed** | Deleted the teaser's `#demo-overlay` step-cards and gutted `_demoTick` (its stage gates conflicted with the tutorial). The in-canvas tutorial is now the only guidance layer. |

---

## 3. The `tutorial` state object (single source of truth)

Declared near the top of `demo-game.js`. All tutorial state lives here.

```js
var tutorial = {
  active: false,   // master switch — true when any tutorial mode is on
  debug:  false,   // ?leash=1 / ?tutdbg=1 — draws the proof leash + ring
  step:   0,       // (reserved / unused)
  leash:  null,    // null = free; { type:'radius', x, y, r } projects the move target
  target: null,    // current step's target (a scrap or pile-chunk reference)
  scene:  false,   // true = staged scene loaded + ambient frozen (?tut=1)
  foodScraps: [],  // refs to staged tier-1 food (set by spawnTutorialScene)
  acidChunk:  null,// ref to staged tier-0 acid pile item
  targetIndex: 0,  // LEGACY (pre-step-list) — superseded by stepIndex
  steps:      [],  // ORDERED step list (the spine — see section 4)
  stepIndex:  0,   // cursor into steps
  panel:      null // current step's instruction-panel object
};
```

**Two independent flags drive everything:**
- `tutorial.scene` — the staged tutorial (set by `?tut=1`). Loads the authored scene, freezes ambient refill, runs the step machine.
- `tutorial.debug` — the leash proof (set by `?leash=1`). Independent; does **not** stage the scene. Used to verify the clamp hook in isolation.

Both set `tutorial.active = true`.

---

## 4. Step-machine architecture (the core)

### 4.1 The step object schema

Each entry in `tutorial.steps` is:

```js
{
  target: <scrap | pileChunk | null>,   // what the step is about; drives highlight + arrow
  kind:   'eat' | 'acid',               // selects the completion predicate
  panel: {                              // instruction card (section 9)
    title: 'Lettuce',
    lines: ['Food fills your gut.', 'Eat it to grow.'],  // array; one screen line each
    karma: '+3 karma',
    tint:  '#c0d4a8'                     // effect-line color (NOT amber — see tokens)
  }
}
```

### 4.2 Data flow (one frame)

```
spawnTutorialScene()   [once, at setup]
   builds the scene items + tutorial.steps[], sets stepIndex=0, panel=steps[0].panel

updatePlayer()  [every frame, before the worm reads its move target]
   └─ tutorialStep()
        • while (current step done) stepIndex++
        • if all done → target=null, panel=null, leash=null  (release to free roam)
        • else → tutorial.target = step.target
                 tutorial.panel  = step.panel
                 tutorial.leash  = null   (no auto-steer for these steps)

[player eat loop, tier-1]      eat-gate: only tutorial.target is edible while scene is on
[render, after the cursor]     drawTutorialHighlight()  +  drawTutorialPanel()
```

### 4.3 The advancer — `tutorialStep()`

Called once per frame from `updatePlayer()` (before the move-target clamp). Walks `tutorial.steps` via `stepIndex`, advancing past completed steps, and publishes the current step's `target` / `panel` (and `leash`, currently always `null`). On completion it nulls everything → free roam.

### 4.4 The completion predicate — `_tutStepDone(step)`

```js
function _tutStepDone(step) {
  if (!step) return true;
  if (step.kind === 'acid') return pAcid > 0.35;   // green, but below HP-damage (~0.5)
  return step.target && (step.target.eaten || step.target.gone);   // 'eat'
}
```

This is the extension point for new behaviors: **a new step kind = a new branch here** (section 7).

### 4.5 Order enforcement — the eat-gate (NOT the leash)

In the player tier-1 eat loop:

```js
if (tutorial.scene && s.tutProtected && s !== tutorial.target) continue;
```

Only the active target is edible. The player roams freely (no leash) but cannot eat out of sequence. This is what replaced the auto-steer. **The eat-gate is the order mechanism — keep it.**

---

## 5. Hook points in `demo-game.js`

Reference by *function/marker* (line numbers drift). Search for the comment strings.

| Hook | Where | What |
|---|---|---|
| Move-target clamp | `updatePlayer()`, comment `// ── Tutorial move-target clamp — the ONE place...` | `tutorialClampTarget(mX, mY)` projects the steering goal through the leash. No-op when leash is null. |
| Step advance | `updatePlayer()`, `tutorialStep();` just above the clamp | Publishes target/panel each frame. |
| Spawn branch | `setup()`: `if (tutorial.scene) { spawnTutorialScene(); } else { spawnScraps(); }` | Loads staged vs random field. |
| Ambient freeze | top of `updateScrapsLevel()`: `if (tutorial.scene) { scrapsLevel=1; scrapsEmpty=false; return; }` | No refill / reserve-unlock while staged. |
| Eat-gate | player tier-1 eat loop: `// only the active target, in order` | Order enforcement. |
| NPC protection | NPC forage + eat loops skip `tutProtected` | NPCs leave staged food alone. |
| Render | after the cursor dot: `drawTutorialHighlight(); drawTutorialPanel();` | Drawn in the world-translated context (x direct, y - camY). |

---

## 6. HOW TO ADD A NEW STEP (recipe)

This is the common task. For a normal "eat this item" beat:

1. **Create/choose the target item** in `spawnTutorialScene()`.
   - Tier-1 food fragment: `var _x = _tutFood('type_name', x, y);` (returns the scrap ref; auto-tagged `tutProtected`).
   - Tier-0 pile chunk (like the acid item): build a chunk object, `trashChunks.push(it); _prerenderTrashChunk(it);` and keep the ref.
   - Type names come from `TRASH_TYPES` (e.g. `lettuce`, `watermelon_chunk`, `egg_shell`, `overripe_fruit`). Acidic types carry an `acid` field.

2. **Insert a step** into the `tutorial.steps = [ ... ]` array, in the position you want it to run:
   ```js
   { target: _x, kind: 'eat',
     panel: { title: 'Name', lines: ['line 1', 'line 2'], karma: '+3 karma', tint: '#c0d4a8' } },
   ```

3. **Karma values** (accurate, from the engine): tier-1 scrap = flat **+3**; a finished tier-0 pile chunk = **`pts × 5`** (overripe_fruit pts 9 → +45). Put the real number in the panel.

4. **Positioning note (auto-steer is gone, but coherence matters):** place items so the worm's natural path reads sensibly; the worm-anchored arrow guides from wherever the head is. Avoid huge jumps between consecutive targets.

5. Test with `?tut=1&v=<sha>`. No other wiring needed — `tutorialStep`, the eat-gate, highlight, and panel all pick it up automatically.

**That's the whole recipe for an eat-step.** Non-eat steps need a new predicate kind (next section).

---

## 7. Adding new completion-predicate kinds (poop, sump, sleep, cocoon, …)

For steps that complete on something other than "eat the item":

1. Add a `kind` and a branch in `_tutStepDone(step)`. Examples of available game state to gate on:
   - **poop:** `pPooping` transitions / a casting deposited.
   - **acid (existing):** `pAcid > 0.35`.
   - **reach sump:** `pSegs[0].y >= 3*H - 20`.
   - **sleep:** `pSleeping`.
   - **cocoon:** `lastCocoonLaid` changed.
   (These were the gates the OLD `_demoTick` used — they're proven; they were removed only because that overlay conflicted with the new system. Reuse the *conditions*, not the old card UI.)
2. If the step has no physical `target` (e.g. "poop now"), set `target: null` and rely on the panel for instruction; the highlight/arrow simply won't draw.
3. If a step needs movement constraint, attach a leash in `tutorialStep()` for that step only (section 8) — but prefer not to, given the auto-steer feedback.

---

## 8. The leash / clamp machinery (built, currently unused by steps)

- `tutorial.leash = { type:'radius', x, y, r }` constrains the worm's **move target** (not its body) — soft: the worm can drift slightly and eases back.
- `tutorialClampTarget(tx, ty)` projects the requested target onto the leash region. Called at the single steering-read in `updatePlayer()`.
- `?leash=1` proves it: a fixed 180px radius leash + a faint ring.
- **Currently `tutorialStep()` sets `leash = null` for all steps** (auto-steer removed). To use it for a future step, set `tutorial.leash` for that step inside `tutorialStep()`. Soft-clamp only; keep `r` larger than the gap to neighbors.

---

## 9. Rendering

- **`drawTutorialHighlight()`** — pulsing **amber glow ring** on `tutorial.target` (when on-screen) + a **worm-anchored arrow** (sits ~20px ahead of the head, points at the target, works on/off screen). Drawn in the world-translated context: `x` direct, `y - camY`, full width via `leftX = camX - centreOffsetX`.
- **`drawTutorialPanel()`** — bottom card from `tutorial.panel`: bold title, effect `lines[]`, karma. Card border/shadow use amber as a glow accent; **text fills are neutral/tinted, never amber**.

---

## 10. Design tokens & hard constraints

- **No emoji in panel text** (rejected).
- **Amber is glow-only** — never a text fill. Ring/arrow/border glow may be amber; panel text is white/green/tinted.
- **Start screen (`#intro-screen` in the teaser) is locked — do not touch.**
- **Order is enforced by the eat-gate, guidance by ring/arrow/panel; no auto-steer** unless a step explicitly opts into a leash.
- **Acid step ends at `pAcid > 0.35`** — visibly green but below the HP-damage threshold (~0.5), so the antidote reads as relief, never rescue. The eggshell (cure) comes *after* the acid so the green visibly fades.

---

## 11. Activation, testing, cache-busting

- `?tut=1` → staged tutorial. `?leash=1` → leash proof. Neither on → normal free roam.
- **Test link:** `https://cal-starfur.github.io/Wigglers_Room/demo.html?tut=1&v=<COMMIT_SHA>`. The `?v=` busts the HTML; the teaser's loader mirrors it onto `demo-game.js`, so it busts the JS too. **Required on mobile Safari (no hard-refresh).**
- Verify a push by reading the committed blob at the pinned SHA (`contents?ref=SHA`) — the branch `raw` URL is CDN-cached and can lie for minutes.

---

## 12. FUTURE: run the tutorial OVER the live `demo-game.js` (merge plan)

Goal: the worm *must* do the tutorial, but the real game keeps running around it (full scrap field, NPCs, drains, refills) — no stripped staged scene, no "tutorial → free roam" seam.

**Why it's feasible:** the step machine only needs target refs + highlight + panel + eat-gate. None of that requires the staged scene or the freeze.

**Changes required:**
1. **Don't replace the field.** Run normal `spawnScraps()`; have the tutorial **inject its curriculum items additively** at known spots, tag them `tutProtected`, and target those. Drop the `if (tutorial.scene) spawnTutorialScene()` replacement in favor of "spawn normal + inject."
2. **Tighten the eat-gate to ALL scraps.** Change `s.tutProtected && s !== tutorial.target` → `s !== tutorial.target` (while the tutorial runs) so the worm can't eat *any* non-target scrap mid-lesson, even the ambient ones.
3. **Suppress only the ambient cinematics** that hijack the camera (weekly drain, Snoo refill) *during* the lesson — not the whole freeze we have now. Gate those triggers on `!tutorialActiveLesson`.
4. **HP safety guardrail.** In the live world the worm can starve/die; add a light floor so a beat can't end in death during the tutorial.
5. **Acid visibility in a cluttered pile.** The one acid item must read clearly among real pile chunks — the ring + arrow handle it, but watch it.
6. **The payoff:** no seam. When the last step finishes, the worm is already in the real bin and just keeps playing. Better "intro that melts into the game," and testers learn in the real environment.

Fold this into the same default-OFF, `?tut=1`-gated pattern; it's a medium-sized change.

---

## 13. Open polish / backlog

- Make the tutorial the **default** in the teaser (flip `tutorial.scene` on without `?tut=1`); decide if the right-side guide panel stays.
- "You've got it — explore!" **completion beat**.
- Optional **poop step** (new predicate kind — section 7).
- Brief **free-play windows** between beats.
- Tune panel copy / positions / tints on-device.
- (Unrelated) ghost-worm render crash still masked by the per-NPC try/catch + green debug overlay — needs the `ghostERR:` console value.

---

## 14. Function index

| Function | Role |
|---|---|
| `tutorial` (object) | All tutorial state. |
| `tutorialClampTarget(tx,ty)` | Soft leash projection at the single steering read. |
| `tutorialStep()` | Per-frame advancer; publishes target/panel/leash. |
| `_tutStepDone(step)` | Completion predicate (extension point for new kinds). |
| `spawnTutorialScene()` | Builds staged scene + `tutorial.steps`; contains `_tutFood()` helper. |
| `drawTutorialHighlight()` | Ring + worm-anchored arrow. |
| `drawTutorialPanel()` | Instruction card. |
| `updateScrapsLevel()` | (hook) ambient freeze while staged. |
| `_demoTick()` (teaser) | Gutted to just the pre-entry intro freeze; old stage machine removed. |
