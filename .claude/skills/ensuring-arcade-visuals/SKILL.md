---
name: ensuring-arcade-visuals
description: Ensures a Retrovibe game looks like a real arcade cabinet — palette discipline, low pixel resolution, ASCII sprites, retro bitmap text, CRT filter, ambient particles. Invoke when creating or editing any game's visual presentation, or when a game looks flat, modern, or off-brand.
---

# Ensuring arcade visuals

This skill covers the game's **look** only. Readability and HUD margins (`SAFE_MARGIN`, whether text is legible and clear of edges) are *quality* concerns — they live in **improving-game-quality**, which owns the only quality checklist. Do not duplicate those checks here; defer to that skill.

All engine imports come from the barrel: `import { ... } from '../engine';` (from `game/main.ts`). The reference implementation for everything below is `workspace/game-template/game/main.ts`. After every edit: `cd workspace/<game-name> && npm run check`.

## 1. Palette discipline — one named palette, indexed colors

Pick **ONE** named palette for the game and take every color from it by index. Never write ad-hoc hex strings in game code.

Available palettes (from `engine/palette.ts`, all of type `Palette`):

| Export | Character | Size |
|---|---|---|
| `PICO8` | Bright, versatile PICO-8 16-color set — the default choice | 16 |
| `GAMEBOY` | Muted 4-tone green Game Boy ramp (index 0 = darkest) | 4 |
| `DUSK` | Purple dusk/twilight ramp for moody scenes | 8 |

```ts
import { PICO8, type Palette } from '../engine';

const PAL: Palette = PICO8;      // ONE palette per game, chosen once
const COLOR_BG = PAL[0];         // black
const COLOR_SHIP = PAL[12];      // blue
const COLOR_DANGER = PAL[8];     // red
const COLOR_TEXT = PAL[7];       // white
```

Why indices, not hex: a single indexed palette keeps every sprite, particle, and text color harmonious, and it makes palette-swap easter eggs (`swapPalette`, `PALETTES` — owned by **adding-easter-egg**) work for free. PICO8 index stability: 0 black, 1 dark-blue, 2 dark-purple, 3 dark-green, 4 brown, 5 dark-grey, 6 light-grey, 7 white, 8 red, 9 orange, 10 yellow, 11 green, 12 blue, 13 lavender, 14 pink, 15 peach.

An ad-hoc `'#ff00ff'` in game code is a visual bug: fix it by finding the nearest palette index.

## 2. Pixel scale — low logical resolution, integer scale-up

Use `createPixelCanvas` and keep the **logical** resolution low. The reference game uses 240×160 at scale 3 (a 720×480 canvas). The chunky-pixel look comes from drawing few logical pixels and scaling them up — not from drawing small shapes on a big canvas.

```ts
import { createPixelCanvas } from '../engine';

const W = 240;
const H = 160;

const pc = createPixelCanvas({
  width: W,       // logical width — the coordinate space you draw in
  height: H,      // logical height
  scale: 3,       // backing store is W*scale x H*scale
  parent: document.getElementById('screen'),
});
```

`createPixelCanvas` already disables `imageSmoothingEnabled` and bakes the scale transform, so **all drawing happens in logical pixel units** — never multiply by `scale` yourself, and never re-enable smoothing. `pc.width`/`pc.height` are the logical dimensions; `pc.clear(color)` fills the whole logical area (call it at the start of each frame with the palette's background color, e.g. `pc.clear(PICO8[0])`).

If a game looks "HD" instead of retro, the logical resolution is too high. Stay in the 160–320 wide range.

## 3. Sprite discipline — ASCII art via makeSprite / drawSprite

Sprites are ASCII-art rows colored from the palette. Keep them **3–8 rows** tall and readable at a glance — a player must identify ship vs. pickup vs. hazard instantly at 1 logical pixel per cell.

```ts
import { makeSprite, drawSprite, PICO8 } from '../engine';

// Silhouette first: the shape must read even in one color.
const shipSprite = makeSprite(
  ['..#..',
   '.###.',
   '#####',
   '#.#.#'],
  { '#': PICO8[12] },
);

// Multiple map chars = multiple palette colors in one sprite.
const heartSprite = makeSprite(
  ['.#.#.',
   '#o#o#',
   '#ooo#',
   '.#o#.',
   '..#..'],
  { '#': PICO8[8], o: PICO8[14] },
);

// In render: draws at logical (x, y); px = size of each cell (default 1).
drawSprite(pc.ctx, shipSprite, ship.x, ship.y);
drawSprite(pc.ctx, heartSprite, 100, 40, 2); // 2x2 logical px per cell
```

Rules: `.` and space are transparent (as is any char missing from the map); distinct game entities get distinct silhouettes *and* distinct palette indices; a sprite that needs a caption to be understood is too abstract — redraw it.

## 4. Retro text — the built-in 3×5 bitmap font

All text goes through `drawText` / `drawTextCentered` (never canvas `fillText` — a system font instantly breaks the retro look). The engine font is 3×5 pixels per glyph and **uppercases input automatically**; it covers A–Z, 0–9, and common punctuation. Write strings in uppercase anyway so what you read in code is what renders.

```ts
import { drawText, drawTextCentered, textWidth, PICO8 } from '../engine';

// Title: bigger scale, accent color, centered in the logical width.
drawTextCentered(pc.ctx, 'STAR MINER', W, 48, { color: PICO8[10], scale: 3 });

// Body text at scale 1; secondary info in a dimmer palette index.
drawTextCentered(pc.ctx, 'COLLECT + DODGE', W, 78, { color: PICO8[6] });

// textWidth measures for manual placement (scale, spacing match drawText opts).
const label = 'READY?';
drawText(pc.ctx, label, W - 4 - textWidth(label, 2), 40, { color: PICO8[7], scale: 2 });
```

`TextOptions` are `color`, `scale` (size of each font pixel in logical px), and `spacing` (gap between glyphs in font pixels). Establish hierarchy with scale + palette index: title at scale 2–3 in an accent color, body at scale 1 in white (`PICO8[7]`), hints in grey (`PICO8[6]` / `PICO8[5]`). Whether HUD text is *positioned* safely is **improving-game-quality**'s check.

## 5. CRT filter — created once, rendered LAST

Every game gets the CRT overlay (scanlines + vignette + flicker). Create it once at setup and render it as the **final** draw call of every frame — after `juice.postRender`, over the fully finished frame. Anything drawn after the CRT pass floats on top of the "glass" and breaks the illusion.

```ts
import { createCrt } from '../engine';

const crt = createCrt(); // defaults: scanlineAlpha 0.18, vignetteAlpha 0.35, flicker 0.03

function render(): void {
  pc.clear(PICO8[0]);              // 1. clear (un-shaken)
  juice.preRender(pc.ctx);         // 2. shake transform on
  // ...world, sprites, text, HUD...
  juice.postRender(pc.ctx, W, H);  // 3. shake off + flash overlay
  crt.render(pc.ctx, W, H, 1 / 60); // 4. CRT — ALWAYS the last call
}
```

Tune via `CrtOptions` only if the game demands it (e.g. a very dark game may want `vignetteAlpha` lowered); the defaults are calibrated. The full frame-order rule (clear before preRender, etc.) is owned by **improving-game-quality**.

## 6. Ambient particles — a preset that fits the scene

Every game world gets an ambient background layer. Choose the `AmbientPreset` that matches the fiction, not a random one:

| Preset | Fits |
|---|---|
| `'stars'` | Space, night sky, void arenas |
| `'rain'` | Cyberpunk city, storms, noir |
| `'snow'` | Ice/winter levels, mountains |
| `'embers'` | Lava, hell, forge, campfire |
| `'bubbles'` | Underwater, potions, swamp |

```ts
import { createParticles } from '../engine';

const particles = createParticles({ width: W, height: H, ambient: 'stars' });

// Per level/biome, swap the preset (or null for none, e.g. indoor menus):
particles.setAmbient('embers');
```

Call `particles.update(dt)` in the update tick and `particles.render(pc.ctx)` inside the juice pre/post window (usually first, behind the world). Density is `ambientCount` (default 48) — lower it if the background competes with gameplay. Whether the preset *matches the game world* is re-verified by **improving-game-quality**; impact `burst` tuning also lives there.

## Visual pass checklist (look only)

- [ ] One named palette (`PICO8` / `GAMEBOY` / `DUSK`); zero ad-hoc hex strings in `game/`.
- [ ] Logical resolution low (reference: 240×160, scale 3); all drawing in logical units.
- [ ] Sprites are `makeSprite` ASCII art, 3–8 rows, distinct silhouettes + colors per entity type.
- [ ] All text via `drawText` / `drawTextCentered`; hierarchy from `scale` + palette index.
- [ ] `crt.render` is the last call of every frame, after `juice.postRender`.
- [ ] Ambient preset fits the fiction.
- [ ] `cd workspace/<game-name> && npm run check` passes.
