import type { Rect } from '../engine';
import type { App } from './app';
import { ROW_STYLE } from './sprites';
import { H, W } from './theme';

export interface Brick extends Rect { color: string; light: string; dark: string }
export interface Ball extends Rect { vx: number; vy: number; served: boolean }

export interface Game {
  app: App;
  clock: number;
  paddle: Rect;
  ball: Ball;
  bricks: Brick[];
  score: number;
  lives: number;
  dying: boolean;
}

const BRICK_COLS = 8;
const BRICK_W = 24;
const BRICK_H = 6;
const BRICK_GAP = 2;
const BRICK_X0 = (W - (BRICK_COLS * (BRICK_W + BRICK_GAP) - BRICK_GAP)) / 2;
const BRICK_Y0 = 28;

export function createGame(app: App): Game {
  return {
    app,
    clock: 0,
    paddle: { x: W / 2 - 12, y: H - 16, w: 24, h: 4 },
    ball: { x: 0, y: 0, w: 6, h: 6, vx: 0, vy: 0, served: false },
    bricks: [],
    score: 0,
    lives: 3,
    dying: false,
  };
}

export function holdBall(g: Game): void {
  const { ball, paddle } = g;
  ball.served = false;
  ball.vx = 0;
  ball.vy = 0;
  ball.x = paddle.x + paddle.w / 2 - ball.w / 2;
  ball.y = paddle.y - ball.h;
}

function buildWall(): Brick[] {
  const bricks: Brick[] = [];
  for (const [r, style] of ROW_STYLE.entries()) {
    for (let c = 0; c < BRICK_COLS; c++) {
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
  return bricks;
}

export function resetWorld(g: Game): void {
  g.bricks = buildWall();
  g.paddle.x = W / 2 - g.paddle.w / 2;
  g.score = 0;
  g.lives = 3;
  g.dying = false;
  holdBall(g);
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
