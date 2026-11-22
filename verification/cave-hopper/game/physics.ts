import type { Input } from '../engine';
import { SOLIDS } from './level';
import type { Player } from './state';
import { overlaps } from './state';
import { W } from './theme';

const GRAVITY = 900;
const JUMP_VELOCITY = -280;
const JUMP_CUT = 0.4;
const MOVE_SPEED = 90;
const MAX_FALL = 300;
const COYOTE_TIME = 0.1;
const JUMP_BUFFER = 0.12;

function steer(p: Player, input: Input): void {
  p.vx = input.dir.x * MOVE_SPEED;
  if (input.dir.x !== 0) {
    p.facing = input.dir.x > 0 ? 1 : -1;
  }
}

function tickTimers(p: Player, input: Input, dt: number): void {
  p.buffer = input.pressed('A') ? JUMP_BUFFER : Math.max(0, p.buffer - dt);
  p.coyote = p.onGround ? COYOTE_TIME : Math.max(0, p.coyote - dt);
}

export function tryJump(p: Player, input: Input, dt: number): boolean {
  steer(p, input);
  tickTimers(p, input, dt);
  const jumped = p.buffer > 0 && p.coyote > 0;
  if (jumped) {
    p.vy = JUMP_VELOCITY;
    p.buffer = 0;
    p.coyote = 0;
    p.onGround = false;
  }
  return jumped;
}

export function applyGravity(p: Player, input: Input, dt: number): void {
  if (input.released('A') && p.vy < 0) {
    p.vy *= JUMP_CUT;
  }
  p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);
}

function moveX(p: Player, dt: number): void {
  p.x += p.vx * dt;
  for (const s of SOLIDS) {
    if (!overlaps(p, s)) {
      continue;
    }
    if (p.vx > 0) {
      p.x = s.x - p.w;
    } else if (p.vx < 0) {
      p.x = s.x + s.w;
    }
  }
  p.x = Math.max(0, Math.min(W - p.w, p.x));
}

function moveY(p: Player, dt: number): void {
  p.onGround = false;
  p.y += p.vy * dt;
  for (const s of SOLIDS) {
    if (!overlaps(p, s)) {
      continue;
    }
    if (p.vy > 0) {
      p.y = s.y - p.h;
      p.vy = 0;
      p.onGround = true;
    } else if (p.vy < 0) {
      p.y = s.y + s.h;
      p.vy = 0;
    }
  }
}

export function moveAndCollide(p: Player, dt: number): boolean {
  const wasAirborne = !p.onGround;
  moveX(p, dt);
  moveY(p, dt);
  return wasAirborne && p.onGround;
}
