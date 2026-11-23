import type { PixelCanvas } from './canvas';
import type { Rect } from './geometry';
import { parseHex } from './palette';
import { drawText, textWidth } from './text';

export const SAFE_MARGIN = 8;

export interface HudOptions {
  color?: string;
  scale?: number;
  shadow?: boolean | string;
  plate?: boolean;
}
export interface PanelOptions {
  color?: string;
  border?: string;
}
export type HAnchor = 'left' | 'center' | 'right';
export type VAnchor = 'top' | 'middle' | 'bottom';
export interface Anchor {
  h: HAnchor;
  v: VAnchor;
}

const PLATE_FILL = 'rgba(0,0,0,0.66)';
const PLATE_BORDER = 'rgba(255,255,255,0.18)';
const DIM_BLEED = 16;
const HUD_TEXT_COLOR = '#FFF1E8';

const H_POSITION: Readonly<Record<HAnchor, (span: number, w: number) => number>> = {
  left: () => SAFE_MARGIN,
  right: (span, w) => span - SAFE_MARGIN - w,
  center: (span, w) => Math.round((span - w) / 2),
};
const V_POSITION: Readonly<Record<VAnchor, (span: number, h: number) => number>> = {
  top: () => SAFE_MARGIN,
  bottom: (span, h) => span - SAFE_MARGIN - h,
  middle: (span, h) => Math.round((span - h) / 2),
};

function drawBorder(ctx: CanvasRenderingContext2D, r: Rect, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(r.x, r.y, r.w, 1);
  if (r.h > 1) {ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);}
  if (r.h > 2) {
    ctx.fillRect(r.x, r.y + 1, 1, r.h - 2);
    if (r.w > 1) {ctx.fillRect(r.x + r.w - 1, r.y + 1, 1, r.h - 2);}
  }
}

export function drawPanel(pc: PixelCanvas, rect: Rect, opts: PanelOptions = {}): void {
  const x0 = Math.max(SAFE_MARGIN, Math.round(rect.x));
  const y0 = Math.max(SAFE_MARGIN, Math.round(rect.y));
  const x1 = Math.min(pc.width - SAFE_MARGIN, Math.round(rect.x + rect.w));
  const y1 = Math.min(pc.height - SAFE_MARGIN, Math.round(rect.y + rect.h));
  if (x1 <= x0 || y1 <= y0) {return;}
  const ctx = pc.ctx;
  const w = x1 - x0;
  const h = y1 - y0;
  ctx.fillStyle = opts.color ?? PLATE_FILL;
  ctx.fillRect(x0, y0, w, h);
  const border = opts.border ?? PLATE_BORDER;
  if (border) {drawBorder(ctx, { x: x0, y: y0, w, h }, border);}
}
export function dimScene(pc: PixelCanvas, alpha = 0.55): void {
  pc.ctx.fillStyle = `rgba(0,0,0,${Math.max(0, Math.min(1, alpha))})`;
  pc.ctx.fillRect(
    -DIM_BLEED,
    -DIM_BLEED,
    pc.width + 2 * DIM_BLEED,
    pc.height + 2 * DIM_BLEED,
  );
}
function hudLine(pc: PixelCanvas, text: string, x: number, opts: HudOptions): void {
  drawText(pc.ctx, text, { x, y: SAFE_MARGIN }, {
    color: opts.color ?? HUD_TEXT_COLOR,
    scale: opts.scale ?? 1,
    shadow: opts.shadow ?? true,
  });
}
export function drawScore(pc: PixelCanvas, score: number, opts: HudOptions = {}): void {
  hudLine(pc, `SCORE ${score}`, SAFE_MARGIN, opts);
}
export function drawLives(pc: PixelCanvas, lives: number, opts: HudOptions = {}): void {
  const text = `LIVES ${lives}`;
  hudLine(pc, text, pc.width - SAFE_MARGIN - textWidth(text, opts.scale ?? 1), opts);
}
function drawPlate(pc: PixelCanvas, text: Rect, scale: number, color: string | undefined): void {
  const padX = 4 * scale;
  const padY = 3 * scale;
  drawPanel(pc, { x: text.x - padX, y: text.y - padY, w: text.w + 2 * padX + 1, h: text.h + 2 * padY + 1 }, {
    border: color ? hexToRgba(color, 0.35) : PLATE_BORDER,
  });
}
export function hudText(pc: PixelCanvas, text: string, anchor: Anchor, opts: HudOptions = {}): void {
  const scale = opts.scale ?? 1;
  const w = textWidth(text, scale);
  const glyphH = 5 * scale;
  const x = H_POSITION[anchor.h](pc.width, w);
  const y = V_POSITION[anchor.v](pc.height, glyphH);
  const plate = opts.plate ?? (anchor.h === 'center' && anchor.v === 'middle' && scale >= 2);
  if (plate) {drawPlate(pc, { x, y, w, h: glyphH }, scale, opts.color);}
  drawText(pc.ctx, text, { x, y }, {
    color: opts.color ?? HUD_TEXT_COLOR,
    scale,
    shadow: opts.shadow ?? true,
  });
}
function hexToRgba(color: string, alpha: number): string {
  const rgb = parseHex(color);
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : color;
}
