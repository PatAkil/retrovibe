// particles.ts — ambient background presets + a burst emitter for impacts.
//
// Ambient particles (stars/rain/snow/embers/bubbles) persist and wrap around the
// screen. burst() spawns short-lived particles that radiate out and fade — tune
// the count to the event's significance (see improving-game-quality: ~5-10 on
// destruction/death, smaller for minor hits).

export type AmbientPreset = 'stars' | 'rain' | 'snow' | 'embers' | 'bubbles';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number; // seconds remaining (Infinity for ambient)
  maxLife: number;
}

export interface BurstOptions {
  count?: number;
  color?: string;
  /** Base speed in px/s (default 90). */
  speed?: number;
  /** Lifetime in seconds (default 0.5). */
  life?: number;
}

export interface ParticleSystem {
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  burst(x: number, y: number, opts?: BurstOptions): void;
  setAmbient(preset: AmbientPreset | null): void;
}

export interface ParticleOptions {
  width: number;
  height: number;
  ambient?: AmbientPreset | null;
  /** Ambient particle count (default 48). */
  ambientCount?: number;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export function createParticles(opts: ParticleOptions): ParticleSystem {
  const { width, height } = opts;
  const ambientCount = opts.ambientCount ?? 48;
  let ambientPreset: AmbientPreset | null = opts.ambient ?? null;
  let ambient: Particle[] = [];
  const transient: Particle[] = [];

  function spawnAmbient(preset: AmbientPreset): Particle {
    const x = rand(0, width);
    const y = rand(0, height);
    switch (preset) {
      case 'stars':
        return { x, y, vx: 0, vy: rand(2, 10), size: rand(1, 2), color: '#FFF1E8', life: Infinity, maxLife: Infinity };
      case 'rain':
        return { x, y, vx: -30, vy: rand(160, 240), size: 1, color: '#29ADFF', life: Infinity, maxLife: Infinity };
      case 'snow':
        return { x, y, vx: rand(-12, 12), vy: rand(14, 30), size: rand(1, 2), color: '#FFF1E8', life: Infinity, maxLife: Infinity };
      case 'embers':
        return { x, y, vx: rand(-8, 8), vy: rand(-40, -18), size: rand(1, 2), color: '#FFA300', life: Infinity, maxLife: Infinity };
      case 'bubbles':
        return { x, y, vx: rand(-6, 6), vy: rand(-30, -12), size: rand(1, 3), color: '#83769C', life: Infinity, maxLife: Infinity };
    }
  }

  function rebuildAmbient(): void {
    ambient = [];
    if (!ambientPreset) return;
    for (let i = 0; i < ambientCount; i++) ambient.push(spawnAmbient(ambientPreset));
  }
  rebuildAmbient();

  function wrap(p: Particle): void {
    if (p.x < -4) p.x = width + 4;
    else if (p.x > width + 4) p.x = -4;
    if (p.y < -4) p.y = height + 4;
    else if (p.y > height + 4) p.y = -4;
  }

  return {
    update(dt) {
      for (const p of ambient) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        wrap(p);
      }
      for (let i = transient.length - 1; i >= 0; i--) {
        const p = transient[i];
        p.life -= dt;
        if (p.life <= 0) {
          transient.splice(i, 1);
          continue;
        }
        p.vy += 140 * dt; // gravity on impact particles
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    },
    render(ctx) {
      for (const p of ambient) {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      for (const p of transient) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;
    },
    burst(x, y, o = {}) {
      const count = o.count ?? 8;
      const color = o.color ?? '#FFEC27';
      const speed = o.speed ?? 90;
      const life = o.life ?? 0.5;
      for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2);
        const s = speed * rand(0.4, 1);
        transient.push({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          size: rand(1, 2),
          color,
          life,
          maxLife: life,
        });
      }
    },
    setAmbient(preset) {
      ambientPreset = preset;
      rebuildAmbient();
    },
  };
}
