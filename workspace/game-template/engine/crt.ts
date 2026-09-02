// crt.ts — retro screen filter: phosphor glass over the finished frame.
// Draw it LAST, over the finished frame (after juice.postRender).
//
// The pass is four cheap layers, in order:
//   1. Halation — the frame drawn back onto itself, offset ±1 device px, with
//      'lighter' at low alpha. Bright sprites bleed sideways like a real tube.
//   2. Phosphor lift — a faint additive blue-grey so a pure-black ground reads
//      as a LIT tube rather than a hole. Without it the scanlines below have
//      nothing to modulate and the glass is invisible on black games.
//   3. Scanlines — 'multiply' with a mid grey, not an opaque black bar. Every
//      row is scaled toward its own hue instead of dragged toward black, so a
//      mid-luminance field (navy, a red flash) shades instead of banding into
//      hard corduroy stripes.
//   4. Vignette + flicker — a rounder, softer, slightly-blue edge falloff.
//
// No getImageData, no ctx.filter; the gradient is built once and cached.

export interface Crt {
  /** Overlay the CRT effect on the current frame. dt drives the flicker. */
  render(ctx: CanvasRenderingContext2D, width: number, height: number, dt: number): void;
}

export interface CrtOptions {
  /** Depth of the scanline modulation (default 0.12). 0 disables. */
  scanlineAlpha?: number;
  /** Strength of the edge vignette (default 0.35). */
  vignetteAlpha?: number;
  /** Peak extra flicker alpha (default 0.03). 0 disables. */
  flicker?: number;
}

/** Additive phosphor floor: what an "unlit but powered" tube reads as. */
const PHOSPHOR_LIFT = 'rgb(15,17,28)';
/** Per-side halation alpha (two draws, so the total added bloom is 2x this). */
const HALATION_ALPHA = 0.09;

export function createCrt(opts: CrtOptions = {}): Crt {
  const scanlineAlpha = opts.scanlineAlpha ?? 0.12;
  const vignetteAlpha = opts.vignetteAlpha ?? 0.35;
  const flickerPeak = opts.flicker ?? 0.03;

  // Scanlines multiply toward this grey rather than toward black: a bright row
  // loses a proportion of its value, a dark row barely moves, and hue is kept.
  const scanGrey = Math.max(0, Math.round(255 * (1 - scanlineAlpha)));
  const scanFill = `rgb(${scanGrey},${scanGrey},${scanGrey})`;

  let clock = 0;
  // Cached vignette — rebuilt only if the logical size ever changes.
  let grad: CanvasGradient | null = null;
  let gradW = -1;
  let gradH = -1;

  function vignette(ctx: CanvasRenderingContext2D, width: number, height: number): CanvasGradient {
    if (grad && gradW === width && gradH === height) return grad;
    const cx = width / 2;
    const cy = height / 2;
    const outer = Math.max(width, height) * 0.86;
    const g = ctx.createRadialGradient(cx, cy, outer * 0.42, cx, cy, outer);
    g.addColorStop(0, 'rgba(4,6,14,0)');
    // A midpoint stop keeps the falloff round and soft instead of a hard ring.
    g.addColorStop(0.62, `rgba(4,6,14,${(vignetteAlpha * 0.3).toFixed(4)})`);
    g.addColorStop(1, `rgba(4,6,14,${vignetteAlpha.toFixed(4)})`);
    grad = g;
    gradW = width;
    gradH = height;
    return g;
  }

  return {
    render(ctx, width, height, dt) {
      clock += dt;
      const canvas = ctx.canvas;

      // 1. Halation — copy the frame back over itself, ±1 DEVICE px sideways.
      //    Done in device space (identity transform) so the offset stays a
      //    single physical pixel at any pixel scale: a glow, not a ghost.
      if (HALATION_ALPHA > 0 && canvas.width > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = HALATION_ALPHA;
        const dw = canvas.width;
        const dh = canvas.height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        // Left-shifted copy, edge-clamped: the last column samples itself, so
        // no device column is left with one copy instead of two (a 1-px seam).
        ctx.drawImage(canvas, 1, 0, dw - 1, dh, 0, 0, dw - 1, dh);
        ctx.drawImage(canvas, dw - 1, 0, 1, dh, dw - 1, 0, 1, dh);
        // Right-shifted copy, edge-clamped at x = 0.
        ctx.drawImage(canvas, 0, 0, dw - 1, dh, 1, 0, dw - 1, dh);
        ctx.drawImage(canvas, 0, 0, 1, dh, 0, 0, 1, dh);
        ctx.restore();
      }

      // 2. Phosphor lift — black grounds become a lit tube.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = PHOSPHOR_LIFT;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      // 3. Scanlines — multiplicative, 2-logical-px period preserved.
      if (scanlineAlpha > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = scanFill;
        for (let y = 0; y < height; y += 2) {
          ctx.fillRect(0, y, width, 1);
        }
        ctx.restore();
      }

      // 4. Vignette: darken toward the edges.
      ctx.fillStyle = vignette(ctx, width, height);
      ctx.fillRect(0, 0, width, height);

      // Flicker: a faint time-varying wash.
      if (flickerPeak > 0) {
        const a = flickerPeak * (0.5 + 0.5 * Math.sin(clock * 40));
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(0, 0, width, height);
      }
    },
  };
}
