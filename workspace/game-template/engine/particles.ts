import type { AmbientField, AmbientPreset } from './ambient';
import { buildAmbient, driftAmbient, rand, renderAmbient } from './ambient';

export type { AmbientPreset } from './ambient';

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface BurstOptions {
  count?: number;
  color?: string;
  speed?: number;
  life?: number;
}

export interface ParticleSystem {
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  burst(x: number, y: number, opts?: BurstOptions): void;
  setAmbient(preset: AmbientPreset | null, color?: string): void;
}

export interface ParticleOptions {
  width: number;
  height: number;
  ambient?: AmbientPreset | null;
  ambientCount?: number;
  ambientColor?: string;
}

const SPARK_GRAVITY = 140;

function spawnSparks(x: number, y: number, o: BurstOptions): Spark[] {
  const count = o.count ?? 8;
  const color = o.color ?? '#FFEC27';
  const speed = o.speed ?? 90;
  const life = o.life ?? 0.5;
  const sparks: Spark[] = [];
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const s = speed * rand(0.4, 1);
    const size = Math.random() < 0.5 ? 2 : 3;
    sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size, color, life, maxLife: life });
  }
  return sparks;
}

function stepSparks(sparks: Spark[], dt: number): void {
  let kept = 0;
  for (const p of sparks) {
    p.life -= dt;
    if (p.life <= 0) {continue;}
    p.vy += SPARK_GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    sparks[kept++] = p;
  }
  sparks.length = kept;
}

function renderSparks(ctx: CanvasRenderingContext2D, sparks: readonly Spark[]): void {
  for (const p of sparks) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

export function createParticles(opts: ParticleOptions): ParticleSystem {
  const field: AmbientField = { width: opts.width, height: opts.height, count: opts.ambientCount ?? 48 };
  let ambientColor = opts.ambientColor;
  const rebuild = (preset: AmbientPreset | null): ReturnType<typeof buildAmbient> =>
    preset ? buildAmbient(field, preset, ambientColor) : [];
  let ambient = rebuild(opts.ambient ?? null);
  const sparks: Spark[] = [];
  let clock = 0;
  return {
    update(dt) {
      clock += dt;
      driftAmbient(ambient, field, dt);
      stepSparks(sparks, dt);
    },
    render(ctx) {
      renderAmbient(ctx, ambient, clock);
      renderSparks(ctx, sparks);
    },
    burst(x, y, o = {}) {
      sparks.push(...spawnSparks(x, y, o));
    },
    setAmbient(preset, color) {
      if (color !== undefined) {ambientColor = color;}
      ambient = rebuild(preset);
    },
  };
}
