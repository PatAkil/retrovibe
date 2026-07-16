// draw.ts — pixel-scaled rendering, ASCII-art sprite maps, and retro bitmap text.
//
// createPixelCanvas() owns the <canvas>: it sizes the backing store to
// logical*scale, disables smoothing, and bakes a scale transform so ALL drawing
// happens in logical (pre-scale) pixel units. juice.ts layers extra transforms
// with save/restore on top of this base.

export interface PixelCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Logical (pre-scale) width in pixels — the coordinate space you draw in. */
  readonly width: number;
  /** Logical (pre-scale) height in pixels. */
  readonly height: number;
  readonly scale: number;
  /** Fill the whole logical area (call at the start of each frame). */
  clear(color?: string): void;
}

export interface CreatePixelCanvasOptions {
  width: number;
  height: number;
  scale?: number;
  /**
   * Element to append the canvas to. Omit for document.body. An EXPLICIT null
   * (e.g. a failed getElementById) throws — a missing mount point must fail
   * loudly so the smoke gate catches it, never silently mount elsewhere.
   */
  parent?: HTMLElement | null;
}

export function createPixelCanvas(opts: CreatePixelCanvasOptions): PixelCanvas {
  if (opts.parent === null) {
    throw new Error(
      'createPixelCanvas: parent is null — mount point not found (check the id passed to getElementById against index.html)',
    );
  }
  const { width, height } = opts;
  const scale = opts.scale ?? 3;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  // Bake the scale so every draw call works in logical pixels.
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  (opts.parent ?? document.body).appendChild(canvas);

  return {
    canvas,
    ctx,
    width,
    height,
    scale,
    clear(color = '#000000') {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
    },
  };
}

// --- Sprites ----------------------------------------------------------------

export type SpriteMap = Record<string, string>;

export interface Sprite {
  readonly w: number;
  readonly h: number;
  /** Row-major cells; null = transparent. */
  readonly pixels: ReadonlyArray<string | null>;
}

/**
 * Build a sprite from ASCII-art rows. Any char not in `map` (and '.' / ' ')
 * is transparent.
 *   makeSprite(['.#.', '###', '#.#'], { '#': '#fff' })
 */
export function makeSprite(rows: string[], map: SpriteMap): Sprite {
  const h = rows.length;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const pixels: (string | null)[] = [];
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      pixels.push(ch !== undefined && ch !== '.' && ch !== ' ' && map[ch] ? map[ch] : null);
    }
  }
  return { w, h, pixels };
}

/** Draw a sprite at logical (x,y). `px` = size of each sprite cell (default 1). */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  px = 1,
): void {
  for (let cy = 0; cy < sprite.h; cy++) {
    for (let cx = 0; cx < sprite.w; cx++) {
      const color = sprite.pixels[cy * sprite.w + cx];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + cx * px, y + cy * px, px, px);
    }
  }
}

// --- Bitmap text (3x5 font) -------------------------------------------------

const GLYPH_W = 3;
const GLYPH_H = 5;

// Each glyph is 5 rows of 3 chars; '#' = on. Missing chars render blank.
const FONT: Record<string, string[]> = {
  A: ['###', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['###', '#..', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['###', '#..', '#.#', '#.#', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '###'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['#.#', '##.', '#.#', '.##', '#.#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['###', '#.#', '###', '#..', '#..'],
  Q: ['###', '#.#', '#.#', '###', '..#'],
  R: ['###', '#.#', '###', '##.', '#.#'],
  S: ['###', '#..', '###', '..#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  ' ': ['...', '...', '...', '...', '...'],
  '.': ['...', '...', '...', '...', '.#.'],
  ',': ['...', '...', '...', '.#.', '#..'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  '?': ['###', '..#', '.#.', '...', '.#.'],
  '-': ['...', '...', '###', '...', '...'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '=': ['...', '###', '...', '###', '...'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  "'": ['.#.', '.#.', '...', '...', '...'],
  '(': ['.#.', '#..', '#..', '#..', '.#.'],
  ')': ['.#.', '..#', '..#', '..#', '.#.'],
  '<': ['..#', '.#.', '#..', '.#.', '..#'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  '*': ['...', '#.#', '.#.', '#.#', '...'],
  '#': ['#.#', '###', '#.#', '###', '#.#'],
};

export interface TextOptions {
  color?: string;
  /** Size of each font pixel in logical px (default 1). */
  scale?: number;
  /** Gap between glyphs in font pixels (default 1). */
  spacing?: number;
}

/** Width in logical px that drawText would occupy for `text`. */
export function textWidth(text: string, scale = 1, spacing = 1): number {
  if (text.length === 0) return 0;
  return text.length * (GLYPH_W + spacing) * scale - spacing * scale;
}

/** Draw retro bitmap text at logical (x,y) = top-left. Uppercases input. */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: TextOptions = {},
): void {
  const color = opts.color ?? '#FFF1E8';
  const scale = opts.scale ?? 1;
  const spacing = opts.spacing ?? 1;
  ctx.fillStyle = color;
  const advance = (GLYPH_W + spacing) * scale;
  let cursor = x;
  for (const raw of text.toUpperCase()) {
    const glyph = FONT[raw];
    if (glyph) {
      for (let gy = 0; gy < GLYPH_H; gy++) {
        const row = glyph[gy];
        for (let gx = 0; gx < GLYPH_W; gx++) {
          if (row[gx] === '#') {
            ctx.fillRect(cursor + gx * scale, y + gy * scale, scale, scale);
          }
        }
      }
    }
    cursor += advance;
  }
}

/** Draw text horizontally centered within [0, areaWidth]. */
export function drawTextCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  areaWidth: number,
  y: number,
  opts: TextOptions = {},
): void {
  const w = textWidth(text, opts.scale ?? 1, opts.spacing ?? 1);
  drawText(ctx, text, Math.round((areaWidth - w) / 2), y, opts);
}
