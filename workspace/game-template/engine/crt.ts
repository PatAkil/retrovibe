// crt.ts — retro screen filter: phosphor glass over the finished frame.
// Draw it LAST, over the finished frame (after juice.postRender).
//
// The pass is four cheap layers, in order:
//   1. Halation — a SNAPSHOT of the finished frame drawn back over it, offset
//      -1 and +1 device px, with 'lighter' at low alpha. Bright sprites bleed
//      sideways like a real tube. The snapshot matters: drawing the live canvas
//      onto itself twice makes the second copy read pixels the first copy has
//      already brightened, so the glow comes out asymmetric and double-ghosted.
//      The offscreen is cached and re-created only when the device size changes.
//   2. Phosphor lift — a faint additive blue-grey so a pure-black ground reads
//      as a LIT tube rather than a hole. Without it the scanlines below have
//      nothing to modulate and the glass is invisible on black games.
//   3. Scanlines — 'multiply' with a mid grey, not an opaque black bar. Every
//      row is scaled toward its own hue instead of dragged toward black, so a
//      mid-luminance field (navy, a red flash) shades instead of banding into
//      hard corduroy stripes.
//   4. Vignette + flicker — a rounder, softer, slightly-blue edge falloff.
//
// Layers 1 and 2 are tunable per game via CrtOptions (`halation`, `lift`) and
// skipped entirely at 0 / ''. No getImageData, no ctx.filter; the gradient and
// the halation offscreen are built once and cached — zero per-frame allocation.

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
  /**
   * Per-side halation alpha — the sideways bloom off bright sprites (default
   * 0.09; the total added glow is 2x this, one copy per side). 0 disables the
   * layer, and with it the per-frame frame snapshot.
   */
  halation?: number;
  /**
   * Additive phosphor floor: the colour an "unlit but powered" tube reads as
   * (default 'rgb(15,17,28)'). Any CSS colour; '' disables the layer — for a
   * game on a bright ground that has no black to lift.
   */
  lift?: string;
}

/** Default additive phosphor floor: what an "unlit but powered" tube reads as. */
const PHOSPHOR_LIFT = 'rgb(15,17,28)';
/** Default per-side halation alpha (two draws, so the total bloom is 2x this). */
const HALATION_ALPHA = 0.09;

export function createCrt(opts: CrtOptions = {}): Crt {
  const scanlineAlpha = opts.scanlineAlpha ?? 0.09;
  const vignetteAlpha = opts.vignetteAlpha ?? 0.35;
  const flickerPeak = opts.flicker ?? 0.03;
  const halationAlpha = opts.halation ?? HALATION_ALPHA;
  const lift = opts.lift ?? PHOSPHOR_LIFT;

  // Scanlines multiply toward this grey rather than toward black: a bright row
  // loses a proportion of its value, a dark row barely moves, and hue is kept.
  const scanGrey = Math.max(0, Math.round(255 * (1 - scanlineAlpha)));
  const scanFill = `rgb(${scanGrey},${scanGrey},${scanGrey})`;

  let clock = 0;
  // Cached vignette — rebuilt only if the logical size ever changes.
  let grad: CanvasGradient | null = null;
  let gradW = -1;
  let gradH = -1;

  // Cached halation offscreen — one snapshot buffer for the life of the filter,
  // re-created only when the DEVICE size changes. Allocating per frame would
  // hand the GC a full-screen canvas 60 times a second.
  let snap: HTMLCanvasElement | null = null;
  let snapCtx: CanvasRenderingContext2D | null = null;

  function snapshot(source: HTMLCanvasElement): CanvasRenderingContext2D | null {
    if (!snap || snap.width !== source.width || snap.height !== source.height) {
      snap = document.createElement('canvas');
      snap.width = source.width;
      snap.height = source.height;
      snapCtx = snap.getContext('2d');
      if (snapCtx) snapCtx.imageSmoothingEnabled = false;
    }
    if (!snapCtx) return null;
    // Identity transform: the snapshot is a 1:1 device-pixel copy.
    snapCtx.setTransform(1, 0, 0, 1, 0, 0);
    snapCtx.globalCompositeOperation = 'copy';
    snapCtx.drawImage(source, 0, 0);
    snapCtx.globalCompositeOperation = 'source-over';
    return snapCtx;
  }

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
      if (halationAlpha > 0 && canvas.width > 0 && canvas.height > 0) {
        // Snapshot the CLEAN frame once. Both offsets then read the same
        // untouched source, so the left and right glows are exactly symmetric;
        // drawing the live canvas onto itself would feed pass 2 the output of
        // pass 1 and produce a lopsided double ghost.
        const src = snapshot(canvas);
        if (src) {
          const source = src.canvas;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = halationAlpha;
          const dw = canvas.width;
          const dh = canvas.height;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          // Left-shifted copy, edge-clamped: the last column samples itself, so
          // no device column is left with one copy instead of two (a 1-px seam).
          ctx.drawImage(source, 1, 0, dw - 1, dh, 0, 0, dw - 1, dh);
          ctx.drawImage(source, dw - 1, 0, 1, dh, dw - 1, 0, 1, dh);
          // Right-shifted copy, edge-clamped at x = 0 the same way.
          ctx.drawImage(source, 0, 0, dw - 1, dh, 1, 0, dw - 1, dh);
          ctx.drawImage(source, 0, 0, 1, dh, 0, 0, 1, dh);
          ctx.restore();
        }
      }

      // 2. Phosphor lift — black grounds become a lit tube.
      if (lift !== '') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = lift;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }

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

      // 4. Vignette + flicker. Wrapped in save/restore like every other layer,
      //    so crt.render leaves fillStyle (and the rest of the context state)
      //    exactly as the caller left it — the last layer must not be the one
      //    that quietly hands the next frame's first draw a grey gradient.
      ctx.save();
      // Vignette: darken toward the edges.
      ctx.fillStyle = vignette(ctx, width, height);
      ctx.fillRect(0, 0, width, height);

      // Flicker: a faint time-varying wash.
      if (flickerPeak > 0) {
        const a = flickerPeak * (0.5 + 0.5 * Math.sin(clock * 40));
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();
    },
  };
}
