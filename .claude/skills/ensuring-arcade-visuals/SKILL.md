---
name: ensuring-arcade-visuals
description: Use when creating or editing a game's visual presentation, or when a game looks flat, modern, or off-brand. Ensures the arcade-cabinet look — palette discipline, low pixel resolution, ASCII sprites, retro bitmap text, CRT filter, ambient particles.
---

# Ensuring arcade visuals

This skill covers the game's **look** only. Readability and HUD margins (`SAFE_MARGIN`, whether text is legible and clear of edges) are *quality* concerns — they live in **improving-game-quality**, which owns the only quality checklist. Do not duplicate those checks here; defer to that skill.

**Editing this skill, or any engine module it describes, changes how every future game looks — run **verifying-graphics** before calling such an edit done.** This skill itself is for one game's look.

All engine imports come from the barrel: `import { ... } from '../engine';` (from any module in `game/`). The reference implementation for everything below is the template's presentation code — `game/theme.ts` (palette roles), `game/sprites.ts` (art), `game/view.ts` (backdrop, actors, HUD) and `game/screens.ts` (title, pause, terminal screens) in `workspace/game-template/` — and its decisions are recorded in the template's `STYLE.md`. After every edit, from the game folder: `npm run check && npm run lint`, then look at the scene you changed (`npm run look -- --scene <scene>`, read the screenshot). Code samples below carry no comments (comments are a lint error and agents copy samples); the prose around each one explains it.

## 0. Style card BEFORE code — forced divergence

Before the first milestone save, derive **2–3 distinct visual directions** from the game's fiction — each a one-liner: palette + background/actor color indices, ambient preset, sprite silhouette language, juice personality. Pick one and record it in the game's `STYLE.md` (the clone starts with the reference game's card — rewrite every decision, keep the structure) — never as a comment block in code: comments are a lint error.

**The style card records the ART DECISIONS, not just the palette.** It must name, in one compact block:

- **palette** + the background/actor index scheme;
- **sprite tones** — the 2–3 palette indices per actor (body / shade / highlight) and whether the keyline is authored into the rows or baked with `{ outline }` (§3b), plus what each living thing's 2 frames do;
- **background planes** — the far band/ramp and the silhouette layer, with their indices, and the note that both sit under the ambient band (§7);
- **surface treatment** — the `drawBevel` fill/light/dark triple, the one texture strip, and how edges/pits read as depth;
- **logo colors** — the `drawLogo` `color`/`shade`/`shadow` indices, and what the title's hero prop is;
- ambient preset, juice personality, terminal-screen treatment.

The two art-passed fixtures show the format at full length: `verification/cave-hopper/STYLE.md` and `verification/brick-bounce/STYLE.md` (read only — never run or modify a fixture).

**Divergence rule — a concrete comparison set.** The chosen style card must differ from:

- **(a) the reference game's combination** — PICO8 / black bg with haze bands and a far planet / blue swept arrow-ship / yellow cut gem / red barbed mine / `'stars'` — **always reserved**; and the two fixtures' combinations are reserved with it: **cave-hopper** (SUNSET / banded cave + stalactite silhouettes / cream outlined hopper / gold coin / fang spikes / `'embers'`) and **brick-bounce** (PICO8 underwater / navy depth ramp + coral + arena bezel / white pearl / beveled shell rows / `'bubbles'`). Borrow the *techniques* from a fixture; never its look; and
- **(b) the style cards of every game currently in `workspace/`** — read each `workspace/<name>/STYLE.md` before choosing.

`STYLE.md` is also the record to keep consistent when a game's look evolves: a change that moves a decision edits the card in the same milestone.

**Divergence is never "avoid PICO8".** The reserved combinations are reserved as *combinations*; the palette itself is shared. Default to **PICO8** for any game with more than two actor roles or a set of target rows, and diverge on silhouettes, ground color, background planes, ambient and burst colors. A blind comparison of generated games showed the failure mode plainly: writers who fled to a single-ramp palette (OCEAN, DUSK, NEON) to "be different" produced monochrome walls and pickups the same hue as hazards, and scored far below games that kept PICO8 with distinct silhouettes. **Target sets are multi-hue, always:** a wall of bricks, a column of enemies, a row of gems — anything the player must tell apart by row or type — spans at least three hue families (red / yellow / green / blue …), never one hue at three values. A magenta-pink-lilac wall reads as one slab in motion and in grayscale; this is the single most common way a generated game has scored badly. Reach for SUNSET/NEON/DUSK/OCEAN/GAMEBOY only when the fiction demands that mood *and* the role-hue contract (§1b) can still be met inside it — if it cannot, change the palette, not the contract.

**Name the game and show it.** The title screen carries a real game name in `drawLogo` (never the folder name — "VG SPACE" is a placeholder, not a title), a one-line hook, and the hero sprite as a prop at px 2–4. A title without a hero sprite reads as a test fixture.

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

ONE palette per game, chosen once, every role a named constant read by index (the template keeps them in `game/theme.ts` as `C_BG`, `C_TEXT`, `C_ACCENT`, …): background black (0), ship blue (12), danger red (8), text white (7). Keep the palette's own tuple type (`const PAL = PICO8`, not `const PAL: Palette`) so an index reads as a `string` under `noUncheckedIndexedAccess`:

```ts
import { PICO8 } from '../engine';

const PAL = PICO8;
const COLOR_BG = PAL[0];
const COLOR_SHIP = PAL[12];
const COLOR_DANGER = PAL[8];
const COLOR_TEXT = PAL[7];
```

Why indices, not hex: a single indexed palette keeps every sprite, particle, and text color harmonious, and it makes palette-swap easter eggs (`swapPalette`, `PALETTES` — owned by **adding-easter-egg**) work for free. PICO8 roles per index — roles guide selection; the contrast floor below decides legality:

| Role | Indices |
|---|---|
| background | 0 black `#000000` · 1 dark-blue `#1D2B53` · 2 dark-purple `#7E2553` · 5 dark-grey `#5F574F` |
| scenery | 3 dark-green `#008751` · 4 brown `#AB5236` · 6 light-grey `#C2C3C7` · 13 lavender `#83769C` · 15 peach `#FFCCAA` |
| actor | 7 white `#FFF1E8` · 8 red `#FF004D` · 9 orange `#FFA300` · 10 yellow `#FFEC27` · 11 green `#00E436` · 12 blue `#29ADFF` · 14 pink `#FF77A8` |

The 8-tone palettes (`DUSK`, `NEON`, `SUNSET`, `OCEAN`) run dark → light, index 0 the ground and 7 the brightest; `GAMEBOY` likewise 0 → 3. A swapped palette is a new array, so easter eggs toggle between them cheaply.

**Choosing between them is an art decision, not a mood pick.** For a game with **several target/brick rows, or more than two actor roles**, prefer a **multi-hue** palette — `PICO8`, `NEON`, `SUNSET`. The single-ramp palettes (`OCEAN`, `GAMEBOY`, `DUSK`) are one hue at eight values, so every row and every role comes out the same color at a different brightness — the same failure as the original monochrome pass, which cleared every contrast ratio and still looked worse. If a single-ramp palette is genuinely right for the fiction, then rows must differ by **value AND edge treatment** (bevel tones, lip, dither) — not value alone — and the player (or ball) must take the ramp's **brightest** tone so it is never confused with scenery.

An ad-hoc `'#ff00ff'` in game code is a visual bug: fix it by finding the nearest palette index.

## 1b. Contrast floor + red-green safety — the floor is the gate

- **Actor floor:** every gameplay-critical entity color must have `contrast(entity, surface) >= 3.0` (exported from the barrel) against **every static surface it can overlap** — the clear color AND drawn scenery/terrain. `contrast()` measures the colors you AUTHOR; the CRT pass adds a fixed phosphor lift on top of both, which raises a dark ground more than it raises a bright actor. Against a non-black ground the ratio you measure is therefore about 1.4× the ratio that reaches the eye, so **on any clear color other than pure black the authored floor is 4.5:1, not 3.0** (PICO8 red on PICO8[1] navy measures 3.52:1 and renders at 2.48:1 — legal by the old gate, and mushy on the glass). Against a pure-black clear color 3.0 still holds, because there the lift works in the actor's favour. A role partition alone provably fails (PICO8 red vs dark-grey is 1.81:1 — "partition-legal" and invisible); compute the ratio.
- **Ambient prominence band:** ambient particle colors sit **just above the background** — contrast vs the clear color between ~1.8:1 and ~2.5:1, tuned toward the top of the band, at 1–2 px sizes. The engine preset defaults are band-compliant vs a **black** clear color; a brighter background needs `ambientColor` (or `setAmbient(preset, color)`) retuned into the band. The 1.8 floor stands on black grounds: the far depth layer is dimmer than the mid layer by design, and the phosphor lift raises a dot on pure black only a little, not enough to push a correctly-tuned far-layer dot below perceptibility. The band is measured on the authored hex, before the CRT. On black the pass raises every tone by roughly 0.8 of a ratio point, so a tone that measures at the 2.5 ceiling reaches the eye near the 3:1 actor floor — keep the whole ramp, near layer and sparks included, at or below 2.5 as authored.
- **Red-green safety:** a red-vs-green hue difference may never be the ONLY distinction between critical entity classes. Require two of: hue family (prefer blue/orange/yellow pairs), brightness, silhouette. Check: would the entities still be distinguishable in grayscale?
- **Role-hue contract:** player, pickup, and hazard must come from three different hue families AND use three different silhouettes — never reuse the reference/fixture shapes (arrow-ship, cut gem, barbed mine) across two roles in the same game, and never let two roles share a silhouette even if their palette indices differ. Pickups take the palette's brightest warm accent (PICO8 10/9 territory — yellow/orange); hazards are red-family or read as spiky/jagged regardless of hue (a round friendly-looking hazard fails even if it's red). **Actual-size check:** before committing to a sprite, render it at its actual `px × cell` size in your head (or on scrap paper) — silhouettes must still read as distinct shapes at 6–12 px, the size floor from §3; a design that only reads at preview zoom is too fussy for the arena.

## 2. Pixel scale — low logical resolution, integer scale-up

Use `createPixelCanvas` and keep the **logical** resolution low. The reference game uses 240×160 at scale 3 (a 720×480 canvas). The chunky-pixel look comes from drawing few logical pixels and scaling them up — not from drawing small shapes on a big canvas.

`width`/`height` are the logical size — the coordinate space you draw in; `scale` multiplies it into the backing store (W×scale by H×scale):

```ts
import { createPixelCanvas } from '../engine';

const W = 240;
const H = 160;

const pc = createPixelCanvas({
  width: W,
  height: H,
  scale: 3,
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

Two levers, both legitimate: a bigger ASCII sprite map, or `drawSprite`'s `px` cell-size parameter (a 6-row sprite at `px: 2` renders 12 px — but the reference authors every gameplay sprite at `PX = 1` at full rendered size: a 16×12 ship, an 8×8 gem, a 10×10 mine).

**Hitboxes must follow the visuals:** every entity's `{w, h}` — and everything derived from it (collision, clamps, bounce margins, spawn offsets, burst anchors) — within ~1 logical px of the **rendered** size (`px × cell count`). Scaling only the sprite gives a big-looking ship with a tiny hitbox: visibly-touching hazards don't kill, visibly-touched pickups don't collect.

Silhouette first: the ship below must read even in one color. The heart shows that multiple map chars give multiple palette colors in one sprite. In render, `drawSprite` draws at a logical `{x, y}`; the last argument `px` is the size of each cell (default 1), so the heart draws 2×2 logical px per cell:

```ts
import { makeSprite, drawSprite, PICO8 } from '../engine';

const shipSprite = makeSprite(
  ['..#..',
   '.###.',
   '#####',
   '#.#.#'],
  { '#': PICO8[12] },
);

const heartSprite = makeSprite(
  ['.#.#.',
   '#o#o#',
   '#ooo#',
   '.#o#.',
   '..#..'],
  { '#': PICO8[8], o: PICO8[14] },
);

drawSprite(pc.ctx, shipSprite, { x: ship.x, y: ship.y });
drawSprite(pc.ctx, heartSprite, { x: 100, y: 40 }, 2);
```

Rules: `.` and space are transparent (as is any char missing from the map); distinct game entities get distinct silhouettes *and* distinct palette indices; a sprite that needs a caption to be understood is too abstract — redraw it.

## 3b. Sprite craft — full-size, multi-tone, outlined, animated

§3 gets a shape on screen. This section is what separates a **game** from a demo: a one-color blob at `px: 2` is legible and still looks like a placeholder. Worked examples: the template's `game/sprites.ts` (ship, gem, mine, debris, planet), `verification/cave-hopper/game/sprites.ts` (player, coin, spikes, flag) and `verification/brick-bounce/game/sprites.ts` (the pearl). Read them; never run or modify a fixture.

- **Author at `px = 1`, at the sprite's full rendered size.** A 10×8-px ship is a **10×8-cell** ASCII map drawn at `px: 1` — not a 5×4 map at `px: 2`. Cells are your resolution: at `px: 2` you cannot draw a keyline, a shade or an eye, only 2×2 chunks. The size floors and the hitbox rule from §3 are unchanged (rendered size = `px × cells`; here `px` is 1, so the map size *is* the hitbox size). `px >= 2` stays legitimate for **title-screen props** (§7) and for coarse background dressing, not for gameplay actors.
- **2–3 palette tones per sprite:** a body tone, a shade for the lower/away side, and (optionally) a highlight where the light hits. Same palette, same indices as everything else (§1) — three chars in the `SpriteMap`, no extra cost.
- **Plus a dark keyline.** Either author the outline **into the rows** (an `O` char mapped to the darkest palette index — cave-hopper does this, and the sprite's `w`/`h` stay exactly as written), or pass `makeSprite(rows, map, { outline: PAL[0] })`, which bakes an 8-neighbour keyline and **grows the sprite by one cell on every side** — a hitbox derived from it must use the inner size. Authoring it in is preferred precisely because the footprint stays honest.
  - **A keyline authored into the rows scales with `px`.** At `px: 4` that 1-cell outline becomes a 4-px band and the sprite reads as a striped blob, not a character. The condition is a contrast one: **a row-authored keyline may be scaled past `px: 2` only when the keyline tone reads ≤ 2:1 against the ground behind it** — the reference ship's `PICO8[1]` keyline on black is 1.52:1, so its `px: 4` title prop still reads as one silhouette. Otherwise (a keyline that clears the ground, as any dark line on a lit surface does) author a **dedicated poster sprite** whose keyline is one cell at that size — never blow up a gameplay sprite to poster size (§7's hero prop is the place this bites).
  - **A critical entity that overlaps a textured surface carries a 1-px keyline that clears 3:1 against BOTH the entity and the surface.** A keyline in the same tone as the surface's own lip or texture is not separation — it is camouflage; compute both ratios with `contrast()`.
- **Silhouette first, still.** All of the above is on top of §1b's role-hue contract: the shape must read in one flat color before any tone is added. Tones make it look built; they never rescue a mushy outline.
- **Anything alive gets a 2-frame animation**, picked from the game clock with `frameIndex(clock, fps, count)`: an engine flame flicker, a coin spin (wide→narrow disc), a walk cycle, a flag flutter, an idle bob. Two frames is enough — 3–8 fps. Build the frames once at module scope (§10 of improving-game-quality); `frameIndex` is the only per-frame cost.
- **Facing is a second sprite, not a transform.** `flipSprite(sprite)` (or `makeSprite(..., { flipX: true })`) at **setup**, then index by facing in render. Never flip per frame.

The hero below is 8×10 cells at px 1: `O` is the authored keyline, `C` the body, `F` the shade, `V` the highlight. Two frames — legs together, legs apart — and the facing mirrored ONCE, at setup. In render it draws at px 1, so the hitbox is the 8×10 the rows describe; the frame lookup goes through `at()` from the game's `lookup.ts`, because an array index may be out of range under `noUncheckedIndexedAccess`:

```ts
import { makeSprite, flipSprite, frameIndex, drawSprite, SUNSET } from '../engine';
import { at } from './lookup';

const PAL = SUNSET;
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
const heroRight = [
  makeSprite([...BODY, '.OC..CO.', 'OCC..CCO'], MAP),
  makeSprite([...BODY, '.OC..CO.', '.OC..CO.'], MAP),
];
const heroLeft = heroRight.map((frame) => flipSprite(frame));

const set = player.facing < 0 ? heroLeft : heroRight;
const frame = at(set, frameIndex(clock, 8, 2));
drawSprite(pc.ctx, frame, { x: Math.round(player.x), y: Math.round(player.y) }, 1);
```

## 4. Retro text — the built-in 3×5 bitmap font (5-wide M/W)

All text goes through `drawText` / `drawTextCentered` (never canvas `fillText` — a system font instantly breaks the retro look). The engine font is 3×5 pixels per glyph — except **M and W, which are 5 wide**, because a 3-wide cell cannot draw those two unambiguously (readers see 'YOU YIN', 'ARROVS', 'GAHE OVER'). The font is therefore proportional: `textWidth` and the draw routines advance per glyph, so **always measure with `textWidth`, never `len * 4 * scale`** — a string containing M or W is wider than it used to be. It **uppercases input automatically**; it covers A–Z, 0–9, and common punctuation. Write strings in uppercase anyway so what you read in code is what renders.

A title at a bigger scale in the accent color, centred in the logical width (`{ width, y }`); body text at scale 1 with secondary info in a dimmer palette index; and `textWidth` (its `scale` and `spacing` match the `drawText` options) for manual placement at a point (`{ x, y }`):

```ts
import { drawText, drawTextCentered, textWidth, PICO8 } from '../engine';

drawTextCentered(pc.ctx, 'STAR MINER', { width: W, y: 48 }, { color: PICO8[10], scale: 3 });
drawTextCentered(pc.ctx, 'COLLECT + DODGE', { width: W, y: 78 }, { color: PICO8[6] });

const label = 'READY?';
drawText(pc.ctx, label, { x: W - 4 - textWidth(label, 2), y: 40 }, { color: PICO8[7], scale: 2 });
```

`TextOptions` are `color`, `scale` (size of each font pixel in logical px), `spacing` (gap between glyphs in font pixels), `shadow`, and `outline`. Establish hierarchy with scale + palette index: title at scale 2–3 in an accent color, body at scale 1 in white (`PICO8[7]`), hints in grey (`PICO8[6]` / `PICO8[5]`). Whether HUD text is *positioned* safely is **improving-game-quality**'s check.

**Shadow/outline defaults — headline vs HUD.** `drawTextCentered` at `scale >= 2` (titles, GAME OVER, YOU WIN, big prompts) asks for a 1-px all-round dark keyline (`outline`) by default, so headline words stay legible over a live, moving scene — but the keyline itself is only drawn at **`scale >= 3`**: at scale 2 a keyline pressing in from both sides closes the glyph counters, so it degrades to a 1-px drop shadow. Asking for an outline is always safe; below scale 3 you get a shadow. A *color* outline degrades to a shadow of that color, so pass `outline: true` unless you specifically want a colored shadow. `drawScore`/`drawLives`/`hudText` (`ui.ts`) get a 1-px drop shadow by default instead — enough separation for HUD text that sits over a mostly-static ground. Opt out (`{ shadow: false }` / `{ outline: false }`) only when the text already sits on a solid plate or a dimmed background (`drawPanel`/`dimScene`) and the extra ink would look muddy; never opt out of both shadow and outline for text over live gameplay.

## 5. CRT filter — created once, rendered LAST

Every game gets the CRT overlay. The pass is five layers, in order: **halation** (the finished frame re-drawn ±1 device px with `'lighter'`), a **phosphor lift** (additive blue-grey so pure black reads as a lit tube), **multiply scanlines** (each row scaled toward its own hue), then **vignette** and **flicker**. Create it once at setup and render it as the **final** draw call of every frame — after `juice.postRender`, over the fully finished frame. Anything drawn after the CRT pass floats on top of the "glass" and breaks the illusion.

`createCrt()` with no options takes the calibrated defaults (halation 0.09, lift `'rgb(15,17,28)'`, `scanlineAlpha` 0.09, `vignetteAlpha` 0.35, `flicker` 0.03). The frame is: clear (un-shaken), `preRender` (shake transform on), world, sprites, text and HUD, `postRender` (shake off, flash overlay — radial from the death point when `flash()` got an origin), and the CRT — ALWAYS the last call:

```ts
import { createCrt } from '../engine';

const crt = createCrt();

function render(): void {
  pc.clear(PICO8[0]);
  juice.preRender(pc.ctx);
  drawWorld();
  juice.postRender(pc.ctx, W, H);
  crt.render(pc.ctx, W, H, 1 / 60);
}
```

Tune via `CrtOptions` only if the game demands it (e.g. a very dark game may want `vignetteAlpha` lowered); the defaults are calibrated. `halation` is the per-side bloom alpha (default 0.09) and **0 disables the layer entirely** — the escape hatch on a slow host, since halation is the one pass that snapshots the frame each frame. `lift` is the additive phosphor floor (default `'rgb(15,17,28)'`); `''` disables it, for a game on a bright ground with no black to lift. The full frame-order rule (clear before preRender, etc.) is owned by **improving-game-quality**.

**The glass is not neutral.** A phosphor lift means pure-black art no longer renders as pure black — the CRT pass adds a faint lit-tube glow on top, so don't chase "true black" by darkening game colors further; the lift is deliberate and part of the calibrated look; halation (default per-side alpha 0.09) additionally blooms bright sprites sideways. `scanlineAlpha` (default 0.09) is a **multiply depth**, not an opacity over black — it scales each row toward its own hue rather than dragging it toward black, so raising it darkens proportionally without banding into hard stripes.

## 6. Ambient particles — a preset that fits the scene

Every game world gets an ambient background layer. Choose the `AmbientPreset` that matches the fiction, not a random one:

| Preset | Fits |
|---|---|
| `'stars'` | Space, night sky, void arenas |
| `'rain'` | Cyberpunk city, storms, noir |
| `'snow'` | Ice/winter levels, mountains |
| `'embers'` | Lava, hell, forge, campfire, torch-lit caves |
| `'bubbles'` | Underwater, potions, swamp, damp caves |

Create it once (the template does it in `game/app.ts`); per level or biome, swap the preset (or pass `null` for none, e.g. indoor menus):

```ts
import { createParticles } from '../engine';

const particles = createParticles({ width: W, height: H, ambient: 'stars' });
particles.setAmbient('embers');
```

Call `particles.update(dt)` in the update tick and `particles.render(pc.ctx)` inside the juice pre/post window (usually first, behind the world). Density is `ambientCount` (default 48) — lower it if the background competes with gameplay. Whether the preset *matches the game world* is re-verified by **improving-game-quality**; impact `burst` tuning also lives there.

**Depth, twinkle, and clustering are defaults now — nothing to opt into.** Every ambient preset builds 2–3 depth layers automatically (far specks dimmer/slower, near ones a touch brighter/faster/bigger, plus a handful of bright sparks for `'stars'`/`'embers'`); each particle twinkles on its own deterministic clock instead of holding a flat alpha; and every preset but `'rain'` clusters into clumps or streams rather than an even sprinkle (an even scatter reads as dirt on the glass, not atmosphere). `ambientColor` (or `setAmbient(preset, color)`) still exists for retuning the whole band to a non-black background — the depth-layer tones are derived from whatever color you pass, so an override keeps the ramp. The far layer is always dimmer than the mid layer, which is dimmer than the near layer — don't hand-tune that ordering per game.

## 7. Art direction — backgrounds, surfaces, title

The single loudest "this is a demo" tell is not the sprites: it is a **flat clear color behind a flat rectangle under a text-only title**. Every game gets a background with depth, surfaces with a light source, and a drawn title. All four helpers below are cheap and setup-free (`fillBands`, `fillDither`, `drawBevel`, `drawFrame`, `drawLogo` — all from `'../engine'`). Worked examples: `verification/cave-hopper/game/view.ts` (cave depth, rock slabs, pit) and `verification/brick-bounce/game/view.ts` (underwater ramp, arena bezel, beveled shells), with their titles in each fixture's `game/screens.ts`. Every rect below is an object `{ x, y, w, h }`.

### Backgrounds — at least two depth planes

1. **A far band or horizon** — `fillBands(ctx, { x: 0, y: 0, w: W, h }, [c1, c2, c3])` for sky/water/cave depth, or a short `fillDither` ladder between the palette's **two darkest** tones for a smooth seam (`fillDither(ctx, rect, { colorA, colorB, pattern: 'sparse' | 'checker' })`, `'checker'` by default — two palette colors mixed into a third without leaving the palette).
2. **Silhouettes that frame the arena** — stalactites, coral, a planet, a city line, side walls closing in — drawn in the **darkest** tones.

**A far band must never cross the middle of the play field, and a horizon is a SOLID step.** Bands live as a *horizon*: in the top or bottom quarter of the frame, at most 1.3:1 against the clear color, drawn with `fillBands` or a plain rect as a hard step between two adjacent dark tones. Never a dithered ladder or dithered seam across the field — three separate blind reviews read every dithered horizon as a "dotted band artifact"; `fillDither` belongs on slab faces, seabeds and other small surfaces. A flat block across mid-field reads as a wall and steals the scene.

Both planes must sit **at or below the ambient band vs the clear color** (§1b): scenery may never compete with an actor. The engine ambient layer renders *on top* of them (`particles.render` after the backdrop, before the world). Keep the play field itself **calm** — **keep dither to seams and edges, and never tile the play field under fast actors**: the pattern beats against their motion and the whole arena reads as texture rather than as a place. Two or three dither seams low in the frame read as depth; a tall dither ladder — or a full-field crosshatch — across the play area reads as stripes. A flat palette field with one seam is the default; texture is the exception you justify.

The cave backdrop below is a far plane in the cave dark, two dither seams low in the frame, a flat near plane, and the stalactite silhouettes on top:

```ts
import { fillBands, fillDither, SUNSET } from '../engine';

const PAL = SUNSET;

function drawBackdrop(): void {
  const ctx = pc.ctx;
  fillBands(ctx, { x: 0, y: 0, w: W, h: 104 }, [PAL[0], PAL[0]]);
  fillDither(ctx, { x: 0, y: 104, w: W, h: 5 }, { colorA: PAL[0], colorB: PAL[1], pattern: 'sparse' });
  fillDither(ctx, { x: 0, y: 109, w: W, h: 5 }, { colorA: PAL[0], colorB: PAL[1], pattern: 'checker' });
  ctx.fillStyle = PAL[1];
  ctx.fillRect(0, 114, W, H - 114);
  for (const spike of STALACTITES) {
    drawSpike(spike, PAL[1]);
  }
}
```

### Surfaces — every slab is beveled, edges read as depth

- Every platform, brick, paddle and panel is `drawBevel(ctx, { x, y, w, h }, { fill, light, dark })` — a 1-px lit top/left and dark bottom/right edge turns a rectangle into an object. Take `fill`/`light`/`dark` from neighbouring palette indices — and check the lit edge and lip against the **hazard** tones before settling: cave-hopper's slab is `PAL[2] / PAL[2] / PAL[1]` with a `PAL[2]/PAL[5]` dithered lip precisely because a lip in `PAL[3]`/`PAL[4]` wore the spikes' own tones and the hazards read as terrain.
- **At most one texture strip** per surface (a `fillDither` face, or a lit top lip) — more and the surface competes with the actors standing on it.
- **Pits and edges are depth, not seams:** `fillBands(ctx, { x: pit.x, y, w: pit.w, h }, [PAL[1], PAL[0], PAL[0]])` falls away into the palette's darkest tone. Stay in the palette here too: on SUNSET, `PAL[0]` is a deep plum, deliberately *not* black, and a `'#000000'` band under it reads as a hole punched in the art rather than as depth.
- **An arena frame where the fiction has walls:** `drawFrame(ctx, { x, y, w, h }, { color, thickness })`, optionally twice (a thick dark bezel plus a 1-px light keyline) so the walls the actor bounces off are visibly the walls.

A slab is the bevel (fill / light / dark), a dithered face when it is tall enough, and a lit top lip; the arena is a 4-px dark bezel plus a 1-px keyline on the bounce walls:

```ts
import { drawBevel, fillDither, drawFrame, type Rect } from '../engine';

function drawSlab(r: Rect): void {
  drawBevel(pc.ctx, r, { fill: PAL[2], light: PAL[2], dark: PAL[1] });
  if (r.h > 3) {
    fillDither(pc.ctx, { x: r.x + 1, y: r.y + 3, w: r.w - 2, h: r.h - 4 }, { colorA: PAL[2], colorB: PAL[1], pattern: 'sparse' });
  }
  fillDither(pc.ctx, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: 1 }, { colorA: PAL[2], colorB: PAL[5], pattern: 'sparse' });
}

drawFrame(pc.ctx, { x: 4, y: 12, w: W - 8, h: 164 }, { color: PAL[0], thickness: 4 });
drawFrame(pc.ctx, { x: 7, y: 15, w: W - 14, h: 158 }, { color: PAL[5], thickness: 1 });
```

### Title screen — a drawn wordmark, a hook, and the hero

A title made of `drawTextCentered` at scale 3 is a placeholder. The title screen carries four things:

1. **`drawLogo(ctx, text, { width: W, y }, { color, shade, shadow, scale })`** — a two-tone lit-from-above wordmark with an offset shadow, in one call (`color` lights the top 3 font rows, `shade` is the body, `shadow` the offset). Take all three from the palette.
2. **A one-line hook** at scale 1 — what the player does, in six words ("HOP THE SPIKES  REACH THE FLAG").
3. **The hero as a prop** — the player sprite drawn **larger than in play** on a beveled ledge, with a pickup beside it. This is the one place `px > 1` is right: it is a poster, not a hitbox. But an outline authored into the rows scales with `px` (§3b): **a row-authored keyline may be scaled past `px: 2` only when the keyline tone reads ≤ 2:1 against the ground behind it** — the reference ship's `PICO8[1]` keyline on black is 1.52:1, which is why its `px: 4` prop holds together. When the keyline clears the ground by more than that, go bigger with a **dedicated poster sprite** whose keyline is one cell at that size. Props show the still frame (`frames[0]`) or a slow `frameIndex`; they never animate at gameplay speed.
4. **A pulsing prompt + control hints** — `blink`/`pulse` per improving-game-quality §1b, then `controlHints(input)`. **Hint text at scale 1 over a textured backdrop passes `{ shadow: true }`** — `drawText`/`drawTextCentered` back small text with nothing by default, and a 3x5 glyph over a dither field loses its stems.

Terminal screens (GAME_OVER / WIN) keep the world visible: `dimScene(pc, 0.6)` **then a HOLLOW `drawFrame` bezel** around the headline block — the dim IS the backing, so an opaque `drawBevel`/`drawPanel` plate on top of it is the "dim **or** plate, never both" violation, and it throws away the world context the dim was there to keep. Use an opaque plaque only where there is no dim.

The cave-hopper title as an example: the logo, the hook, the ledge, the hero and a coin as px-2 props (or a dedicated big sprite), the pulsing prompt and the hints. The template's version is `renderTitle` in `game/screens.ts`:

```ts
import { drawLogo, drawTextCentered, drawSprite, blink, controlHints, BUTTON_KEY } from '../engine';

drawLogo(pc.ctx, 'CAVE HOPPER', { width: W, y: 18 }, { color: PAL[6], shade: PAL[5], shadow: PAL[1], scale: 3 });
drawTextCentered(pc.ctx, 'HOP THE SPIKES  REACH THE FLAG', { width: W, y: 42 }, { color: PAL[5], shadow: true });
drawSlab({ x: 40, y: 104, w: 68, h: 10 });
drawSprite(pc.ctx, heroProp, { x: 62, y: 80 }, 2);
drawSprite(pc.ctx, coinProp, { x: 124, y: 92 }, 2);
drawTextCentered(pc.ctx, `PRESS ${BUTTON_KEY.A.hint} TO START`, { width: W, y: 118 }, {
  color: blink(clock, 1.0, 0.6) ? PAL[7] : PAL[5],
  shadow: true,
});
controlHints(input).forEach((h, i) => {
  drawTextCentered(pc.ctx, h, { width: W, y: 130 + i * 8 }, { color: PAL[6], shadow: true });
});
```

## Visual pass checklist (look only)

- [ ] Style card in the game's `STYLE.md` (never a comment block), recording the art decisions (sprite tones, background planes, surface treatment, logo colors) as well as palette/ambient/juice; differs from the reference game, both fixtures, AND every other game in `workspace/` per the divergence rule (§0).
- [ ] One named palette (`PICO8` / `GAMEBOY` / `DUSK` / `NEON` / `SUNSET` / `OCEAN`); multi-hue (PICO8/NEON/SUNSET) whenever there are several target rows or >2 actor roles, and a single-ramp choice separates rows by value AND edge treatment with the player on the brightest tone (§1); zero ad-hoc hex strings in `game/`.
- [ ] Every gameplay-critical entity color clears `contrast() >= 3.0` vs the clear color and any scenery it overlaps; ambient color in the 1.8–2.5:1 band; entities distinguishable in grayscale (§1b).
- [ ] Player, pickup, hazard use three different hue families AND three different silhouettes (never the reference/fixture shapes reused across roles); pickup is the palette's brightest warm accent; hazard is red-family or spiky (§1b role-hue contract).
- [ ] Logical resolution low (reference: 240×160, scale 3); all drawing in logical units.
- [ ] Sprites are `makeSprite` ASCII art, distinct silhouettes + colors per entity type; size floors met (player ≥ H/12, other critical entities ≥ H/20) and hitboxes within ~1 px of rendered size (§3); silhouettes checked at their actual rendered px size, not preview zoom.
- [ ] Sprites authored at `px = 1` at full rendered size, 2–3 palette tones each, with a dark keyline (authored into the rows, or `makeSprite {outline}` with the hitbox on the inner size) that clears 3:1 against both the entity and any textured surface it overlaps; every living thing has a 2-frame `frameIndex` animation and facing via `flipSprite` mirrored at setup (§3b).
- [ ] Background has ≥2 depth planes (a `fillBands`/`fillDither` far band plus dark silhouettes), both at or below the ambient band; no far band crosses mid-field — bands sit in the top or bottom quarter, ≤1.3:1 vs the clear color, drawn as a solid step (never a dithered seam); dither is confined to seams and edges and the play field under fast actors is a calm flat field; ambient renders on top (§7).
- [ ] Every platform/brick/panel is a `drawBevel` slab with at most one texture strip; pits/edges fall away via `fillBands` into the palette's darkest tone (stay in the palette — `PAL[0]`, not `'#000000'`); `drawFrame` bezel where the fiction has walls (§7).
- [ ] Title is `drawLogo` + a one-line hook + the hero prop drawn large (a row-authored keyline scales past `px: 2` only when that keyline tone reads ≤ 2:1 against the ground behind it; else a dedicated poster sprite) + a pulsing prompt + control hints, with scale-1 hint text over texture passing `{ shadow: true }`; terminal screens use `dimScene` plus a HOLLOW `drawFrame` bezel (dim OR plate, never both) (§7).
- [ ] All text via `drawText` / `drawTextCentered`; hierarchy from `scale` + palette index; headline text keeps the default outline at scale >= 2 (rendered as a keyline from scale >= 3, as a drop shadow at scale 2), HUD text the default shadow, unless already on a plate/dimmed background (§4).
- [ ] `crt.render` is the last call of every frame, after `juice.postRender`.
- [ ] Ambient preset fits the fiction; bursts use the game's own palette colors, never the engine default.
- [ ] `npm run check` and `npm run lint` pass in the game folder, and every scene touched has been looked at with `npm run look -- --scene <scene>` (screenshot read, `errors` empty).
