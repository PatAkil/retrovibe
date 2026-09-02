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
  /**
   * 1-logical-px drop shadow under the glyphs, so text stays legible on any
   * ground. `true` uses SHADOW_COLOR, a string uses that color, `false` opts
   * out. Low-level drawText defaults to OFF (callers opt in); drawTextCentered
   * turns it ON for scale >= 2, and the ui.ts HUD helpers turn it on always.
   */
  shadow?: boolean | string;
  /**
   * 1-logical-px dark keyline all the way around the glyphs — a stronger
   * separation than `shadow` for headline words that sit on a live scene.
   * `true` uses SHADOW_COLOR, a string uses that color. drawTextCentered turns
   * it ON for scale >= 2; pass `false` to opt out. When set, it replaces the
   * offset shadow (the two together read as a smear).
   */
  outline?: boolean | string;
}

/** Default drop-shadow / outline color for bitmap text. */
export const SHADOW_COLOR = 'rgba(0,0,0,0.7)';

/** Default keyline color for outlined text (opaque — see drawText). */
export const OUTLINE_COLOR = '#000000';

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
  const advance = (GLYPH_W + spacing) * scale;
  const upper = text.toUpperCase();

  // Backing pass: an outline (keyline all round) if asked for, otherwise a
  // shadow one LOGICAL pixel down-right whatever the scale — so it lifts the
  // word off the ground without thickening the 3x5 glyphs at scale 1.
  const outline = opts.outline;
  const shadow = opts.shadow;
  const offsets: Array<[number, number]> = outline
    ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
    : shadow
      ? [[1, 1]]
      : [];
  if (offsets.length > 0) {
    // The outline overlaps itself at the corners, so its default must be
    // OPAQUE — a translucent one would mottle where the passes stack.
    const back = outline ?? shadow;
    ctx.fillStyle = typeof back === 'string' ? back : outline ? OUTLINE_COLOR : SHADOW_COLOR;
    for (const [ox, oy] of offsets) {
      let sc = x + ox;
      for (const raw of upper) {
        const glyph = FONT[raw];
        if (glyph) {
          for (let gy = 0; gy < GLYPH_H; gy++) {
            const row = glyph[gy];
            for (let gx = 0; gx < GLYPH_W; gx++) {
              if (row[gx] === '#') ctx.fillRect(sc + gx * scale, y + oy + gy * scale, scale, scale);
            }
          }
        }
        sc += advance;
      }
    }
  }

  ctx.fillStyle = color;
  let cursor = x;
  for (const raw of upper) {
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

/**
 * Draw text horizontally centered within [0, areaWidth]. Large text (scale >= 2
 * — titles, GAME OVER, YOU WIN) gets a drop shadow by DEFAULT so headline words
 * read against whatever the live scene leaves behind them; pass
 * `{ shadow: false }` to opt out.
 */
export function drawTextCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  areaWidth: number,
  y: number,
  opts: TextOptions = {},
): void {
  const scale = opts.scale ?? 1;
  const w = textWidth(text, scale, opts.spacing ?? 1);
  const outline = opts.outline ?? (opts.shadow === undefined && scale >= 2);
  drawText(ctx, text, Math.round((areaWidth - w) / 2), y, { ...opts, outline });
}

/** Blink factor in [0,1]: 1 for `onRatio` of each `period`, else 0. */
export function blink(time: number, period = 0.9, onRatio = 0.6): number {
  const phase = ((time % period) + period) % period;
  return phase < period * onRatio ? 1 : 0;
}

/** Smooth 0..1 pulse (sine), for breathing prompts and highlights. */
export function pulse(time: number, period = 1.2): number {
  return 0.5 - 0.5 * Math.cos((time / period) * Math.PI * 2);
}
