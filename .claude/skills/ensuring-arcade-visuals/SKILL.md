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

**The style card records the ART DECISIONS, not just the palette.** It must name, in one compact block:

- **palette** + the background/actor index scheme;
- **sprite tones** — the 2–3 palette indices per actor (body / shade / highlight) and whether the keyline is authored into the rows or baked with `{ outline }` (§3b), plus what each living thing's 2 frames do;
- **background planes** — the far band/ramp and the silhouette layer, with their indices, and the note that both sit under the ambient band (§7);
- **surface treatment** — the `drawBevel` fill/light/dark triple, the one texture strip, and how edges/pits read as depth;
- **logo colors** — the `drawLogo` `color`/`shade`/`shadow` indices, and what the title's hero prop is;
- ambient preset, juice personality, terminal-screen treatment.

The two art-passed fixtures show the format at full length: `verification/cave-hopper/game/main.ts` and `verification/brick-bounce/game/main.ts` (read only — never run or modify a fixture).

**Divergence rule — a concrete comparison set.** The chosen style card must differ from:

- **(a) the reference game's combination** — PICO8 / black bg / blue arrow-ship / yellow `+` pickup / red `x` hazard / `'stars'` — **always reserved**; and the two fixtures' combinations are reserved with it: **cave-hopper** (SUNSET / banded cave + stalactite silhouettes / cream outlined hopper / gold coin / fang spikes / `'embers'`) and **brick-bounce** (PICO8 underwater / navy depth ramp + coral + arena bezel / white pearl / beveled shell rows / `'bubbles'`). Borrow the *techniques* from a fixture; never its look; and
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

- **Actor floor:** every gameplay-critical entity color must have `contrast(entity, surface) >= 3.0` (exported from the barrel) against **every static surface it can overlap** — the clear color AND drawn scenery/terrain. `contrast()` measures the colors you AUTHOR; the CRT pass adds a fixed phosphor lift on top of both, which raises a dark ground more than it raises a bright actor. Against a non-black ground the ratio you measure is therefore about 1.4× the ratio that reaches the eye, so **on any clear color other than pure black the authored floor is 4.5:1, not 3.0** (PICO8 red on PICO8[1] navy measures 3.52:1 and renders at 2.48:1 — legal by the old gate, and mushy on the glass). Against a pure-black clear color 3.0 still holds, because there the lift works in the actor's favour. A role partition alone provably fails (PICO8 red vs dark-grey is 1.81:1 — "partition-legal" and invisible); compute the ratio.
- **Ambient prominence band:** ambient particle colors sit **just above the background** — contrast vs the clear color between ~1.8:1 and ~2.5:1, tuned toward the top of the band, at 1–2 px sizes. The engine preset defaults are band-compliant vs a **black** clear color; a brighter background needs `ambientColor` (or `setAmbient(preset, color)`) retuned into the band. The 1.8 floor stands on black grounds: the far depth layer is dimmer than the mid layer by design, and the phosphor lift raises a dot on pure black only a little, not enough to push a correctly-tuned far-layer dot below perceptibility. The band is measured on the authored hex, before the CRT. On black the pass raises every tone by roughly 0.8 of a ratio point, so a tone that measures at the 2.5 ceiling reaches the eye near the 3:1 actor floor — keep the whole ramp, near layer and sparks included, at or below 2.5 as authored.
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

- player character ≥ **1/12 of logical height** in its larger rendered dimension (≈14 px at 160-high; 16×12 is the comfortable arcade target — the reference ship);
- other gameplay-critical entities (hazards, pickups, projectiles) ≥ **1/20 of logical height** (≈8 px at 160).

These floors were raised after the art-direction pass: at 6–10 px an actor is a blob that no amount of shading rescues, and a 240×160 field with three 8-px actors reads as a test harness. (The older fixtures under `verification/` — cave-hopper's 8×12 runner, brick-bounce's 6-px pearl — predate this floor and stay frozen as instruments; do not copy their sizes.)

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

## 3b. Sprite craft — full-size, multi-tone, outlined, animated

§3 gets a shape on screen. This section is what separates a **game** from a demo: a one-color blob at `px: 2` is legible and still looks like a placeholder. Worked examples: `verification/cave-hopper/game/main.ts` (player, coin, spikes, flag) and `verification/brick-bounce/game/main.ts` (the pearl). Read them; never run or modify them.

- **Author at `px = 1`, at the sprite's full rendered size.** A 10×8-px ship is a **10×8-cell** ASCII map drawn at `px: 1` — not a 5×4 map at `px: 2`. Cells are your resolution: at `px: 2` you cannot draw a keyline, a shade or an eye, only 2×2 chunks. The size floors and the hitbox rule from §3 are unchanged (rendered size = `px × cells`; here `px` is 1, so the map size *is* the hitbox size). `px >= 2` stays legitimate for **title-screen props** (§7) and for coarse background dressing, not for gameplay actors.
- **2–3 palette tones per sprite:** a body tone, a shade for the lower/away side, and (optionally) a highlight where the light hits. Same palette, same indices as everything else (§1) — three chars in the `SpriteMap`, no extra cost.
- **Plus a dark keyline.** Either author the outline **into the rows** (an `O` char mapped to the darkest palette index — cave-hopper does this, and the sprite's `w`/`h` stay exactly as written), or pass `makeSprite(rows, map, { outline: PAL[0] })`, which bakes an 8-neighbour keyline and **grows the sprite by one cell on every side** — a hitbox derived from it must use the inner size. Authoring it in is preferred precisely because the footprint stays honest.
  - **A keyline authored into the rows scales with `px`.** At `px: 4` that 1-cell outline is a 4-px black band and the sprite reads as a striped blob, not a character. Above `px: 2`, draw a **dedicated larger sprite** whose keyline is still one cell — never blow up a gameplay sprite to poster size (§7's hero prop is the place this bites).
  - **A critical entity that overlaps a textured surface carries a 1-px keyline that clears 3:1 against BOTH the entity and the surface.** A keyline in the same tone as the surface's own lip or texture is not separation — it is camouflage; compute both ratios with `contrast()`.
- **Silhouette first, still.** All of the above is on top of §1b's role-hue contract: the shape must read in one flat color before any tone is added. Tones make it look built; they never rescue a mushy outline.
- **Anything alive gets a 2-frame animation**, picked from the game clock with `frameIndex(clock, fps, count)`: an engine flame flicker, a coin spin (wide→narrow disc), a walk cycle, a flag flutter, an idle bob. Two frames is enough — 3–8 fps. Build the frames once at module scope (§10 of improving-game-quality); `frameIndex` is the only per-frame cost.
- **Facing is a second sprite, not a transform.** `flipSprite(sprite)` (or `makeSprite(..., { flipX: true })`) at **setup**, then index by facing in render. Never flip per frame.

```ts
import { makeSprite, flipSprite, frameIndex, drawSprite, SUNSET } from '../engine';

const PAL = SUNSET;
// 8x10 cells at px 1: O = authored keyline, C = body, F = shade, V = highlight.
const MAP = { O: PAL[0], C: PAL[7], F: PAL[5], V: PAL[3] };
const BODY = [
  '..OOOO..',
  '.OCCCCO.',
  '.OCCVVO.',
  '.OCCCCO.',
  '..OCCO..',
  'OCCCCCCO',
  'OCFFFFCO',
  '.OFFFFO.',
];
// Two frames: legs together / legs apart. Facing mirrored ONCE, at setup.
const heroRight = [
  makeSprite([...BODY, '.OC..CO.', 'OCC..CCO'], MAP),
  makeSprite([...BODY, '.OC..CO.', '.OC..CO.'], MAP),
];
const heroLeft = heroRight.map(flipSprite);

// In render — px 1, and the hitbox is the 8x10 the rows describe.
const set = player.facing < 0 ? heroLeft : heroRight;
drawSprite(pc.ctx, set[frameIndex(clock, 8, 2)], Math.round(player.x), Math.round(player.y), 1);
```

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

**Shadow/outline defaults — headline vs HUD.** `drawTextCentered` at `scale >= 2` (titles, GAME OVER, YOU WIN, big prompts) asks for a 1-px all-round dark keyline (`outline`) by default, so headline words stay legible over a live, moving scene — but the keyline itself is only drawn at **`scale >= 3`**: at scale 2 a keyline pressing in from both sides closes the glyph counters, so it degrades to a 1-px drop shadow. Asking for an outline is always safe; below scale 3 you get a shadow. A *color* outline degrades to a shadow of that color, so pass `outline: true` unless you specifically want a colored shadow. `drawScore`/`drawLives`/`hudText` (`ui.ts`) get a 1-px drop shadow by default instead — enough separation for HUD text that sits over a mostly-static ground. Opt out (`{ shadow: false }` / `{ outline: false }`) only when the text already sits on a solid plate or a dimmed background (`drawPanel`/`dimScene`) and the extra ink would look muddy; never opt out of both shadow and outline for text over live gameplay.

## 5. CRT filter — created once, rendered LAST

Every game gets the CRT overlay. The pass is five layers, in order: **halation** (the finished frame re-drawn ±1 device px with `'lighter'`), a **phosphor lift** (additive blue-grey so pure black reads as a lit tube), **multiply scanlines** (each row scaled toward its own hue), then **vignette** and **flicker**. Create it once at setup and render it as the **final** draw call of every frame — after `juice.postRender`, over the fully finished frame. Anything drawn after the CRT pass floats on top of the "glass" and breaks the illusion.

```ts
import { createCrt } from '../engine';

const crt = createCrt(); // defaults: halation 0.09, lift 'rgb(15,17,28)',
                         //   scanlineAlpha 0.12, vignetteAlpha 0.35, flicker 0.03

function render(): void {
  pc.clear(PICO8[0]);              // 1. clear (un-shaken)
  juice.preRender(pc.ctx);         // 2. shake transform on
  // ...world, sprites, text, HUD...
  juice.postRender(pc.ctx, W, H);  // 3. shake off + flash overlay
  crt.render(pc.ctx, W, H, 1 / 60); // 4. CRT — ALWAYS the last call
}
```

Tune via `CrtOptions` only if the game demands it (e.g. a very dark game may want `vignetteAlpha` lowered); the defaults are calibrated. `halation` is the per-side bloom alpha (default 0.09) and **0 disables the layer entirely** — the escape hatch on a slow host, since halation is the one pass that snapshots the frame each frame. `lift` is the additive phosphor floor (default `'rgb(15,17,28)'`); `''` disables it, for a game on a bright ground with no black to lift. The full frame-order rule (clear before preRender, etc.) is owned by **improving-game-quality**.

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

## 7. Art direction — backgrounds, surfaces, title

The single loudest "this is a demo" tell is not the sprites: it is a **flat clear color behind a flat rectangle under a text-only title**. Every game gets a background with depth, surfaces with a light source, and a drawn title. All four helpers below are cheap and setup-free (`fillBands`, `fillDither`, `drawBevel`, `drawFrame`, `drawLogo` — all from `'../engine'`). Worked examples: cave-hopper (cave depth, rock slabs, pit) and brick-bounce (underwater ramp, light shafts, arena bezel, beveled shells).

### Backgrounds — at least two depth planes

1. **A far band or horizon** — `fillBands(ctx, 0, 0, W, h, [c1, c2, c3])` for sky/water/cave depth, or a short `fillDither` ladder between the palette's **two darkest** tones for a smooth seam (`fillDither(ctx, x, y, w, h, colorA, colorB, 'sparse' | 'checker')` — two palette colors mixed into a third without leaving the palette).
2. **Silhouettes that frame the arena** — stalactites, coral, a planet, a city line, side walls closing in — drawn in the **darkest** tones.

Both planes must sit **at or below the ambient band vs the clear color** (§1b): scenery may never compete with an actor. The engine ambient layer renders *on top* of them (`particles.render` after the backdrop, before the world). Keep the play field itself **calm** — **keep dither to seams and edges, and never tile the play field under fast actors**: the pattern beats against their motion and the whole arena reads as texture rather than as a place. Two or three dither seams low in the frame read as depth; a tall dither ladder — or a full-field crosshatch — across the play area reads as stripes. A flat palette field with one seam is the default; texture is the exception you justify.

```ts
import { fillBands, fillDither, SUNSET } from '../engine';
const PAL = SUNSET;

function drawBackdrop(): void {
  const ctx = pc.ctx;
  fillBands(ctx, 0, 0, W, 104, [PAL[0], PAL[0]]);        // far plane: cave dark
  fillDither(ctx, 0, 104, W, 5, PAL[0], PAL[1], 'sparse');   // seam, low in frame
  fillDither(ctx, 0, 109, W, 5, PAL[0], PAL[1], 'checker');
  ctx.fillStyle = PAL[1];
  ctx.fillRect(0, 114, W, H - 114);                      // near plane
  for (const [x, w, h] of STALACTITES) drawSpike(x, w, h, PAL[1]); // silhouettes
}
```

### Surfaces — every slab is beveled, edges read as depth

- Every platform, brick, paddle and panel is `drawBevel(ctx, x, y, w, h, fill, light, dark)` — a 1-px lit top/left and dark bottom/right edge turns a rectangle into an object. Take `fill`/`light`/`dark` from three neighbouring palette indices.
- **At most one texture strip** per surface (a `fillDither` face, or a lit top lip) — more and the surface competes with the actors standing on it.
- **Pits and edges are depth, not seams:** `fillBands(ctx, pit.x, y, pit.w, h, [PAL[1], PAL[0], '#000000'])` falls away into black. (The literal black here is the one legitimate non-palette color — it is the absence of surface, not an art color.)
- **An arena frame where the fiction has walls:** `drawFrame(ctx, x, y, w, h, color, thickness)`, optionally twice (a thick dark bezel plus a 1-px light keyline) so the walls the actor bounces off are visibly the walls.

```ts
import { drawBevel, fillDither, drawFrame } from '../engine';

function drawSlab(x: number, y: number, w: number, h: number): void {
  drawBevel(pc.ctx, x, y, w, h, PAL[2], PAL[3], PAL[1]);            // fill / light / dark
  if (h > 3) fillDither(pc.ctx, x + 1, y + 3, w - 2, h - 4, PAL[2], PAL[1], 'sparse');
  fillDither(pc.ctx, x + 1, y + 1, w - 2, 1, PAL[3], PAL[4], 'sparse'); // lit top lip
}
drawFrame(pc.ctx, 4, 12, W - 8, 164, PAL[0], 4);   // bezel
drawFrame(pc.ctx, 7, 15, W - 14, 158, PAL[5], 1);  // keyline on the bounce walls
```

### Title screen — a drawn wordmark, a hook, and the hero

A title made of `drawTextCentered` at scale 3 is a placeholder. The title screen carries four things:

1. **`drawLogo(ctx, text, W, y, { color, shade, shadow, scale })`** — a two-tone lit-from-above wordmark with an offset shadow, in one call (`color` lights the top 3 font rows, `shade` is the body, `shadow` the offset). Take all three from the palette.
2. **A one-line hook** at scale 1 — what the player does, in six words ("HOP THE SPIKES  REACH THE FLAG").
3. **The hero as a prop** — the player sprite drawn **larger than in play** on a beveled ledge, with a pickup beside it. This is the one place `px > 1` is right: it is a poster, not a hitbox. But an outline authored into the rows scales with `px` (§3b), so `px: 2` is the ceiling for a gameplay sprite — go bigger with a **dedicated poster sprite** whose keyline is one cell at that size. Props show the still frame (`frames[0]`) or a slow `frameIndex`; they never animate at gameplay speed.
4. **A pulsing prompt + control hints** — `blink`/`pulse` per improving-game-quality §1b, then `controlHints(input)`. **Hint text at scale 1 over a textured backdrop passes `{ shadow: true }`** — `drawText`/`drawTextCentered` back small text with nothing by default, and a 3x5 glyph over a dither field loses its stems.

Terminal screens (GAME_OVER / WIN) keep the world visible: `dimScene(pc, 0.6)` **then a HOLLOW `drawFrame` bezel** around the headline block — the dim IS the backing, so an opaque `drawBevel`/`drawPanel` plate on top of it is the "dim **or** plate, never both" violation, and it throws away the world context the dim was there to keep. Use an opaque plaque only where there is no dim.

```ts
import { drawLogo, drawTextCentered, drawSprite, blink, controlHints, BUTTON_KEY } from '../engine';

drawLogo(pc.ctx, 'CAVE HOPPER', W, 18, { color: PAL[6], shade: PAL[5], shadow: PAL[1], scale: 3 });
drawTextCentered(pc.ctx, 'HOP THE SPIKES  REACH THE FLAG', W, 42, { color: PAL[5], shadow: true });
drawSlab(40, 104, 68, 10);                                  // the ledge
drawSprite(pc.ctx, heroRight[0], 62, 80, 2);                // hero prop: px 2, or a
drawSprite(pc.ctx, coinFrames[0], 124, 92, 2);              //   dedicated big sprite
drawTextCentered(pc.ctx, `PRESS ${BUTTON_KEY.A.hint} TO START`, W, 118, {
  color: blink(clock, 1.0, 0.6) ? PAL[7] : PAL[5],
  shadow: true,
});
controlHints(input).forEach((h, i) =>
  drawTextCentered(pc.ctx, h, W, 130 + i * 8, { color: PAL[6], shadow: true }));
```

## Visual pass checklist (look only)

- [ ] Style card comment atop `main.ts`, recording the art decisions (sprite tones, background planes, surface treatment, logo colors) as well as palette/ambient/juice; differs from the reference game, both fixtures, AND every other game in `workspace/` per the divergence rule (§0).
- [ ] One named palette (`PICO8` / `GAMEBOY` / `DUSK` / `NEON` / `SUNSET` / `OCEAN`); zero ad-hoc hex strings in `game/`.
- [ ] Every gameplay-critical entity color clears `contrast() >= 3.0` vs the clear color and any scenery it overlaps; ambient color in the 1.8–2.5:1 band; entities distinguishable in grayscale (§1b).
- [ ] Player, pickup, hazard use three different hue families AND three different silhouettes (never the reference/fixture shapes reused across roles); pickup is the palette's brightest warm accent; hazard is red-family or spiky (§1b role-hue contract).
- [ ] Logical resolution low (reference: 240×160, scale 3); all drawing in logical units.
- [ ] Sprites are `makeSprite` ASCII art, distinct silhouettes + colors per entity type; size floors met (player ≥ H/12, other critical entities ≥ H/20) and hitboxes within ~1 px of rendered size (§3); silhouettes checked at their actual rendered px size, not preview zoom.
- [ ] Sprites authored at `px = 1` at full rendered size, 2–3 palette tones each, with a dark keyline (authored into the rows, or `makeSprite {outline}` with the hitbox on the inner size) that clears 3:1 against both the entity and any textured surface it overlaps; every living thing has a 2-frame `frameIndex` animation and facing via `flipSprite` mirrored at setup (§3b).
- [ ] Background has ≥2 depth planes (a `fillBands`/`fillDither` far band plus dark silhouettes), both at or below the ambient band; dither is confined to seams and edges and the play field under fast actors is a calm flat field; ambient renders on top (§7).
- [ ] Every platform/brick/panel is a `drawBevel` slab with at most one texture strip; pits/edges fall away via `fillBands` into black; `drawFrame` bezel where the fiction has walls (§7).
- [ ] Title is `drawLogo` + a one-line hook + the hero prop drawn large (`px` ≤ 2 for a row-outlined sprite, else a dedicated poster sprite) + a pulsing prompt + control hints, with scale-1 hint text over texture passing `{ shadow: true }`; terminal screens use `dimScene` plus a HOLLOW `drawFrame` bezel (dim OR plate, never both) (§7).
- [ ] All text via `drawText` / `drawTextCentered`; hierarchy from `scale` + palette index; headline text keeps the default outline at scale >= 2 (rendered as a keyline from scale >= 3, as a drop shadow at scale 2), HUD text the default shadow, unless already on a plate/dimmed background (§4).
- [ ] `crt.render` is the last call of every frame, after `juice.postRender`.
- [ ] Ambient preset fits the fiction; bursts use the game's own palette colors, never the engine default.
- [ ] `cd workspace/<game-name> && npm run check` passes.
