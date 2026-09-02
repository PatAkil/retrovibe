---
name: ensuring-arcade-visuals
description: Use when creating or editing a game's visual presentation, or when a game looks flat, modern, or off-brand. Ensures the arcade-cabinet look — palette discipline, low pixel resolution, ASCII sprites, retro bitmap text, CRT filter, ambient particles.
---

# Ensuring arcade visuals

This skill covers the game's **look** only. Readability and HUD margins (`SAFE_MARGIN`, whether text is legible and clear of edges) are *quality* concerns — they live in **improving-game-quality**, which owns the only quality checklist. Do not duplicate those checks here; defer to that skill.

**Editing this skill, or any engine module it describes, changes how every future game looks — run **verifying-graphics** before calling such an edit done.** This skill itself is for one game's look.

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

- **Actor floor:** every gameplay-critical entity color must have `contrast(entity, surface) >= 3.0` (the `contrast()` helper is exported from the barrel) against **every static surface it can overlap** — the clear color AND drawn scenery/terrain, measured **pre-CRT** (the ratio is on the game's own draw colors, not a post-filter screenshot). A role partition alone provably fails (PICO8 red vs dark-grey is 1.81:1 — "partition-legal" and invisible); compute the ratio. The CRT glass is not neutral once it's on top: the phosphor lift raises non-black grounds and the halation bloom lifts bright actors further, which compresses mid-tone ratios by roughly 0.5 — so for a saturated actor against a **non-black** ground, keep the pre-CRT ratio at **≥ 3.5:1**, not the bare 3.0 floor, to survive the lift.
- **Ambient prominence band:** ambient particle colors sit **just above the background** — contrast vs the clear color between ~1.8:1 and ~2.5:1, tuned toward the top of the band, at 1–2 px sizes. The engine preset defaults are band-compliant vs a **black** clear color; a brighter background needs `ambientColor` (or `setAmbient(preset, color)`) retuned into the band. The 1.8 floor stands on black grounds: the far depth layer is dimmer than the mid layer by design, and the phosphor lift raises a dot on pure black only a little, not enough to push a correctly-tuned far-layer dot below perceptibility.
- **Red-green safety:** a red-vs-green hue difference may never be the ONLY distinction between critical entity classes. Require two of: hue family (prefer blue/orange/yellow pairs), brightness, silhouette. Check: would the entities still be distinguishable in grayscale?
- **Role-hue contract:** player, pickup, and hazard must come from three different hue families AND use three different silhouettes — never reuse the reference/fixture shapes (arrow-ship, `+`, `x`) across two roles in the same game, and never let two roles share a silhouette even if their palette indices differ. Pickups take the palette's brightest warm accent (PICO8 10/9 territory — yellow/orange); hazards are red-family or read as spiky/jagged regardless of hue (a round friendly-looking hazard fails even if it's red). **Actual-size check:** before committing to a sprite, render it at its actual `px × cell` size in your head (or on scrap paper) — silhouettes must still read as distinct shapes at 6–12 px, the size floor from §3; a design that only reads at preview zoom is too fussy for the arena.

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

`TextOptions` are `color`, `scale` (size of each font pixel in logical px), `spacing` (gap between glyphs in font pixels), `shadow`, and `outline`. Establish hierarchy with scale + palette index: title at scale 2–3 in an accent color, body at scale 1 in white (`PICO8[7]`), hints in grey (`PICO8[6]` / `PICO8[5]`). Whether HUD text is *positioned* safely is **improving-game-quality**'s check.

**Shadow/outline defaults — headline vs HUD.** `drawTextCentered` at `scale >= 2` (titles, GAME OVER, YOU WIN, big prompts) gets a 1-px all-round dark keyline (`outline`) by default, so headline words stay legible over a live, moving scene. `drawScore`/`drawLives`/`hudText` (`ui.ts`) get a 1-px drop shadow by default instead — enough separation for HUD text that sits over a mostly-static ground. Opt out (`{ shadow: false }` / `{ outline: false }`) only when the text already sits on a solid plate or a dimmed background (`drawPanel`/`dimScene`) and the extra ink would look muddy; never opt out of both shadow and outline for text over live gameplay.

## 5. CRT filter — created once, rendered LAST

Every game gets the CRT overlay (scanlines + vignette + flicker). Create it once at setup and render it as the **final** draw call of every frame — after `juice.postRender`, over the fully finished frame. Anything drawn after the CRT pass floats on top of the "glass" and breaks the illusion.

```ts
import { createCrt } from '../engine';

const crt = createCrt(); // defaults: scanlineAlpha 0.12, vignetteAlpha 0.35, flicker 0.03

function render(): void {
  pc.clear(PICO8[0]);              // 1. clear (un-shaken)
  juice.preRender(pc.ctx);         // 2. shake transform on
  // ...world, sprites, text, HUD...
  juice.postRender(pc.ctx, W, H);  // 3. shake off + flash overlay
  crt.render(pc.ctx, W, H, 1 / 60); // 4. CRT — ALWAYS the last call
}
```

Tune via `CrtOptions` only if the game demands it (e.g. a very dark game may want `vignetteAlpha` lowered); the defaults are calibrated. The full frame-order rule (clear before preRender, etc.) is owned by **improving-game-quality**.

**The glass is not neutral.** A phosphor lift means pure-black art no longer renders as pure black — the CRT pass adds a faint lit-tube glow on top, so don't chase "true black" by darkening game colors further; the lift is deliberate and part of the calibrated look; halation (default per-side alpha 0.09) additionally blooms bright sprites sideways. `scanlineAlpha` (default 0.12) is a **multiply depth**, not an opacity over black — it scales each row toward its own hue rather than dragging it toward black, so raising it darkens proportionally without banding into hard stripes.

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

**Depth, twinkle, and clustering are defaults now — nothing to opt into.** Every ambient preset builds 2–3 depth layers automatically (far specks dimmer/slower, near ones a touch brighter/faster/bigger, plus a handful of bright sparks for `'stars'`/`'embers'`); each particle twinkles on its own deterministic clock instead of holding a flat alpha; and every preset but `'rain'` clusters into clumps or streams rather than an even sprinkle (an even scatter reads as dirt on the glass, not atmosphere). `ambientColor` (or `setAmbient(preset, color)`) still exists for retuning the whole band to a non-black background — the depth-layer tones are derived from whatever color you pass, so an override keeps the ramp. The far layer is always dimmer than the mid layer, which is dimmer than the near layer — don't hand-tune that ordering per game.

## Visual pass checklist (look only)

- [ ] Style card comment atop `main.ts`; differs from the reference game AND every other game in `workspace/` per the divergence rule (§0).
- [ ] One named palette (`PICO8` / `GAMEBOY` / `DUSK` / `NEON` / `SUNSET` / `OCEAN`); zero ad-hoc hex strings in `game/`.
- [ ] Every gameplay-critical entity color clears `contrast() >= 3.0` vs the clear color and any scenery it overlaps; ambient color in the 1.8–2.5:1 band; entities distinguishable in grayscale (§1b).
- [ ] Player, pickup, hazard use three different hue families AND three different silhouettes (never the reference/fixture shapes reused across roles); pickup is the palette's brightest warm accent; hazard is red-family or spiky (§1b role-hue contract).
- [ ] Logical resolution low (reference: 240×160, scale 3); all drawing in logical units.
- [ ] Sprites are `makeSprite` ASCII art, distinct silhouettes + colors per entity type; size floors met (player ≥ H/16, other critical entities ≥ H/26) and hitboxes within ~1 px of rendered size (§3); silhouettes checked at their actual rendered px size, not preview zoom.
- [ ] All text via `drawText` / `drawTextCentered`; hierarchy from `scale` + palette index; headline text keeps the default outline at scale >= 2, HUD text the default shadow, unless already on a plate/dimmed background (§4).
- [ ] `crt.render` is the last call of every frame, after `juice.postRender`.
- [ ] Ambient preset fits the fiction; bursts use the game's own palette colors, never the engine default.
- [ ] `cd workspace/<game-name> && npm run check` passes.
