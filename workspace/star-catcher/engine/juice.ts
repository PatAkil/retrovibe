// juice.ts — screen shake, screen flash, and hit-stop (freeze frames).
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
        ctx.translate((Math.random() * 2 - 1) * mag, (Math.random() * 2 - 1) * mag);
      }
    },
    postRender(ctx, width, height) {
      ctx.restore();
      if (flashTime > 0 && flashDur > 0) {
        ctx.globalAlpha = Math.max(0, flashTime / flashDur);
        ctx.fillStyle = flashColor;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }
    },
  };
}
