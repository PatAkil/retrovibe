---
name: adding-easter-egg
description: Use when the user asks for an easter egg, a secret, a cheat code, or an unlockable color scheme. Adds hidden surprises to a game — palette-swap toggles and secret input sequences (↑↑↓↓…).
---

# Adding an easter egg

**Editing this skill's palette-swap guidance or `swapPalette`/`PALETTES` in the engine changes how every future game can look — run **verifying-graphics** before calling such an edit done.** This skill itself is for one game's secret.

Easter eggs combine two engine features: **palette swaps** (`engine/palette.ts`) and the **input module** (`engine/input.ts`). Import only from the barrel (`'../engine'`). Reference: the template's game (`game/main.ts` and the modules it wires). After every edit, from the game folder: `npm run check && npm run lint`. The dev hook injects every button and direction as a one-tick press, so `look` can enter the secret and show the result: `npm run look -- --scene title --keys "Up,Up,Down,Down,Left,Right,Left,Right" --steps 2` — compare its screenshot with a plain `npm run look -- --scene title`.

## Palette swaps

`type Palette = readonly string[]` — plain hex-string arrays, indexed by role. Named palettes: `PICO8` (16-color, stable indices — e.g. 8 red, 10 yellow, 12 blue), `GAMEBOY` (4-tone), `DUSK` (8-tone twilight ramp), `NEON` (8-tone synthwave), `SUNSET` (8-tone warm), `OCEAN` (8-tone cold), and `PALETTES` (`Readonly<Record<string, Palette>>` with keys `pico8`, `gameboy`, `dusk`, `neon`, `sunset`, `ocean`). The named palettes are declared as fixed-length tuples, so `PICO8[12]` is a plain `string`; a value typed `Palette` is not, and with `noUncheckedIndexedAccess` its `pal[12]` is `string | undefined` — read it through a guarded helper (below), never with `!`.

`swapPalette(p: Palette, mapping: Record<number, number>): Palette` returns a **new** palette with the index→index remap applied; unmapped indices keep their color, the original is untouched. Swapping red and blue:

```ts
swapPalette(PICO8, { 8: 12, 12: 8 })
```

Two things a palette swap does **not** do automatically:
- Colors already baked into sprites stay baked — `makeSprite` captures hex strings at creation. To swap sprites, rebuild them from the current palette.
- Anything drawn with a literal `PICO8[n]` won't change. Route swappable colors through one `let pal: Palette` variable. In the template every sprite is built from `PICO8` at module scope in `game/sprites.ts` and the UI colours are constants in `game/theme.ts`, so an egg that recolours them first turns those into functions of the palette.

## Secret input sequences — the honest pattern

The engine's `Input` exposes button edges via `pressed()`, but **arrow-direction edges are not exposed as pressed-events** — `input.dir` is a live `{ x, y }` snapshot (each axis `-1 | 0 | 1`). So detect discrete direction presses in game code by comparing this frame's `dir` to the previous frame's — `dirStep` returns the direction that went down this frame, or `null`:

```ts
type Step = 'U' | 'D' | 'L' | 'R';

function dirStep(dir: { x: number; y: number }, prev: { x: number; y: number }): Step | null {
  if (dir.y === -1 && prev.y !== -1) { return 'U'; }
  if (dir.y === 1 && prev.y !== 1) { return 'D'; }
  if (dir.x === -1 && prev.x !== -1) { return 'L'; }
  if (dir.x === 1 && prev.x !== 1) { return 'R'; }
  return null;
}
```

Alternative: build the sequence from buttons instead (`input.pressed('A')` / `input.pressed('B')` are real per-frame edges — remember `input.endFrame()` clears them once per tick, which the game's update already does).

## Worked example — hidden palette swap on the title screen

Konami-style ↑↑↓↓←→←→ on the title screen toggles a red↔blue / yellow↔pink world, confirmed with a `blip` so the player knows it landed. Additions to a game structured like the template (`game/app.ts` creates `audio`, `input` and `scenes`; sprites are built from `PICO8`). The egg state is one palette variable, a guarded `ink(i)` reader, and sprites rebuilt from it — rebuilding is the only way a swap reaches a sprite:

```ts
import { swapPalette, PICO8, makeSprite } from '../engine';
import type { Palette, Sprite } from '../engine';

let pal: Palette = PICO8;
let egged = false;
const ink = (i: number): string => pal[i] ?? PICO8[0];

let shipSprite: Sprite;
let pickupSprite: Sprite;
function rebuildSprites(): void {
  shipSprite = makeSprite(['..#..', '.###.', '#####', '#.#.#'], { '#': ink(12) });
  pickupSprite = makeSprite(['.#.', '###', '.#.'], { '#': ink(10) });
}
rebuildSprites();

function toggleEgg(): void {
  egged = !egged;
  pal = egged ? swapPalette(PICO8, { 8: 12, 12: 8, 10: 14, 14: 10 }) : PICO8;
  rebuildSprites();
  audio.play('blip');
}

const SECRET: readonly Step[] = ['U', 'U', 'D', 'D', 'L', 'R', 'L', 'R'];
let progress = 0;
let prevDir = { x: 0, y: 0 };
```

The detector advances on the right step and completes the sequence; a wrong step restarts it — at 1 rather than 0 when the wrong step is itself the sequence's first:

```ts
function advanceSecret(step: Step): void {
  if (step !== SECRET[progress]) {
    progress = step === SECRET[0] ? 1 : 0;
    return;
  }
  progress += 1;
  if (progress === SECRET.length) {
    progress = 0;
    toggleEgg();
  }
}
```

Then the title's update handler runs the detector before the existing start check. Read `input.dir` once per frame — the getter builds a fresh object each call. In the template the title handler is the `TITLE` entry of `UPDATE_SCENE` in `game/frame.ts` (`startOnA`, shared with the terminal scenes — give the title its own handler for this):

```ts
function updateTitle(): void {
  const dir = input.dir;
  const step = dirStep(dir, prevDir);
  prevDir = dir;
  if (step !== null) { advanceSecret(step); }
  if (input.pressed('A')) {
    audio.play('blip');
    startPlaying();
  }
}
```

Finally, replace literal `PICO8[n]` with `ink(n)` in every render call the egg should recolor (text colors, `particles.burst(...)` colors, `juice.flash(...)`). Colors you leave as `PICO8[n]` deliberately stay fixed.

Notes:
- `dirStep` fires once per key press because `dir` only transitions when keys go down/up; holding a direction produces one step. Blur clears held keys automatically, so no stuck-sequence state.
- Keep the sequence short (4–8 steps) and title-screen-only unless asked otherwise; reset `progress = 0` when entering TITLE if the game can re-enter it.
- Audio confirm works even for the very first input: the sequence's own keydowns already fired `onFirstKey` → `audio.unlock()` (see **handling-user-input**).

## Cross-references

- **handling-user-input** owns button bindings and action labels. Secret sequences are deliberately unlabeled — never add them to `controlHints`. But if an egg *repurposes a declared button*, its label changes in the same `ActionDecl`, per that skill.
- **improving-game-quality** owns the quality checklist; an egg must never break its invariants (readability, reachable lose state).
- **ensuring-arcade-visuals** owns baseline palette discipline; this skill only covers the hidden swap.
