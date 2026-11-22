import { glyphFor, glyphWidth } from './font';
import type { CenterRow, Point } from './geometry';

export interface TextOptions {
  color?: string;
  scale?: number;
  spacing?: number;
  shadow?: boolean | string;
  outline?: boolean | string;
}

export interface LogoOptions {
  color: string;
  shade?: string;
  shadow?: string;
  scale?: number;
  spacing?: number;
  shadowOffset?: number;
}

type Offsets = readonly (readonly [number, number])[];

interface Backing {
  offsets: Offsets;
  color: string | true;
}

interface Metrics {
  scale: number;
  spacing: number;
}

const OUTLINE_OFFSETS: Offsets = [
  [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1],
];
const SHADOW_OFFSETS: Offsets = [[1, 1]];
const OUTLINE_MIN_SCALE = 3;
const SHADOW_COLOR = 'rgba(0,0,0,0.7)';
const OUTLINE_COLOR = '#000000';
const DEFAULT_TEXT_COLOR = '#FFF1E8';

export function textWidth(text: string, scale = 1, spacing = 1): number {
  const upper = text.toUpperCase();
  if (upper.length === 0) {return 0;}
  let w = 0;
  for (const raw of upper) {w += (glyphWidth(raw) + spacing) * scale;}
  return w - spacing * scale;
}

function backingFor(opts: TextOptions, scale: number): Backing | null {
  const requested = opts.outline === false ? undefined : opts.outline;
  const outline = scale >= OUTLINE_MIN_SCALE ? requested : undefined;
  const shadow = outline === undefined && requested !== undefined ? requested : opts.shadow;
  if (outline) {return { offsets: OUTLINE_OFFSETS, color: outline };}
  if (!shadow) {return null;}
  return { offsets: SHADOW_OFFSETS, color: outline ?? shadow };
}

function backingColor(back: Backing): string {
  if (typeof back.color === 'string') {return back.color;}
  return back.offsets === OUTLINE_OFFSETS ? OUTLINE_COLOR : SHADOW_COLOR;
}

function inkText(ctx: CanvasRenderingContext2D, upper: string, at: Point, m: Metrics): void {
  const { scale, spacing } = m;
  let cursor = at.x;
  for (const raw of upper) {
    const glyph = glyphFor(raw);
    if (glyph) {
      for (const [gx, gy] of glyph.cells) {ctx.fillRect(cursor + gx * scale, at.y + gy * scale, scale, scale);}
    }
    cursor += (glyphWidth(raw) + spacing) * scale;
  }
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, at: Point, opts: TextOptions = {}): void {
  const m: Metrics = { scale: opts.scale ?? 1, spacing: opts.spacing ?? 1 };
  const upper = text.toUpperCase();
  const back = backingFor(opts, m.scale);
  if (back) {
    ctx.fillStyle = backingColor(back);
    for (const [ox, oy] of back.offsets) {inkText(ctx, upper, { x: at.x + ox, y: at.y + oy }, m);}
  }
  ctx.fillStyle = opts.color ?? DEFAULT_TEXT_COLOR;
  inkText(ctx, upper, at, m);
}

export function drawTextCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  row: CenterRow,
  opts: TextOptions = {},
): void {
  const scale = opts.scale ?? 1;
  const w = textWidth(text, scale, opts.spacing ?? 1);
  const outline = opts.outline ?? (opts.shadow === undefined && scale >= 2);
  drawText(ctx, text, { x: Math.round((row.width - w) / 2), y: row.y }, { ...opts, outline });
}

export function drawLogo(ctx: CanvasRenderingContext2D, text: string, row: CenterRow, opts: LogoOptions): void {
  if (!opts.color) {
    throw new Error(
      'drawLogo: opts.color is required and must come from the game palette, e.g. { color: PAL[10], shade: PAL[9] }',
    );
  }
  const scale = opts.scale ?? 3;
  const spacing = opts.spacing ?? 1;
  const color = opts.color;
  const off = opts.shadowOffset ?? 1;
  const w = textWidth(text, scale, spacing);
  const x = Math.round((row.width - w) / 2);
  const y = Math.round(row.y);
  const base = { scale, spacing, shadow: false as const, outline: false as const };
  drawText(ctx, text, { x: x + off, y: y + off }, { ...base, color: opts.shadow ?? OUTLINE_COLOR });
  drawText(ctx, text, { x, y }, { ...base, color: opts.shade ?? color });
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - off, y, w + 2 * off, 3 * scale);
  ctx.clip();
  drawText(ctx, text, { x, y }, { ...base, color });
  ctx.restore();
}
