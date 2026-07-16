---
name: building-platformer-games
description: Use when the requested game is a platformer or has jumping/gravity movement. Provides the tuned controller recipe — variable jump height, coyote time, jump buffering, gravity constants, AABB collision resolution order, one-way platforms, and WIN-state goal levels.
---

# Building platformer games

A platformer lives or dies on jump feel. This skill is the recipe: concrete game code (it lives in `game/main.ts`, adapted per game — none of it is engine code) built on the frozen engine API imported from `'../engine'`. The tuning constants are **starting points that feel good at 60fps fixed-step on a 240×160 canvas** — tune from there, don't invent from scratch. After every edit: `cd workspace/<game-name> && npm run check`.

Feedback *tuning philosophy* (burst sizes, shake intensity, the render order rule) is owned by **improving-game-quality**; input semantics and labels by **handling-user-input**. This skill wires the hooks and cites the owners.

## Tuning constants — the worked example set

```ts
// Platformer tuning — game code, not engine. Starting points at 240x160 / 60fps.
const GRAVITY = 900;         // px/s^2 — snappy arcade fall, not floaty
const JUMP_VELOCITY = -280;  // px/s — ~43px apex with this gravity (~5 tiles of 8px)
const JUMP_CUT = 0.4;        // multiply vy by this on early release (variable height)
const MOVE_SPEED = 90;       // px/s horizontal
const MAX_FALL = 300;        // px/s terminal velocity — keeps landings readable
const COYOTE_TIME = 0.1;     // s of jump grace after walking off a ledge (0.08-0.12)
const JUMP_BUFFER = 0.12;    // s a jump press is remembered before landing (0.1-0.15)
```

Rules of thumb when tuning: apex height ≈ `JUMP_VELOCITY² / (2·GRAVITY)`; heavier games raise both together. If jumps feel floaty, raise `GRAVITY` before touching `JUMP_VELOCITY`. Never let `MAX_FALL` exceed roughly the tile size × 60, or a falling player can tunnel through thin platforms in one 1/60s step.

## The three feel mechanics

1. **Variable jump height** — a tap hops, a hold soars. On the release *edge* of the jump button while still rising, cut vertical velocity: `if (input.released('A') && player.vy < 0) player.vy *= JUMP_CUT;`
2. **Coyote time** — players press jump a few frames *after* running off a ledge; without grace it feels like the game ate the input. Keep a `coyote` timer topped up while grounded, ticking down airborne; a jump is legal while it's > 0.
3. **Jump buffering** — players press jump a few frames *before* landing. Store the press in a `buffer` timer and consume it on the first grounded (or coyote) tick.

All three combine into one condition: *jump when `buffer > 0 && coyote > 0`*.

## AABB collision — resolution ORDER matters

Entities are plain axis-aligned boxes `{ x, y, w, h }`. Resolve movement **one axis at a time: X fully first, then Y**. Never move diagonally and then push out of the combined overlap.

Why: with combined resolution, a player running along a floor made of adjacent tiles clips a pixel into the next tile's **corner**, and the "shortest push-out" is sideways — the player snags on a seam in flat ground (or gets popped on top of a wall they ran into). Per-axis resolution can't express that failure: the X pass runs with the player still at floor height (no vertical overlap, no snag), and the Y pass then sees the floor purely as "below" and lands cleanly.

```ts
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
```

## The player controller — complete update skeleton

Setup (see `workspace/game-template/game/main.ts` for the full frame around this — scenes, render, CRT):

```ts
import {
  createPixelCanvas,
  createInput,
  createScenes,
  createParticles,
  createJuice,
  createAudio,
  PICO8,
} from '../engine';

const W = 240;
const H = 160;

const pc = createPixelCanvas({ width: W, height: H, scale: 3, parent: document.getElementById('screen') });
const audio = createAudio();
// Labels declared in code — title hints render from these via controlHints
// (see handling-user-input, which owns the action model and the audio unlock).
const input = createInput(
  [{ button: 'A', label: 'jump' }],
  { onFirstKey: () => audio.unlock() },
);
const scenes = createScenes();
const particles = createParticles({ width: W, height: H, ambient: 'stars' });
const juice = createJuice();

const solids: Rect[] = [
  { x: 0, y: H - 16, w: W, h: 16 },   // ground
  { x: 96, y: H - 56, w: 48, h: 8 },  // a ledge
];

const player = {
  x: 24, y: H - 32, w: 6, h: 8,
  vx: 0, vy: 0,
  onGround: false,
  coyote: 0,  // seconds of post-ledge jump grace remaining
  buffer: 0,  // seconds the buffered jump press remains valid
};
```

The controller — call from the `PLAYING` branch of the fixed-step `update(dt)`:

```ts
function updatePlayer(dt: number): void {
  // 1. Horizontal intent (input.dir.x is -1 | 0 | 1 from arrows/WASD).
  player.vx = input.dir.x * MOVE_SPEED;

  // 2. Jump buffering: remember the press edge; tick the buffer down otherwise.
  if (input.pressed('A')) player.buffer = JUMP_BUFFER;
  else player.buffer = Math.max(0, player.buffer - dt);

  // 3. Coyote time: topped up while grounded, ticking down while airborne.
  if (player.onGround) player.coyote = COYOTE_TIME;
  else player.coyote = Math.max(0, player.coyote - dt);

  // 4. Jump: buffered press meets (real or coyote) ground.
  if (player.buffer > 0 && player.coyote > 0) {
    player.vy = JUMP_VELOCITY;
    player.buffer = 0;
    player.coyote = 0;
    player.onGround = false;
    audio.play('jump');
  }

  // 5. Variable height: cut upward velocity on the release edge.
  if (input.released('A') && player.vy < 0) {
    player.vy *= JUMP_CUT;
  }

  // 6. Gravity, clamped to terminal velocity.
  player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL);

  const wasAirborne = !player.onGround;

  // 7. Move & collide — X axis FULLY first...
  player.x += player.vx * dt;
  for (const s of solids) {
    if (!overlaps(player, s)) continue;
    if (player.vx > 0) player.x = s.x - player.w;
    else if (player.vx < 0) player.x = s.x + s.w;
  }

  // 8. ...THEN Y axis.
  player.onGround = false;
  player.y += player.vy * dt;
  for (const s of solids) {
    if (!overlaps(player, s)) continue;
    if (player.vy > 0) {
      player.y = s.y - player.h;   // landed on top
      player.vy = 0;
      player.onGround = true;
    } else if (player.vy < 0) {
      player.y = s.y + s.h;        // bonked a ceiling
      player.vy = 0;
    }
  }

  // 9. Landing feedback — a minor event: small burst, tiny shake.
  //    (Sizing rationale lives in improving-game-quality.)
  if (wasAirborne && player.onGround) {
    particles.burst(player.x + player.w / 2, player.y + player.h, {
      count: 3, color: PICO8[6], speed: 40, life: 0.3,
    });
    juice.shake(1, 0.08);
  }
}
```

**endFrame discipline** (per **handling-user-input**): `pressed`/`released` are per-tick edges, so the game's `update(dt)` must call `input.endFrame()` exactly once, at the end, *after* all input reads — never inside `updatePlayer`, and never per rendered frame (the fixed-step loop can run several update ticks per frame):

```ts
function update(dt: number): void {
  juice.update(dt);
  particles.update(dt);
  if (scenes.is('PLAYING') && !juice.frozen) {
    updatePlayer(dt);
  }
  input.endFrame(); // once per tick, last
}
```

## One-way platforms (optional variant)

Platforms you can jump up through but stand on. Keep them in a separate list; in the **Y pass only**, collide only when falling *and* the player's previous bottom edge was at or above the platform top:

```ts
const oneWays: Rect[] = [{ x: 60, y: H - 88, w: 40, h: 4 }];

// After the solid Y pass, inside the same Y phase:
for (const p of oneWays) {
  const prevBottom = player.y + player.h - player.vy * dt; // bottom before this Y move
  if (player.vy > 0 && prevBottom <= p.y && overlaps(player, p)) {
    player.y = p.y - player.h;
    player.vy = 0;
    player.onGround = true;
  }
}
```

One-ways never appear in the X pass — you can always walk through them sideways. Optional drop-through: skip the check while the player holds down (`input.dir.y > 0`).

## Use the WIN state for goal levels

Platformers usually have a goal — flag, door, exit. The scene machine supports `WIN` (`PLAYING → WIN → restart`); the reference game only demonstrates `GAME_OVER`, so it's easy to forget `WIN` exists. Use it — don't fake a win with a `GAME_OVER` screen that says "YOU WIN":

```ts
const goal: Rect = { x: W - 24, y: H - 28, w: 6, h: 12 };

// In the PLAYING update, after movement:
if (overlaps(player, goal)) {
  audio.play('pickup');
  juice.flash(PICO8[11], 0.3);
  scenes.to('WIN');
}
```

Render a distinct `WIN` screen with a restart hint, and make `WIN` exitable (`A` → restart, as `GAME_OVER` does in the reference). Multi-level games advance with a `PLAYING → PLAYING` re-entry and save `WIN` for the final goal. Host notification on win (`gameOver({ score, won: true })`) is owned by **messaging-game-over**. A reachable *lose* condition (pits, hazards) is still mandatory — that check, plus landing/feedback tuning and the rest of the quality pass, is owned by **improving-game-quality**.

## Scrolling levels — world vs. screen coordinates

This recipe is single-screen. If the level scrolls (a climb, a long run), keep entities in **world** coordinates and subtract the camera when rendering (`drawSprite(ctx, sprite, e.x, e.y - cameraY)`). Two traps: the engine's particles and HUD are **screen-space** — convert burst positions (`particles.burst(x, y - cameraY, ...)`) or the effect fires off-screen; and the lose check for falling must use world coordinates relative to the camera (`player.y > cameraY + H`), or scrolling makes it unreachable.
