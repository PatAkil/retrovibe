import type { Rect } from '../engine';
import { drawBevel, drawSprite, fillBands, fillDither, frameIndex } from '../engine';
import type { Silhouette } from './level';
import { FAR_ROCKS, GOAL, PIT, SIDE_TEETH, SOLIDS, SPIKES, STALACTITES } from './level';
import { at } from './lookup';
import { COIN_FRAMES, FLAG_FRAMES, PLAYER_LEFT, PLAYER_RIGHT, SPIKE } from './sprites';
import type { Game } from './state';
import { H, PAL, PX, W } from './theme';

type Ctx = CanvasRenderingContext2D;

function drawStalactite(ctx: Ctx, [x, w, h]: Silhouette, color: string): void {
  ctx.fillStyle = color;
  for (let r = 0; r < h; r++) {
    const inset = Math.floor((r * (w / 2)) / h);
    const rw = w - 2 * inset;
    if (rw <= 0) {
      break;
    }
    ctx.fillRect(x + inset, r, rw, 1);
  }
}

function drawHump(ctx: Ctx, [x, w, h]: Silhouette, base: number, color: string): void {
  ctx.fillStyle = color;
  for (let r = 0; r < h; r++) {
    const inset = Math.floor(((h - r) * (w / 2.6)) / h);
    const rw = w - 2 * inset;
    if (rw <= 0) {
      continue;
    }
    ctx.fillRect(x + inset, base - h + r, rw, 1);
  }
}

export function renderBackdrop(g: Game): void {
  const { ctx } = g.app.pc;
  fillBands(ctx, { x: 0, y: 0, w: W, h: 104 }, [PAL[0], PAL[0]]);
  ctx.fillStyle = PAL[1];
  ctx.fillRect(0, 112, W, 7);
  ctx.fillStyle = PAL[1];
  ctx.fillRect(0, 119, W, H - 119);
  for (const rock of FAR_ROCKS) {
    drawHump(ctx, rock, 146, PAL[0]);
  }
  for (const spike of STALACTITES) {
    drawStalactite(ctx, spike, PAL[1]);
  }
  for (const [i, t] of SIDE_TEETH.entries()) {
    const y = i * 8;
    ctx.fillStyle = y < 100 ? PAL[1] : PAL[0];
    ctx.fillRect(0, y, t, 8);
    ctx.fillRect(W - t, y, t, 8);
  }
}

export function drawSlab(ctx: Ctx, { x, y, w, h }: Rect): void {
  drawBevel(ctx, { x, y, w, h }, { fill: PAL[2], light: PAL[2], dark: PAL[1] });
  if (h > 3) {
    fillDither(ctx, { x: x + 1, y: y + 3, w: w - 2, h: h - 4 }, { colorA: PAL[2], colorB: PAL[1], pattern: 'sparse' });
  }
  fillDither(ctx, { x: x + 1, y: y + 1, w: w - 2, h: 1 }, { colorA: PAL[2], colorB: PAL[5], pattern: 'sparse' });
}

function drawLevel(g: Game): void {
  const { ctx } = g.app.pc;
  fillBands(ctx, { x: PIT.x, y: 132, w: PIT.w, h: H - 132 }, [PAL[1], PAL[0], PAL[0]]);
  for (const s of SOLIDS) {
    drawSlab(ctx, s);
  }
  const coinFrame = at(COIN_FRAMES, frameIndex(g.clock, 3, COIN_FRAMES.length));
  for (const s of SPIKES) {
    drawSprite(ctx, SPIKE, { x: s.x, y: s.y }, PX);
  }
  for (const c of g.coins) {
    drawSprite(ctx, coinFrame, { x: c.x, y: c.y }, PX);
  }
  drawSprite(ctx, at(FLAG_FRAMES, frameIndex(g.clock, 4, FLAG_FRAMES.length)), { x: GOAL.x, y: GOAL.y }, PX);
}

function playerFrame(g: Game): number {
  if (!g.player.onGround) {
    return 1;
  }
  if (g.player.vx === 0) {
    return 0;
  }
  return frameIndex(g.clock, 8, 2);
}

function drawPlayer(g: Game): void {
  const { player } = g;
  const set = player.facing < 0 ? PLAYER_LEFT : PLAYER_RIGHT;
  drawSprite(g.app.pc.ctx, at(set, playerFrame(g)), { x: Math.round(player.x), y: Math.round(player.y) }, PX);
}

export function renderWorld(g: Game): void {
  drawLevel(g);
  drawPlayer(g);
}
