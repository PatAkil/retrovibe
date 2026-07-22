// juice.ts — screen shake, screen flash, and hit-stop (freeze frames).
//
// Magnitude floors (feedback must be unmissable — see improving-game-quality):
//   shake: major events (death/explosion) >= 4-6 px amplitude, >= 0.4 s
//   flash: full-screen death flash holds >= 0.3 s
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
   * Full-screen colour flash fading over `duration` s. Rate-limited: starts
   * within 0.35 s of the previous accepted start are dropped, keeping
   * full-screen flashes under the WCAG 2.3.1 three-per-second ceiling even
   * when gameplay fires flash() every hit.
   */
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
  // WCAG 2.3.1: at most ~3 full-screen flashes per second. Game-time clock —
  // advances in update() even during hit-stop, so the window can't be frozen open.
  const MIN_FLASH_INTERVAL = 0.35;
  let sinceFlash = MIN_FLASH_INTERVAL;

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
      if (sinceFlash < MIN_FLASH_INTERVAL) return;
      sinceFlash = 0;
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
      sinceFlash += dt;
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
