// juice.ts — screen shake, screen flash, and hit-stop (freeze frames).
//
// Magnitude floors (feedback must be unmissable — see improving-game-quality):
//   shake: major events (death/explosion) >= 4-6 px amplitude, >= 0.4 s
//   flash: hold-then-fall, not a plain fade — the overlay sits at its 0.55 peak
//     (never a full-opacity wash) for the first 12 % of the duration so the
//     death instant reads as a strike, then falls on a quadratic ease-out over
//     the remaining 80 %. Give it >= 0.3 s so the hold covers the hit-stop.
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
  /** Full-screen colour flash fading over `duration` s. */
  flash(color: string, duration: number): void;
  /** Freeze the simulation for `duration` s (impact emphasis). */
  hitStop(duration: number): void;
  /** True while a hit-stop is active — skip world simulation when set. */
  readonly frozen: boolean;
  update(dt: number): void;
  preRender(ctx: CanvasRenderingContext2D): void;
  postRender(ctx: CanvasRenderingContext2D, width: number, height: number): void;
}

export function createJuice(): Juice {
  let shakeAmp = 0;
  let shakeTime = 0;
  let shakeDur = 0;

  let flashColor = '#FFFFFF';
  let flashTime = 0;
  let flashDur = 0;

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
    flash(color, duration) {
      flashColor = color;
      flashTime = duration;
      flashDur = duration;
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
        const PEAK = 0.55;
        const HOLD = 0.12; // fraction of duration held at full peak before falling (a 2-3 frame strike at 0.35 s; ~0.27 alpha by the last hit-stop frame so the tableau reads through it)
        let shape;
        if (t > 1 - HOLD) {
          shape = 1;
        } else {
          const u = t / (1 - HOLD); // renormalize remaining fall to 0..1
          shape = u * u;
        }
        ctx.globalAlpha = PEAK * shape;
        ctx.fillStyle = flashColor;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }
    },
  };
}
