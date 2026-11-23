import { drawFrame, drawScore, drawSprite, frameIndex } from '../engine';
import { at } from './lookup';
import { HAZARD_FRAMES, PICKUP_FRAMES, PLANET, SHIP_FRAMES } from './sprites';
import type { Game } from './state';
import { C_FAR, H, PX, W } from './theme';

const HAZE_ALPHAS = [0.10, 0.18, 0.28];

export const shipFrame = (clock: number): (typeof SHIP_FRAMES)[number] => at(SHIP_FRAMES, frameIndex(clock, 12, 2));

export function renderBackdrop(g: Game): void {
  const { ctx } = g.app.pc;
  for (const [i, alpha] of HAZE_ALPHAS.entries()) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = C_FAR;
    ctx.fillRect(0, H - 26 + i * 9, W, 9);
  }
  ctx.globalAlpha = 0.85;
  drawSprite(ctx, PLANET, { x: W - 48, y: 12 }, 2);
  ctx.globalAlpha = 1;
  drawFrame(ctx, { x: 0, y: 0, w: W, h: H }, { color: C_FAR, thickness: 1 });
}

export function renderWorld(g: Game): void {
  const { pc } = g.app;
  const { clock, pickup, hazard, ship } = g;
  drawSprite(pc.ctx, at(PICKUP_FRAMES, frameIndex(clock, 6, 2)), { x: pickup.x, y: pickup.y }, PX);
  drawSprite(pc.ctx, at(HAZARD_FRAMES, frameIndex(clock, 8, 2)), { x: hazard.x, y: hazard.y }, PX);
  drawSprite(pc.ctx, shipFrame(clock), { x: ship.x, y: ship.y }, PX);
  drawScore(pc, g.score);
}
