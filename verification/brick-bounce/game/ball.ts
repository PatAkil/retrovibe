import type { Rect } from '../engine';
import { SAFE_MARGIN } from '../engine';
import type { Ball, Brick } from './state';
import { overlaps } from './state';
import { W } from './theme';

const BRICK_SPEEDUP = 1.03;

export function bounceOffWalls(ball: Ball): void {
  if (ball.x < SAFE_MARGIN) {
    ball.x = SAFE_MARGIN;
    ball.vx = Math.abs(ball.vx);
  }
  if (ball.x + ball.w > W - SAFE_MARGIN) {
    ball.x = W - SAFE_MARGIN - ball.w;
    ball.vx = -Math.abs(ball.vx);
  }
  if (ball.y < SAFE_MARGIN + 8) {
    ball.y = SAFE_MARGIN + 8;
    ball.vy = Math.abs(ball.vy);
  }
}

export function bounceOffPaddle(ball: Ball, paddle: Rect): boolean {
  if (ball.vy <= 0 || !overlaps(ball, paddle)) {
    return false;
  }
  const hit = (ball.x + ball.w / 2 - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
  const speed = Math.hypot(ball.vx, ball.vy);
  const angle = hit * 1.05;
  ball.vx = Math.sin(angle) * speed;
  ball.vy = -Math.cos(angle) * speed;
  ball.y = paddle.y - ball.h;
  return true;
}

export function hitBrick(ball: Ball, bricks: Brick[]): Brick | null {
  for (let i = bricks.length - 1; i >= 0; i--) {
    const b = bricks[i];
    if (b === undefined || !overlaps(ball, b)) {
      continue;
    }
    bricks.splice(i, 1);
    const overlapX = Math.min(ball.x + ball.w - b.x, b.x + b.w - ball.x);
    const overlapY = Math.min(ball.y + ball.h - b.y, b.y + b.h - ball.y);
    if (overlapX < overlapY) {
      ball.vx *= -1;
    } else {
      ball.vy *= -1;
    }
    ball.vx *= BRICK_SPEEDUP;
    ball.vy *= BRICK_SPEEDUP;
    return b;
  }
  return null;
}
