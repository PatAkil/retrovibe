// Reference game — the minimal complete game every skill points to.
// Title → play (move a ship, collect pickups, dodge a hazard; contact = lose)
// → game over → restart. Proves every engine rule: fixed-step loop, A/B/PAUSE
// actions with labels-in-code, scene machine, starfield, burst+shake+flash+
// hit-stop (with the freeze-frame actually rendered) on death, chiptune sfx
// (unlocked on first keypress), safe-margin HUD, CRT filter, runtime messaging.
//
// STYLE CARD (this combination is RESERVED for the reference game — every
// generated game must diverge, see ensuring-arcade-visuals):
//   palette PICO8 — bg 0 (black), ship 12 (blue), pickup 10 (yellow),
//   hazard 8 (red) · ambient 'stars' · silhouettes: arrow-ship / plus / cross
//   · juice: red death flash, hard freeze-frame.

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
  BUTTON_KEY,
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
    { button: 'PAUSE', label: 'pause' },
  ],
  { onFirstKey: () => audio.unlock() },
);
const scenes = createScenes();
const particles = createParticles({ width: W, height: H, ambient: 'stars' });
const juice = createJuice();
const crt = createCrt();
const runtime = createRuntime();

// --- Sprites -----------------------------------------------------------------
// Rendered at PX=2 logical px per cell so gameplay entities meet the size
// floors (player >= H/16 = 10 px, other critical entities >= H/26 ≈ 6 px in
// their larger dimension). Entity hitboxes below match the rendered size.

const PX = 2;

const shipSprite = makeSprite(
  ['..#..', '.###.', '#####', '#.#.#'],
  { '#': PICO8[12] },
); // 5x4 cells → 10x8 px rendered
const pickupSprite = makeSprite(
  ['.#.', '###', '.#.'],
  { '#': PICO8[10] },
); // 3x3 cells → 6x6 px rendered
const hazardSprite = makeSprite(
  ['#.#', '.#.', '#.#'],
  { '#': PICO8[8] },
); // 3x3 cells → 6x6 px rendered

// --- World state -------------------------------------------------------------

interface Entity {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SHIP_SPEED = 90;
// Hitboxes match the rendered sprite sizes (PX * cell counts) within 1 px.
const SHIP_W = 10;
const SHIP_H = 8;
const ITEM_SIZE = 6;
// Difficulty ramp: felt inside 30 s, threatening by ~2 min (endless game bar).
const PICKUP_SPEEDUP = 1.12; // per pickup
const TIME_SPEEDUP = 0.01; // +1%/s compounding, so idling doesn't stall the ramp

const ship: Entity = { x: W / 2 - SHIP_W / 2, y: H - 30, w: SHIP_W, h: SHIP_H };
let pickup: Entity = { x: 0, y: 0, w: ITEM_SIZE, h: ITEM_SIZE };
const hazard: Entity & { vx: number; vy: number } = {
  x: 20, y: 20, w: ITEM_SIZE, h: ITEM_SIZE, vx: 55, vy: 40,
};
let score = 0;
let dying = false; // death seen; GAME_OVER deferred until the hit-stop expires

function placePickup(): void {
  pickup = {
    x: SAFE_MARGIN + Math.random() * (W - 2 * SAFE_MARGIN - ITEM_SIZE),
    y: SAFE_MARGIN + 12 + Math.random() * (H - 2 * SAFE_MARGIN - 12 - 28 - ITEM_SIZE),
    w: ITEM_SIZE,
    h: ITEM_SIZE,
  };
}

function resetWorld(): void {
  ship.x = W / 2 - SHIP_W / 2;
  ship.y = H - 30;
  hazard.x = 20;
  hazard.y = 20;
  hazard.vx = 55;
  hazard.vy = 40;
  score = 0;
  dying = false;
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
      // Death flow: the frozen tableau renders for the whole hit-stop —
      // transition to GAME_OVER only when it expires (see juice.ts floors).
      if (dying) {
        if (!juice.frozen) scenes.to('GAME_OVER');
        break;
      }
      if (input.pressed('PAUSE')) {
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

      // Hazard bounces around the arena — and creeps faster over time, so the
      // ramp is felt even without collecting pickups.
      const timeRamp = 1 + TIME_SPEEDUP * dt;
      hazard.vx *= timeRamp;
      hazard.vy *= timeRamp;
      hazard.x += hazard.vx * dt;
      hazard.y += hazard.vy * dt;
      if (hazard.x < SAFE_MARGIN || hazard.x > W - SAFE_MARGIN - hazard.w) hazard.vx *= -1;
      if (hazard.y < SAFE_MARGIN || hazard.y > H - SAFE_MARGIN - hazard.h) hazard.vy *= -1;

      // Pickup: score + small celebratory burst (game-palette color, centered).
      if (overlaps(ship, pickup)) {
        score += 10;
        runtime.scoreChanged(score);
        audio.play('pickup');
        particles.burst(pickup.x + pickup.w / 2, pickup.y + pickup.h / 2, {
          count: 5, color: PICO8[10],
        });
        // Speed the hazard up so difficulty ramps and losing stays reachable.
        hazard.vx *= PICKUP_SPEEDUP;
        hazard.vy *= PICKUP_SPEEDUP;
        placePickup();
      }

      // Hazard contact = lose: big burst, shake, flash, hit-stop — the world
      // freezes in PLAYING so the tableau is visible; GAME_OVER comes after.
      if (overlaps(ship, hazard)) {
        audio.play('explosion');
        particles.burst(ship.x + ship.w / 2, ship.y + ship.h / 2, {
          count: 10, color: PICO8[8], speed: 140,
        });
        juice.shake(5, 0.45);
        juice.flash(PICO8[8], 0.35);
        juice.hitStop(0.15);
        dying = true;
      }
      break;
    }
    case 'PAUSED': {
      if (input.pressed('PAUSE')) {
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
  // Clear FIRST, un-shaken — clearing inside the shake translate would leave
  // stale pixels along the canvas edges for the duration of the shake.
  pc.clear(PICO8[0]);
  juice.preRender(pc.ctx);
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
      drawSprite(pc.ctx, pickupSprite, pickup.x, pickup.y, PX);
      drawSprite(pc.ctx, hazardSprite, hazard.x, hazard.y, PX);
      drawSprite(pc.ctx, shipSprite, ship.x, ship.y, PX);
      drawScore(pc, score);
      if (scenes.is('PAUSED')) {
        hudText(pc, 'PAUSED', 'center', 'middle', { color: PICO8[10], scale: 2 });
      }
      break;
    }
    case 'GAME_OVER': {
      drawTextCentered(pc.ctx, 'GAME OVER', W, 56, { color: PICO8[8], scale: 2 });
      drawTextCentered(pc.ctx, `SCORE ${score}`, W, 80, { color: PICO8[7] });
      drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, W, 100, { color: PICO8[6] });
      break;
    }
    case 'WIN': {
      drawTextCentered(pc.ctx, 'YOU WIN', W, 56, { color: PICO8[11], scale: 2 });
      drawTextCentered(pc.ctx, `SCORE ${score}`, W, 80, { color: PICO8[7] });
      drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, W, 100, { color: PICO8[6] });
      break;
    }
  }

  juice.postRender(pc.ctx, W, H);
  crt.render(pc.ctx, W, H, 1 / 60);
}

createLoop({ update, render }).start();
