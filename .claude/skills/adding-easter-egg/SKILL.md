---
name: adding-easter-egg
description: Use when the user asks for an easter egg, a secret, a cheat code, or an unlockable color scheme. Adds hidden surprises to a game — palette-swap toggles and secret input sequences (↑↑↓↓…).
---

# Adding an easter egg

Easter eggs combine two engine features: **palette swaps** (`engine/palette.ts`) and the **input module** (`engine/input.ts`). Import only from the barrel (`'../engine'`). Reference game: `workspace/game-template/game/main.ts`. After every edit: `cd workspace/<game-name> && npm run check`.

## Palette swaps

`type Palette = readonly string[]` — plain hex-string arrays, indexed by role. Named palettes: `PICO8` (16-color, stable indices — e.g. 8 red, 10 yellow, 12 blue), `GAMEBOY` (4-tone), `DUSK` (8-tone twilight ramp), `NEON` (8-tone synthwave), `SUNSET` (8-tone warm), `OCEAN` (8-tone cold), and `PALETTES` (`Readonly<Record<string, Palette>>` with keys `pico8`, `gameboy`, `dusk`, `neon`, `sunset`, `ocean`).

`swapPalette(p: Palette, mapping: Record<number, number>): Palette` returns a **new** palette with the index→index remap applied; unmapped indices keep their color, the original is untouched. From the engine's own doc comment:

```ts
swapPalette(PICO8, { 8: 12, 12: 8 })  // swap red<->blue
```

Two things a palette swap does **not** do automatically:
- Colors already baked into sprites stay baked — `makeSprite` captures hex strings at creation. To swap sprites, rebuild them from the current palette.
- Anything drawn with a literal `PICO8[n]` won't change. Route swappable colors through one `let pal: Palette` variable.

## Secret input sequences — the honest pattern

The engine's `Input` exposes button edges via `pressed()`, but **arrow-direction edges are not exposed as pressed-events** — `input.dir` is a live `{ x, y }` snapshot (each axis `-1 | 0 | 1`). So detect discrete direction presses in game code by comparing this frame's `dir` to the previous frame's:

```ts
type Step = 'U' | 'D' | 'L' | 'R';

/** Discrete direction press this frame, derived from dir transitions. */
function dirStep(dir: { x: number; y: number }, prev: { x: number; y: number }): Step | null {
  if (dir.y === -1 && prev.y !== -1) return 'U';
  if (dir.y === 1 && prev.y !== 1) return 'D';
  if (dir.x === -1 && prev.x !== -1) return 'L';
  if (dir.x === 1 && prev.x !== 1) return 'R';
  return null;
}
```

Alternative: build the sequence from buttons instead (`input.pressed('A')` / `input.pressed('B')` are real per-frame edges — remember `input.endFrame()` clears them once per tick, which the game's update already does).

## Worked example — hidden palette swap on the title screen

Konami-style ↑↑↓↓←→←→ on the title screen toggles a red↔blue / yellow↔pink world, confirmed with a `blip`. Additions to a game structured like `game/main.ts` (which already has `audio`, `input`, `scenes`, and sprites built from `PICO8`):

```ts
import { swapPalette, PICO8, makeSprite } from '../engine';
import type { Palette, Sprite } from '../engine';

// --- Easter egg state ----------------------------------------------------

let pal: Palette = PICO8;
let egged = false;

// Sprites must be rebuilt from `pal` for the swap to reach them.
let shipSprite: Sprite;
let pickupSprite: Sprite;
function rebuildSprites(): void {
  shipSprite = makeSprite(['..#..', '.###.', '#####', '#.#.#'], { '#': pal[12] });
  pickupSprite = makeSprite(['.#.', '###', '.#.'], { '#': pal[10] });
}
rebuildSprites();

function toggleEgg(): void {
  egged = !egged;
  pal = egged ? swapPalette(PICO8, { 8: 12, 12: 8, 10: 14, 14: 10 }) : PICO8;
  rebuildSprites();
  audio.play('blip'); // small confirm so the player knows it landed
}

// --- Sequence detector ---------------------------------------------------

const SECRET: readonly Step[] = ['U', 'U', 'D', 'D', 'L', 'R', 'L', 'R'];
let progress = 0;
let prevDir = { x: 0, y: 0 };
```

Then in the `TITLE` branch of `update(dt)`, before the existing start check:

```ts
case 'TITLE': {
  const dir = input.dir; // read once per frame; the getter returns a fresh object
  const step = dirStep(dir, prevDir);
  prevDir = dir;
  if (step !== null) {
    if (step === SECRET[progress]) {
      progress += 1;
      if (progress === SECRET.length) {
        progress = 0;
        toggleEgg();
      }
    } else {
      progress = step === SECRET[0] ? 1 : 0; // wrong step restarts (it may itself start a run)
    }
  }
  if (input.pressed('A')) {
    audio.play('blip');
    startPlaying();
  }
  break;
}
```

Finally, replace literal `PICO8[n]` with `pal[n]` in every render call the egg should recolor (text colors, `particles.burst(...)` colors, `juice.flash(...)`). Colors you leave as `PICO8[n]` deliberately stay fixed.

Notes:
- `dirStep` fires once per key press because `dir` only transitions when keys go down/up; holding a direction produces one step. Blur clears held keys automatically, so no stuck-sequence state.
- Keep the sequence short (4–8 steps) and title-screen-only unless asked otherwise; reset `progress = 0` when entering TITLE if the game can re-enter it.
- Audio confirm works even for the very first input: the sequence's own keydowns already fired `onFirstKey` → `audio.unlock()` (see **handling-user-input**).

## Cross-references

- **handling-user-input** owns button bindings and action labels. Secret sequences are deliberately unlabeled — never add them to `controlHints`. But if an egg *repurposes a declared button*, its label changes in the same `ActionDecl`, per that skill.
- **improving-game-quality** owns the quality checklist; an egg must never break its invariants (readability, reachable lose state).
- **ensuring-arcade-visuals** owns baseline palette discipline; this skill only covers the hidden swap.
