export interface LoopCallbacks {
  update(dt: number): void;
  render(alpha: number): void;
}

export interface LoopOptions {
  step?: number;
  maxFrame?: number;
}

export interface GameLoop {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

function positive(v: number | undefined, fallback: number, name: string): number {
  if (v === undefined) {return fallback;}
  if (Number.isFinite(v) && v > 0) {return v;}
  throw new RangeError(`createLoop: ${name} must be a positive finite number of seconds, got ${String(v)}`);
}

export function createLoop(cbs: LoopCallbacks, opts: LoopOptions = {}): GameLoop {
  const step = positive(opts.step, 1 / 60, 'step');
  const maxFrame = positive(opts.maxFrame, 0.25, 'maxFrame');

  let running = false;
  let paused = false;
  let rafId = 0;
  let last = 0;
  let accumulator = 0;
  const isRunning = (): boolean => running;

  function frame(nowMs: number): void {
    if (!running) {return;}
    rafId = requestAnimationFrame(frame);

    const now = nowMs / 1000;
    if (paused) {
      last = now;
      cbs.render(0);
      return;
    }

    const delta = Math.max(0, Math.min(now - last, maxFrame));
    last = now;
    accumulator += delta;

    while (accumulator >= step && isRunning()) {
      cbs.update(step);
      accumulator -= step;
    }
    if (!isRunning()) {return;}
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
    resetClock();
  }
  function onVisibility(): void {
    if (document.hidden) {onBlur();}
    else {onFocus();}
  }

  return {
    start() {
      if (running) {return;}
      running = true;
      paused = false;
      resetClock();
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onVisibility);
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      if (!running) {return;}
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
