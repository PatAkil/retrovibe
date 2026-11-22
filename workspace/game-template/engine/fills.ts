import type { Rect } from './geometry';
import { snapRect, solidRect } from './geometry';

export type DitherPattern = 'checker' | 'sparse';

export interface DitherStyle {
  colorA: string;
  colorB: string;
  pattern?: DitherPattern;
}

export interface BevelStyle {
  fill: string;
  light: string;
  dark: string;
}

export interface FrameStyle {
  color: string;
  thickness?: number;
}

const DITHER_CACHE = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();
const BAYER_4: readonly number[] = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];
const DITHER_CUTOFF: Readonly<Record<DitherPattern, number>> = { checker: 8, sparse: 4 };

export function fillBands(ctx: CanvasRenderingContext2D, rect: Rect, colors: string[]): void {
  const n = colors.length;
  if (n === 0 || rect.w <= 0 || rect.h <= 0) {return;}
  const { x, y, w, h } = snapRect(rect);
  const band = Math.floor(h / n);
  let cy = y;
  colors.forEach((color, i) => {
    const bh = i === n - 1 ? y + h - cy : band;
    if (bh <= 0) {return;}
    ctx.fillStyle = color;
    ctx.fillRect(x, cy, w, bh);
    cy += bh;
  });
}

function paintDitherTile(style: Required<DitherStyle>): HTMLCanvasElement | null {
  const tile = document.createElement('canvas');
  tile.width = 4;
  tile.height = 4;
  const tctx = tile.getContext('2d');
  if (!tctx) {return null;}
  tctx.fillStyle = style.colorA;
  tctx.fillRect(0, 0, 4, 4);
  tctx.fillStyle = style.colorB;
  const cutoff = DITHER_CUTOFF[style.pattern];
  BAYER_4.forEach((rank, i) => {
    if (rank < cutoff) {tctx.fillRect(i % 4, Math.floor(i / 4), 1, 1);}
  });
  return tile;
}

function ditherPattern(ctx: CanvasRenderingContext2D, style: Required<DitherStyle>): CanvasPattern | null {
  let perCtx = DITHER_CACHE.get(ctx);
  if (!perCtx) {
    perCtx = new Map<string, CanvasPattern>();
    DITHER_CACHE.set(ctx, perCtx);
  }
  const key = `${style.colorA}|${style.colorB}|${style.pattern}`;
  const hit = perCtx.get(key);
  if (hit) {return hit;}
  const tile = paintDitherTile(style);
  if (!tile) {return null;}
  const made = ctx.createPattern(tile, 'repeat');
  if (!made) {return null;}
  perCtx.set(key, made);
  return made;
}

export function fillDither(ctx: CanvasRenderingContext2D, rect: Rect, style: DitherStyle): void {
  const r = solidRect(rect);
  if (!r) {return;}
  const pat = ditherPattern(ctx, { ...style, pattern: style.pattern ?? 'checker' });
  if (!pat) {
    ctx.fillStyle = style.colorA;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    return;
  }
  ctx.save();
  ctx.fillStyle = pat;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

export function drawBevel(ctx: CanvasRenderingContext2D, rect: Rect, style: BevelStyle): void {
  const r = solidRect(rect);
  if (!r) {return;}
  ctx.fillStyle = style.fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = style.light;
  ctx.fillRect(r.x, r.y, r.w, 1);
  ctx.fillRect(r.x, r.y, 1, r.h);
  ctx.fillStyle = style.dark;
  ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
  ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
}

export function drawFrame(ctx: CanvasRenderingContext2D, rect: Rect, style: FrameStyle): void {
  const r = solidRect(rect);
  if (!r) {return;}
  const t = Math.max(1, Math.round(style.thickness ?? 1));
  ctx.fillStyle = style.color;
  const tv = Math.min(t, r.h);
  const th = Math.min(t, r.w);
  ctx.fillRect(r.x, r.y, r.w, tv);
  ctx.fillRect(r.x, r.y + r.h - tv, r.w, tv);
  ctx.fillRect(r.x, r.y + tv, th, Math.max(0, r.h - 2 * tv));
  ctx.fillRect(r.x + r.w - th, r.y + tv, th, Math.max(0, r.h - 2 * tv));
}
