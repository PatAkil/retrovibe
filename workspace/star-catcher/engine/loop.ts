// loop.ts — fixed-timestep game loop with an accumulator.
//
// update(dt) runs at a fixed step (default 60 Hz) so physics is deterministic;
// render(alpha) runs once per animation frame with an interpolation factor.
//
// Two protections are MANDATORY against alt-tab / sleep (a background tab throttles
// rAF, so the next delta can be many seconds):
//   1. Per-frame delta is CLAMPED to MAX_FRAME (~250ms) before it enters the
//      accumulator — without this, one huge delta spawns hundreds of catch-up
//      update() calls (spiral of death) or a physics teleport.
//   2. On regaining focus/visibility the clock is RESET, so the hidden gap is
//      discarded entirely rather than merely clamped.
// The loop also auto-pauses simulation while the window is blurred/hidden.

export interface LoopCallbacks {
  /** Fixed-step simulation tick. dt is constant (= step) in seconds. */
  update(dt: number): void;
  /** Render. alpha in [0,1) = fraction of a step since the last update. */
  render(alpha: number): void;
}

export interface LoopOptions {
  /** Fixed step in seconds (default 1/60). */
  step?: number;
  /** Max real seconds folded into one frame (default 0.25). */
  maxFrame?: number;
}

export interface GameLoop {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

export function createLoop(cbs: LoopCallbacks, opts: LoopOptions = {}): GameLoop {
  const step = opts.step ?? 1 / 60;
  const maxFrame = opts.maxFrame ?? 0.25;

  let running = false;
  let paused = false; // window blurred/hidden — skip simulation, hold the clock
  let rafId = 0;
  let last = 0;
  let accumulator = 0;

  function frame(nowMs: number): void {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    const now = nowMs / 1000;
    if (paused) {
      // Hold the clock so no time accrues while blurred; render a static frame.
      last = now;
      cbs.render(0);
      return;
    }

    let delta = now - last;
    last = now;
    if (delta > maxFrame) delta = maxFrame; // clamp — the load-bearing guard
    accumulator += delta;

    while (accumulator >= step) {
      cbs.update(step);
      accumulator -= step;
    }
    cbs.render(accumulator / step);
  }

  function resetClock(): void {
    last = performance.now() / 1000;
    accumulator = 0;
  }
  function onBlur(): void {
    paused = true;
  }
  function onFocus(): void {
    paused = false;
    resetClock(); // discard the hidden gap
  }
  function onVisibility(): void {
    if (document.hidden) onBlur();
    else onFocus();
  }

  return {
    start() {
      if (running) return;
      running = true;
      paused = false;
      resetClock();
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onVisibility);
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    },
    get running() {
      return running;
    },
  };
}
