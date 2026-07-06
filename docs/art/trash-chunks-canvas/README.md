# Trash Chunk Canvas Code

Canvas-drawing (`drawArt(canvas)`) versions of the sprites in
`docs/art/trash-chunks/`. These are **not PNGs** — they're plain-text
`.js` files containing an HTML5 canvas function that reproduces the
matching PNG's silhouette and color fills as vector paths.

**Naming convention:** filename must exactly match the corresponding PNG
in `docs/art/trash-chunks/`, with a `.js` extension instead of `.png`
(e.g. `apple_core.js` ↔ `apple_core.png`).

**Why this exists as a separate folder:** the PNGs in `trash-chunks/`
are the source art. These `.js` files are a generated/derived format
(pixel-traced canvas code) meant to eventually feed `drawTrashChunk()`'s
procedural vector fallback path, so they're kept out of the PNG folder
to avoid mixing formats.

**How each file was generated:** contours were traced directly from the
source PNG's pixel data (color-clustered regions → OpenCV contour
extraction → simplified polygon paths), not guessed from a text
description — this keeps the traced shape pixel-accurate to the
original art (typically ≥95% match).

**Format of each file:**
```js
function drawArt(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#hexcolor';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y);
  // ...
  ctx.closePath();
  ctx.fill();
  // one fillStyle/path block per color region, in back-to-front draw order
}
```

These are staged here, not wired into the game yet — same status as the
PNG sprites in the sibling folder, pending `drawTrashChunk()` integration.
