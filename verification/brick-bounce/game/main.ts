// VERIFICATION FIXTURE — brick-bounce. FROZEN: edit only under the fixture rule
// in the verifying-graphics skill. Measures what the other fixtures cannot:
// a small FAST-MOVING actor (the ball) over a MID-NAVY ground (PICO8[1] — the
// large mid-luminance field where scanline banding and vignette crush show;
// the exact ground the motivating regression banded), a dense grid of
// same-shape targets told apart by HUE (four hue-separated rows), 'bubbles'
// ambient retuned into the band for a non-black ground, frequent minor
// impacts (bricks) beside a major one (lost ball), and a WIN on clear.
//
// STYLE CARD: palette PICO8 — UNDERWATER. The play field is a CALM flat navy 1
// field (no texture under the fast ball); depth comes from one dithered 1/0
// seam under the shell wall, a dithered 0/1 seabed strip with coral
// silhouettes (2) below the paddle line, a black arena bezel (0) with a grey 5
// keyline on the walls the ball bounces off. No light shafts: a sparse dither
// column read as dust on the glass wherever it was put.
// Bricks are BEVELED SHELLS: fill 8/9/10/11 by row (red, orange, yellow,
// green), each with its own lighter/darker PICO8 pair for the 1-px light and
// dark edges (14/2, 15/4, 7/9, 7/3). Paddle 12 (blue) beveled with a white
// gloss; ball is a round 6x6 pearl, white 7 with a 6 shade and an unshaded
// top-left highlight · ambient 'bubbles' in 5 (dark grey, ~2.0:1 vs navy) ·
// silhouettes: beveled bar / round pearl / shell slabs · juice: red lost-ball
// flash bursting AT the ball's last position (clamped inside the bezel),
// brick-colored chip bursts, tiny paddle shake · title: drawLogo wordmark over
// a preview of shell wall + paddle + pearl, pulsing prompt. Diverges from
// space-dodge (same palette) on ground, ambient, silhouettes and roles.
// Contrast note: bricks are TARGETS consumed on contact, not static surfaces
// the ball rests on, so the 4.5:1 actor-vs-ground floor applies to ball/paddle
// vs the ground (white 12.5:1, blue 5.6:1 vs navy) and bricks vs the ground
// (red 3.5:1, orange 6.9:1, yellow 11.4:1, green 8.0:1), not ball vs brick.
// With the deep black band gone the ONE ground an actor crosses is navy 1, so
// the ambient 5 sits at 1.95:1 against it — inside the 1.8-2.5 band everywhere
// instead of only in the shallows. Every scenery tone (0, 2, 5 and the two
// remaining dithered mixes) stays at or below that band.

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
  drawLogo,
  fillDither,
  drawBevel,
  drawFrame,
  pulse,
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

// --- Sprites -----------------------------------------------------------------

// The pearl: authored at 1 logical px per cell so a 6x6 hitbox can actually be
// ROUND. Top-left stays pure white (the highlight); the lower-right falls off
// into PAL[6].
const ballSprite = makeSprite(
  [
    '.####.',
    '######',
    '######',
    '#####s',
    '###sss',
    '.#sss.',
  ],
  { '#': PAL[7], s: PAL[6] },
);

// Seabed dressing — dark silhouettes, never in play.
const coralSprite = makeSprite(
  ['..#..', '#.#.#', '#.#.#', '.###.', '..#..'],
  { '#': PAL[2] },
);
const rockSprite = makeSprite(['..###..', '.#####.', '#######'], { '#': PAL[2] });

// --- World -------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Brick extends Rect {
  color: string;
  light: string;
  dark: string;
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
// Row hue + its own lighter/darker PICO8 pair, so every shell is lit from the
// same direction without leaving the palette.
const ROW_STYLE = [
  { fill: PAL[8], light: PAL[14], dark: PAL[2] }, // red    <- pink / dark-purple
  { fill: PAL[9], light: PAL[15], dark: PAL[4] }, // orange <- peach / brown
  { fill: PAL[10], light: PAL[7], dark: PAL[9] }, // yellow <- white / orange
  { fill: PAL[11], light: PAL[7], dark: PAL[3] }, // green  <- white / dark-green
];
const SEABED_Y = 150;

const paddle: Rect = { x: W / 2 - 12, y: H - 16, w: 24, h: 4 };
const ball = { x: 0, y: 0, w: 6, h: 6, vx: 0, vy: 0, served: false };
let bricks: Brick[] = [];
let score = 0;
let lives = 3;
let dying = false;
let clock = 0;

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
      const style = ROW_STYLE[r];
      bricks.push({
        x: BRICK_X0 + c * (BRICK_W + BRICK_GAP),
        y: BRICK_Y0 + r * (BRICK_H + BRICK_GAP),
        w: BRICK_W,
        h: BRICK_H,
        color: style.fill,
        light: style.light,
        dark: style.dark,
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
  // The miss happened where the ball WAS, not at the bottom edge — clamp the
  // burst inside the bezel so the frozen death tableau shows the gap the ball
  // went through, with the paddle still in frame beside it.
  const bx = Math.max(SAFE_MARGIN + 4, Math.min(W - SAFE_MARGIN - 4, ball.x + ball.w / 2));
  const by = Math.max(SAFE_MARGIN + 12, Math.min(SEABED_Y - 4, ball.y + ball.h / 2));
  // Two-tone splash: the blue body reads against the deep water, a smaller
  // white spray reads as the pearl itself coming apart.
  particles.burst(bx, by, { count: 16, color: PAL[12], speed: 160 });
  particles.burst(bx, by, { count: 6, color: PAL[7], speed: 90 });
  juice.shake(5, 0.45);
  juice.flash(PAL[8], 0.35, { x: bx, y: by }); // saturated accent, never white; radial from the clamped miss point
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
  clock += dt;
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

/** Depth ramp, light shafts, arena bezel and seabed — everything static. */
function drawBackdrop(): void {
  const ctx = pc.ctx;
  // The play field is a FLAT navy field. Tiling it with dither crosshatched the
  // whole arena under a 6-px ball travelling 120 px/s: the pattern beat against
  // the ball and the frame read as texture, not as water. Dither survives only
  // where it does depth work — one seam under the shell wall, and the seabed.
  ctx.fillStyle = PAL[1];
  ctx.fillRect(0, 0, W, SEABED_Y);

  // The light shafts are GONE. Moved out of the HUD strip they still read as
  // dust on the glass rather than as light — a sparse dither column is dirt at
  // this size, and the ambient bubbles already carry the water.

  // Seabed: out of play, below the paddle line. Near-black sand so the strip
  // stays scenery — the coral silhouettes are the only tone that carries.
  fillDither(ctx, 0, SEABED_Y, W, H - SEABED_Y, PAL[0], PAL[1], 'checker');
  drawSprite(ctx, coralSprite, 26, SEABED_Y, 2);
  drawSprite(ctx, rockSprite, 96, SEABED_Y + 4, 2);
  drawSprite(ctx, coralSprite, 196, SEABED_Y + 2, 2);

  // Arena bezel: the walls the ball actually bounces off (x = SAFE_MARGIN,
  // y = SAFE_MARGIN + 8). Height overshoots the screen so no bottom bar lands
  // on the paddle line.
  drawFrame(ctx, 4, 12, W - 8, 164, PAL[0], 4);
  drawFrame(ctx, 7, 15, W - 14, 158, PAL[5], 1);
}

function drawPaddle(x: number, y: number): void {
  const ctx = pc.ctx;
  drawBevel(ctx, x, y, paddle.w, paddle.h, PAL[12], PAL[7], PAL[1]);
  ctx.fillStyle = PAL[7]; // gloss
  ctx.fillRect(Math.round(x) + 3, Math.round(y) + 1, 5, 1);
}

function drawWorld(): void {
  for (const b of bricks) drawBevel(pc.ctx, b.x, b.y, b.w, b.h, b.color, b.light, b.dark);
  drawPaddle(Math.round(paddle.x), paddle.y);
  drawSprite(pc.ctx, ballSprite, Math.round(ball.x), Math.round(ball.y), 1);
}

/** A small sample of the wall + paddle + pearl for the title screen. */
function drawPreview(): void {
  const ctx = pc.ctx;
  const cols = 4;
  const bw = 20;
  const bh = 5;
  const gap = 2;
  const x0 = (W - (cols * (bw + gap) - gap)) / 2;
  const y0 = 62;
  for (let r = 0; r < ROW_STYLE.length; r++) {
    const s = ROW_STYLE[r];
    for (let c = 0; c < cols; c++) {
      drawBevel(ctx, x0 + c * (bw + gap), y0 + r * (bh + gap), bw, bh, s.fill, s.light, s.dark);
    }
  }
  drawSprite(ctx, ballSprite, W / 2 - 3, 92, 1);
  drawPaddle(W / 2 - paddle.w / 2, 100);
}

/**
 * Dim OR plate, never both: dimScene already backs the headline, so the card is
 * a HOLLOW bezel that frames the text and leaves the world readable inside it.
 */
function drawCard(top: number, height: number): void {
  drawFrame(pc.ctx, 52, top, W - 104, height, PAL[5], 1);
}

function render(): void {
  pc.clear(PAL[1]);
  juice.preRender(pc.ctx);
  drawBackdrop();
  particles.render(pc.ctx);

  switch (scenes.current) {
    case 'TITLE': {
      drawLogo(pc.ctx, 'BRICK BOUNCE', W, 26, { color: PAL[10], shade: PAL[9], shadow: PAL[1] });
      drawTextCentered(pc.ctx, 'ONE PADDLE. THIRTY-TWO SHELLS.', W, 48, { color: PAL[6], shadow: true });
      drawPreview();
      pc.ctx.save();
      pc.ctx.globalAlpha = 0.45 + 0.55 * pulse(clock);
      drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} TO LAUNCH`, W, 114, { color: PAL[10], shadow: true });
      pc.ctx.restore();
      const hints = controlHints(input);
      drawTextCentered(pc.ctx, hints[hints.length - 1], W, 128, { color: PAL[13], shadow: true });
      drawTextCentered(pc.ctx, 'ARROWS/WASD MOVE', W, 138, { color: PAL[13], shadow: true });
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
      drawCard(64, 60);
      drawTextCentered(pc.ctx, 'GAME OVER', W, 76, { color: PAL[8], scale: 2 });
      drawTextCentered(pc.ctx, `SCORE ${score}`, W, 100, { color: PAL[7], shadow: true });
      drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, W, 114, { color: PAL[6], shadow: true });
      break;
    }
    case 'WIN': {
      drawWorld();
      dimScene(pc, 0.6);
      drawCard(64, 60);
      drawTextCentered(pc.ctx, 'YOU WIN', W, 76, { color: PAL[11], scale: 2 });
      drawTextCentered(pc.ctx, `SCORE ${score}`, W, 100, { color: PAL[7], shadow: true });
      drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, W, 114, { color: PAL[6], shadow: true });
      break;
    }
  }

  juice.postRender(pc.ctx, W, H);
  crt.render(pc.ctx, W, H, 1 / 60);
}

createLoop({ update, render }).start();
