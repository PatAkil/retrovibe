// Cave Hopper — a frog hops up a cave, platform to platform, to reach the
// glowing exit at the top. Arrows/WASD move, Z jumps (variable height, coyote
// time, jump buffering per the platformer recipe). Falling below the bottom of
// the screen loses; reaching the exit wins.

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
} from '../engine';

// --- Setup -------------------------------------------------------------------

const W = 240;
const H = 160;
const WORLD_H = 480; // the cave is three screens tall; a camera follows the climb

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
    { button: 'A', label: 'jump' },
    { button: 'X', label: 'pause' },
  ],
  { onFirstKey: () => audio.unlock() },
);
const scenes = createScenes();
// Damp frog cave — 'bubbles' is the swamp preset and fits the fiction.
const particles = createParticles({ width: W, height: H, ambient: 'bubbles' });
const juice = createJuice();
const crt = createCrt();
const runtime = createRuntime();

// --- Platformer tuning (building-platformer-games starting points) ------------
// Apex = JUMP_VELOCITY^2 / (2*GRAVITY) = 280^2 / 1800 ~ 43.6px. Every ledge in
// the ladder below rises exactly 26px, leaving ~17px of headroom per hop.

const GRAVITY = 900; // px/s^2
const JUMP_VELOCITY = -280; // px/s
const JUMP_CUT = 0.4; // vy multiplier on early release (variable height)
const MOVE_SPEED = 90; // px/s
const MAX_FALL = 300; // px/s terminal velocity
const COYOTE_TIME = 0.1; // s of jump grace after walking off a ledge
const JUMP_BUFFER = 0.12; // s a jump press is remembered before landing

// --- Sprites -----------------------------------------------------------------

const frogSprite = makeSprite(
  [
    '.#..#.',
    '######',
    '#o##o#',
    '######',
    '.####.',
    '######',
    '#....#',
  ],
  { '#': PICO8[11], o: PICO8[7] },
);

const exitSprite = makeSprite(
  [
    '.######.',
    '########',
    '##oooo##',
    '##oooo##',
    '##oooo##',
    '##oooo##',
    '##oooo##',
    '##oooo##',
    '########',
  ],
  { '#': PICO8[9], o: PICO8[10] },
);

// --- World -------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const WALL = 4; // decorative cave walls; the player is clamped inside them

// Cave floor — the only fully solid surface.
const solids: Rect[] = [{ x: 0, y: WORLD_H - 12, w: W, h: 12 }];
const GROUND_TOP = WORLD_H - 12; // 468

// The ledge ladder — one-way platforms (jump up through, land on top), placed
// deterministically. Every top is exactly 26px above the previous one (< 43.6px
// jump apex) and every horizontal edge-to-edge gap is at most 28px (< ~45px
// horizontal reach when rising 26px at MOVE_SPEED), so the exit is reachable.
const oneWays: Rect[] = [
  { x: 64, y: 442, w: 44, h: 6 },
  { x: 132, y: 416, w: 44, h: 6 },
  { x: 70, y: 390, w: 40, h: 6 },
  { x: 20, y: 364, w: 40, h: 6 },
  { x: 88, y: 338, w: 44, h: 6 },
  { x: 156, y: 312, w: 44, h: 6 },
  { x: 96, y: 286, w: 40, h: 6 },
  { x: 36, y: 260, w: 40, h: 6 },
  { x: 100, y: 234, w: 44, h: 6 },
  { x: 168, y: 208, w: 40, h: 6 },
  { x: 110, y: 182, w: 40, h: 6 },
  { x: 48, y: 156, w: 44, h: 6 },
  { x: 112, y: 130, w: 40, h: 6 },
  { x: 176, y: 104, w: 40, h: 6 },
  { x: 120, y: 78, w: 44, h: 6 },
  { x: 88, y: 52, w: 64, h: 6 }, // top ledge — the exit stands on it
];

// The glowing exit, standing on the top ledge (bottom edge = 52).
const exit: Rect = { x: 114, y: 36, w: 12, h: 16 };

const player = {
  x: 40,
  y: GROUND_TOP - 7,
  w: 6,
  h: 7,
  vx: 0,
  vy: 0,
  onGround: false,
  coyote: 0, // seconds of post-ledge jump grace remaining
  buffer: 0, // seconds the buffered jump press remains valid
};

let cameraY = WORLD_H - H; // top of the visible window; only ever scrolls UP
let score = 0; // ledges climbed (best height reached)
let elapsed = 0; // dt-accumulated clock for the exit glow pulse (alt-tab safe)

function resetWorld(): void {
  player.x = 40;
  player.y = GROUND_TOP - player.h;
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  player.coyote = 0;
  player.buffer = 0;
  cameraY = WORLD_H - H;
  score = 0;
  elapsed = 0;
}

// Scene-entry side effects: notify the host of every transition; terminal
// states also send gameOver (won:false on GAME_OVER, won:true on WIN).
scenes.onEnter('TITLE', () => runtime.stateChanged('TITLE'));
scenes.onEnter('PLAYING', () => runtime.stateChanged('PLAYING'));
scenes.onEnter('PAUSED', () => runtime.stateChanged('PAUSED'));
scenes.onEnter('GAME_OVER', () => {
  runtime.stateChanged('GAME_OVER');
  runtime.gameOver({ score, won: false });
});
scenes.onEnter('WIN', () => {
  runtime.stateChanged('WIN');
  runtime.gameOver({ score, won: true });
});

// --- Update ------------------------------------------------------------------

function startPlaying(): void {
  resetWorld();
  scenes.to('PLAYING');
}

function die(): void {
  audio.play('explosion');
  particles.burst(player.x + player.w / 2, Math.min(player.y - cameraY, H - 4), {
    count: 10,
    color: PICO8[8],
    speed: 120,
  });
  juice.shake(3, 0.35);
  juice.flash(PICO8[8], 0.25);
  juice.hitStop(0.12);
  scenes.to('GAME_OVER');
}

function updatePlayer(dt: number): void {
  // 1. Horizontal intent.
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
  // Cave walls clamp the run horizontally.
  player.x = Math.max(WALL, Math.min(W - WALL - player.w, player.x));

  // 8. ...THEN Y axis: solids, then one-way ledges (land only when falling
  // from at-or-above the ledge top — jump up through them freely).
  player.onGround = false;
  player.y += player.vy * dt;
  for (const s of solids) {
    if (!overlaps(player, s)) continue;
    if (player.vy > 0) {
      player.y = s.y - player.h;
      player.vy = 0;
      player.onGround = true;
    } else if (player.vy < 0) {
      player.y = s.y + s.h;
      player.vy = 0;
    }
  }
  for (const p of oneWays) {
    const prevBottom = player.y + player.h - player.vy * dt;
    if (player.vy > 0 && prevBottom <= p.y && overlaps(player, p)) {
      player.y = p.y - player.h;
      player.vy = 0;
      player.onGround = true;
    }
  }

  // 9. Landing feedback — a minor event: small burst, tiny shake.
  if (wasAirborne && player.onGround) {
    particles.burst(player.x + player.w / 2, player.y + player.h - cameraY, {
      count: 3,
      color: PICO8[6],
      speed: 40,
      life: 0.3,
    });
    juice.shake(1, 0.08);
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
      updatePlayer(dt);

      // Camera only ever scrolls up, following the climb.
      cameraY = Math.max(0, Math.min(cameraY, player.y - 96));

      // Score = highest ledge reached (26px per rung above the floor).
      const climbed = Math.max(
        0,
        Math.min(oneWays.length, Math.floor((GROUND_TOP - (player.y + player.h)) / 26) + 1),
      );
      if (climbed > score) {
        score = climbed;
        runtime.scoreChanged(score);
      }

      // Win: touch the glowing exit.
      if (overlaps(player, exit)) {
        audio.play('pickup');
        juice.flash(PICO8[11], 0.3);
        scenes.to('WIN');
        break;
      }

      // Lose: fall below the bottom of the screen.
      if (player.y > cameraY + H) {
        die();
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

function renderWorld(): void {
  const ctx = pc.ctx;
  ctx.save();
  ctx.translate(0, -Math.round(cameraY));

  // Cave walls.
  ctx.fillStyle = PICO8[2];
  ctx.fillRect(0, 0, WALL, WORLD_H);
  ctx.fillRect(W - WALL, 0, WALL, WORLD_H);

  // Floor and ledges — stone with a lit top edge.
  for (const s of solids) {
    ctx.fillStyle = PICO8[4];
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = PICO8[6];
    ctx.fillRect(s.x, s.y, s.w, 1);
  }
  for (const p of oneWays) {
    ctx.fillStyle = PICO8[5];
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = PICO8[6];
    ctx.fillRect(p.x, p.y, p.w, 1);
  }

  // Glowing exit: pulsing halo (dt-driven clock), then the door sprite.
  ctx.globalAlpha = 0.35 + 0.2 * Math.sin(elapsed * 5);
  ctx.fillStyle = PICO8[10];
  ctx.fillRect(exit.x - 3, exit.y - 3, exit.w + 6, exit.h + 6);
  ctx.globalAlpha = 1;
  drawSprite(ctx, exitSprite, exit.x - 1, exit.y - 1, 2);

  drawSprite(ctx, frogSprite, Math.round(player.x), Math.round(player.y));

  ctx.restore();
}

function render(): void {
  // Clear FIRST, un-shaken — clearing inside the shake translate would leave
  // stale pixels along the canvas edges for the duration of the shake.
  pc.clear(PICO8[0]);
  juice.preRender(pc.ctx);
  particles.render(pc.ctx);

  switch (scenes.current) {
    case 'TITLE': {
      drawTextCentered(pc.ctx, 'CAVE HOPPER', W, 40, { color: PICO8[11], scale: 3 });
      drawTextCentered(pc.ctx, 'HOP TO THE GLOWING EXIT', W, 70, { color: PICO8[6] });
      drawTextCentered(pc.ctx, 'DONT FALL OFF THE SCREEN', W, 80, { color: PICO8[6] });
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
      renderWorld();
      drawScore(pc, score);
      if (scenes.is('PAUSED')) {
        hudText(pc, 'PAUSED', 'center', 'middle', { color: PICO8[10], scale: 2 });
      }
      break;
    }
    case 'GAME_OVER': {
      drawTextCentered(pc.ctx, 'YOU FELL', W, 56, { color: PICO8[8], scale: 2 });
      drawTextCentered(pc.ctx, `HEIGHT ${score}`, W, 80, { color: PICO8[7] });
      drawTextCentered(pc.ctx, 'Z RESTART', W, 100, { color: PICO8[6] });
      break;
    }
    case 'WIN': {
      drawTextCentered(pc.ctx, 'YOU ESCAPED', W, 56, { color: PICO8[11], scale: 2 });
      drawTextCentered(pc.ctx, `HEIGHT ${score}`, W, 80, { color: PICO8[7] });
      drawTextCentered(pc.ctx, 'Z RESTART', W, 100, { color: PICO8[6] });
      break;
    }
  }

  juice.postRender(pc.ctx, W, H);
  crt.render(pc.ctx, W, H, 1 / 60);
}

createLoop({ update, render }).start();
