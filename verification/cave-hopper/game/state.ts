import type { Rect } from '../engine';
import type { App } from './app';
import { COIN_SPOTS, START } from './level';

export interface Player extends Rect {
  vx: number;
  vy: number;
  onGround: boolean;
  coyote: number;
  buffer: number;
  facing: number;
}

export interface Game {
  app: App;
  clock: number;
  player: Player;
  coins: Rect[];
  score: number;
  lives: number;
  dying: boolean;
}

export function createGame(app: App): Game {
  return {
    app,
    clock: 0,
    player: { x: START.x, y: START.y, w: 8, h: 12, vx: 0, vy: 0, onGround: false, coyote: 0, buffer: 0, facing: 1 },
    coins: [],
    score: 0,
    lives: 3,
    dying: false,
  };
}

export function respawn(g: Game): void {
  Object.assign(g.player, { x: START.x, y: START.y, vx: 0, vy: 0, onGround: false, coyote: 0, buffer: 0, facing: 1 });
}

export function resetWorld(g: Game): void {
  g.coins = COIN_SPOTS.map((c) => ({ ...c }));
  g.score = 0;
  g.lives = 3;
  g.dying = false;
  respawn(g);
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export const centerOf = (e: Rect): { x: number; y: number } => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 });
