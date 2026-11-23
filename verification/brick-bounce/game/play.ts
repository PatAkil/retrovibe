import { SAFE_MARGIN } from '../engine';
import { bounceOffPaddle, bounceOffWalls, hitBrick } from './ball';
import type { Brick, Game } from './state';
import { holdBall } from './state';
import { H, PAL, SEABED_Y, W } from './theme';

const PADDLE_SPEED = 140;
const BALL_SPEED = 120;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function loseBall(g: Game): void {
  const { audio, particles, juice } = g.app;
  const { ball } = g;
  audio.play('explosion');
  const bx = clamp(ball.x + ball.w / 2, SAFE_MARGIN + 4, W - SAFE_MARGIN - 4);
  const by = clamp(ball.y + ball.h / 2, SAFE_MARGIN + 12, SEABED_Y - 4);
  particles.burst(bx, by, { count: 16, color: PAL[12], speed: 160 });
  particles.burst(bx, by, { count: 6, color: PAL[7], speed: 90 });
  juice.shake(5, 0.45);
  juice.flash(PAL[8], 0.35, { x: bx, y: by });
  juice.hitStop(0.15);
  g.lives -= 1;
  g.dying = true;
}

function serve(g: Game): void {
  const { ball } = g;
  holdBall(g);
  if (g.app.input.pressed('A')) {
    ball.served = true;
    ball.vx = BALL_SPEED * Math.SQRT1_2;
    ball.vy = -BALL_SPEED * Math.SQRT1_2;
    g.app.audio.play('blip');
  }
}

function breakBrick(g: Game, b: Brick): void {
  const { runtime, audio, particles, juice } = g.app;
  g.score += 10;
  runtime.scoreChanged(g.score);
  audio.play('hit');
  particles.burst(b.x + b.w / 2, b.y + b.h / 2, { count: 4, color: b.color, speed: 70 });
  juice.shake(1, 0.08);
}

function flyBall(g: Game, dt: number): void {
  const { ball } = g;
  const { audio, juice, scenes } = g.app;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  bounceOffWalls(ball);
  if (bounceOffPaddle(ball, g.paddle)) {
    audio.play('blip');
    juice.shake(1, 0.06);
  }
  const broken = hitBrick(ball, g.bricks);
  if (broken !== null) {
    breakBrick(g, broken);
  }
  if (g.bricks.length === 0) {
    juice.flash(PAL[11], 0.3);
    scenes.to('WIN');
    return;
  }
  if (ball.y > H) {
    loseBall(g);
  }
}

function updateWorld(g: Game, dt: number): void {
  const { paddle } = g;
  paddle.x += g.app.input.dir.x * PADDLE_SPEED * dt;
  paddle.x = clamp(paddle.x, SAFE_MARGIN, W - SAFE_MARGIN - paddle.w);
  if (g.ball.served) {
    flyBall(g, dt);
  } else {
    serve(g);
  }
}

function resolveDeath(g: Game): void {
  if (g.app.juice.frozen) {
    return;
  }
  g.dying = false;
  if (g.lives <= 0) {
    g.app.scenes.to('GAME_OVER');
  } else {
    holdBall(g);
  }
}

export function updatePlaying(g: Game, dt: number): void {
  const { input, juice, scenes, audio } = g.app;
  if (g.dying) {
    resolveDeath(g);
    return;
  }
  if (input.pressed('PAUSE')) {
    audio.play('blip');
    scenes.to('PAUSED');
    return;
  }
  if (!juice.frozen) {
    updateWorld(g, dt);
  }
}
