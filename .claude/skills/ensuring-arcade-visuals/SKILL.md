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

**Amendment (graphics uplift) — the floor is measured on the composited post-CRT frame.** When a game uses any of the new layers (shaded sprites, grid, colored stars, glow, aberration), `contrast()` on flat palette hexes is the *design-time* gate, not the final one — glow and shading composite **before** `crt.render`, which darkens alternate rows and vignettes the edges, so a sprite can pass pre-CRT and fail on-screen at the periphery:

- **Post-CRT composited sampling:** verify the actor read on the actual composited-and-CRT'd buffer over the worst region (peak-glow / grid-crossing / densest-star), on the worst-case bright frame, including a dark-scanline row at a vignette edge — actor contrast still ≥ 3.0. Do this **offline** (a scratch clone, a captured frame), never as per-frame readback — a per-frame `getImageData` clamp is a multi-ms stall and disallowed.
- **Offline two-sample glow ratio:** for glow, contrast is a two-sample ratio taken from the composited post-CRT frame — one sample on the crisp actor pixel, one on the glow-bathed surface beside it — not a single luminance of the halo color. The engine's design-time luminance budget in `glow.ts` (per-source intensity clamp 0.5, composite `maxAlpha` 0.6, per-source channel budget, ≤3 stacked halos) is what makes this pass by construction; validate it offline, don't re-derive it per frame.
- **HUD text vs the new bright layers:** the three new bright layers (glow bleed, near-grid rows, dense star clusters) share the HUD corners, and thin 1px text is never sampled by actor-pixel checks. **The engine implements the *measure* resolution, not a safe-zone:** `glow.ts` and `background.ts` do **not** mask or dim anything inside `SAFE_MARGIN` bands — there is no reserved HUD zone in code. So the burden is on the game: measure `drawScore` / `drawLives` / `hudText` contrast on the composited post-CRT frame against the brightest corner surface, and if the read fails, redesign — keep halos and the grid horizon out of the HUD corners by placement, or lower `maxAlpha`. (With aberration on, HUD legibility additionally requires the `drawOverlay` routing of §10.)

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

## 7. Shaded sprites — baked shade ladders, never a lerp

`makeSprite` takes an optional third argument `SpriteShade` — `{ ramp?: number[], band?: number }`. Shading is baked **once** at `makeSprite` time (solid bands, no dither); `drawSprite`'s hot loop is untouched, and an unset `ramp` is byte-identical to an unshaded sprite.

```ts
import { makeSprite, SUNSET, type SpriteShade } from '../engine';

// Top-lit fade: row bands take 0, 1, 2 steps DOWN each color's own ladder.
const towerSprite = makeSprite(
  ['###', '###', '###', '###', '###', '###'],
  { '#': SUNSET[7] },              // cream — has a 3-step ladder in SUNSET
  { ramp: [0, 1, 2], band: 2 },    // 2-cell bands, top to bottom
);
```

- **Shade-ladder semantics:** each `ramp` entry is "N steps down that color's **own** audited ladder" (`SHADE_LADDERS` in `palette.ts`, queried via `shadeLadder(color)`). It is **never** an RGB lerp — a free `{top, bottom}` gradient is forbidden — so multi-color rows stay on-palette and every band color already cleared the 3.0:1 darkest-step audit. Steps deeper than a ladder clamp to its darkest rung.
- **Degrade-to-flat is explicit, never silent:** a color with no ladder renders flat under any ramp. Every such color is listed by name in `SHADE_FLAT`. Check before designing: on PICO8 only white/yellow/peach shade; ramp palettes (`SUNSET`/`OCEAN` especially) are the ones that actually show the gradient — pick one of those if shading is the point.
- **Fixed-orientation caveat:** the fade is baked top-lit. A rotated, mirrored, or multi-facing actor is wrong-lit — keep rotating actors **flat**, or bake one sprite per orientation.
- **Moire rule (PX=1):** the CRT scanline period is 2 logical px, so the band height in logical px (`band × px` at draw time) must be a multiple of 2. At `px >= 2` any band aligns; at `px = 1` use an even `band` — banding at `px = 1` combined with a strong `scanlineAlpha` is the flagged moire risk and the two are **mutually exclusive**.
- **Actor-vs-actor floors:** two actors distinct as flat colors can converge to near-identical dark bottoms — verify separation at **every** band, not just against the background.

## 8. Grid + parallax backgrounds — one depth metaphor, genre-gated

`createGrid({ width, height, color, horizon, spacing, scroll })` (barrel export) draws a Tron-style receding floor **behind the world**, between `juice.preRender` and the world pass. `createParticles` gains `ambientColors?: string[]` for colored parallax stars. Both are opt-in — unused, the frame is byte-identical.

Pick **one** depth metaphor per game — these two are alternatives, never combined (see the first bullet below):

```ts
import { createGrid, createParticles, NEON } from '../engine';

// EITHER a receding ground-grid (ground-based scrolling genres)...
const grid = createGrid({ width: W, height: H, color: NEON[3], horizon: 90, spacing: 12, scroll: 40 });
// update tick: grid.update(dt);  render: juice.preRender -> grid.render(pc.ctx) -> world
// on PAUSED: grid.setPaused(true) — the grid has no scene awareness of its own

// ...OR a deep-space starfield (space genres) — NOT both:
const particles = createParticles({
  width: W, height: H, ambient: 'stars',
  // near-grey cool tints, measured 2.31:1 / 2.01:1 vs the NEON[0] clear color —
  // inside the 1.8–2.5:1 band; palette background entries (NEON[1]/[2]) are NOT in band
  ambientColors: ['#4A4A5A', '#414150'],
});
// on PAUSED: particles.setPaused(true);  resume with false
```

- **Genre gating + single depth metaphor:** a scrolling grid/starfield belongs to scrolling/endless genres; a fixed-arena game uses `scroll: 0` (static) or drift-only — scrolling asserts false vection. **Never combine a receding ground-grid with a deep-space starfield** — contradictory depth cues; pick one.
- **Node-brightness cap:** lines draw flat with **no emphasized intersection nodes** — a crossing brighter than the line reads as a point-like false target. The engine already draws flat; do not layer your own bright nodes on top.
- **Integer-logical-step is the default:** lines quantize to whole logical px — pixel-pure and frame-stable. The device-space pass (`deviceSpace: true` + pass the pixel-canvas `scale` to `grid.render(ctx, scale)`) is an **explicit opt-in** for dense receding lines only. It preserves shake via a **relative** `ctx.scale(1/scale, 1/scale)` inside the shake window — never `setTransform`, which would discard the shake and leave a rock-still grid. The grid shakes fully with the world (one rigid scene).
- **Grid in the contrast gate:** the grid is a static surface — every actor overlapping it needs `contrast(actor, gridColor) >= 3.0` (and the post-CRT check in §1b).
- **Colored stars are a hue wash, not a rainbow:** every `ambientColors` entry stays in the 1.8–2.5:1 luminance band vs the clear color (the band governs luminance; the option only varies hue), low saturation, red-green-safe subset. Each particle's hue is fixed once at spawn — the engine stores it; never re-tint per frame.
- **PAUSED freeze:** on entering PAUSED call `grid.setPaused(true)` and `particles.setPaused(true)` so ambient motion halts and "paused" reads as paused; un-pause with `false`. (The grid also honors the §11 reduced-motion damper; particles offer `setPaused` only — ambient star drift is not reduced-motion-damped in the engine, so a game wanting that dampens at the call site, e.g. fewer/slower stars when `matchMedia('(prefers-reduced-motion: reduce)').matches`.)

## 9. Glow — two tiers, decoration only, contrast by design

`createGlow({ width, height })` (barrel export; match `createPixelCanvas` dims + `scale`). Two tiers, **no `ctx.filter` anywhere**: (a) default cheap radial sprite via `glow.halo(x, y, radius, color)` / `glow.bloom(...)` — one precomputed radial-gradient sprite per color, blitted additively; (b) resample blur for arbitrary bright shapes — draw into `glow.ctx` with the same logical coordinates and `drawSprite` `px` you use on the main canvas; `glow.composite(pc.ctx)` blurs by successive bilinear halvings and composites additively.

```ts
const glow = createGlow({ width: W, height: H, scale: pc.scale }); // scale MUST match createPixelCanvas — omitting it silently defaults to 3 and misregisters tier b at any other scale
// update tick: glow.update(dt);
// render, inside the shake window, UNDER the crisp world:
//   pc.clear(bg) -> juice.preRender -> glow.composite(pc.ctx) -> crisp world -> juice.postRender -> crt.render
// halo and ring are PER-FRAME calls — issue them every render frame
// (composite clears the halo queue); bloom alone is a fire-once transient.
glow.halo(orb.x, orb.y, 14, NEON[6], { intensity: 0.35 });
glow.ring(pc.ctx, orb.x, orb.y, 14, NEON[6]);   // crisp 1px ring ON the main ctx, over the halo
glow.bloom(hit.x, hit.y, 20, NEON[4]);          // impact transient, co-fired with juice.shake/flash
```

- **Never bloom a tracked actor:** glow renders **behind** the crisp sprite and is scoped to telegraphs, decorative accents, projectiles, or self-glow — never under a different actor the player must track; additive blur on tracked edges dissolves the read exactly when positioning matters.
- **Gameplay boundaries get a crisp ring:** any glow that *communicates* a boundary (range circle, blast radius, kill zone) pairs the halo with `glow.ring(...)` — a crisp 1px palette-indexed ring at the true edge. The bloom is decoration; the hard line is the contract.
- **Impact bloom is a transient, not wallpaper:** `glow.bloom` has a snappy attack and ~0.1–0.2 s total envelope (`BloomOptions.duration`, clamped), matching `juice.flash` / `crt.pulse`, and is decoupled from ambient halos. **Frozen-hold:** while `juice.frozen`, call `glow.setFrozen(true)` — the envelope holds at peak and decays only after release, so the bloom doesn't drift through the emphasized hit-stop tableau. Blooms are also rate-limited by `minBloomInterval` (default 0.1 s — photosensitivity, §11).
- **Contrast by design, not readback:** budget per-source `intensity` (clamped to 0.5), cap `maxAlpha` (default 0.6), and design-limit overlap to ~3 halos per region — decorate, don't floodlight. Per-frame `getImageData` clamping is disallowed; verification is the offline two-sample post-CRT ratio of §1b.
- **Off-palette exemption:** glow colors are exempt from palette indexing — like the vignette and the death flash, a halo is a lighting effect, not a surface. But gameplay-meaning glow should reuse a palette color so the paired crisp ring stays palette-indexed.
- Mark gameplay-telegraph halos with `{ telegraph: true }` — see §11.
- **Tier b is pay-once-touched:** after the first `glow.ctx` access, `composite` resamples the buffer every frame forever (~0.5 ms on software-rendered clients) — never touch `glow.ctx` unless the game actually draws into it every frame; tier-a halos/blooms alone never allocate it.

## 10. Chromatic aberration — strictly opt-in, capped, HUD un-split

Off by default: `createCrt()` with no `aberration` key renders a byte-identical frame. Opt in with `createCrt({ aberration: {} })` (pulse-only) or `{ aberration: { steady: 1 } }`.

- **Uniform, < 1 device px:** the split is a uniform whole-device-px channel offset, hard-capped at 1 device px, so a 1px projectile's ghosts still overlap its collision cell — apparent position == hitbox. Never radial, never raised "for gameplay layers".
- **Steady and pulse are mutually exclusive per game:** under a <1 px whole-px cap the budget admits only 0 or 1 — a `steady` that rounds to a visible px (≥ 0.5) consumes it and `crt.pulse` then adds 0 visible px (the engine ignores pulses whenever the configured steady quantizes to 1; a steady that rounds to 0 is no steady and leaves pulses enabled). Pick one: `steady: 1` for a constant film-grain identity, or `{}` + `crt.pulse(mag, durationSeconds)` reserved for major events (the same branch as `juice.shake` ≥ 4–6 px / `juice.flash` ≥ 0.3 s). During hit-stop, mirror the freeze with `crt.setFrozen(true)` so the emphasized instant doesn't de-aberrate. **Cost:** `steady: 1` pays ~11 full-device-res canvas passes *every frame* (~3–5 ms on software-rendered clients — a third of the 60 Hz budget, title screen included); pulse-only pays that only during transients. Default to pulse-only.
- **`drawOverlay` routing — HUD and ALL bitmap text:** `crt.render(ctx, W, H, dt, drawOverlay)` takes an optional callback invoked *after* the aberration pass and *before* scanlines, with the baked logical transform live. When aberration is on, move `drawScore` / `drawLives` / `hudText` **and every `drawText` / `drawTextCentered` call** (title text, PAUSED/GET READY popups, score combos) into it — 3×5 glyph strokes are 1 logical / 3 device px, so a 1 px split is ~33% fringing on every letter. If routing all text through the overlay is impractical, **forbid aberration for that game** — text-primary scenes (title-heavy, tutorial, word games) never opt in.

## 11. Reduced motion + photosensitivity — one damper, three categories

All new effects share one damper that defaults to `prefers-reduced-motion` at startup (each module reads `matchMedia` itself; override with `GridOptions.reducedMotion` / `GlowOptions.damped`, or at runtime via `grid.setReducedMotion(...)` / `glow.setDamped(...)`). Three categories:

- **Ambient / decorative — dampened:** grid scroll slows to 25%; decorative halos and steady aberration are dampened (steady split drops to 0).
- **Gameplay telegraphs — exempt:** the damper never zeroes a telegraph's urgency channel (pulse/blink) — a reduced-motion + colorblind player would lose both differentiators at once. Mark them `{ telegraph: true }` on `halo`/`bloom`; also encode urgency on a non-hue channel (pulse/size/blink), or provide a static reduced-motion-safe alternate cue. **Urgency is never zeroed.**
- **Impact-feedback transients — dampened, not zeroed:** impact blooms render dampened; aberration pulse durations are halved. The crisp flash/shake still convey the hit.

**Combined-transient ceiling:** major events can co-fire death-flash + `crt.pulse` + `glow.bloom`. The engine enforces minimum intervals — one accepted `juice.flash` start per 0.35 s (the full-screen flash is the only transient bright enough to count as a WCAG 2.3.1 flash; extra calls inside the window are dropped), one `crt.pulse` per 250 ms, `glow.bloom` gated by `minBloomInterval` (default 0.1 s) — so rapid events can't form a flash train. `CrtOptions.flicker` is hard-capped at 0.05 for the same reason — the flicker is a ~6.4 Hz full-field oscillation and higher amplitudes would sustain >3 flashes/s. Do not work around these (no per-frame re-triggering, no stacking extra full-screen flashes of your own on the same event), and keep the aggregate brightness step of a co-fired moment bounded by using the engine transients rather than hand-rolled overlays.

The damper never touches the pre-existing flicker baseline: a fresh clone with all new options unset renders today's frame byte-identically, reduced-motion machine or not.

## Visual pass checklist (look only)

- [ ] Style card comment atop `main.ts`; differs from the reference game AND every other game in `workspace/` per the divergence rule (§0).
- [ ] One named palette (`PICO8` / `GAMEBOY` / `DUSK` / `NEON` / `SUNSET` / `OCEAN`); zero ad-hoc hex strings in `game/`.
- [ ] Every gameplay-critical entity color clears `contrast() >= 3.0` vs the clear color and any scenery it overlaps; ambient color in the 1.8–2.5:1 band; entities distinguishable in grayscale (§1b).
- [ ] Logical resolution low (reference: 240×160, scale 3); all drawing in logical units.
- [ ] Sprites are `makeSprite` ASCII art, distinct silhouettes + colors per entity type; size floors met (player ≥ H/16, other critical entities ≥ H/26) and hitboxes within ~1 px of rendered size (§3).
- [ ] All text via `drawText` / `drawTextCentered`; hierarchy from `scale` + palette index.
- [ ] `crt.render` is the last call of every frame, after `juice.postRender`.
- [ ] Ambient preset fits the fiction; bursts use the game's own palette colors, never the engine default.
- [ ] If any new layer is used (shade ramp / grid / colored stars / glow / aberration): §1b's post-CRT composited check done offline, incl. the two-sample glow ratio and HUD-text-vs-bright-corners measurement.
- [ ] Shaded sprites: ramp palette chosen (or degrade-to-flat accepted knowingly via `SHADE_FLAT`); rotating actors flat; band × px a multiple of 2 (no `px=1` banding with strong `scanlineAlpha`) (§7).
- [ ] Background: one depth metaphor, genre-gated scroll (fixed arena ⇒ `scroll: 0`); `setPaused(true)` on PAUSED for grid AND particles; `ambientColors` in-band, red-green-safe (§8).
- [ ] Glow: never under a tracked actor; boundary glow paired with `glow.ring`; blooms co-fired with juice and held via `glow.setFrozen` during hit-stop; ≤ ~3 halos per region (§9).
- [ ] Aberration: opt-in only; steady XOR pulse; all HUD + bitmap text routed through `crt.render`'s `drawOverlay`; no aberration on text-primary scenes (§10).
- [ ] Telegraph halos marked `{ telegraph: true }`; no hand-rolled full-screen flashes stacked on engine transients (§11).
- [ ] `cd workspace/<game-name> && npm run check` passes.
