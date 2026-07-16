// Star Catcher — catch falling stars in a basket at the bottom of the screen.
// Arrows/WASD move the basket left/right. Stars fall faster over time.
// Miss 3 stars → game over. Title → play ⇄ pause → game over → restart.

import {
  createPixelCanvas,
  createLoop,
  createInput,
  controlHints,
  createScenes,
  createParticles,
  createJuice,
  createAudio,
  createCrt,
  createRuntime,
  makeSprite,
  drawSprite,
  drawTextCentered,
  drawScore,
  drawLives,
  hudText,
  PICO8,
  SAFE_MARGIN,
} from '../engine';

// --- Setup -------------------------------------------------------------------

const W = 240;
const H = 160;

const pc = createPixelCanvas({
  width: W,
  height: H,
  scale: 3,
  parent: document.getElementById('screen'),
});

const audio = createAudio();
// Actions are DECLARED here with their labels — the title screen renders hints
// from these declarations (controlHints), so labels can never drift.
const input = createInput(
  [
    { button: 'A', label: 'start' },
    { button: 'X', label: 'pause' },
  ],
  { onFirstKey: () => audio.unlock() },
);
const scenes = createScenes();
const particles = createParticles({ width: W, height: H, ambient: 'stars' });
const juice = createJuice();
const crt = createCrt();
const runtime = createRuntime();

// --- Sprites -----------------------------------------------------------------

const basketSprite = makeSprite(
  ['#.....#', '#ooooo#', '.#####.'],
  { '#': PICO8[4], o: PICO8[9] },
);
const starSprite = makeSprite(
  ['..#..', '#####', '.###.', '#.#.#'],
  { '#': PICO8[10] },
);

// --- World state -------------------------------------------------------------

interface Star {
  x: number;
  y: number;
  active: boolean;
}

const BASKET_SPEED = 154;
const MAX_MISSES = 3;
const MAX_STARS = 8;
const STAR_W = 5;
const STAR_H = 4;
const BASE_FALL = 35;
const FALL_RAMP = 2.5; // px/s of extra fall speed gained per second of play

const basket = { x: W / 2 - 3, y: H - SAFE_MARGIN - 3, w: 7, h: 3 };
// Fixed pool, objects reused — no per-frame allocation.
const stars: Star[] = Array.from({ length: MAX_STARS }, () => ({ x: 0, y: 0, active: false }));
let score = 0;
let misses = 0;
let elapsed = 0; // accumulated dt — never wall-clock time
let spawnTimer = 0;

function fallSpeed(): number {
  return BASE_FALL + elapsed * FALL_RAMP;
}

function spawnInterval(): number {
  return Math.max(0.55, 1.4 - elapsed * 0.02);
}

function spawnStar(): void {
  const star = stars.find((s) => !s.active);
  if (!star) return;
  star.x = SAFE_MARGIN + Math.random() * (W - 2 * SAFE_MARGIN - STAR_W);
  star.y = -STAR_H;
  star.active = true;
}

function resetWorld(): void {
  basket.x = W / 2 - 3;
  score = 0;
  misses = 0;
  elapsed = 0;
  spawnTimer = 0;
  for (const s of stars) s.active = false;
}

function caught(s: Star): boolean {
  return (
    s.x < basket.x + basket.w &&
    s.x + STAR_W > basket.x &&
    s.y < basket.y + basket.h &&
    s.y + STAR_H > basket.y
  );
}

// Scene-entry side effects: notify the host of every transition.
scenes.onEnter('TITLE', () => runtime.stateChanged('TITLE'));
scenes.onEnter('PLAYING', () => runtime.stateChanged('PLAYING'));
scenes.onEnter('PAUSED', () => runtime.stateChanged('PAUSED'));
scenes.onEnter('GAME_OVER', () => {
  runtime.stateChanged('GAME_OVER');
  runtime.gameOver({ score, won: false });
});

// --- Update ------------------------------------------------------------------

function startPlaying(): void {
  resetWorld();
  scenes.to('PLAYING');
}

function missStar(s: Star): void {
  s.active = false;
  misses += 1;
  audio.play('hit');
  particles.burst(s.x + 2, H - 4, { count: 6, color: PICO8[8], speed: 100 });
  juice.shake(2, 0.2);
  if (misses >= MAX_MISSES) {
    audio.play('explosion');
    particles.burst(basket.x + 3, basket.y + 1, { count: 10, color: PICO8[8], speed: 120 });
    juice.shake(3, 0.35);
    juice.flash(PICO8[8], 0.25);
    juice.hitStop(0.12);
    scenes.to('GAME_OVER');
  }
}

function update(dt: number): void {
  juice.update(dt);
  particles.update(dt);

  switch (scenes.current) {
    case 'TITLE': {
      if (input.pressed('A')) {
        audio.play('blip');
        startPlaying();
      }
      break;
    }
    case 'PLAYING': {
      if (input.pressed('X')) {
        audio.play('blip');
        scenes.to('PAUSED');
        break;
      }
      if (juice.frozen) break; // hit-stop pauses the world

      elapsed += dt;

      // Basket moves left/right only, kept inside the safe play area.
      basket.x += input.dir.x * BASKET_SPEED * dt;
      basket.x = Math.max(SAFE_MARGIN, Math.min(W - SAFE_MARGIN - basket.w, basket.x));

      // Spawn stars on an accumulated-dt schedule (alt-tab safe).
      spawnTimer += dt;
      if (spawnTimer >= spawnInterval()) {
        spawnTimer = 0;
        spawnStar();
      }

      // Stars fall — faster the longer the run lasts.
      const vy = fallSpeed();
      for (const s of stars) {
        if (!s.active) continue;
        s.y += vy * dt;
        if (caught(s)) {
          s.active = false;
          score += 10;
          runtime.scoreChanged(score);
          audio.play('pickup');
          particles.burst(s.x + 2, s.y + 2, { count: 5, color: PICO8[10] });
        } else if (s.y > H) {
          missStar(s);
          if (scenes.is('GAME_OVER')) break;
        }
      }
      break;
    }
    case 'PAUSED': {
      if (input.pressed('X')) {
        audio.play('blip');
        scenes.to('PLAYING');
      }
      break;
    }
    case 'GAME_OVER':
    case 'WIN': {
      if (input.pressed('A')) {
        audio.play('blip');
        startPlaying();
      }
      break;
    }
  }

  input.endFrame();
}

// --- Render ------------------------------------------------------------------

function render(): void {
  // Clear FIRST, un-shaken — never clear inside the shake transform.
  pc.clear(PICO8[0]);
  juice.preRender(pc.ctx);
  particles.render(pc.ctx);

  switch (scenes.current) {
    case 'TITLE': {
      drawTextCentered(pc.ctx, 'STAR CATCHER', W, 44, { color: PICO8[10], scale: 2 });
      drawTextCentered(pc.ctx, 'CATCH THE FALLING STARS', W, 68, { color: PICO8[6] });
      drawTextCentered(pc.ctx, 'MISS 3 AND ITS OVER', W, 78, { color: PICO8[6] });
      // Control hints rendered FROM the action declarations — never hand-written.
      controlHints(input).forEach((hint, i) => {
        drawTextCentered(pc.ctx, hint, W, 100 + i * 10, { color: PICO8[7] });
      });
      drawTextCentered(pc.ctx, 'ARROWS/WASD MOVE', W, 100 + controlHints(input).length * 10, {
        color: PICO8[5],
      });
      break;
    }
    case 'PLAYING':
    case 'PAUSED': {
      for (const s of stars) {
        if (s.active) drawSprite(pc.ctx, starSprite, s.x, s.y);
      }
      drawSprite(pc.ctx, basketSprite, basket.x, basket.y);
      drawScore(pc, score);
      drawLives(pc, MAX_MISSES - misses); // remaining misses, top-right
      if (scenes.is('PAUSED')) {
        hudText(pc, 'PAUSED', 'center', 'middle', { color: PICO8[10], scale: 2 });
      }
      break;
    }
    case 'GAME_OVER': {
      drawTextCentered(pc.ctx, 'GAME OVER', W, 56, { color: PICO8[8], scale: 2 });
      drawTextCentered(pc.ctx, `SCORE ${score}`, W, 80, { color: PICO8[7] });
      drawTextCentered(pc.ctx, 'Z RESTART', W, 100, { color: PICO8[6] });
      break;
    }
    case 'WIN': {
      drawTextCentered(pc.ctx, 'YOU WIN', W, 56, { color: PICO8[11], scale: 2 });
      drawTextCentered(pc.ctx, `SCORE ${score}`, W, 80, { color: PICO8[7] });
      drawTextCentered(pc.ctx, 'Z RESTART', W, 100, { color: PICO8[6] });
      break;
    }
  }

  juice.postRender(pc.ctx, W, H);
  crt.render(pc.ctx, W, H, 1 / 60);
}

createLoop({ update, render }).start();
