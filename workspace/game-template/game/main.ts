// Reference game — the minimal complete game every skill points to.
// Title → play (move a ship, collect pickups, dodge a hazard; contact = lose)
// → game over → restart. Proves every engine rule: fixed-step loop, A/B/X/Y
// actions with labels-in-code, scene machine, starfield, burst+shake+flash on
// hit, chiptune sfx (unlocked on first keypress), safe-margin HUD, CRT filter,
// runtime messaging.

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

const shipSprite = makeSprite(
  ['..#..', '.###.', '#####', '#.#.#'],
  { '#': PICO8[12] },
);
const pickupSprite = makeSprite(
  ['.#.', '###', '.#.'],
  { '#': PICO8[10] },
);
const hazardSprite = makeSprite(
  ['#.#', '.#.', '#.#'],
  { '#': PICO8[8] },
);

// --- World state -------------------------------------------------------------

interface Entity {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SHIP_SPEED = 90;
const ship: Entity = { x: W / 2 - 2, y: H - 30, w: 5, h: 4 };
let pickup: Entity = { x: 0, y: 0, w: 3, h: 3 };
const hazard: Entity & { vx: number; vy: number } = { x: 20, y: 20, w: 3, h: 3, vx: 55, vy: 40 };
let score = 0;

function placePickup(): void {
  pickup = {
    x: SAFE_MARGIN + Math.random() * (W - 2 * SAFE_MARGIN - 3),
    y: SAFE_MARGIN + 12 + Math.random() * (H - 2 * SAFE_MARGIN - 40),
    w: 3,
    h: 3,
  };
}

function resetWorld(): void {
  ship.x = W / 2 - 2;
  ship.y = H - 30;
  hazard.x = 20;
  hazard.y = 20;
  hazard.vx = 55;
  hazard.vy = 40;
  score = 0;
  placePickup();
}

function overlaps(a: Entity, b: Entity): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Scene-entry side effects: reset the world on (re)entering PLAYING from a
// terminal/title state, and notify the host of every transition.
scenes.onEnter('PLAYING', () => {
  runtime.stateChanged('PLAYING');
});
scenes.onEnter('TITLE', () => runtime.stateChanged('TITLE'));
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

      // Ship movement, kept inside the safe play area.
      ship.x += input.dir.x * SHIP_SPEED * dt;
      ship.y += input.dir.y * SHIP_SPEED * dt;
      ship.x = Math.max(SAFE_MARGIN, Math.min(W - SAFE_MARGIN - ship.w, ship.x));
      ship.y = Math.max(SAFE_MARGIN, Math.min(H - SAFE_MARGIN - ship.h, ship.y));

      // Hazard bounces around the arena.
      hazard.x += hazard.vx * dt;
      hazard.y += hazard.vy * dt;
      if (hazard.x < SAFE_MARGIN || hazard.x > W - SAFE_MARGIN - hazard.w) hazard.vx *= -1;
      if (hazard.y < SAFE_MARGIN || hazard.y > H - SAFE_MARGIN - hazard.h) hazard.vy *= -1;

      // Pickup: score + small celebratory burst.
      if (overlaps(ship, pickup)) {
        score += 10;
        runtime.scoreChanged(score);
        audio.play('pickup');
        particles.burst(pickup.x + 1, pickup.y + 1, { count: 5, color: PICO8[10] });
        // Speed the hazard up slightly so difficulty ramps and losing stays reachable.
        hazard.vx *= 1.06;
        hazard.vy *= 1.06;
        placePickup();
      }

      // Hazard contact = lose: big burst, shake, flash, hit-stop, explosion sfx.
      if (overlaps(ship, hazard)) {
        audio.play('explosion');
        particles.burst(ship.x + 2, ship.y + 2, { count: 10, color: PICO8[8], speed: 120 });
        juice.shake(3, 0.35);
        juice.flash(PICO8[8], 0.25);
        juice.hitStop(0.12);
        scenes.to('GAME_OVER');
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
  juice.preRender(pc.ctx);
  pc.clear(PICO8[0]);
  particles.render(pc.ctx);

  switch (scenes.current) {
    case 'TITLE': {
      drawTextCentered(pc.ctx, 'RETROVIBE', W, 48, { color: PICO8[10], scale: 3 });
      drawTextCentered(pc.ctx, 'COLLECT + DODGE', W, 78, { color: PICO8[6] });
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
      drawSprite(pc.ctx, pickupSprite, pickup.x, pickup.y);
      drawSprite(pc.ctx, hazardSprite, hazard.x, hazard.y);
      drawSprite(pc.ctx, shipSprite, ship.x, ship.y);
      drawScore(pc, score);
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
