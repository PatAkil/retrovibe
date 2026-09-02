// draw.ts — pixel-scaled rendering, ASCII-art sprite maps, and retro bitmap text
// (a 3x5 font with 5-wide M/W).
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

export interface MakeSpriteOptions {
  /**
   * Bake a 1-cell keyline of this color around every opaque cell (8-neighbour).
   * The sprite GROWS by one cell on each side (w+2, h+2), so a hitbox derived
   * from the sprite must use the INNER size (w-2, h-2) — or skip this option and
   * author the outline directly into the rows, which keeps w/h as written.
   *   makeSprite(SHIP, { '#': PAL[12] }, { outline: PAL[1] })  // 5x4 -> 7x6
   */
  outline?: string;
  /** Bake a horizontally mirrored copy (same as flipSprite, one step earlier). */
  flipX?: boolean;
}

/**
 * Build a sprite from ASCII-art rows. Any char not in `map` (and '.' / ' ')
 * is transparent.
 *   makeSprite(['.#.', '###', '#.#'], { '#': '#fff' })
 */
export function makeSprite(rows: string[], map: SpriteMap, opts: MakeSpriteOptions = {}): Sprite {
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
  let sprite: Sprite = { w, h, pixels };
  if (opts.outline) sprite = outlineSprite(sprite, opts.outline);
  if (opts.flipX) sprite = flipSprite(sprite);
  return sprite;
}

/**
 * WHY: a 1-px dark keyline is what separates a pixel actor from a busy ground —
 * baked once at setup, it costs nothing per frame. Grows the sprite by one cell
 * on every side.
 */
function outlineSprite(sprite: Sprite, color: string): Sprite {
  const w = sprite.w + 2;
  const h = sprite.h + 2;
  const pixels: (string | null)[] = new Array(w * h).fill(null);
  // Inner copy first, then fill any transparent cell touching an opaque one.
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) {
      pixels[(y + 1) * w + (x + 1)] = sprite.pixels[y * sprite.w + x];
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pixels[y * w + x]) continue;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx - 1;
          const ny = y + dy - 1;
          if (nx < 0 || ny < 0 || nx >= sprite.w || ny >= sprite.h) continue;
          if (sprite.pixels[ny * sprite.w + nx]) { touches = true; break; }
        }
      }
      if (touches) pixels[y * w + x] = color;
    }
  }
  return { w, h, pixels };
}

/**
 * WHY: facing left is a different sprite, not a per-frame transform — mirror
 * once at setup and pick the right Sprite when drawing. NEVER call per frame.
 *   const shipLeft = flipSprite(shipRight);
 */
export function flipSprite(sprite: Sprite): Sprite {
  const { w, h } = sprite;
  const pixels: (string | null)[] = new Array(w * h).fill(null);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) pixels[y * w + (w - 1 - x)] = sprite.pixels[y * w + x];
  }
  return { w, h, pixels };
}

/**
 * WHY: animation is just choosing which Sprite to draw — this turns the game
 * clock into that choice in one line, like blink/pulse. Returns 0..count-1.
 *   drawSprite(ctx, walkFrames[frameIndex(time, 8, walkFrames.length)], x, y);
 */
export function frameIndex(time: number, fps: number, count: number): number {
  if (count <= 1 || fps <= 0) return 0;
  // A NaN/Infinity clock (an uninitialised timer, a division by zero upstream)
  // would make Math.floor return NaN and index the frame array with undefined.
  if (!Number.isFinite(time)) return 0;
  const i = Math.floor(time * fps) % count;
  return i < 0 ? i + count : i;
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

// --- Bitmap text (3x5 font, with 5-wide M/W) --------------------------------
//
// The font is MOSTLY fixed-width: every glyph is 3 font-px wide except M and W,
// which are 5. In a 3-wide cell M and W cannot be drawn unambiguously — the
// diagonals collapse and readers see 'YOU YIN', 'ARROVS', 'GAHE OVER'. So the
// text routines advance PER GLYPH (glyph width + spacing) instead of by a fixed
// 3, which makes the font proportional in general; only strings containing M or
// W measure any differently than before.

const GLYPH_W = 3;
const GLYPH_H = 5;

/** Width of one glyph in font px (its row length); GLYPH_W for unknown chars. */
function glyphWidth(glyph: string[] | undefined): number {
  return glyph ? glyph[0].length : GLYPH_W;
}

// Each glyph is 5 rows of '#' = on / '.' = off. Rows within a glyph must all be
// the same length; that length is the glyph's width. Missing chars render blank
// (advancing GLYPH_W).
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
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], // 5 wide: a 3-wide M is indistinguishable from H/N
  N: ['###', '#.#', '#.#', '#.#', '#.#'], // flat-top N: distinct from M (filled middle rows), H (bar) and the old zigzag that read as K/X
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['###', '#.#', '###', '#..', '#..'],
  Q: ['###', '#.#', '#.#', '###', '..#'],
  R: ['###', '#.#', '###', '##.', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], // curved S: no longer byte-identical to the digit 5
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], // 5 wide: the inverted M; a 3-wide W read as H or V
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
   *
   * Only honoured at font scale >= 3. At smaller scales the keyline would close
   * the glyph counters, so it quietly degrades to the 1-px drop shadow — asking
   * for an outline is always safe, it just may render as a shadow.
   */
  outline?: boolean | string;
}

/**
 * Backing-pass offsets, hoisted to module constants: drawText runs on every
 * frame, and these arrays never vary, so allocating them per call was pure
 * garbage.
 */
const OUTLINE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1],
];
const SHADOW_OFFSETS: ReadonlyArray<readonly [number, number]> = [[1, 1]];
const NO_OFFSETS: ReadonlyArray<readonly [number, number]> = [];

/**
 * Smallest font scale at which the full 8-way keyline is safe. The 3x5 glyphs
 * have 1-font-px counters, so at scale 2 a counter is 2 logical px wide and a
 * 1-px keyline pressing in from BOTH sides closes it completely — A, O, 0, 8,
 * B, D, P and R turn into solid blobs. At scale 3 a counter is 3 px and one
 * pixel of hole survives, so the keyline reads as a keyline. Below the
 * threshold drawText silently falls back to the single drop shadow, which
 * separates the word from the ground without touching the counters.
 */
const OUTLINE_MIN_SCALE = 3;

/** Default drop-shadow / outline color for bitmap text. */
export const SHADOW_COLOR = 'rgba(0,0,0,0.7)';

/** Default keyline color for outlined text (opaque — see drawText). */
export const OUTLINE_COLOR = '#000000';

/** Width in logical px that drawText would occupy for `text`. */
export function textWidth(text: string, scale = 1, spacing = 1): number {
  const upper = text.toUpperCase();
  if (upper.length === 0) return 0;
  let w = 0;
  for (const raw of upper) w += (glyphWidth(FONT[raw]) + spacing) * scale;
  return w - spacing * scale;
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
  const upper = text.toUpperCase();

  // Backing pass: an outline (keyline all round) if asked for, otherwise a
  // shadow one LOGICAL pixel down-right whatever the scale — so it lifts the
  // word off the ground without thickening the 3x5 glyphs at scale 1.
  //
  // The full keyline is only applied from OUTLINE_MIN_SCALE up: at scale 2 it
  // would close the 1-font-px counters and turn A/O/0/8/B/D/P/R into blobs, so
  // a requested outline degrades to the single drop shadow there instead.
  const wantsOutline = opts.outline !== undefined && opts.outline !== false;
  const outline = wantsOutline && scale >= OUTLINE_MIN_SCALE ? opts.outline : undefined;
  // A demoted outline still wants SOME backing — fall through to the shadow,
  // using the caller's colour if they gave one.
  const shadow = outline === undefined && wantsOutline ? opts.outline : opts.shadow;
  const offsets = outline ? OUTLINE_OFFSETS : shadow ? SHADOW_OFFSETS : NO_OFFSETS;
  if (offsets.length > 0) {
    // The outline overlaps itself at the corners, so its default must be
    // OPAQUE — a translucent one would mottle where the passes stack.
    const back = outline ?? shadow;
    ctx.fillStyle = typeof back === 'string' ? back : outline ? OUTLINE_COLOR : SHADOW_COLOR;
    for (const [ox, oy] of offsets) {
      let sc = x + ox;
      for (const raw of upper) {
        const glyph = FONT[raw];
        const gw = glyphWidth(glyph);
        if (glyph) {
          for (let gy = 0; gy < GLYPH_H; gy++) {
            const row = glyph[gy];
            for (let gx = 0; gx < gw; gx++) {
              if (row[gx] === '#') ctx.fillRect(sc + gx * scale, y + oy + gy * scale, scale, scale);
            }
          }
        }
        sc += (gw + spacing) * scale;
      }
    }
  }

  ctx.fillStyle = color;
  let cursor = x;
  for (const raw of upper) {
    const glyph = FONT[raw];
    const gw = glyphWidth(glyph);
    if (glyph) {
      for (let gy = 0; gy < GLYPH_H; gy++) {
        const row = glyph[gy];
        for (let gx = 0; gx < gw; gx++) {
          if (row[gx] === '#') {
            ctx.fillRect(cursor + gx * scale, y + gy * scale, scale, scale);
          }
        }
      }
    }
    cursor += (gw + spacing) * scale;
  }
}

/**
 * Draw text horizontally centered within [0, areaWidth]. Large text (scale >= 2
 * — titles, GAME OVER, YOU WIN) gets a backing pass by DEFAULT so headline words
 * read against whatever the live scene leaves behind them: a full keyline at
 * scale >= 3, and a drop shadow at scale 2 where a keyline would close the
 * counters (see OUTLINE_MIN_SCALE). Pass `{ shadow: false }` to opt out.
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

// --- Surfaces ---------------------------------------------------------------
//
// Cheap, opt-in background/slab helpers. All coordinates are LOGICAL pixels and
// every edge is rounded to the pixel grid, so nothing half-covers a pixel and
// no seams appear between adjacent calls. Nothing here allocates per frame
// (the dither patterns are built once and cached).

/**
 * WHY: a flat background is the single loudest "this is a mockup" tell; three
 * or four horizontal bands read instantly as a retro sky, water or cave wall.
 * Band heights split evenly; the LAST band absorbs the remainder so the fill is
 * exactly h tall with no gap.
 *   fillBands(ctx, 0, 0, W, 90, [PAL[1], PAL[13], PAL[12]]);
 */
export function fillBands(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: string[],
): void {
  const n = colors.length;
  if (n === 0 || w <= 0 || h <= 0) return;
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const wi = Math.round(w);
  const hi = Math.round(h);
  const band = Math.floor(hi / n);
  let cy = y0;
  for (let i = 0; i < n; i++) {
    const bh = i === n - 1 ? y0 + hi - cy : band;
    if (bh <= 0) continue;
    ctx.fillStyle = colors[i];
    ctx.fillRect(x0, cy, wi, bh);
    cy += bh;
  }
}

export type DitherPattern = 'checker' | 'sparse';

/**
 * 4x4 ordered (Bayer) dither tiles, built once per (colorA, colorB, pattern)
 * and cached — a CanvasPattern is immutable, so reusing it is free and the hot
 * path allocates nothing. The cache is tiny by construction (a game has a
 * handful of pairs).
 *
 * WHY 4x4 and not 2x2: a 2x2 checker has CONSTANT parity per row, and the CRT
 * scanline pass runs on a 2-logical-px pitch — the two lock together and the
 * dither resolves into 2-px bands instead of averaging into a third tone. A 4x4
 * ordered cell breaks that phase lock: no row repeats at the scanline period,
 * so alternating rows are never uniformly lit or uniformly dimmed.
 *
 * Keyed per CONTEXT in a WeakMap: a CanvasPattern belongs to the context that
 * created it, so a second canvas must never be handed the first one's pattern.
 * The WeakMap lets a dead context and its patterns be collected together.
 */
const DITHER_CACHE = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

/** Classic 4x4 Bayer thresholds, 0..15. */
const BAYER_4: ReadonlyArray<number> = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

function ditherPattern(
  ctx: CanvasRenderingContext2D,
  colorA: string,
  colorB: string,
  pattern: DitherPattern,
): CanvasPattern | null {
  let perCtx = DITHER_CACHE.get(ctx);
  if (!perCtx) {
    perCtx = new Map<string, CanvasPattern>();
    DITHER_CACHE.set(ctx, perCtx);
  }
  const key = `${colorA}|${colorB}|${pattern}`;
  const hit = perCtx.get(key);
  if (hit) return hit;
  const tile = document.createElement('canvas');
  tile.width = 4;
  tile.height = 4;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;
  tctx.fillStyle = colorA;
  tctx.fillRect(0, 0, 4, 4);
  tctx.fillStyle = colorB;
  // 'checker' = 50 % coverage (thresholds 0-7), 'sparse' = 25 % (0-3).
  const cutoff = pattern === 'sparse' ? 4 : 8;
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      if (BAYER_4[ty * 4 + tx] < cutoff) tctx.fillRect(tx, ty, 1, 1);
    }
  }
  const made = ctx.createPattern(tile, 'repeat');
  if (!made) return null;
  perCtx.set(key, made);
  return made;
}

/**
 * WHY: two palette colors dithered together give a THIRD tone without leaving
 * the palette — the classic way to get a gradient or a ground texture on 16
 * colors. The 4x4 ordered tile is anchored to the logical pixel grid (the
 * pattern lives in the canvas's baked logical space) and its rows do not repeat
 * at the CRT's 2-px scanline pitch, so a static field averages instead of
 * banding. It is still a PATTERN, not a solid: keep it to seams, edges and
 * out-of-play strips — tiled under fast actors it beats against their motion.
 *   fillDither(ctx, 0, 96, W, H - 96, PAL[3], PAL[11], 'sparse');
 */
export function fillDither(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colorA: string,
  colorB: string,
  pattern: DitherPattern = 'checker',
): void {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const wi = Math.round(w);
  const hi = Math.round(h);
  if (wi <= 0 || hi <= 0) return;
  const pat = ditherPattern(ctx, colorA, colorB, pattern);
  if (!pat) {
    ctx.fillStyle = colorA;
    ctx.fillRect(x0, y0, wi, hi);
    return;
  }
  // save/restore so the pattern never leaks into the caller's next fill — a
  // CanvasPattern left in fillStyle silently textures whatever is drawn next.
  ctx.save();
  ctx.fillStyle = pat;
  ctx.fillRect(x0, y0, wi, hi);
  ctx.restore();
}

/**
 * WHY: a flat rectangle is a rectangle; the same rectangle with a 1-px light
 * top/left and dark bottom/right edge is a BRICK, a platform, a panel. Two
 * extra fills, no state to keep.
 *   drawBevel(ctx, p.x, p.y, p.w, p.h, PAL[4], PAL[15], PAL[2]);
 */
export function drawBevel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  light: string,
  dark: string,
): void {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const wi = Math.round(w);
  const hi = Math.round(h);
  if (wi <= 0 || hi <= 0) return;
  ctx.fillStyle = fill;
  ctx.fillRect(x0, y0, wi, hi);
  ctx.fillStyle = light;
  ctx.fillRect(x0, y0, wi, 1);
  ctx.fillRect(x0, y0, 1, hi);
  ctx.fillStyle = dark;
  ctx.fillRect(x0, y0 + hi - 1, wi, 1);
  ctx.fillRect(x0 + wi - 1, y0, 1, hi);
}

/**
 * WHY: arena edges, window frames and selection boxes are all the same hollow
 * rectangle, and stroke() at a baked scale lands on half-pixels. This is four
 * fillRects, always on the grid.
 *   drawFrame(ctx, 4, 4, W - 8, H - 8, PAL[5], 2);
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  thickness = 1,
): void {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const wi = Math.round(w);
  const hi = Math.round(h);
  const t = Math.max(1, Math.round(thickness));
  if (wi <= 0 || hi <= 0) return;
  ctx.fillStyle = color;
  const tv = Math.min(t, hi);
  const th = Math.min(t, wi);
  ctx.fillRect(x0, y0, wi, tv);
  ctx.fillRect(x0, y0 + hi - tv, wi, tv);
  ctx.fillRect(x0, y0 + tv, th, Math.max(0, hi - 2 * tv));
  ctx.fillRect(x0 + wi - th, y0 + tv, th, Math.max(0, hi - 2 * tv));
}

// --- Title treatment --------------------------------------------------------

export interface LogoOptions {
  /**
   * Lit color for the TOP 3 of the 5 font rows. REQUIRED, and taken from the
   * game's palette — a hard-coded default would be the one place a title screen
   * leaves the palette.
   */
  color: string;
  /** Body color for the whole word — the shaded lower half (defaults to `color`). */
  shade?: string;
  /** Offset shadow color under the word (default OUTLINE_COLOR, opaque black). */
  shadow?: string;
  /** Font pixel size in logical px (default 3). */
  scale?: number;
  /** Gap between glyphs in font pixels (default 1). */
  spacing?: number;
  /** Shadow offset in logical px (default 1). */
  shadowOffset?: number;
}

/**
 * WHY: an arcade title is never one flat color — it is lit from above. This is
 * the whole treatment in one call: an offset shadow, the word in `shade`, then
 * the top 3 of the 5 font rows re-drawn in `color` behind a single clip, so the
 * letters read as metal catching the light. One save/restore per call; the
 * per-glyph outline is off inside (the logo carries its own shadow).
 *
 * `color` is REQUIRED; `shade` defaults to `color` (a flat but on-palette
 * wordmark) and `shadow` to OUTLINE_COLOR. There are no palette-specific
 * literals here — a PICO8 default would put an off-palette hue on every
 * SUNSET/OCEAN/GAMEBOY title screen.
 *   drawLogo(ctx, 'STAR DRIFT', W, 34, { color: PAL[10], shade: PAL[9] });
 */
export function drawLogo(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerWidth: number,
  y: number,
  opts: LogoOptions,
): void {
  if (!opts || !opts.color) {
    throw new Error(
      'drawLogo: opts.color is required and must come from the game palette, e.g. { color: PAL[10], shade: PAL[9] }',
    );
  }
  const scale = opts.scale ?? 3;
  const spacing = opts.spacing ?? 1;
  const color = opts.color;
  const shade = opts.shade ?? color;
  const shadow = opts.shadow ?? OUTLINE_COLOR;
  const off = opts.shadowOffset ?? 1;
  const w = textWidth(text, scale, spacing);
  const x = Math.round((centerWidth - w) / 2);
  const yi = Math.round(y);
  const base = { scale, spacing, shadow: false as const, outline: false as const };

  drawText(ctx, text, x + off, yi + off, { ...base, color: shadow });
  drawText(ctx, text, x, yi, { ...base, color: shade });
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - off, yi, w + 2 * off, 3 * scale);
  ctx.clip();
  drawText(ctx, text, x, yi, { ...base, color });
  ctx.restore();
}
