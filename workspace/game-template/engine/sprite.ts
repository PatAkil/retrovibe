import type { Point } from './geometry';

export type SpriteMap = Record<string, string>;

export interface Sprite {
  readonly w: number;
  readonly h: number;

  readonly pixels: readonly (string | null)[];
}
export interface MakeSpriteOptions {
  outline?: string;

  flipX?: boolean;
}
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];
function blankPixels(count: number): (string | null)[] {
  return new Array<string | null>(count).fill(null);
}
function inkOf(ch: string | undefined, map: SpriteMap): string | null {
  if (ch === undefined || ch === '.' || ch === ' ') {return null;}
  const color = map[ch];
  return color === undefined || color === '' ? null : color;
}
export function makeSprite(rows: string[], map: SpriteMap, opts: MakeSpriteOptions = {}): Sprite {
  const h = rows.length;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const pixels: (string | null)[] = [];
  for (const row of rows) {
    for (let x = 0; x < w; x++) {pixels.push(inkOf(row[x], map));}
  }
  let sprite: Sprite = { w, h, pixels };
  if (opts.outline) {sprite = outlineSprite(sprite, opts.outline);}
  if (opts.flipX) {sprite = flipSprite(sprite);}
  return sprite;
}
function pixelAt(sprite: Sprite, x: number, y: number): string | null {
  if (x < 0 || y < 0 || x >= sprite.w || y >= sprite.h) {return null;}
  return sprite.pixels[y * sprite.w + x] ?? null;
}
function touchesInk(sprite: Sprite, x: number, y: number): boolean {
  return NEIGHBOURS.some(([dx, dy]) => Boolean(pixelAt(sprite, x + dx, y + dy)));
}
function outlineSprite(sprite: Sprite, color: string): Sprite {
  const w = sprite.w + 2;
  const h = sprite.h + 2;
  const pixels = blankPixels(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const own = pixelAt(sprite, x - 1, y - 1);
      pixels[y * w + x] = !own && touchesInk(sprite, x - 1, y - 1) ? color : own;
    }
  }
  return { w, h, pixels };
}
export function flipSprite(sprite: Sprite): Sprite {
  const { w, h } = sprite;
  const pixels = blankPixels(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {pixels[y * w + (w - 1 - x)] = sprite.pixels[y * w + x] ?? null;}
  }
  return { w, h, pixels };
}
export function drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite, at: Point, px = 1): void {
  for (let cy = 0; cy < sprite.h; cy++) {
    for (let cx = 0; cx < sprite.w; cx++) {
      const color = sprite.pixels[cy * sprite.w + cx];
      if (!color) {continue;}
      ctx.fillStyle = color;
      ctx.fillRect(at.x + cx * px, at.y + cy * px, px, px);
    }
  }
}
