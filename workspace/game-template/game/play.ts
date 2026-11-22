import { SAFE_MARGIN } from '../engine';
import type { Game } from './state';
import { centerOf, overlaps, placePickup, PICKUP_SPEEDUP, POP_LIFE, SHIP_SPEED, TIME_SPEEDUP } from './state';
import { C_ACCENT, C_DANGER, C_TEXT, H, W } from './theme';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function steerShip(g: Game, dt: number): void {
  const { ship } = g;
  const { dir } = g.app.input;
  ship.x += dir.x * SHIP_SPEED * dt;
  ship.y += dir.y * SHIP_SPEED * dt;
  ship.x = clamp(ship.x, SAFE_MARGIN, W - SAFE_MARGIN - ship.w);
  ship.y = clamp(ship.y, SAFE_MARGIN, H - SAFE_MARGIN - ship.h);
}

function moveHazard(g: Game, dt: number): void {
  const { hazard } = g;
  const timeRamp = 1 + TIME_SPEEDUP * dt;
  hazard.vx *= timeRamp;
  hazard.vy *= timeRamp;
  hazard.x += hazard.vx * dt;
  hazard.y += hazard.vy * dt;
  if (hazard.x < SAFE_MARGIN || hazard.x > W - SAFE_MARGIN - hazard.w) {
    hazard.vx *= -1;
  }
  if (hazard.y < SAFE_MARGIN || hazard.y > H - SAFE_MARGIN - hazard.h) {
    hazard.vy *= -1;
  }
}

function collectPickup(g: Game): void {
  const { pickup, hazard } = g;
  const { runtime, audio, particles } = g.app;
  g.score += 10;
  runtime.scoreChanged(g.score);
  audio.play('pickup');
  const center = centerOf(pickup);
  particles.burst(center.x, center.y, { count: 5, color: C_ACCENT });
  g.pops.push({ x: center.x, y: pickup.y, life: POP_LIFE, text: '+10' });
  g.squash = 0.12;
  hazard.vx *= PICKUP_SPEEDUP;
  hazard.vy *= PICKUP_SPEEDUP;
  placePickup(g);
}

function explode(g: Game): void {
  const { audio, particles, juice } = g.app;
  const mag = Math.min(1, g.score / 200);
  const center = centerOf(g.ship);
  audio.play('explosion');
  particles.burst(center.x, center.y, {
    count: 10 + Math.round(mag * 10), color: C_DANGER, speed: 140 + mag * 80, life: 0.7,
  });
  particles.burst(center.x, center.y, { count: 6, color: C_TEXT, speed: 70, life: 0.45 });
  juice.shake(5 + mag * 3, 0.45 + mag * 0.15);
  juice.flash(C_DANGER, 0.35, center);
  juice.hitStop(0.15);
  g.dying = true;
}

function advanceWorld(g: Game, dt: number): void {
  if (g.squash > 0) {
    g.squash = Math.max(0, g.squash - dt);
  }
  if (g.ready > 0) {
    g.ready = Math.max(0, g.ready - dt);
  }
  steerShip(g, dt);
  if (g.ready <= 0) {
    moveHazard(g, dt);
  }
  if (overlaps(g.ship, g.pickup)) {
    collectPickup(g);
  }
  if (g.ready <= 0 && overlaps(g.ship, g.hazard)) {
    explode(g);
  }
}

export function updatePlaying(g: Game, dt: number): void {
  const { input, juice, scenes, audio } = g.app;
  if (g.dying) {
    if (!juice.frozen) {
      scenes.to('GAME_OVER');
    }
    return;
  }
  if (input.pressed('PAUSE')) {
    audio.play('blip');
    scenes.to('PAUSED');
    return;
  }
  if (!juice.frozen) {
    advanceWorld(g, dt);
  }
}
