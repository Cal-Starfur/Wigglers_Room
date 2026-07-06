# Scrap Sprites

Drop scrap (debris fragment / tier-1 nibble) PNGs here, one per trash type.

**Gallery:** https://cal-starfur.github.io/Wigglers_Room/art/debris-fragment-gallery.html

**Naming convention:** filename must exactly match the `name:` key used in
the trash type table in `game.js` / `debris-fragment-gallery.html`
(e.g. `broccoli.png`, `pizza.png`, `banana_peel.png`, `apple_core.png`,
`fish_bone.png`, `melon_rind.png`).

**Format:**
- Transparent PNG (RGBA), no background
- Small/simple — these render at debris scale, much smaller than a full
  trash chunk
- Flat illustrated style to match the game's existing look

These are not wired into the game's render loop yet — they're just staged
here until we hook `drawDebrisFragment()` to check for a sprite before
falling back to the procedural vector drawing.
