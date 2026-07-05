# Trash Chunk Sprites

Drop trash-chunk PNGs here, one per trash type.

**Naming convention:** filename must exactly match the `name:` key used in
the trash type table in `game.js` / `trash-chunks.html`
(e.g. `broccoli.png`, `pizza.png`, `banana_peel.png`, `apple_core.png`,
`fish_bone.png`, `melon_rind.png`).

**Format:**
- Transparent PNG (RGBA), no background
- Square-ish canvas, content clipped/trimmed to the art (matches how
  `broccoli.png` was exported — 126x126, content bbox roughly x:17-107, y:34-115)
- Flat illustrated style to match the game's existing look

These are not wired into the game's render loop yet — they're just staged
here until we hook `drawTrashChunk()` to check for a sprite before falling
back to the procedural vector drawing.
