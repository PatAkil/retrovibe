import type { Point } from '../engine';
import { drawBevel, drawFrame, drawSprite, fillDither } from '../engine';
import { BALL, CORAL, ROCK, ROW_STYLE } from './sprites';
import type { Game } from './state';
import { H, PAL, SEABED_Y, W } from './theme';

type Ctx = CanvasRenderingContext2D;

const PREVIEW = { cols: 4, bw: 20, bh: 5, gap: 2, y0: 62 };

export function renderBackdrop(g: Game): void {
  const { ctx } = g.app.pc;
  ctx.fillStyle = PAL[1];
  ctx.fillRect(0, 0, W, SEABED_Y);
  fillDither(ctx, { x: 0, y: SEABED_Y, w: W, h: H - SEABED_Y }, { colorA: PAL[0], colorB: PAL[1], pattern: 'checker' });
  drawSprite(ctx, CORAL, { x: 26, y: SEABED_Y }, 2);
  drawSprite(ctx, ROCK, { x: 96, y: SEABED_Y + 4 }, 2);
  drawSprite(ctx, CORAL, { x: 196, y: SEABED_Y + 2 }, 2);
  drawFrame(ctx, { x: 4, y: 12, w: W - 8, h: 164 }, { color: PAL[0], thickness: 4 });
  drawFrame(ctx, { x: 7, y: 15, w: W - 14, h: 158 }, { color: PAL[5], thickness: 1 });
}

function drawPaddle(g: Game, { x, y }: Point): void {
  const { ctx } = g.app.pc;
  drawBevel(ctx, { x, y, w: g.paddle.w, h: g.paddle.h }, { fill: PAL[12], light: PAL[7], dark: PAL[1] });
  ctx.fillStyle = PAL[7];
  ctx.fillRect(Math.round(x) + 3, Math.round(y) + 1, 5, 1);
}

export function renderWorld(g: Game): void {
  const { ctx } = g.app.pc;
  for (const b of g.bricks) {
    drawBevel(ctx, { x: b.x, y: b.y, w: b.w, h: b.h }, { fill: b.color, light: b.light, dark: b.dark });
  }
  drawPaddle(g, { x: Math.round(g.paddle.x), y: g.paddle.y });
  drawSprite(ctx, BALL, { x: Math.round(g.ball.x), y: Math.round(g.ball.y) }, 1);
}

function drawPreviewWall(ctx: Ctx): void {
  const { cols, bw, bh, gap, y0 } = PREVIEW;
  const x0 = (W - (cols * (bw + gap) - gap)) / 2;
  for (const [r, s] of ROW_STYLE.entries()) {
    for (let c = 0; c < cols; c++) {
      drawBevel(ctx, { x: x0 + c * (bw + gap), y: y0 + r * (bh + gap), w: bw, h: bh }, s);
    }
  }
}

export function renderPreview(g: Game): void {
  const { ctx } = g.app.pc;
  drawPreviewWall(ctx);
  drawSprite(ctx, BALL, { x: W / 2 - 3, y: 92 }, 1);
  drawPaddle(g, { x: W / 2 - g.paddle.w / 2, y: 100 });
}
