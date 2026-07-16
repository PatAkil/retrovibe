---
name: ensuring-arcade-visuals
description: Use when creating or editing a game's visual presentation, or when a game looks flat, modern, or off-brand. Ensures the arcade-cabinet look — palette discipline, low pixel resolution, ASCII sprites, retro bitmap text, CRT filter, ambient particles.
---

# Ensuring arcade visuals

This skill covers the game's **look** only. Readability and HUD margins (`SAFE_MARGIN`, whether text is legible and clear of edges) are *quality* concerns — they live in **improving-game-quality**, which owns the only quality checklist. Do not duplicate those checks here; defer to that skill.

All engine imports come from the barrel: `import { ... } from '../engine';` (from `game/main.ts`). The reference implementation for everything below is `workspace/game-template/game/main.ts`. After every edit: `cd workspace/<game-name> && npm run check`.

## 0. Style card BEFORE code — forced divergence

Before the first milestone save, derive **2–3 distinct visual directions** from the game's fiction — each a one-liner: palette + background/actor color indices, ambient preset, sprite silhouette language, juice personality. Pick one and record it as a comment block atop `game/main.ts` (the reference game shows the format).

**Divergence rule — a concrete comparison set.** The chosen style card must differ from:

- **(a) the reference game's combination** — PICO8 / black bg / blue arrow-ship / yellow `+` pickup / red `x` hazard / `'stars'` — **always reserved**; and
- **(b) the style cards of every game currently in `workspace/`** — read the comment blocks atop their `main.ts` files before choosing.

Any two coexisting games must differ on **sprite silhouettes AND at least one other axis** (palette-index scheme, ambient preset, or burst colors beyond the palette mapping). Ambient is exempt from the count when the fiction locks it (two space games may both use `'stars'` — they still differ on silhouette plus another axis). Bursts use the game's **own palette colors** — never the engine default yellow.

## 1. Palette discipline — one named palette, indexed colors

Pick **ONE** named palette for the game and take every color from it by index. Never write ad-hoc hex strings in game code.

Available palettes (from `engine/palette.ts`, all of type `Palette` — pick the one that fits the fiction):

| Export | Character | Size |
|---|---|---|
| `PICO8` | Bright, versatile PICO-8 16-color set | 16 |
| `GAMEBOY` | Muted 4-tone green Game Boy ramp (index 0 = darkest) | 4 |
| `DUSK` | Purple dusk/twilight ramp for moody scenes | 8 |
| `NEON` | Synthwave — hot magenta/cyan on deep violet | 8 |
| `SUNSET` | Warm sunset — dusk sky to ember highlights | 8 |
| `OCEAN` | Cold ocean — abyss blues to foam | 8 |

```ts
import { PICO8, type Palette } from '../engine';

const PAL: Palette = PICO8;      // ONE palette per game, chosen once
const COLOR_BG = PAL[0];         // black
const COLOR_SHIP = PAL[12];      // blue
const COLOR_DANGER = PAL[8];     // red
const COLOR_TEXT = PAL[7];       // white
```

Why indices, not hex: a single indexed palette keeps every sprite, particle, and text color harmonious, and it makes palette-swap easter eggs (`swapPalette`, `PALETTES` — owned by **adding-easter-egg**) work for free. PICO8 roles (documented in `palette.ts`): background 0/1/2/5, scenery 3/4/6/13/15, actor 7/8/9/10/11/12/14. Roles guide selection; the contrast floor below decides legality.

An ad-hoc `'#ff00ff'` in game code is a visual bug: fix it by finding the nearest palette index.

## 1b. Contrast floor + red-green safety — the floor is the gate

- **Actor floor:** every gameplay-critical entity color must have `contrast(entity, surface) >= 3.0` (the `contrast()` helper is exported from the barrel) against **every static surface it can overlap** — the clear color AND drawn scenery/terrain. A role partition alone provably fails (PICO8 red vs dark-grey is 1.81:1 — "partition-legal" and invisible); compute the ratio.
- **Ambient prominence band:** ambient particle colors sit **just above the background** — contrast vs the clear color between ~1.8:1 and ~2.5:1, tuned toward the top of the band, at 1–2 px sizes. The engine preset defaults are band-compliant vs a **black** clear color; a brighter background needs `ambientColor` (or `setAmbient(preset, color)`) retuned into the band. The floor is 1.8 because the CRT pass darkens everything — a 1.2:1 dot renders sub-perceptual.
- **Red-green safety:** a red-vs-green hue difference may never be the ONLY distinction between critical entity classes. Require two of: hue family (prefer blue/orange/yellow pairs), brightness, silhouette. Check: would the entities still be distinguishable in grayscale?

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

Sprites are ASCII-art rows colored from the palette, readable at a glance — a player must identify ship vs. pickup vs. hazard instantly.

**Size floors (relative to logical height, so they transfer across the 160–320-wide range):**

- player character ≥ **1/16 of logical height** in its larger rendered dimension (≈10 px at 160-high);
- other gameplay-critical entities (hazards, pickups, projectiles) ≥ **1/26 of logical height** (≈6 px at 160).

Two levers, both legitimate: a bigger ASCII sprite map, or `drawSprite`'s `px` cell-size parameter (a 6-row sprite at `px: 2` renders 12 px — the reference game renders everything at `PX = 2`).

**Hitboxes must follow the visuals:** every entity's `{w, h}` — and everything derived from it (collision, clamps, bounce margins, spawn offsets, burst anchors) — within ~1 logical px of the **rendered** size (`px × cell count`). Scaling only the sprite gives a big-looking ship with a tiny hitbox: visibly-touching hazards don't kill, visibly-touched pickups don't collect.

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
| `'embers'` | Lava, hell, forge, campfire, torch-lit caves |
| `'bubbles'` | Underwater, potions, swamp, damp caves |

```ts
import { createParticles } from '../engine';

const particles = createParticles({ width: W, height: H, ambient: 'stars' });

// Per level/biome, swap the preset (or null for none, e.g. indoor menus):
particles.setAmbient('embers');
```

Call `particles.update(dt)` in the update tick and `particles.render(pc.ctx)` inside the juice pre/post window (usually first, behind the world). Density is `ambientCount` (default 48) — lower it if the background competes with gameplay. Whether the preset *matches the game world* is re-verified by **improving-game-quality**; impact `burst` tuning also lives there.

## Visual pass checklist (look only)

- [ ] Style card comment atop `main.ts`; differs from the reference game AND every other game in `workspace/` per the divergence rule (§0).
- [ ] One named palette (`PICO8` / `GAMEBOY` / `DUSK` / `NEON` / `SUNSET` / `OCEAN`); zero ad-hoc hex strings in `game/`.
- [ ] Every gameplay-critical entity color clears `contrast() >= 3.0` vs the clear color and any scenery it overlaps; ambient color in the 1.8–2.5:1 band; entities distinguishable in grayscale (§1b).
- [ ] Logical resolution low (reference: 240×160, scale 3); all drawing in logical units.
- [ ] Sprites are `makeSprite` ASCII art, distinct silhouettes + colors per entity type; size floors met (player ≥ H/16, other critical entities ≥ H/26) and hitboxes within ~1 px of rendered size (§3).
- [ ] All text via `drawText` / `drawTextCentered`; hierarchy from `scale` + palette index.
- [ ] `crt.render` is the last call of every frame, after `juice.postRender`.
- [ ] Ambient preset fits the fiction; bursts use the game's own palette colors, never the engine default.
- [ ] `cd workspace/<game-name> && npm run check` passes.
