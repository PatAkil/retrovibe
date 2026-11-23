import type { Point } from './geometry';
import { parseHex } from './palette';

export interface Juice {
  shake(intensity: number, duration: number): void;
  flash(color: string, duration: number, origin?: Point): void;
  hitStop(duration: number): void;
  readonly frozen: boolean;
  update(dt: number): void;
  preRender(ctx: CanvasRenderingContext2D): void;
  postRender(ctx: CanvasRenderingContext2D, width: number, height: number): void;
}

interface Flash {
  readonly trigger: (color: string, duration: number, origin?: Point) => void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void;
}

interface Shake {
  readonly trigger: (intensity: number, duration: number) => void;
  update(dt: number): void;
  apply(ctx: CanvasRenderingContext2D): void;
}

const PEAK_UNIFORM = 0.55;
const RADIAL_PEAK = 0.75;
const RADIUS_SCALE = 0.55;
const FLASH_HOLD = 0.12;

function withAlpha(color: string, alpha: number): string {
  const rgb = parseHex(color);
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : 'rgba(0,0,0,0)';
}

function flashShape(t: number): number {
  if (t > 1 - FLASH_HOLD) {return 1;}
  const u = t / (1 - FLASH_HOLD);
  return u * u;
}

function radialFlash(ctx: CanvasRenderingContext2D, color: string, origin: Point, radius: number): CanvasGradient {
  const g = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, radius);
  g.addColorStop(0, color);
  g.addColorStop(0.14, withAlpha(color, 0.8));
  g.addColorStop(0.42, withAlpha(color, 0.24));
  g.addColorStop(1, withAlpha(color, 0));
  return g;
}

function createFlash(): Flash {
  let color = '#FFFFFF';
  let time = 0;
  let dur = 0;
  let origin: Point = { x: 0, y: 0 };
  let radial = false;
  let grad: CanvasGradient | null = null;
  let gradKey = '';
  function gradientFor(ctx: CanvasRenderingContext2D, width: number, height: number): CanvasGradient {
    const key = `${color}|${origin.x}|${origin.y}|${width}|${height}`;
    if (key !== gradKey || grad === null) {
      grad = radialFlash(ctx, color, origin, RADIUS_SCALE * Math.max(width, height));
      gradKey = key;
    }
    return grad;
  }
  return {
    trigger(c, duration, at) {
      color = c;
      time = duration;
      dur = duration;
      radial = !!at;
      if (at) {origin = { x: at.x, y: at.y };}
    },
    update(dt) {
      if (time > 0) {time = Math.max(0, time - dt);}
    },
    render(ctx, width, height) {
      if (time <= 0 || dur <= 0) {return;}
      const t = Math.max(0, time / dur);
      ctx.globalAlpha = (radial ? RADIAL_PEAK : PEAK_UNIFORM) * flashShape(t);
      ctx.fillStyle = radial ? gradientFor(ctx, width, height) : color;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    },
  };
}

function createShake(): Shake {
  let amp = 0;
  let time = 0;
  let dur = 0;
  return {
    trigger(intensity, duration) {
      if (intensity >= amp * (time / (dur || 1)) || time <= 0) {
        amp = intensity;
        time = duration;
        dur = duration;
      }
    },
    update(dt) {
      if (time > 0) {time = Math.max(0, time - dt);}
    },
    apply(ctx) {
      if (time <= 0 || dur <= 0) {return;}
      const mag = amp * (time / dur);
      ctx.translate(
        Math.round((Math.random() * 2 - 1) * mag),
        Math.round((Math.random() * 2 - 1) * mag),
      );
    },
  };
}

export function createJuice(): Juice {
  const shake = createShake();
  const flash = createFlash();
  let freezeTime = 0;
  return {
    shake: shake.trigger,
    flash: flash.trigger,
    hitStop(duration) {
      freezeTime = Math.max(freezeTime, duration);
    },
    get frozen() {
      return freezeTime > 0;
    },
    update(dt) {
      if (freezeTime > 0) {freezeTime = Math.max(0, freezeTime - dt);}
      shake.update(dt);
      flash.update(dt);
    },
    preRender(ctx) {
      ctx.save();
      shake.apply(ctx);
    },
    postRender(ctx, width, height) {
      ctx.restore();
      flash.render(ctx, width, height);
    },
  };
}
