// particles.ts — ambient background presets + a burst emitter for impacts.
//
// Ambient particles (stars/rain/snow/embers/bubbles) persist and wrap around the
// screen. They are built as 2-3 DEPTH LAYERS: far specks are 1 px, dimmer and
// slower; near ones are 2 px, a touch brighter and faster — parallax that reads
// as atmosphere instead of an even sprinkle of dirt. Each particle carries a
// spawn-time seed driving a slow deterministic brightness pulse (twinkle) and,
// for the drifting presets, a sideways wobble; no Math.random is consumed after
// spawn, so seeded captures stay reproducible.
//
// Their default colors sit in the prominence band — contrast 1.78-2.47:1 vs a
// black clear color (see palette.ts contrast()) — visible atmosphere that never
// competes with actors. The whole authored ramp, near layer and sparks included,
// stays at or below 2.5: the CRT phosphor lift adds roughly another 0.8 of a
// ratio point on black, so a tone authored at the ceiling already reaches the
// eye near the 3:1 actor floor. 'stars' adds a handful of 1 px bright sparks at
// the top of the ramp (1 px, so they can never be mistaken for a pickup).
// Pass `ambientColor` to retune for a non-black background: every layer tone is
// derived from that one color by scaling, so an override keeps the hue and
// inherits the depth ramp.
//
// burst() spawns short-lived 2-3 px particles that radiate out and fade — tune
// the count to the event's significance (see improving-game-quality: ~5-10 on
// destruction/death, smaller for minor hits) and pass the game's own palette
// color; speeds should clear the sprite silhouette.

export type AmbientPreset = 'stars' | 'rain' | 'snow' | 'embers' | 'bubbles';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Rendered width/height in logical px. */
  w: number;
  h: number;
  color: string;
  life: number; // seconds remaining (Infinity for ambient)
  maxLife: number;
  // --- ambient only (deterministic, seeded at spawn) ---
  /** Phase offset in radians. */
  seed: number;
  /** Pulse speed in rad/s. */
  rate: number;
  /** Alpha floor of the brightness pulse. */
  base: number;
  /** Alpha swing added on top of `base`. */
  amp: number;
  /** Pulse sharpness: 1 = sine, >1 = mostly dim with a brief flare. */
  sharp: number;
  /** Sideways wobble amplitude in px (render-only offset). */
  wob: number;
  /** Wobble speed in rad/s. */
  wobRate: number;
  /** Extra 1 px specular pixel (bubbles' near layer) in this color, or ''. */
  gloss: string;
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
  setAmbient(preset: AmbientPreset | null, color?: string): void;
}

export interface ParticleOptions {
  width: number;
  height: number;
  ambient?: AmbientPreset | null;
  /** Ambient particle count (default 48). */
  ambientCount?: number;
  /**
   * Override the preset's ambient color. Defaults are tuned to the 1.8-2.5:1
   * prominence band against a BLACK clear color — games with a brighter
   * background should pass a color in the same band vs their own clear color.
   * The depth-layer tones are derived from it by scaling, so the ramp follows.
   */
  ambientColor?: string;
}

const TAU = Math.PI * 2;
const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** Scale a hex color's channels by `f` (clamped), keeping its hue. */
function shade(hex: string, f: number): string {
  const h = hex.replace('#', '');
  let out = '#';
  for (let i = 0; i < 3; i++) {
    const v = Math.min(255, Math.max(0, Math.round(parseInt(h.slice(i * 2, i * 2 + 2), 16) * f)));
    out += v.toString(16).padStart(2, '0');
  }
  return out;
}

export function createParticles(opts: ParticleOptions): ParticleSystem {
  const { width, height } = opts;
  const ambientCount = opts.ambientCount ?? 48;
  let ambientPreset: AmbientPreset | null = opts.ambient ?? null;
  let ambientColor: string | undefined = opts.ambientColor;
  let ambient: Particle[] = [];
  const transient: Particle[] = [];
  let clock = 0; // seconds since start — drives every deterministic pulse

  // Preset mid-layer colors: dimmed variants of the classic hues. Measured with
  // palette.ts contrast() against a black clear color, the whole authored ramp
  // now sits INSIDE the 1.8-2.5 prominence band (the previous tones ran to
  // ~2.6:1 near / ~2.9:1 spark, above the band — and the CRT phosphor lift adds
  // roughly another 0.8 of a ratio point on black, which pushed a spark up to
  // the 3:1 actor floor and made it read as a collectible):
  //   far (0.85x) 1.78-1.82 · mid (1x) 2.08-2.12 · near (1.1x) 2.31-2.36 ·
  //   spark (1.15x) 2.42-2.47 · bubble gloss (1.15x) 2.42-2.47
  const AMBIENT_COLOR: Record<AmbientPreset, string> = {
    stars: '#45413F',
    rain: '#104668',
    snow: '#3B444C',
    embers: '#5C3B00',
    bubbles: '#453F53',
  };

  const FAR = 0.85;
  const NEAR = 1.1;
  // 'stars' bright sparks + ember flare cores — 1 px only. Kept just above the
  // NEAR layer rather than far above it: at 1.45x a spark landed brighter than
  // the actor floor against the CRT-lifted ground and started reading as a
  // collectible. Ambient must stay atmosphere, never compete with a pickup.
  const SPARK = 1.15;
  const GLOSS = 1.15; // the 1 px specular dot on a near bubble

  /**
   * Build one ambient particle. `d` is the depth ticket: 0 far, 1 mid, 2 near,
   * 3 the rare bright spark. `x`/`y` come from the caller so clustered presets
   * can place their particles.
   */
  function spawnAmbient(preset: AmbientPreset, d: number, x: number, y: number, gloss = false): Particle {
    const c = ambientColor ?? AMBIENT_COLOR[preset];
    const tone = d === 0 ? shade(c, FAR) : d === 1 ? c : d === 2 ? shade(c, NEAR) : shade(c, SPARK);
    // Depth 0..1 — drives speed and size across every preset.
    const z = d === 3 ? 0.7 : d / 2;
    const p: Particle = {
      x, y, vx: 0, vy: 0,
      w: d === 2 ? 2 : 1,
      h: d === 2 ? 2 : 1,
      color: tone,
      life: Infinity,
      maxLife: Infinity,
      seed: rand(0, TAU),
      rate: rand(0.6, 1.8),
      base: 0.92,
      amp: 0.08,
      sharp: 1,
      wob: 0,
      wobRate: rand(0.5, 1.4),
      gloss: '',
    };
    switch (preset) {
      case 'stars':
        p.vy = rand(1.5, 5) + z * 7;
        if (d === 3) {
          // A handful of bright 1 px sparks that visibly breathe.
          p.w = 1;
          p.h = 1;
          p.base = 0.6;
          p.amp = 0.4;
          p.rate = rand(1.1, 2.4);
        } else if (d === 2) {
          p.base = 0.82;
          p.amp = 0.18;
        } else if (d === 0) {
          p.base = 0.88;
          p.amp = 0.12;
        }
        break;
      case 'rain':
        // Streaks, not dots: far rain is a short slow smear, near rain long/fast.
        p.w = 1;
        p.h = d >= 2 ? 3 : 2;
        p.vx = -22 - z * 22;
        p.vy = 130 + z * 130;
        p.base = 1;
        p.amp = 0;
        break;
      case 'snow':
        p.vy = 10 + z * 26;
        p.wob = 1 + z * 2;
        p.wobRate = rand(0.4, 1.1);
        p.base = 0.88;
        p.amp = 0.12;
        break;
      case 'embers':
        // Rising, wobbling, mostly dark with a brief bright core.
        p.vy = -(14 + z * 34);
        p.vx = rand(-5, 5);
        p.wob = 1 + z * 2;
        p.wobRate = rand(0.6, 1.6);
        p.sharp = 3;
        if (d === 3) {
          p.w = 1;
          p.h = 1;
          p.base = 0.5;
          p.amp = 0.5;
          p.rate = rand(1.0, 2.2);
        } else {
          p.base = 0.85;
          p.amp = 0.15;
          p.rate = rand(0.5, 1.4);
        }
        break;
      case 'bubbles':
        p.vy = -(8 + z * 24);
        p.vx = rand(-3, 3);
        p.wob = 1.5 + z * 2.5;
        p.wobRate = rand(0.5, 1.3);
        p.base = 0.9;
        p.amp = 0.1;
        // Half the near bubbles get a 1 px specular highlight — a ring/
        // soap-bubble read without growing the footprint past 2 px.
        if (d === 2 && gloss) p.gloss = shade(c, GLOSS);
        break;
    }
    return p;
  }

  function rebuildAmbient(): void {
    ambient = [];
    if (!ambientPreset) return;
    const preset = ambientPreset;
    // Depth mix: mostly far, some mid, a few near; 'stars' and 'embers' also
    // get a couple of bright sparks (ticket 3).
    const sparks = preset === 'stars' || preset === 'embers';
    // Clustering: real skies clump. Every few particles opens a new cluster
    // centre; the rest scatter tightly around the current one, leaving gaps.
    // Rain alone stays an even sheet; every other preset clumps, because an
    // even sprinkle is exactly what reads as dirt on the glass. Rising presets
    // clump into narrow vertical STREAMS (a vent, a crack, a bubble column);
    // falling/still ones into loose patches with gaps between them.
    const clumps = preset !== 'rain';
    const rising = preset === 'embers' || preset === 'bubbles';
    let cx = rand(0, width);
    let cy = rand(0, height);
    for (let i = 0; i < ambientCount; i++) {
      const r = i / ambientCount;
      let d = r < 0.5 ? 0 : r < 0.82 ? 1 : 2;
      if (sparks && i % 17 === 5) d = 3;
      let x: number;
      let y: number;
      if (clumps) {
        if (i % 4 === 0) {
          cx = rand(0, width);
          cy = rand(0, height);
          x = cx;
          y = cy;
        } else {
          const sx = rising ? 6 + d * 3 : 14 + d * 10;
          const sy = rising ? height * 0.45 : 14 + d * 10;
          x = (cx + rand(-sx, sx) + width) % width;
          y = (cy + rand(-sy, sy) + height) % height;
        }
      } else {
        x = rand(0, width);
        y = rand(0, height);
      }
      ambient.push(spawnAmbient(preset, d, x, y, i % 2 === 0));
    }
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
      clock += dt;
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
        let u = 0.5 + 0.5 * Math.sin(clock * p.rate + p.seed);
        if (p.sharp !== 1) u = u ** p.sharp;
        const a = p.base + p.amp * u;
        ctx.globalAlpha = a > 1 ? 1 : a;
        ctx.fillStyle = p.color;
        const x = Math.round(p.x + (p.wob === 0 ? 0 : p.wob * Math.sin(clock * p.wobRate + p.seed)));
        const y = Math.round(p.y);
        ctx.fillRect(x, y, p.w, p.h);
        if (p.gloss !== '') {
          ctx.fillStyle = p.gloss;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      ctx.globalAlpha = 1;
      for (const p of transient) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.w, p.h);
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
        // 2 or 3 logical px — an INTEGER: a fractional size lands the rect on a
        // half pixel and the CRT pass smears it into a soft blob. Same single
        // Math.random() call as before, so seeded captures stay reproducible.
        const size = Math.random() < 0.5 ? 2 : 3;
        transient.push({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          w: size,
          h: size,
          color,
          life,
          maxLife: life,
          seed: 0, rate: 0, base: 1, amp: 0, sharp: 1, wob: 0, wobRate: 0, gloss: '',
        });
      }
    },
    setAmbient(preset, color) {
      ambientPreset = preset;
      if (color !== undefined) ambientColor = color;
      rebuildAmbient();
    },
  };
}
