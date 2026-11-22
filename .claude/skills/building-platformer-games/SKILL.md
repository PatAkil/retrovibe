---
name: building-platformer-games
description: Use when the requested game is a platformer or has jumping/gravity movement. Provides the tuned controller recipe — variable jump height, coyote time, jump buffering, gravity constants, AABB collision resolution order, one-way platforms, and WIN-state goal levels — laid out as lint-clean game modules.
---

# Building platformer games

A platformer lives or dies on jump feel. This skill is the recipe: concrete game code — none of it is engine code — built on the engine API imported from `'../engine'`, laid out the way a game folder splits it: tuning and the controller in `game/physics.ts`, the level's geometry in `game/level.ts`, the `Player` type and `Game` state in `game/state.ts`, the PLAYING rules that call the controller in `game/play.ts`. The tuning constants are **starting points that feel good at 60fps fixed-step on a 240×160 canvas** — tune from there, don't invent from scratch. After every edit, from the game folder: `npm run check && npm run lint`, then `npm run look -- --scene playing --keys "Right,Space"` to see a jump land.

Feedback *tuning philosophy* (burst sizes, shake intensity, the render order rule) is owned by **improving-game-quality**; input semantics and labels by **handling-user-input**. This skill wires the hooks and cites the owners. The frozen fixture `verification/cave-hopper/` is a worked platformer in exactly this layout (`game/physics.ts`, `game/level.ts`, `game/play.ts`) — read it, never run or modify it.

## Tuning constants — the worked example set

Starting points at 240×160 / 60 fps, in px and seconds. `GRAVITY` 900 px/s² is a snappy arcade fall, not floaty; `JUMP_VELOCITY` −280 px/s gives a ~43 px apex with that gravity (about five 8-px tiles); `JUMP_CUT` multiplies `vy` on an early release (variable height); `MAX_FALL` is terminal velocity and keeps landings readable; `COYOTE_TIME` is the jump grace after walking off a ledge (0.08–0.12); `JUMP_BUFFER` is how long a press is remembered before landing (0.1–0.15):

```ts
const GRAVITY = 900;
const JUMP_VELOCITY = -280;
const JUMP_CUT = 0.4;
const MOVE_SPEED = 90;
const MAX_FALL = 300;
const COYOTE_TIME = 0.1;
const JUMP_BUFFER = 0.12;
```

Rules of thumb when tuning: apex height ≈ `JUMP_VELOCITY² / (2·GRAVITY)`; heavier games raise both together. If jumps feel floaty, raise `GRAVITY` before touching `JUMP_VELOCITY`. Never let `MAX_FALL` exceed roughly the tile size × 60, or a falling player can tunnel through thin platforms in one 1/60s step.

## The three feel mechanics

1. **Variable jump height** — a tap hops, a hold soars. On the release *edge* of the jump button while still rising, cut vertical velocity by `JUMP_CUT`.
2. **Coyote time** — players press jump a few frames *after* running off a ledge; without grace it feels like the game ate the input. Keep a `coyote` timer topped up while grounded, ticking down airborne; a jump is legal while it's > 0.
3. **Jump buffering** — players press jump a few frames *before* landing. Store the press in a `buffer` timer and consume it on the first grounded (or coyote) tick.

All three combine into one condition: *jump when `buffer > 0 && coyote > 0`*.

## AABB collision — resolution ORDER matters

Entities are plain axis-aligned boxes — the engine's `Rect` type `{ x, y, w, h }`. Resolve movement **one axis at a time: X fully first, then Y**. Never move diagonally and then push out of the combined overlap.

Why: with combined resolution, a player running along a floor made of adjacent tiles clips a pixel into the next tile's **corner**, and the "shortest push-out" is sideways — the player snags on a seam in flat ground (or gets popped on top of a wall they ran into). Per-axis resolution can't express that failure: the X pass runs with the player still at floor height (no vertical overlap, no snag), and the Y pass then sees the floor purely as "below" and lands cleanly.

The player is a `Rect` plus its velocity, ground flag, the two feel timers and its facing (for the mirrored sprite). In `game/state.ts`, next to the `Game` type:

```ts
import type { Rect } from '../engine';

export interface Player extends Rect {
  vx: number;
  vy: number;
  onGround: boolean;
  coyote: number;
  buffer: number;
  facing: number;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
```

The level is data in `game/level.ts` — solids (ground and ledges) and the goal; the player starts at `{ x: 24, y: H - 40 }` with a hitbox equal to its rendered sprite (**ensuring-arcade-visuals** §3: a 10×14 hero at px 1 is a 10×14 box):

```ts
import type { Rect } from '../engine';
import { H, W } from './theme';

export const SOLIDS: readonly Rect[] = [
  { x: 0, y: H - 16, w: W, h: 16 },
  { x: 96, y: H - 56, w: 48, h: 8 },
];
export const GOAL: Rect = { x: W - 24, y: H - 28, w: 8, h: 12 };
```

## The player controller — `game/physics.ts`

Split along the steps of one tick, each a small function, so every function stays far inside the lint thresholds (complexity 10, 80 lines) and `play.ts` reads like the recipe.

**Steer and tick the timers.** Horizontal intent comes from `input.dir.x` (−1 | 0 | 1, arrows/WASD) and sets the facing. A press of A refills the jump buffer, otherwise it ticks down; the coyote timer is topped up while grounded and ticks down while airborne:

```ts
import type { Input } from '../engine';
import { SOLIDS } from './level';
import type { Player } from './state';
import { overlaps } from './state';

function steer(p: Player, input: Input): void {
  p.vx = input.dir.x * MOVE_SPEED;
  if (input.dir.x !== 0) {
    p.facing = Math.sign(input.dir.x);
  }
}

function tickTimers(p: Player, input: Input, dt: number): void {
  p.buffer = input.pressed('A') ? JUMP_BUFFER : Math.max(0, p.buffer - dt);
  p.coyote = p.onGround ? COYOTE_TIME : Math.max(0, p.coyote - dt);
}
```

**Jump** when a buffered press meets real or coyote ground; both timers are consumed so one press is one jump. It returns whether it jumped, so `play.ts` plays the sound:

```ts
export function tryJump(p: Player, input: Input, dt: number): boolean {
  steer(p, input);
  tickTimers(p, input, dt);
  const jumped = p.buffer > 0 && p.coyote > 0;
  if (jumped) {
    p.vy = JUMP_VELOCITY;
    p.buffer = 0;
    p.coyote = 0;
    p.onGround = false;
  }
  return jumped;
}
```

**Variable height and gravity.** The release edge cuts upward velocity; gravity is then clamped to terminal velocity:

```ts
export function applyGravity(p: Player, input: Input, dt: number): void {
  if (input.released('A') && p.vy < 0) {
    p.vy *= JUMP_CUT;
  }
  p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);
}
```

**Move and collide — X fully first, then Y.** The X pass pushes the player out sideways by its direction of travel; the Y pass lands on top (stopping the fall and setting `onGround`) or bonks a ceiling. `moveAndCollide` returns `true` on the tick the player lands, which is when the landing feedback fires:

```ts
function moveX(p: Player, dt: number): void {
  p.x += p.vx * dt;
  for (const s of SOLIDS) {
    if (!overlaps(p, s)) {
      continue;
    }
    if (p.vx > 0) {
      p.x = s.x - p.w;
    } else if (p.vx < 0) {
      p.x = s.x + s.w;
    }
  }
}

function moveY(p: Player, dt: number): void {
  p.onGround = false;
  p.y += p.vy * dt;
  for (const s of SOLIDS) {
    if (!overlaps(p, s)) {
      continue;
    }
    if (p.vy > 0) {
      p.y = s.y - p.h;
      p.vy = 0;
      p.onGround = true;
    } else if (p.vy < 0) {
      p.y = s.y + s.h;
      p.vy = 0;
    }
  }
}

export function moveAndCollide(p: Player, dt: number): boolean {
  const wasAirborne = !p.onGround;
  moveX(p, dt);
  moveY(p, dt);
  return wasAirborne && p.onGround;
}
```

**Wire it in `game/play.ts`.** The PLAYING update calls the controller in that order. Landing is a minor event — a small burst in the game's own palette and a tiny shake (sizing rationale lives in improving-game-quality); the jump gets its sfx. `g` is the game object from `state.ts` with the engine services on `g.app` (the template's layout):

```ts
import { PICO8 } from '../engine';
import { applyGravity, moveAndCollide, tryJump } from './physics';
import type { Game } from './state';

function landingPuff(g: Game): void {
  const { player } = g;
  g.app.particles.burst(player.x + player.w / 2, player.y + player.h, {
    count: 3, color: PICO8[6], speed: 40, life: 0.3,
  });
  g.app.juice.shake(1, 0.08);
}

export function updatePlayer(g: Game, dt: number): void {
  const { player } = g;
  const { input, audio } = g.app;
  if (tryJump(player, input, dt)) {
    audio.play('jump');
  }
  applyGravity(player, input, dt);
  if (moveAndCollide(player, dt)) {
    landingPuff(g);
  }
}
```

**endFrame discipline** (per **handling-user-input**): `pressed`/`released` are per-tick edges, so the game's `update` must call `input.endFrame()` exactly once, at the end, *after* all input reads — never inside the controller, and never per rendered frame (the fixed-step loop can run several update ticks per frame). The template's `update(g, dt)` in `game/frame.ts` already does this: juice and particles tick, the scene's handler from `UPDATE_SCENE` runs (PLAYING skips the world while `juice.frozen`), then `input.endFrame()`.

## One-way platforms (optional variant)

Platforms you can jump up through but stand on. Keep them in a separate list in `level.ts`; in the **Y pass only**, after the solid loop, collide only when falling *and* the player's bottom edge before this move was at or above the platform top:

```ts
export const ONE_WAYS: readonly Rect[] = [{ x: 60, y: H - 88, w: 40, h: 4 }];

function landOnOneWays(p: Player, dt: number): void {
  const prevBottom = p.y + p.h - p.vy * dt;
  for (const o of ONE_WAYS) {
    if (p.vy > 0 && prevBottom <= o.y && overlaps(p, o)) {
      p.y = o.y - p.h;
      p.vy = 0;
      p.onGround = true;
    }
  }
}
```

Call `landOnOneWays(p, dt)` at the end of `moveY`. One-ways never appear in the X pass — you can always walk through them sideways. Optional drop-through: skip the check while the player holds down (`input.dir.y > 0`).

## Use the WIN state for goal levels

Platformers usually have a goal — flag, door, exit. The scene machine supports `WIN` (`PLAYING → WIN → restart`); the reference game draws a WIN screen but nothing in its play reaches it, so it's easy to forget `WIN` exists. Use it — don't fake a win with a `GAME_OVER` screen that says "YOU WIN". In the PLAYING update, after movement, touching the goal confirms with a sound and a uniform flash (no origin — only death flashes are radial) and enters `WIN`:

```ts
function reachGoal(g: Game): boolean {
  if (!overlaps(g.player, GOAL)) {
    return false;
  }
  g.app.audio.play('pickup');
  g.app.juice.flash(PICO8[11], 0.3);
  g.app.scenes.to('WIN');
  return true;
}
```

The template already renders a distinct `WIN` screen with a restart hint and makes it exitable (`A` → restart, as `GAME_OVER` does) — keep both. Multi-level games advance with a `PLAYING → PLAYING` re-entry and save `WIN` for the final goal. The dev hook's `win` fixture should steer onto the goal (or set the scene directly) so `npm run look -- --scene win` shows it. Host notification on win (`gameOver({ score, won: true })`) is owned by **messaging-game-over**. A reachable *lose* condition (pits, hazards) is still mandatory — that check, plus landing/feedback tuning and the rest of the quality pass, is owned by **improving-game-quality**.

## Terrain art — the worked example

This recipe draws collision, not pictures: a `Rect` list is geometry, and filling each rect with one flat color is what makes a correct platformer look like a demo. The worked example for platformer art is the frozen fixture cave-hopper — `verification/cave-hopper/game/view.ts` for terrain and backdrop, `game/sprites.ts` for actors, `STYLE.md` for the decisions (read them; never run or modify a fixture). Take from it: **terrain slabs** are `drawBevel(ctx, rect, { fill: PAL[2], light: PAL[2], dark: PAL[1] })` with a sparse `fillDither` rock face and a brighter dithered **lit top lip** (`fillDither(ctx, { x: x + 1, y: y + 1, w: w - 2, h: 1 }, { colorA: PAL[2], colorB: PAL[5], pattern: 'sparse' })`) — the lip is what tells the player where the standable surface is, and both its tones stay off the hazard's tones, or the spikes read as part of the terrain; the **pit** is `fillBands(ctx, { x: PIT.x, y, w: PIT.w, h }, [PAL[1], PAL[0], PAL[0]])`, so the gap falls away into the palette's darkest tone (on SUNSET that is a deep plum, deliberately not black) instead of reading as a seam between two grounds; **spikes** are a fang sprite with a bright tip (`PAL[5]`) over a `PAL[4]` body, with the darkest tone only as a 1-px base shadow and an authored dark outline, so the hazard never shares a value — or a tone — with the slab it sits on; **coins** are a 2-frame `frameIndex` spin, the **flag** a 2-frame flutter, and the **player** an outlined multi-tone sprite with a walk cycle and `flipSprite` facing. The rules behind all of that live in **ensuring-arcade-visuals** §3b (sprite craft) and §7 (backgrounds, surfaces, title).

## Scrolling levels — world vs. screen coordinates

This recipe is single-screen. If the level scrolls (a climb, a long run), keep entities in **world** coordinates and subtract the camera when rendering (`drawSprite(ctx, sprite, { x: e.x, y: e.y - cameraY })`). Two traps: the engine's particles and HUD are **screen-space** — convert burst positions (`particles.burst(x, y - cameraY, opts)`) or the effect fires off-screen; and the lose check for falling must use world coordinates relative to the camera (`player.y > cameraY + H`), or scrolling makes it unreachable.
