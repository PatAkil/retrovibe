# Ensuring arcade visuals — worked examples & rationale

On-demand reference for `.claude/skills/ensuring-arcade-visuals/SKILL.md`. Read this only if a visual pass fails or you need worked code examples. Code samples carry no comments (comments are a lint error); the prose around each explains it.

## 0. Divergence rationale

**Divergence is never "avoid PICO8".** The reserved combinations are reserved as *combinations*; the palette itself is shared. Default to **PICO8** for any game with more than two actor roles or a set of target rows, and diverge on silhouettes, ground color, background planes, ambient and burst colors. Writers who flee to a single-ramp palette (`OCEAN`, `DUSK`, `NEON`) to "be different" often produce monochrome walls and pickups the same hue as hazards.

**Target sets are multi-hue, always:** a wall of bricks, a column of enemies, a row of gems — anything the player must tell apart by row or type — spans at least three hue families (red / yellow / green / blue …), never one hue at three values. Reach for `SUNSET`/`NEON`/`DUSK`/`OCEAN`/`GAMEBOY` only when the fiction demands that mood *and* the role-hue contract can still be met inside it — if it cannot, change the palette, not the contract.

If a single-ramp palette (`OCEAN`, `GAMEBOY`, `DUSK`) is genuinely right for the fiction, separate rows by **value AND edge treatment** (bevel tones, lip, dither) — not value alone — and put the player (or ball) on the ramp's **brightest** tone.

Worked fixture references (frozen — read only, **never run, never modify, never clone**, never copy their look):
- `verification/cave-hopper/` (`STYLE.md`, `game/sprites.ts`, `game/view.ts`, `game/screens.ts`)
- `verification/brick-bounce/` (`STYLE.md`, `game/sprites.ts`, `game/view.ts`, `game/screens.ts`)

## 1. Palette indexing & PICO8 role table

Keep the palette's own tuple type (`const PAL = PICO8`, not `const PAL: Palette`) so an index reads as a `string` under `noUncheckedIndexedAccess`:

```ts
import { PICO8 } from '../engine';

const PAL = PICO8;
const COLOR_BG = PAL[0];
const COLOR_SHIP = PAL[12];
const COLOR_DANGER = PAL[8];
const COLOR_TEXT = PAL[7];
```

PICO8 roles per index (roles guide selection; `contrast()` decides legality):

| Role | Indices |
|---|---|
| background | 0 black `#000000` · 1 dark-blue `#1D2B53` · 2 dark-purple `#7E2553` · 5 dark-grey `#5F574F` |
| scenery | 3 dark-green `#008751` · 4 brown `#AB5236` · 6 light-grey `#C2C3C7` · 13 lavender `#83769C` · 15 peach `#FFCCAA` |
| actor | 7 white `#FFF1E8` · 8 red `#FF004D` · 9 orange `#FFA300` · 10 yellow `#FFEC27` · 11 green `#00E436` · 12 blue `#29ADFF` · 14 pink `#FF77A8` |

The 8-tone palettes (`DUSK`, `NEON`, `SUNSET`, `OCEAN`) run dark → light, index 0 the ground and 7 the brightest; `GAMEBOY` likewise 0 → 3.

### Contrast math & CRT phosphor lift

`contrast()` measures the colors you AUTHOR; the CRT pass adds a fixed phosphor lift on top of both, raising a dark ground more than a bright actor. Against a non-black ground the ratio you measure is ~1.4× the ratio that reaches the eye, so **on any clear color other than pure black the authored floor is 4.5:1, not 3.0** (PICO8 red on `PICO8[1]` navy measures 3.52:1 and renders at 2.48:1 — mushy on the glass). Against pure black, 3.0 holds. A role partition alone fails (`PICO8[8]` red vs `PICO8[5]` dark-grey is 1.81:1) — always compute the ratio.

On black, the CRT pass raises ambient tones by ~0.8 ratio point, so keep the whole ambient ramp (near layer and sparks included) at or below 2.5:1 authored.

## 2. Pixel canvas setup

`width`/`height` are logical dimensions; `scale` multiplies into the backing store (`W×scale` by `H×scale`). `createPixelCanvas` disables `imageSmoothingEnabled` and bakes the scale transform — draw in logical px only:

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

## 3. Sprites — basic & full craft (`px = 1`, multi-tone, outlined, animated, flipped)

Simple silhouette sprites:

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

Full-craft 10×14 hero at `px = 1` (meets ≥14 px player floor): `O` authored keyline, `C` body, `F` shade, `V` highlight; 2-frame walk cycle; facing mirrored ONCE at setup via `flipSprite`:

```ts
import { makeSprite, flipSprite, frameIndex, drawSprite, SUNSET } from '../engine';
import { at } from './lookup';

const PAL = SUNSET;
const MAP = { O: PAL[0], C: PAL[7], F: PAL[5], V: PAL[3] };
const BODY = [
  '...OOOO...',
  '..OCCCCO..',
  '.OCCVVCCO.',
  '.OCCCCCCO.',
  '..OCCCCO..',
  '...OCCO...',
  'OCCCCCCCCO',
  'OCCFFFFCCO',
  '.OCFFFFCO.',
  '.OCFFFFCO.',
  '..OFFFFO..',
  '..OC..CO..',
];
const heroRight = [
  makeSprite([...BODY, '..OC..CO..', '.OCC..CCO.'], MAP),
  makeSprite([...BODY, '.OC....CO.', '.OC....CO.'], MAP),
];
const heroLeft = heroRight.map((frame) => flipSprite(frame));

const set = player.facing < 0 ? heroLeft : heroRight;
const frame = at(set, frameIndex(clock, 8, 2));
drawSprite(pc.ctx, frame, { x: Math.round(player.x), y: Math.round(player.y) }, 1);
```

**Keyline scaling rule:** a row-authored keyline scales with `px`. It may be scaled past `px: 2` only when the keyline tone reads `<= 2:1` against the ground behind it (e.g. reference ship's `PICO8[1]` on black is 1.52:1). Otherwise author a dedicated poster sprite whose keyline is 1 cell at poster size.

## 4. Retro text

Proportional 3×5 bitmap font (M and W are 5 wide) — always measure with `textWidth`, never `len * 4 * scale`:

```ts
import { drawText, drawTextCentered, textWidth, PICO8 } from '../engine';

drawTextCentered(pc.ctx, 'STAR MINER', { width: W, y: 48 }, { color: PICO8[10], scale: 3 });
drawTextCentered(pc.ctx, 'COLLECT + DODGE', { width: W, y: 78 }, { color: PICO8[6] });

const label = 'READY?';
drawText(pc.ctx, label, { x: W - 4 - textWidth(label, 2), y: 40 }, { color: PICO8[7], scale: 2 });
```

`drawTextCentered` at `scale >= 2` asks for a 1-px outline by default (rendered as keyline at `scale >= 3`, degraded to 1-px drop shadow at `scale 2` so counters don't close). HUD helpers (`drawScore`/`drawLives`/`hudText`) default to a 1-px drop shadow.

## 5. CRT filter & frame order

Create once at setup (`createCrt()` calibrated defaults: halation 0.09, lift `'rgb(15,17,28)'`, `scanlineAlpha` 0.09, `vignetteAlpha` 0.35, `flicker` 0.03). Render LAST after `juice.postRender`:

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

`halation: 0` disables the bloom snapshot on slow hosts; `lift: ''` disables phosphor lift on bright grounds.

## 6. Ambient particles

| Preset | Fits |
|---|---|
| `'stars'` | Space, night sky, void arenas |
| `'rain'` | Cyberpunk city, storms, noir |
| `'snow'` | Ice/winter levels, mountains |
| `'embers'` | Lava, hell, forge, campfire, torch-lit caves |
| `'bubbles'` | Underwater, potions, swamp, damp caves |

Depth layers, twinkle, and clustering are built-in defaults:

```ts
import { createParticles } from '../engine';

const particles = createParticles({ width: W, height: H, ambient: 'stars' });
particles.setAmbient('embers');
```

## 7. Backgrounds, beveled surfaces & title screen

Cave backdrop — far plane, solid horizon step in the bottom quarter (never a dithered horizon across mid-field), stalactite silhouettes on top:

```ts
import { fillBands, SUNSET } from '../engine';

const PAL = SUNSET;

function drawBackdrop(): void {
  const ctx = pc.ctx;
  fillBands(ctx, { x: 0, y: 0, w: W, h: 120 }, [PAL[0], PAL[0]]);
  ctx.fillStyle = PAL[1];
  ctx.fillRect(0, 120, W, H - 120);
  for (const spike of STALACTITES) {
    drawSpike(spike, PAL[1]);
  }
}
```

Beveled slab (fill/light/dark + sparse dither face + lit top lip) and double-bezel arena walls:

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

Title screen — `drawLogo`, one-line hook, beveled ledge + large hero & pickup props, pulsing prompt, `controlHints(input)` with `{ shadow: true }` over texture:

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
