// crt.ts — retro screen filter: scanlines + vignette + subtle flicker,
// plus (strictly opt-in, default-off) chromatic aberration.
// Draw it LAST, over the finished frame (after juice.postRender).
//
// Aberration model (WS4):
//   - Capped UNIFORM device-px channel split. Whole-device-px offsets only,
//     hard-capped at 1 device px so a 1px projectile's ghosts still overlap
//     its collision cell. Apparent position == hitbox.
//   - Steady and pulse are mutually exclusive per game: a whole-px offset
//     under a <~1px cap admits only 0 or 1, so a steady that quantizes to a
//     visible px (>= 0.5 before rounding) consumes the whole budget and
//     leaves pulse adding 0 visible px; a steady that rounds to 0 is no
//     steady at all and leaves pulses enabled.
//     Steady defaults to 0; crt.pulse(mag, durationSeconds) owns the single
//     0→1px transient with real wall-clock decay (performance.now). The
//     flicker clock stays on `clock += dt` — pulse is the only
//     performance.now consumer.
//   - Order inside render: aberration on the world/flash frame FIRST, then
//     the optional drawOverlay callback (HUD + ALL bitmap text route through
//     it, painted un-split), then scanlines/vignette/flicker un-aberrated —
//     the glass, not the signal.
//   - crt.setFrozen(true) pauses the pulse's decay during hit-stop so the
//     most-emphasized frozen instant doesn't de-aberrate; call it from the
//     same place juice.hitStop state is managed.
//   - Photosensitivity: pulses are rate-limited (min interval) so rapid major
//     events co-firing with death-flash/impact bloom can't form a flash
//     train; under prefers-reduced-motion the steady (ambient) split is
//     dampened to 0 and pulse durations are halved (dampened, not zeroed —
//     pulse is an impact transient, not a telegraph).
//   - Everything unset is byte-identical to the pre-WS4 render path.

export interface Crt {
  /**
   * Overlay the CRT effect on the current frame. dt drives the flicker.
   * `drawOverlay` (optional) is invoked after the aberration pass and before
   * scanlines, with the baked logical transform re-established — route the
   * HUD and all bitmap text through it so they paint un-split.
   */
  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dt: number,
    drawOverlay?: (ctx: CanvasRenderingContext2D) => void,
  ): void;
  /**
   * Fire an aberration transient: a decaying 0→1 device-px split over
   * `durationSeconds` of real wall-clock time. No-op unless
   * CrtOptions.aberration is set. Reserve for major events (the same branch
   * that calls juice.shake >= 4-6px / juice.flash >= 0.3s). Ignored while
   * the configured steady quantizes to a visible px (>= 0.5 — the budget is
   * already spent) and rate-limited to one accepted pulse per 250 ms.
   */
  pulse(mag: number, durationSeconds: number): void;
  /** Pause (true) / resume (false) the pulse's wall-clock decay during hit-stop. */
  setFrozen(frozen: boolean): void;
}

export interface CrtAberrationOptions {
  /**
   * Steady device-px split (default 0). Rounded to whole px and capped at 1.
   * A steady that rounds to 1 consumes the whole <1px budget — pulse then
   * adds nothing; one that rounds to 0 renders no split and leaves pulses on.
   * Dampened to 0 under prefers-reduced-motion (ambient category).
   */
  steady?: number;
}

export interface CrtOptions {
  /** Darkness of each scanline (default 0.18). */
  scanlineAlpha?: number;
  /** Strength of the edge vignette (default 0.35). */
  vignetteAlpha?: number;
  /**
   * Peak extra flicker alpha (default 0.03). 0 disables. Hard-capped at 0.05:
   * the flicker is a ~6.4 Hz full-field oscillation, and higher amplitudes
   * would cross the WCAG 2.3.1 general-flash threshold as a sustained
   * >3-flashes-per-second violation.
   */
  flicker?: number;
  /**
   * Chromatic aberration — strictly opt-in, default off (unset = byte-
   * identical frame). Pass `{}` for pulse-only, or `{ steady: 1 }` for a
   * constant 1-device-px split (mutually exclusive with visible pulses).
   * COST: steady pays ~11 full-device-res canvas ops EVERY frame (~3-5 ms on
   * software-rendered clients — a third of the 60 Hz budget); pulse mode pays
   * only during transients for the same look. Prefer pulse-only.
   */
  aberration?: CrtAberrationOptions;
}

/** Minimum wall-clock gap between accepted pulses (photosensitivity ceiling). */
const PULSE_MIN_INTERVAL_MS = 250;

export function createCrt(opts: CrtOptions = {}): Crt {
  const scanlineAlpha = opts.scanlineAlpha ?? 0.18;
  const vignetteAlpha = opts.vignetteAlpha ?? 0.35;
  const flickerPeak = Math.min(opts.flicker ?? 0.03, 0.05);
  let clock = 0;

  // --- Aberration state (inert unless opts.aberration is set) ---------------
  const aberration = opts.aberration;
  const reducedMotion =
    !!aberration && typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  // Steady is ambient/decorative: dampened (to 0) under reduced motion.
  const steadyRaw = aberration?.steady ?? 0;
  // Whole-px quantized configured steady — the pulse gate keys off this
  // (mutual exclusivity is a configuration fact), while the rendered
  // steadyPx additionally drops to 0 under reduced motion.
  const steadyConfiguredPx = Math.min(1, Math.max(0, Math.round(steadyRaw)));
  const steadyPx = reducedMotion ? 0 : steadyConfiguredPx;

  let pulseMag = 0;
  let pulseDurMs = 0;
  let pulseStart = 0; // performance.now() ms
  let lastPulseAt = -Infinity;
  let frozen = false;
  let frozenAt = 0; // performance.now() ms when freeze began

  // Lazy one-time allocation keyed on device dims (createCrt has no canvas
  // ref; render only receives logical w/h — so allocate on first use from
  // ctx.canvas, and re-key if the backing store is ever resized).
  let bufW = 0;
  let bufH = 0;
  // Baked vignette gradient (lazy, keyed on logical w/h). The gradient
  // depends only on the dimensions + constant stops, so caching produces an
  // identical frame — this just removes a per-frame allocation.
  let vignetteGrad: CanvasGradient | null = null;
  let vignetteW = 0;
  let vignetteH = 0;
  let scratch: HTMLCanvasElement | null = null;
  let scratchCtx: CanvasRenderingContext2D | null = null;
  let chanBuf: HTMLCanvasElement | null = null;
  let chanCtx: CanvasRenderingContext2D | null = null;

  function ensureBuffers(dw: number, dh: number): boolean {
    if (scratch && bufW === dw && bufH === dh) return true;
    const s = document.createElement('canvas');
    s.width = dw;
    s.height = dh;
    const sc = s.getContext('2d');
    const c = document.createElement('canvas');
    c.width = dw;
    c.height = dh;
    const cc = c.getContext('2d');
    if (!sc || !cc) return false;
    scratch = s;
    scratchCtx = sc;
    chanBuf = c;
    chanCtx = cc;
    bufW = dw;
    bufH = dh;
    return true;
  }

  /** Current effective split in whole device px (0 or 1). */
  function currentSplitPx(): number {
    if (!aberration) return 0;
    if (steadyPx > 0) return steadyPx; // steady owns the whole budget
    if (pulseMag <= 0) return 0;
    const now = frozen ? frozenAt : performance.now();
    const elapsed = now - pulseStart;
    if (elapsed >= pulseDurMs) {
      pulseMag = 0;
      return 0;
    }
    const value = pulseMag * (1 - elapsed / pulseDurMs);
    // Whole-px quantization under the 1px cap: on while the decaying value
    // still rounds to a visible pixel.
    return value >= 0.5 ? 1 : 0;
  }

  /**
   * True channel split onto black. Snapshot the finished frame to a scratch
   * offscreen, clear main to black, then per channel: source-over copy the
   * snapshot into the reusable chanBuf, multiply the channel mask, and
   * lighter-composite into main at the capped offset. globalCompositeOperation
   * is reset to source-over at the top of channels 2 and 3 (otherwise the
   * opaque snapshot redraws multiplied and corrupts them).
   * Cost per frame: snapshot + clear + 3×(copy + mask + offset-composite)
   * = 11 device-res ops.
   */
  function channelSplit(ctx: CanvasRenderingContext2D, splitPx: number): void {
    const canvas = ctx.canvas;
    const dw = canvas.width;
    const dh = canvas.height;
    if (!ensureBuffers(dw, dh)) return;
    const sctx = scratchCtx!;
    const cctx = chanCtx!;

    // 1. Snapshot the finished frame (device space, identity).
    sctx.clearRect(0, 0, dw, dh);
    sctx.drawImage(canvas, 0, 0);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // 2. Clear main to black.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, dw, dh);

    // 3. Per channel: copy, mask, offset-composite. Uniform horizontal split:
    //    R left, G center, B right — each a whole device px.
    const channels: Array<[string, number]> = [
      ['#FF0000', -splitPx],
      ['#00FF00', 0],
      ['#0000FF', splitPx],
    ];
    for (const [mask, offX] of channels) {
      cctx.globalCompositeOperation = 'source-over'; // reset before every copy
      cctx.drawImage(scratch!, 0, 0);
      cctx.globalCompositeOperation = 'multiply';
      cctx.fillStyle = mask;
      cctx.fillRect(0, 0, dw, dh);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(chanBuf!, offX, 0);
    }
    // restore re-establishes the baked logical transform AND source-over.
    ctx.restore();
  }

  return {
    pulse(mag, durationSeconds) {
      if (!aberration) return; // aberration is strictly opt-in
      // Gate on the configured (quantized) steady, never the reduced-motion-
      // dampened steadyPx: a game that configured steady must not gain pulse
      // transients under reduced motion, and a sub-0.5 steady (no split after
      // rounding) must not silently disable pulses either.
      if (steadyConfiguredPx > 0) return; // steady and pulse are mutually exclusive
      if (!(mag > 0) || !(durationSeconds > 0)) return;
      const now = performance.now();
      // Combined-transient photosensitivity ceiling: rate-limit pulses so
      // co-firing major events can't chain into a flash train.
      if (now - lastPulseAt < PULSE_MIN_INTERVAL_MS) return;
      lastPulseAt = now;
      pulseMag = Math.min(1, mag);
      // Impact transient: dampened (halved), never zeroed, under reduced motion.
      pulseDurMs = durationSeconds * 1000 * (reducedMotion ? 0.5 : 1);
      pulseStart = now;
      if (frozen) frozenAt = now; // freeze holds the fresh peak
    },

    setFrozen(f) {
      if (f === frozen) return;
      if (f) {
        frozen = true;
        frozenAt = performance.now();
      } else {
        frozen = false;
        // Shift the pulse start so no decay elapsed during the freeze.
        if (pulseMag > 0) pulseStart += performance.now() - frozenAt;
      }
    },

    render(ctx, width, height, dt, drawOverlay) {
      clock += dt;

      // Warm the aberration scratch canvases on the first rendered frame, not
      // on the first visible pulse — lazy allocation would otherwise pay the
      // canvas backing-store hitch on the busiest possible frame (a major
      // impact, where pulses fire).
      if (aberration && !scratch) ensureBuffers(ctx.canvas.width, ctx.canvas.height);

      // Chromatic aberration on the world/flash frame FIRST (opt-in; a zero
      // split performs no ops — the default path is byte-identical).
      const splitPx = currentSplitPx();
      if (splitPx > 0) channelSplit(ctx, splitPx);

      // Un-split overlay: HUD and all bitmap text paint here, after the
      // aberration pass, before scanlines — baked logical transform is live.
      if (drawOverlay) drawOverlay(ctx);

      // Scanlines: darken every other logical row.
      ctx.fillStyle = `rgba(0,0,0,${scanlineAlpha})`;
      for (let y = 0; y < height; y += 2) {
        ctx.fillRect(0, y, width, 1);
      }

      // Vignette: darken toward the edges.
      if (!vignetteGrad || vignetteW !== width || vignetteH !== height) {
        const cx = width / 2;
        const cy = height / 2;
        const grad = ctx.createRadialGradient(cx, cy, Math.min(width, height) * 0.35, cx, cy, Math.max(width, height) * 0.72);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, `rgba(0,0,0,${vignetteAlpha})`);
        vignetteGrad = grad;
        vignetteW = width;
        vignetteH = height;
      }
      ctx.fillStyle = vignetteGrad;
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
