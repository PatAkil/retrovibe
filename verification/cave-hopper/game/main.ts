// VERIFICATION FIXTURE — cave-hopper. FROZEN: edit only under the fixture rule
// in the verifying-graphics skill. Measures what space-dodge cannot: actors
// over STATIC SURFACES (tiles, ledges, spikes), a non-black warm background,
// 'embers' ambient, a lives HUD, a minor landing burst next to a major death
// tableau, respawn, and both terminal scenes (WIN flag, GAME_OVER on 0 lives).
//
// STYLE CARD: palette SUNSET — bg 0, tiles 2 with a 3 top edge, spikes 4,
// flag 5, coins 6, player 7 · ambient 'embers' · silhouettes: tall runner /
// diamond coin / picket spikes / pennant flag · juice: orange death flash,
// hard freeze-frame, tiny landing puff.

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
  BUTTON_KEY,
  SUNSET,
} from '../engine';

// --- Setup -------------------------------------------------------------------

const W = 240;
const H = 160;
const PAL = SUNSET;

const pc = createPixelCanvas({
  width: W,
  height: H,
  scale: 3,
  parent: document.getElementById('screen'),
});

const audio = createAudio();
const input = createInput(
  [
    { button: 'A', label: 'jump' },
    { button: 'PAUSE', label: 'pause' },
  ],
  { onFirstKey: () => audio.unlock() },
);
const scenes = createScenes();
const particles = createParticles({ width: W, height: H, ambient: 'embers' });
const juice = createJuice();
const crt = createCrt();
const runtime = createRuntime();

// --- Sprites (PX = 2 logical px per cell) ------------------------------------

const PX = 2;

const playerSprite = makeSprite(
  ['.##.', '.##.', '####', '.##.', '.##.', '#..#'],
  { '#': PAL[7] },
); // 4x6 cells → 8x12 px
const coinSprite = makeSprite(['.#.', '###', '.#.'], { '#': PAL[6] }); // 6x6 px
const spikeSprite = makeSprite(['#.#.', '#.#.', '####'], { '#': PAL[4] }); // 8x6 px
const flagSprite = makeSprite(
  ['##..', '###.', '####', '#...', '#...', '#...'],
  { '#': PAL[5] },
); // 8x12 px

// --- Level -------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const solids: Rect[] = [
  { x: 0, y: 144, w: 104, h: 16 }, // ground, left of the pit
  { x: 136, y: 144, w: 104, h: 16 }, // ground, right of the pit
  { x: 56, y: 112, w: 32, h: 8 },
  { x: 136, y: 96, w: 40, h: 8 },
  { x: 192, y: 72, w: 40, h: 8 },
];
const spikes: Rect[] = [
  { x: 72, y: 138, w: 8, h: 6 },
  { x: 160, y: 138, w: 8, h: 6 },
];
const coinSpots: Rect[] = [
  { x: 40, y: 132, w: 6, h: 6 },
  { x: 68, y: 100, w: 6, h: 6 },
  { x: 152, y: 84, w: 6, h: 6 },
];
const goal: Rect = { x: 216, y: 60, w: 8, h: 12 };
const START = { x: 12, y: 132 };

// Platformer tuning — starting points from building-platformer-games.
const GRAVITY = 900;
const JUMP_VELOCITY = -280;
const JUMP_CUT = 0.4;
const MOVE_SPEED = 90;
const MAX_FALL = 300;
const COYOTE_TIME = 0.1;
const JUMP_BUFFER = 0.12;

const player = {
  x: START.x, y: START.y, w: 8, h: 12,
  vx: 0, vy: 0, onGround: false, coyote: 0, buffer: 0,
};
let coins: Rect[] = [];
let score = 0;
let lives = 3;
let dying = false;

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function respawn(): void {
  player.x = START.x;
  player.y = START.y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.coyote = 0;
  player.buffer = 0;
}

function resetWorld(): void {
  coins = coinSpots.map((c) => ({ ...c }));
  score = 0;
  lives = 3;
  dying = false;
  respawn();
}

scenes.onEnter('PLAYING', () => runtime.stateChanged('PLAYING'));
scenes.onEnter('TITLE', () => runtime.stateChanged('TITLE'));
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

function loseLife(): void {
  audio.play('explosion');
  particles.burst(player.x + player.w / 2, player.y + player.h / 2, {
    count: 10, color: PAL[4], speed: 140,
  });
  juice.shake(5, 0.45);
  juice.flash(PAL[4], 0.35);
  juice.hitStop(0.15);
  lives -= 1;
  dying = true; // resolved when the hit-stop expires: respawn or GAME_OVER
}

function updatePlayer(dt: number): void {
  player.vx = input.dir.x * MOVE_SPEED;

  if (input.pressed('A')) player.buffer = JUMP_BUFFER;
  else player.buffer = Math.max(0, player.buffer - dt);
  if (player.onGround) player.coyote = COYOTE_TIME;
  else player.coyote = Math.max(0, player.coyote - dt);

  if (player.buffer > 0 && player.coyote > 0) {
    player.vy = JUMP_VELOCITY;
    player.buffer = 0;
    player.coyote = 0;
    player.onGround = false;
    audio.play('jump');
  }
  if (input.released('A') && player.vy < 0) player.vy *= JUMP_CUT;

  player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL);
  const wasAirborne = !player.onGround;

  // X fully first...
  player.x += player.vx * dt;
  for (const s of solids) {
    if (!overlaps(player, s)) continue;
    if (player.vx > 0) player.x = s.x - player.w;
    else if (player.vx < 0) player.x = s.x + s.w;
  }
  player.x = Math.max(0, Math.min(W - player.w, player.x));

  // ...then Y.
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

  // Landing — a minor event: small puff, tiny shake.
  if (wasAirborne && player.onGround) {
    particles.burst(player.x + player.w / 2, player.y + player.h, {
      count: 3, color: PAL[3], speed: 40, life: 0.3,
    });
    juice.shake(1, 0.08);
  }

  // Coins — minor pickup burst in the coin's own color.
  for (let i = coins.length - 1; i >= 0; i--) {
    if (!overlaps(player, coins[i])) continue;
    const c = coins[i];
    coins.splice(i, 1);
    score += 10;
    runtime.scoreChanged(score);
    audio.play('pickup');
    particles.burst(c.x + c.w / 2, c.y + c.h / 2, { count: 5, color: PAL[6] });
  }

  if (overlaps(player, goal)) {
    audio.play('pickup');
    juice.flash(PAL[6], 0.3);
    scenes.to('WIN');
    return;
  }

  // Lose: spikes, or falling into the pit.
  if (player.y > H || spikes.some((s) => overlaps(player, s))) loseLife();
}

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
      if (dying) {
        if (!juice.frozen) {
          dying = false;
          if (lives <= 0) scenes.to('GAME_OVER');
          else respawn();
        }
        break;
      }
      if (input.pressed('PAUSE')) {
        audio.play('blip');
        scenes.to('PAUSED');
        break;
      }
      if (juice.frozen) break;
      updatePlayer(dt);
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

function drawLevel(): void {
  for (const s of solids) {
    pc.ctx.fillStyle = PAL[2];
    pc.ctx.fillRect(s.x, s.y, s.w, s.h);
    pc.ctx.fillStyle = PAL[3];
    pc.ctx.fillRect(s.x, s.y, s.w, 1);
  }
  for (const s of spikes) drawSprite(pc.ctx, spikeSprite, s.x, s.y, PX);
  for (const c of coins) drawSprite(pc.ctx, coinSprite, c.x, c.y, PX);
  drawSprite(pc.ctx, flagSprite, goal.x, goal.y, PX);
}

function render(): void {
  pc.clear(PAL[0]);
  juice.preRender(pc.ctx);
  particles.render(pc.ctx);

  switch (scenes.current) {
    case 'TITLE': {
      drawTextCentered(pc.ctx, 'CAVE HOPPER', W, 40, { color: PAL[6], scale: 3 });
      drawTextCentered(pc.ctx, 'REACH THE FLAG', W, 70, { color: PAL[5] });
      controlHints(input).forEach((hint, i) => {
        drawTextCentered(pc.ctx, hint, W, 92 + i * 10, { color: PAL[7] });
      });
      drawTextCentered(pc.ctx, 'ARROWS/WASD MOVE', W, 92 + controlHints(input).length * 10, {
        color: PAL[3],
      });
      break;
    }
    case 'PLAYING':
    case 'PAUSED': {
      drawLevel();
      drawSprite(pc.ctx, playerSprite, Math.round(player.x), Math.round(player.y), PX);
      drawScore(pc, score);
      drawLives(pc, lives);
      if (scenes.is('PAUSED')) {
        hudText(pc, 'PAUSED', 'center', 'middle', { color: PAL[6], scale: 2 });
      }
      break;
    }
    case 'GAME_OVER': {
      drawLevel();
      drawTextCentered(pc.ctx, 'GAME OVER', W, 48, { color: PAL[4], scale: 2 });
      drawTextCentered(pc.ctx, `SCORE ${score}`, W, 72, { color: PAL[7] });
      drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, W, 88, { color: PAL[5] });
      break;
    }
    case 'WIN': {
      drawLevel();
      drawTextCentered(pc.ctx, 'YOU WIN', W, 48, { color: PAL[6], scale: 2 });
      drawTextCentered(pc.ctx, `SCORE ${score}`, W, 72, { color: PAL[7] });
      drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, W, 88, { color: PAL[5] });
      break;
    }
  }

  juice.postRender(pc.ctx, W, H);
  crt.render(pc.ctx, W, H, 1 / 60);
}

createLoop({ update, render }).start();
