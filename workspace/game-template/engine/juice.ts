// juice.ts — screen shake, screen flash, and hit-stop (freeze frames).
//
// Magnitude floors (feedback must be unmissable — see improving-game-quality):
//   shake: major events (death/explosion) >= 4-6 px amplitude, >= 0.4 s
//   flash: hold-then-fall, not a plain fade — the overlay sits at its peak
//     (never a full-opacity wash) for the first 12 % of the duration so the
//     death instant reads as a strike, then falls on a quadratic ease-out over
//     the remaining 88 %. Give it >= 0.3 s so the hold covers the hit-stop.
//     Pass an ORIGIN (logical px) on a death flash and the overlay becomes a
//     RADIAL burst centred there — full colour at the impact point, clear at
//     the frame edges — so the HUD, the far background and the opposite side
//     of the frame keep their own colours instead of being washed to one hue.
//   hit-stop: the frozen tableau must actually RENDER — stay in PLAYING while
//     frozen (~0.15 s, burst/shake/flash visible over the frozen world) and
//     transition to GAME_OVER only when the hit-stop expires. Transitioning in
//     the same tick as hitStop() means the freeze-frame is never drawn.
//
// Usage per frame:
//   juice.update(dt);              // always — counts down timers
//   if (!juice.frozen) { ...world simulation... }   // hit-stop pauses the world
//   pc.clear(bg);                  // clear FIRST, un-shaken — clearing inside
//                                  //   the shake translate leaves stale pixels
//                                  //   at the canvas edges during a shake
//   juice.preRender(ctx);          // save + apply shake translate
//   ...render world...
//   juice.postRender(ctx, w, h);   // restore + draw flash overlay
//
// preRender/postRender MUST be paired (save/restore).

export interface Juice {
  /** Shake for `duration` s at pixel amplitude `intensity`. Strongest wins. */
  shake(intensity: number, duration: number): void;
  /**
   * Colour flash fading over `duration` s.
   * Without `origin`, a uniform full-screen overlay (peak 0.55).
   * With `origin` (LOGICAL px, the space the world draws in), a radial burst
   * centred there: peak 0.75 at the centre, transparent by RADIUS_SCALE x the
   * larger frame dimension. The gradient is cached and rebuilt only when the
   * origin, colour or frame size changes — no per-frame allocation.
   */
  flash(color: string, duration: number, origin?: { x: number; y: number }): void;
  /** Freeze the simulation for `duration` s (impact emphasis). */
  hitStop(duration: number): void;
  /** True while a hit-stop is active — skip world simulation when set. */
  readonly frozen: boolean;
  update(dt: number): void;
  preRender(ctx: CanvasRenderingContext2D): void;
  postRender(ctx: CanvasRenderingContext2D, width: number, height: number): void;
}

// Flash overlay constants. The uniform peak is deliberately low (it covers the
// whole frame); the radial peak can be higher because only the impact point
// reaches it and the edges stay clear.
const PEAK_UNIFORM = 0.55;
const RADIAL_PEAK = 0.75;
/** Radial flash reaches full transparency at this x the larger frame dimension. */
const RADIUS_SCALE = 0.55;

/** '#RRGGBB' -> 'rgba(r,g,b,a)'; setup-time only (gradient build), never per frame. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }
  // Non-hex colours (rgb()/named): fall back to a transparent-black stop, which
  // still fades out cleanly on every ground the palettes use.
  return `rgba(0,0,0,${alpha === 0 ? 0 : alpha * 0})`;
}

export function createJuice(): Juice {
  let shakeAmp = 0;
  let shakeTime = 0;
  let shakeDur = 0;

  let flashColor = '#FFFFFF';
  let flashTime = 0;
  let flashDur = 0;
  let flashX = 0;
  let flashY = 0;
  let flashRadial = false;

  // Cached radial gradient — rebuilt only when origin/colour/frame size change.
  let grad: CanvasGradient | null = null;
  let gradKey = '';

  let freezeTime = 0;

  return {
    shake(intensity, duration) {
      // Don't let a small shake stomp a bigger ongoing one.
      if (intensity >= shakeAmp * (shakeTime / (shakeDur || 1)) || shakeTime <= 0) {
        shakeAmp = intensity;
        shakeTime = duration;
        shakeDur = duration;
      }
    },
    flash(color, duration, origin) {
      flashColor = color;
      flashTime = duration;
      flashDur = duration;
      flashRadial = !!origin;
      if (origin) {
        flashX = origin.x;
        flashY = origin.y;
      }
    },
    hitStop(duration) {
      freezeTime = Math.max(freezeTime, duration);
    },
    get frozen() {
      return freezeTime > 0;
    },
    update(dt) {
      if (freezeTime > 0) freezeTime = Math.max(0, freezeTime - dt);
      if (shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);
      if (flashTime > 0) flashTime = Math.max(0, flashTime - dt);
    },
    preRender(ctx) {
      ctx.save();
      if (shakeTime > 0 && shakeDur > 0) {
        const falloff = shakeTime / shakeDur;
        const mag = shakeAmp * falloff;
        // Rounded to WHOLE logical pixels: a fractional translate resamples the
        // frame, so dither fields crawl and 1-px sprite keylines smear into two
        // half-lit rows for the length of the shake. Integer offsets keep every
        // pixel a pixel; at these amplitudes the shake reads the same.
        ctx.translate(
          Math.round((Math.random() * 2 - 1) * mag),
          Math.round((Math.random() * 2 - 1) * mag),
        );
      }
    },
    postRender(ctx, width, height) {
      ctx.restore();
      if (flashTime > 0 && flashDur > 0) {
        const t = Math.max(0, flashTime / flashDur);
        // Hold-then-fall: full peak for the first HOLD fraction of the
        // duration (the hit-stop tableau stays lit so the death instant
        // reads as a hit even on a mid-luminance ground), then a quadratic
        // ease-out clears the rest of the way so the world is legible again
        // well before GAME_OVER. Peak capped below full opacity so the
        // burst/shake/frozen tableau stays visible through the flash
        // instead of being washed out by it.
        const PEAK = flashRadial ? RADIAL_PEAK : PEAK_UNIFORM;
        const HOLD = 0.12; // fraction of duration held at full peak before falling (a 2-3 frame strike at 0.35 s; ~0.27 alpha by the last hit-stop frame so the tableau reads through it)
        let shape;
        if (t > 1 - HOLD) {
          shape = 1;
        } else {
          const u = t / (1 - HOLD); // renormalize remaining fall to 0..1
          shape = u * u;
        }
        ctx.globalAlpha = PEAK * shape;
        if (flashRadial) {
          // Radial burst from the impact point. postRender runs after
          // ctx.restore(), so the origin is un-shaken logical space — correct:
          // the tableau under it shakes, the flash is the screen itself.
          const radius = RADIUS_SCALE * Math.max(width, height);
          const key = flashColor + '|' + flashX + '|' + flashY + '|' + width + '|' + height;
          if (key !== gradKey || grad === null) {
            const g = ctx.createRadialGradient(flashX, flashY, 0, flashX, flashY, radius);
            g.addColorStop(0, flashColor);
            // Front-loaded midpoints keep a bright core with a fast falloff, so
            // the far side of the frame is untinted rather than half-washed.
            g.addColorStop(0.14, withAlpha(flashColor, 0.8));
            g.addColorStop(0.42, withAlpha(flashColor, 0.24));
            g.addColorStop(1, withAlpha(flashColor, 0));
            grad = g;
            gradKey = key;
          }
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = flashColor;
        }
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }
    },
  };
}
