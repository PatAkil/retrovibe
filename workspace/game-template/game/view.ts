import { blink, drawFrame, drawScore, drawSprite, drawText, frameIndex, pulse, textWidth } from '../engine';
import { at } from './lookup';
import { DEBRIS, HAZARD_FRAMES, HAZARD_HOT_FRAMES, PICKUP_FRAMES, PICKUP_HOT_FRAMES, PLANET, SHIP_FLASH, SHIP_FRAMES } from './sprites';
import type { Game } from './state';
import { POP_LIFE } from './state';
import { C_ACCENT, C_FAR, H, PX, W } from './theme';

const HAZE_ALPHAS = [0.10, 0.18, 0.28];

export const blinkHz = (clock: number, hz: number): boolean => blink(clock, 1 / hz, 0.5) === 1;
const accentHz = (clock: number, hz: number, duty: number): boolean => blink(clock, 1 / hz, duty) === 1;

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

function renderActors(g: Game): void {
  const { ctx } = g.app.pc;
  const { clock, pickup, hazard, ship } = g;
  const bob = Math.round((pulse(clock, 1 / 0.6) * 2 - 1) * 1.5);
  const gems = accentHz(clock, 1.2, 0.25) ? PICKUP_HOT_FRAMES : PICKUP_FRAMES;
  drawSprite(ctx, at(gems, frameIndex(clock, 6, 2)), { x: pickup.x, y: pickup.y + bob }, PX);
  const mines = accentHz(clock, 2, 0.18) ? HAZARD_HOT_FRAMES : HAZARD_FRAMES;
  drawSprite(ctx, at(mines, frameIndex(clock, 8, 2)), { x: hazard.x, y: hazard.y }, PX);
  if (g.dying) {
    drawSprite(ctx, DEBRIS, { x: ship.x, y: ship.y }, PX);
  } else if (g.ready <= 0 || blinkHz(clock, 6)) {
    drawSprite(ctx, g.squash > 0 ? SHIP_FLASH : shipFrame(clock), { x: ship.x, y: ship.y }, PX);
  }
}

export function renderWorld(g: Game): void {
  const { pc } = g.app;
  renderActors(g);
  for (const p of g.pops) {
    pc.ctx.globalAlpha = Math.max(0, p.life / POP_LIFE);
    drawText(pc.ctx, p.text, { x: p.x - textWidth(p.text, 1) / 2, y: p.y }, { color: C_ACCENT });
  }
  pc.ctx.globalAlpha = 1;
  drawScore(pc, g.score);
}
