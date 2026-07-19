// background.ts — Tron-style receding floor grid, drawn BEHIND the world.
//
// createGrid({ color, horizon, spacing, scroll }) renders a perspective ground
// plane: horizontal lines that compress toward a horizon and (optionally)
// scroll toward the viewer, plus vertical lines fanning out from a vanishing
// point. Palette-indexed geometry — pass a palette hex string as `color`.
//
// Rules baked in (graphics-uplift spec, WS2):
// - GENRE-GATED, single depth metaphor: a scrolling grid belongs to
//   scrolling/endless genres; fixed-arena games use scroll: 0 (static). Never
//   combine a receding ground-grid with a deep-space starfield.
// - CONTRAST: the grid is a static surface — every actor that overlaps it must
//   keep contrast(actor, gridColor) >= 3.0 (palette.ts contrast()). Lines are
//   drawn FLAT with no emphasized intersection nodes, so a crossing can never
//   become a point-like false target brighter than the line itself.
// - INTEGER-LOGICAL-STEP SCROLL is the default: 1-logical-px lines quantized
//   to whole logical pixels — pixel-pure, frame-stable, matching the engine's
//   pixel identity. A device-space pass (smooth sub-logical-px line placement
//   for dense receding lines) is an EXPLICIT opt-in (`deviceSpace: true` +
//   pass the pixel-canvas scale to render()); it composes with juice's shake
//   translate via a RELATIVE ctx.scale inside the shake window — never
//   setTransform, which would discard the shake. The grid shakes fully with
//   the world (one rigid scene; no parallax damping on shake).
// - PAUSED / reduced-motion: call setPaused(true) on entering PAUSED — scroll
//   freezes so "paused" reads as paused. The shared reduced-motion damper
//   (defaults to prefers-reduced-motion at startup, overridable) slows the
//   ambient scroll to 25% — dampened, not zeroed (it is decorative, not a
//   gameplay telegraph).
//
// Draw order: pc.clear(bg) -> juice.preRender -> grid.render -> world ->
// juice.postRender -> crt.render. The grid is a NEW module — games that never
// call createGrid render byte-identically to today.

export interface GridOptions {
  /** Logical canvas width in px. */
  width: number;
  /** Logical canvas height in px. */
  height: number;
  /** Grid line color — a palette hex string (see contrast rule above). */
  color: string;
  /** Logical y of the horizon (vanishing) line. Lines draw from here down. */
  horizon: number;
  /** Line spacing at the bottom edge, logical px (perspective compresses it toward the horizon). */
  spacing: number;
  /** Scroll speed toward the viewer, logical px/s at the bottom edge. 0 = static (fixed-arena). */
  scroll: number;
  /** Vertical (converging) line count across the full width (default 9). 0 = horizontals only. */
  verticals?: number;
  /**
   * EXPLICIT opt-in: draw in device space for smooth sub-logical-px line
   * placement near the horizon. Requires passing the pixel-canvas `scale` to
   * render(). Uses a relative ctx.scale inside the shake window so juice's
   * shake translate still applies (never setTransform).
   */
  deviceSpace?: boolean;
  /**
   * Reduced-motion damper override. Defaults to
   * matchMedia('(prefers-reduced-motion: reduce)') at creation time.
   */
  reducedMotion?: boolean;
}

export interface Grid {
  /** Advance the scroll phase. Call every frame (it self-freezes on pause). */
  update(dt: number): void;
  /**
   * Draw the grid (call between juice.preRender and the world pass). For the
   * deviceSpace opt-in, pass the pixel canvas `scale`; ignored otherwise.
   */
  render(ctx: CanvasRenderingContext2D, scale?: number): void;
  /** Freeze (true) / resume (false) the ambient scroll — call on PAUSED. */
  setPaused(paused: boolean): void;
  /** Flip the reduced-motion damper at runtime (settings toggle). */
  setReducedMotion(reduced: boolean): void;
}

/** Damper factor applied to ambient grid scroll under reduced motion. */
const REDUCED_MOTION_SCROLL_FACTOR = 0.25;

export function createGrid(opts: GridOptions): Grid {
  const { width, height, color, horizon, spacing, scroll } = opts;
  const verticals = opts.verticals ?? 9;
  const deviceSpace = opts.deviceSpace ?? false;
  let reduced =
    opts.reducedMotion ??
    (typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches);
  let paused = false;

  const depth = Math.max(1, height - horizon); // logical px from horizon to bottom
  // Number of horizontal lines: enough that the bottom-most gap ~= spacing.
  const lineCount = Math.max(3, Math.ceil((2 * depth) / Math.max(1, spacing)));
  // Scroll phase in [0,1) — one unit = one line advancing into the next slot.
  let phase = 0;

  /** Perspective map: t in [0,1] (0 = horizon, 1 = bottom) -> logical y. */
  const yAt = (t: number): number => horizon + depth * t * t;

  function drawLines(
    ctx: CanvasRenderingContext2D,
    q: (v: number) => number, // coordinate quantizer (round in logical space, identity in device space)
    s: number, // coordinate multiplier (1 logical, scale for device space)
  ): void {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = s; // 1 logical px in either space

    // Horizontal receding lines. All lines share one flat color/alpha — no
    // emphasized crossings (intersection brightness == line brightness).
    for (let i = 0; i < lineCount; i++) {
      const t = (i + phase) / lineCount;
      if (t > 1) continue;
      const y = q(yAt(t) * s);
      ctx.fillRect(0, y, width * s, s);
    }
    // Horizon line itself (static).
    ctx.fillRect(0, q(horizon * s), width * s, s);

    // Vertical converging lines: fan from the vanishing point at (cx, horizon)
    // to evenly spaced bottom-edge anchors. Static (they don't scroll).
    if (verticals > 0) {
      const cx = width / 2;
      ctx.beginPath();
      for (let j = 0; j < verticals; j++) {
        const bx = ((j + 0.5) / verticals) * width * 2 - width / 2; // overscan so edge lines exit the sides
        ctx.moveTo(q(cx * s) + 0.5, q(horizon * s) + 0.5);
        ctx.lineTo(q(bx * s) + 0.5, q(height * s) + 0.5);
      }
      ctx.stroke();
    }
  }

  return {
    update(dt) {
      if (paused || scroll === 0) return;
      const factor = reduced ? REDUCED_MOTION_SCROLL_FACTOR : 1;
      // Bottom-edge speed `scroll` px/s over a bottom gap of ~spacing px:
      phase += ((scroll * factor) / Math.max(1, spacing)) * dt;
      phase -= Math.floor(phase); // keep in [0,1)
    },
    render(ctx, scale = 1) {
      ctx.save();
      if (deviceSpace && scale > 1) {
        // RELATIVE scale — composes with the shake translate already on the
        // CTM (juice.preRender ran before us). Never setTransform here.
        ctx.scale(1 / scale, 1 / scale);
        drawLines(ctx, (v) => v, scale);
      } else {
        // Default: integer-logical-step — quantize to whole logical px.
        drawLines(ctx, Math.round, 1);
      }
      ctx.restore();
    },
    setPaused(p) {
      paused = p;
    },
    setReducedMotion(r) {
      reduced = r;
    },
  };
}
