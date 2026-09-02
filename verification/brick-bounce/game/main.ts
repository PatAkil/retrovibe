// VERIFICATION FIXTURE — brick-bounce. FROZEN: edit only under the fixture rule
// in the verifying-graphics skill. Measures what the other fixtures cannot:
// a small FAST-MOVING actor (the ball) over a MID-NAVY ground (PICO8[1] — the
// large mid-luminance field where scanline banding and vignette crush show;
// the exact ground the motivating regression banded), a dense grid of
// same-shape targets told apart by HUE (four hue-separated rows), 'bubbles'
// ambient retuned into the band for a non-black ground, frequent minor
// impacts (bricks) beside a major one (lost ball), and a WIN on clear.
//
// STYLE CARD: palette PICO8 — bg 1 (navy), bricks 8/9/10/11 by row (red,
// orange, yellow, green), paddle 12 (blue), ball 7 (white) · ambient 'bubbles'
// in 5 (dark grey, ≈2.0:1 vs navy) · silhouettes: flat bar / square ball /
// brick slabs · juice: white lost-ball flash, brick-colored chip bursts, tiny
// paddle shake. Diverges from space-dodge (same palette) on ground, ambient,
// silhouettes and roles.
// Contrast note: bricks are TARGETS consumed on contact, not static surfaces
// the ball rests on, so the 3:1 actor-vs-surface floor applies to ball/paddle
// vs the ground (white/blue vs navy ≥ 5:1) and bricks vs the ground (all ≥
// 3:1), not ball vs brick.

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
  dimScene,
  BUTTON_KEY,
  PICO8,
  SAFE_MARGIN,
} from '../engine';

// --- Setup -------------------------------------------------------------------

const W = 240;
const H = 160;
const PAL = PICO8;

const pc = createPixelCanvas({
  width: W,
  height: H,
  scale: 3,
  parent: document.getElementById('screen'),
});

const audio = createAudio();
const input = createInput(
  [
    { button: 'A', label: 'launch' },
    { button: 'PAUSE', label: 'pause' },
  ],
  { onFirstKey: () => audio.unlock() },
);
const scenes = createScenes();
const particles = createParticles({ width: W, height: H, ambient: 'bubbles', ambientColor: PAL[5] });
const juice = createJuice();
const crt = createCrt();
const runtime = createRuntime();

// --- Sprites (PX = 2 logical px per cell) ------------------------------------

const PX = 2;
const paddleSprite = makeSprite(['############', '############'], { '#': PAL[12] }); // 24x4 px — blue, never a brick color
const ballSprite = makeSprite(['.#.', '###', '.#.'], { '#': PAL[7] }); // 6x6 px

// --- World -------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Brick extends Rect {
  color: string;
}

const PADDLE_SPEED = 140;
const BALL_SPEED = 120;
const BRICK_SPEEDUP = 1.03;
const BRICK_COLS = 8;
const BRICK_ROWS = 4;
const BRICK_W = 24;
const BRICK_H = 6;
const BRICK_GAP = 2;
const BRICK_X0 = (W - (BRICK_COLS * (BRICK_W + BRICK_GAP) - BRICK_GAP)) / 2;
const BRICK_Y0 = 28;
const ROW_COLOR = [PAL[8], PAL[9], PAL[10], PAL[11]];

const paddle: Rect = { x: W / 2 - 12, y: H - 16, w: 24, h: 4 };
const ball = { x: 0, y: 0, w: 6, h: 6, vx: 0, vy: 0, served: false };
let bricks: Brick[] = [];
let score = 0;
let lives = 3;
let dying = false;

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function holdBall(): void {
  ball.served = false;
  ball.vx = 0;
  ball.vy = 0;
  ball.x = paddle.x + paddle.w / 2 - ball.w / 2;
  ball.y = paddle.y - ball.h;
}

function resetWorld(): void {
  bricks = [];
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      bricks.push({
        x: BRICK_X0 + c * (BRICK_W + BRICK_GAP),
        y: BRICK_Y0 + r * (BRICK_H + BRICK_GAP),
        w: BRICK_W,
        h: BRICK_H,
        color: ROW_COLOR[r],
      });
    }
  }
  paddle.x = W / 2 - paddle.w / 2;
  score = 0;
  lives = 3;
  dying = false;
  holdBall();
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

function loseBall(): void {
  audio.play('explosion');
  particles.burst(ball.x + ball.w / 2, H - 4, { count: 10, color: PAL[12], speed: 140 });
  juice.shake(5, 0.45);
  juice.flash(PAL[8], 0.35); // saturated accent, never white: a white flash bleaches the frame
  juice.hitStop(0.15);
  lives -= 1;
  dying = true;
}

function updateWorld(dt: number): void {
  paddle.x += input.dir.x * PADDLE_SPEED * dt;
  paddle.x = Math.max(SAFE_MARGIN, Math.min(W - SAFE_MARGIN - paddle.w, paddle.x));

  if (!ball.served) {
    holdBall();
    if (input.pressed('A')) {
      ball.served = true;
      ball.vx = BALL_SPEED * Math.SQRT1_2;
      ball.vy = -BALL_SPEED * Math.SQRT1_2;
      audio.play('blip');
    }
    return;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // Walls.
  if (ball.x < SAFE_MARGIN) { ball.x = SAFE_MARGIN; ball.vx = Math.abs(ball.vx); }
  if (ball.x + ball.w > W - SAFE_MARGIN) { ball.x = W - SAFE_MARGIN - ball.w; ball.vx = -Math.abs(ball.vx); }
  if (ball.y < SAFE_MARGIN + 8) { ball.y = SAFE_MARGIN + 8; ball.vy = Math.abs(ball.vy); }

  // Paddle: angle by where the ball struck.
  if (ball.vy > 0 && overlaps(ball, paddle)) {
    const hit = (ball.x + ball.w / 2 - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
    const speed = Math.hypot(ball.vx, ball.vy);
    const angle = hit * 1.05; // radians off vertical, ±60°
    ball.vx = Math.sin(angle) * speed;
    ball.vy = -Math.cos(angle) * speed;
    ball.y = paddle.y - ball.h;
    audio.play('blip');
    juice.shake(1, 0.06);
  }

  // Bricks: a minor impact each — chip burst in the brick's color, tiny shake.
  for (let i = bricks.length - 1; i >= 0; i--) {
    const b = bricks[i];
    if (!overlaps(ball, b)) continue;
    bricks.splice(i, 1);
    const overlapX = Math.min(ball.x + ball.w - b.x, b.x + b.w - ball.x);
    const overlapY = Math.min(ball.y + ball.h - b.y, b.y + b.h - ball.y);
    if (overlapX < overlapY) ball.vx *= -1;
    else ball.vy *= -1;
    ball.vx *= BRICK_SPEEDUP;
    ball.vy *= BRICK_SPEEDUP;
    score += 10;
    runtime.scoreChanged(score);
    audio.play('hit');
    particles.burst(b.x + b.w / 2, b.y + b.h / 2, { count: 4, color: b.color, speed: 70 });
    juice.shake(1, 0.08);
    break;
  }

  if (bricks.length === 0) {
    juice.flash(PAL[11], 0.3);
    scenes.to('WIN');
    return;
  }
  if (ball.y > H) loseBall();
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
          else holdBall();
        }
        break;
      }
      if (input.pressed('PAUSE')) {
        audio.play('blip');
        scenes.to('PAUSED');
        break;
      }
      if (juice.frozen) break;
      updateWorld(dt);
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

function drawWorld(): void {
  for (const b of bricks) {
    pc.ctx.fillStyle = b.color;
    pc.ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  drawSprite(pc.ctx, paddleSprite, Math.round(paddle.x), paddle.y, PX);
  drawSprite(pc.ctx, ballSprite, Math.round(ball.x), Math.round(ball.y), PX);
}

function render(): void {
  pc.clear(PAL[1]);
  juice.preRender(pc.ctx);
  particles.render(pc.ctx);

  switch (scenes.current) {
    case 'TITLE': {
      drawTextCentered(pc.ctx, 'BRICK BOUNCE', W, 40, { color: PAL[10], scale: 3 });
      drawTextCentered(pc.ctx, 'CLEAR THE WALL', W, 70, { color: PAL[6] });
      controlHints(input).forEach((hint, i) => {
        drawTextCentered(pc.ctx, hint, W, 92 + i * 10, { color: PAL[7] });
      });
      drawTextCentered(pc.ctx, 'ARROWS/WASD MOVE', W, 92 + controlHints(input).length * 10, {
        color: PAL[13],
      });
      break;
    }
    case 'PLAYING':
    case 'PAUSED': {
      drawWorld();
      drawScore(pc, score);
      drawLives(pc, lives);
      if (scenes.is('PAUSED')) {
        hudText(pc, 'PAUSED', 'center', 'middle', { color: PAL[10], scale: 2 });
      }
      break;
    }
    case 'GAME_OVER': {
      drawWorld();
      dimScene(pc, 0.6);
      drawTextCentered(pc.ctx, 'GAME OVER', W, 76, { color: PAL[8], scale: 2 });
      drawTextCentered(pc.ctx, `SCORE ${score}`, W, 100, { color: PAL[7] });
      drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, W, 116, { color: PAL[6] });
      break;
    }
    case 'WIN': {
      drawWorld();
      dimScene(pc, 0.6);
      drawTextCentered(pc.ctx, 'YOU WIN', W, 76, { color: PAL[11], scale: 2 });
      drawTextCentered(pc.ctx, `SCORE ${score}`, W, 100, { color: PAL[7] });
      drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, W, 116, { color: PAL[6] });
      break;
    }
  }

  juice.postRender(pc.ctx, W, H);
  crt.render(pc.ctx, W, H, 1 / 60);
}

createLoop({ update, render }).start();
