# Improving game quality — worked code examples

On-demand reference for `.claude/skills/improving-game-quality/SKILL.md`. Read this only if a quality check fails or you need worked code examples. Code samples carry no comments (comments are a lint error); the prose around each explains it.

## 1. Margins & HUD helpers

Use `drawScore`, `drawLives`, and `hudText` so every HUD line stays inside `SAFE_MARGIN` (8 logical px):

```ts
import { drawScore, drawLives, hudText } from '../engine';

drawScore(pc, score);
drawLives(pc, lives);
hudText(pc, 'LEVEL 2', { h: 'center', v: 'bottom' });
hudText(pc, 'PAUSED', { h: 'center', v: 'middle' }, { scale: 2 });
```

## 1b. Pulsing prompts (never blink off)

Alternate two visible palette colors using `blink` on the accumulated game `clock`:

```ts
drawTextCentered(pc.ctx, `PRESS ${BUTTON_KEY.A.hint}`, { width: W, y: 84 }, {
  color: blink(clock, 1 / 1.2, 0.5) === 1 ? PICO8[7] : PICO8[6], scale: 2,
});
```

## 2. Endless difficulty ramp & illegal transition debugging

Combine a per-pickup multiplier (`1.10–1.15`) with a compounding time ramp (`+1%/s`) while `PLAYING`:

```ts
hazard.vx *= 1.12;
hazard.vy *= 1.12;
```

```ts
const timeRamp = 1 + 0.01 * dt;
hazard.vx *= timeRamp;
hazard.vy *= timeRamp;
```

To surface silently ignored transitions during debugging:

```ts
createScenes('TITLE', {
  onIllegal: (from, to) => {
    reportError(new Error(`illegal ${from} -> ${to}`));
  },
});
```

## 3b. Idle world alive

Bob pickups with `pulse` and flash hot twins with `blink` (low duty `0.15–0.25` on hazards, same hue family):

```ts
const bob = Math.round((pulse(clock, 1 / 0.6) * 2 - 1) * 1.5);
const pickupFrame = blink(clock, 1 / 1.2, 0.2) === 1 ? pickupHotSprite : pickupSprite;
const hazardFrame = blink(clock, 1 / 2, 0.18) === 1 ? hazardHotSprite : hazardSprite;
drawSprite(pc.ctx, pickupFrame, { x: pickup.x, y: pickup.y + bob }, PX);
drawSprite(pc.ctx, hazardFrame, { x: hazard.x, y: hazard.y }, PX);
```

## 4. Impact particle bursts

Scale count and speed by significance, colored from the game's own palette (never engine default yellow):

```ts
particles.burst(ship.x + ship.w / 2, ship.y + ship.h / 2, { count: 10, color: PICO8[8], speed: 140 });
particles.burst(pickup.x + pickup.w / 2, pickup.y + pickup.h / 2, { count: 5, color: PICO8[10] });
```

## 4b. Floating score pops

Push at the event site, age/rise in `update`, fade in `render`:

```ts
pops.push({ x: pickup.x + pickup.w / 2, y: pickup.y, life: POP_LIFE, text: '+10' });
```

```ts
for (const p of pops) {
  p.life -= dt;
  p.y -= 18 * dt;
}
```

```ts
for (const p of pops) {
  pc.ctx.globalAlpha = Math.max(0, p.life / POP_LIFE);
  drawText(pc.ctx, p.text, { x: Math.round(p.x - textWidth(p.text) / 2), y: Math.round(p.y) }, { color: PICO8[10], shadow: true });
}
pc.ctx.globalAlpha = 1;
```

## 5. Scaled death feedback, deferred hit-stop, debris & frame order

Scale death shake/burst with run significance (`mag 0..1`), fire a radial saturated flash at the death point, and defer `GAME_OVER` until `juice.frozen` clears:

```ts
const mag = Math.min(1, score / 200);
juice.shake(5 + mag * 3, 0.45 + mag * 0.15);
juice.flash(PICO8[8], 0.35, { x: ship.x + ship.w / 2, y: ship.y + ship.h / 2 });
juice.hitStop(0.15);
particles.burst(ship.x + ship.w / 2, ship.y + ship.h / 2, {
  count: 10 + Math.round(mag * 10), color: PICO8[8], speed: 140 + mag * 80,
});
dying = true;
```

```ts
function updatePlaying(dt: number): void {
  if (dying) {
    if (!juice.frozen) { scenes.to('GAME_OVER'); }
    return;
  }
  stepWorld(dt);
}
```

Swap player sprite for debris while dying:

```ts
drawSprite(pc.ctx, dying ? debrisSprite : shipSprite, { x: ship.x, y: ship.y }, PX);
```

Mandatory `update` / `render` order (clear FIRST un-shaken, `crt.render` LAST):

```ts
function update(dt: number): void {
  juice.update(dt);
  if (juice.frozen) { return; }
  stepWorld(dt);
}

function render(): void {
  pc.clear(PICO8[0]);
  juice.preRender(pc.ctx);
  drawWorld();
  juice.postRender(pc.ctx, W, H);
  crt.render(pc.ctx, W, H, 1 / 60);
}
```

## 6. BEST score persistence

Module-scope persistence floor + `try`/`catch` `localStorage` bonus; call `saveBest()` in `scenes.onEnter` for `GAME_OVER`/`WIN`:

```ts
function loadBest(): number {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

function storeBest(value: number): boolean {
  try {
    localStorage.setItem(KEY, String(value));
    return true;
  } catch {
    return false;
  }
}

let best = loadBest();

function saveBest(): void {
  if (score <= best) { return; }
  best = score;
  storeBest(best);
}
```

## 8. Title-screen control hints

Render from `controlHints(input)` (plus a static movement line):

```ts
controlHints(input).forEach((hint, i) => {
  drawTextCentered(pc.ctx, hint, { width: W, y: 100 + i * 10 }, { color: PICO8[7] });
});
```
