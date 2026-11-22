export function frameIndex(time: number, fps: number, count: number): number {
  if (count <= 1 || fps <= 0) {return 0;}
  if (!Number.isFinite(time)) {return 0;}
  const i = Math.floor(time * fps) % count;
  return i < 0 ? i + count : i;
}
export function blink(time: number, period = 0.9, onRatio = 0.6): number {
  const phase = ((time % period) + period) % period;
  return phase < period * onRatio ? 1 : 0;
}
export function pulse(time: number, period = 1.2): number {
  return 0.5 - 0.5 * Math.cos((time / period) * Math.PI * 2);
}
