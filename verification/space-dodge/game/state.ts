import { SAFE_MARGIN } from '../engine';
import type { App } from './app';
import { H, W } from './theme';

export interface Entity { x: number; y: number; w: number; h: number }
export interface Mover extends Entity { vx: number; vy: number }

export interface Game {
  app: App;
  clock: number;
  ship: Entity;
  pickup: Entity;
  hazard: Mover;
  score: number;
  dying: boolean;
}

export const SHIP_SPEED = 90;
export const PICKUP_SPEEDUP = 1.12;
export const TIME_SPEEDUP = 0.01;
const SHIP_W = 16;
const SHIP_H = 12;
const PICKUP_SIZE = 8;
const HAZARD_SIZE = 10;
const SHIP_START = { x: W / 2 - SHIP_W / 2, y: H - 30 };
const HAZARD_START = { x: 20, y: 20, vx: 55, vy: 40 };

export function createGame(app: App): Game {
  return {
    app,
    clock: 0,
    ship: { ...SHIP_START, w: SHIP_W, h: SHIP_H },
    pickup: { x: 0, y: 0, w: PICKUP_SIZE, h: PICKUP_SIZE },
    hazard: { ...HAZARD_START, w: HAZARD_SIZE, h: HAZARD_SIZE },
    score: 0,
    dying: false,
  };
}

export function placePickup(g: Game): void {
  const x = SAFE_MARGIN + Math.random() * (W - 2 * SAFE_MARGIN - PICKUP_SIZE);
  const y = SAFE_MARGIN + 12 + Math.random() * (H - 2 * SAFE_MARGIN - 12 - 28 - PICKUP_SIZE);
  g.pickup = { x, y, w: PICKUP_SIZE, h: PICKUP_SIZE };
}

export function resetWorld(g: Game): void {
  Object.assign(g.ship, SHIP_START);
  Object.assign(g.hazard, HAZARD_START);
  g.score = 0;
  g.dying = false;
  placePickup(g);
}

export function overlaps(a: Entity, b: Entity): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export const centerOf = (e: Entity): { x: number; y: number } => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 });
