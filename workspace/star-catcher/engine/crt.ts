// crt.ts — retro screen filter: scanlines + vignette + subtle flicker.
// Draw it LAST, over the finished frame (after juice.postRender).

export interface Crt {
  /** Overlay the CRT effect on the current frame. dt drives the flicker. */
  render(ctx: CanvasRenderingContext2D, width: number, height: number, dt: number): void;
}

export interface CrtOptions {
  /** Darkness of each scanline (default 0.18). */
  scanlineAlpha?: number;
  /** Strength of the edge vignette (default 0.35). */
  vignetteAlpha?: number;
  /** Peak extra flicker alpha (default 0.03). 0 disables. */
  flicker?: number;
}

export function createCrt(opts: CrtOptions = {}): Crt {
  const scanlineAlpha = opts.scanlineAlpha ?? 0.18;
  const vignetteAlpha = opts.vignetteAlpha ?? 0.35;
  const flickerPeak = opts.flicker ?? 0.03;
  let clock = 0;

  return {
    render(ctx, width, height, dt) {
      clock += dt;

      // Scanlines: darken every other logical row.
      ctx.fillStyle = `rgba(0,0,0,${scanlineAlpha})`;
      for (let y = 0; y < height; y += 2) {
        ctx.fillRect(0, y, width, 1);
      }

      // Vignette: darken toward the edges.
      const cx = width / 2;
      const cy = height / 2;
      const grad = ctx.createRadialGradient(cx, cy, Math.min(width, height) * 0.35, cx, cy, Math.max(width, height) * 0.72);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${vignetteAlpha})`);
      ctx.fillStyle = grad;
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
