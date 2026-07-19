// glow.ts — additive glow/bloom pass. Opt-in: nothing in the default render
// path touches this module; a game that never calls createGlow renders
// byte-identically to a template without it.
//
// Two tiers, NO ctx.filter anywhere:
//   (a) DEFAULT — cheap radial sprite. One precomputed soft radial-gradient
//       alpha sprite (per color, cached), blitted additively via glow.halo().
//       Zero per-frame filter cost; covers range circles / self-glow accents.
//   (b) RESAMPLE blur — for arbitrary bright shapes. The game draws into
//       glow.ctx (logical space — identical drawSprite calls, same px, the
//       buffer bakes the same scale as the pixel canvas so px=3 lands
//       pixel-identical). composite() then downscales in successive bilinear
//       HALVINGS (e.g. 720→360→180 device px, imageSmoothing on — never a
//       single 4x jump, which point-samples and shimmers on moving sources)
//       and draws ONE smoothed upscale additively. The resample passes ARE
//       the blur.
//
// Frame order (world space, inside the shake window):
//   pc.clear(bg)
//   juice.preRender(ctx)            // shake translate
//     glow.composite(ctx)           // <-- glow UNDER the crisp world
//     ...draw crisp world sprites on top...
//   juice.postRender(ctx, w, h)
//   crt.render(ctx, w, h, dt)
//
// composite() runs under the ambient CTM (baked scale + shake translate) and
// NEVER resets the transform — so the halo registers with the shaken world.
// It is wrapped in ONE save()/restore(); exit invariant after restore:
//   filter='none', globalCompositeOperation='source-over', globalAlpha=1,
//   imageSmoothingEnabled=false
// A leaked 'lighter' would make CRT's black scanlines a no-op (black+lighter
// changes nothing) and silently disable the filter — the named landmine.
//
// CONTRAST IS BY DESIGN, NOT READBACK (per-frame getImageData is disallowed):
//   - per-source intensity is clamped to MAX_SOURCE_INTENSITY (0.5)
//   - the whole composite is drawn at <= maxAlpha (default 0.6)
//   - documented worst-case overlap budget: 'lighter' clamps at 255, but the
//     design budget assumes at most 3 overlapping halos at a point; at the
//     defaults (3 x 0.5 x 0.6 = 0.9 summed alpha over a dark background) the
//     brightest possible halo core stays below full white, and a crisp actor
//     (palette actor color, >=3:1 vs static surfaces) drawn ON TOP of the
//     glow keeps its >=3.0 post-CRT read — validated offline (two-sample
//     ratio on the composited post-CRT frame), never per-frame.
//   Do not stack more than ~3 gameplay halos over one region; decorate, don't
//   floodlight.
//
// RULES (see graphics-uplift spec, stream 3):
//   - Never bloom a tracked actor: glow renders BEHIND the crisp sprite. Scope
//     halos to telegraphs, decorative accents, projectiles, or self-glow.
//   - Any glow that COMMUNICATES a boundary (range circle, blast radius)
//     pairs the soft halo with a crisp 1px palette-indexed ring at the true
//     edge — glow.ring() draws it. The bloom is decoration; the hard line is
//     the contract.
//   - Impact bloom is a transient (glow.bloom): snappy attack (~0.03 s) and
//     short decay (total ~0.1–0.2 s, matching juice.flash / crt.pulse), never
//     wallpaper. While juice.frozen, call glow.setFrozen(true): the envelope
//     HOLDS (source + intensity pinned) and decays only after release —
//     otherwise the bloom drifts through the emphasized hit-stop tableau.
//   - Reduced-motion damper: decorative halos and impact blooms are dampened
//     (x DAMP_FACTOR) when damped; gameplay telegraphs ({ telegraph: true })
//     are EXEMPT — the damper never zeroes a telegraph's urgency channel.
//     Defaults to prefers-reduced-motion at startup; override with
//     { damped } or setDamped().
//   - Photosensitivity: bloom accepts a minimum re-trigger interval
//     (minBloomInterval, default 0.1 s) so rapid major events cannot produce
//     a flash train.
//   - Glow colors are an off-palette exemption (like the vignette and the
//     death flash): the halo is a lighting effect, not a surface — but
//     gameplay-meaning glow should reuse a palette color so the paired crisp
//     ring stays palette-indexed.

export interface HaloOptions {
  /** 0..1 brightness of this source (clamped to 0.5). Default 0.35. */
  intensity?: number;
  /**
   * Mark a gameplay telegraph: EXEMPT from the reduced-motion damper (the
   * urgency channel is never zeroed). Default false (decorative).
   */
  telegraph?: boolean;
}

export interface BloomOptions extends HaloOptions {
  /** Total envelope length in seconds (default 0.15; clamped 0.1–0.2). */
  duration?: number;
}

export interface GlowOptions {
  /** Logical width — match createPixelCanvas (e.g. 240). */
  width: number;
  /** Logical height — match createPixelCanvas (e.g. 160). */
  height: number;
  /**
   * Device scale of the target pixel canvas (default 3). The resample buffer
   * is allocated at width*scale x height*scale with the scale baked into its
   * transform, so identical drawSprite calls (same px) land pixel-identical.
   */
  scale?: number;
  /** Cap on the composite's globalAlpha (default 0.6, clamped 0..1). */
  maxAlpha?: number;
  /**
   * Reduced-motion damper. Defaults to prefers-reduced-motion at creation.
   * When true, decorative halos and impact blooms render at DAMP_FACTOR;
   * telegraphs are exempt.
   */
  damped?: boolean;
  /** Minimum seconds between accepted bloom() triggers (default 0.1). */
  minBloomInterval?: number;
}

export interface Glow {
  /**
   * Resample-tier authoring surface. Draw bright shapes here each frame with
   * the SAME logical coordinates / drawSprite px you use on the main canvas.
   * Allocated lazily on first access; cleared every composite().
   */
  readonly ctx: CanvasRenderingContext2D;
  /** Queue a cheap radial-sprite halo at logical (x, y), radius in logical px. */
  halo(x: number, y: number, radius: number, color: string, opts?: HaloOptions): void;
  /**
   * Trigger an impact-bloom transient at logical (x, y): fast attack, short
   * decay (~0.1–0.2 s total). Decoupled from ambient glow. Rate-limited by
   * minBloomInterval (photosensitivity).
   */
  bloom(x: number, y: number, radius: number, color: string, opts?: BloomOptions): void;
  /**
   * Crisp 1px palette-indexed ring at the TRUE edge of a gameplay boundary —
   * draw it on the MAIN ctx, over the halo. Integer-quantized midpoint
   * circle; no smoothing, no state leaks.
   */
  ring(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void;
  /** Advance bloom envelopes. Call every frame (before render). */
  update(dt: number): void;
  /**
   * Mirror juice.frozen (glow holds no juice ref): while frozen, bloom
   * envelopes HOLD at their current intensity and decay only after release.
   */
  setFrozen(frozen: boolean): void;
  /** Override the reduced-motion damper at runtime. */
  setDamped(damped: boolean): void;
  /**
   * Blur + composite everything additively into `target` under its CURRENT
   * transform (call inside the shake window, before drawing crisp sprites).
   * One save()/restore(); on exit: filter='none', op='source-over', alpha=1,
   * imageSmoothingEnabled=false. Clears the authoring buffer and per-frame
   * halo queue.
   */
  composite(target: CanvasRenderingContext2D): void;
}

const MAX_SOURCE_INTENSITY = 0.5;
const DAMP_FACTOR = 0.4;
const ATTACK = 0.03; // s — bloom attack, matching juice.flash snappiness

interface HaloCmd {
  x: number;
  y: number;
  radius: number;
  color: string;
  intensity: number;
  telegraph: boolean;
}

interface Bloom extends HaloCmd {
  t: number; // elapsed envelope time (held while frozen)
  duration: number;
}

export function createGlow(opts: GlowOptions): Glow {
  const width = opts.width;
  const height = opts.height;
  const scale = opts.scale ?? 3;
  const maxAlpha = Math.min(1, Math.max(0, opts.maxAlpha ?? 0.6));
  const minBloomInterval = opts.minBloomInterval ?? 0.1;
  let damped =
    opts.damped ??
    (typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)').matches
      : false);
  let frozen = false;

  // --- Radial sprite cache (tier a) — one soft radial-gradient alpha sprite
  // per color, precomputed once. No ctx.filter anywhere.
  const SPRITE_SIZE = 64; // device px; scaled to radius at blit time
  const spriteCache = new Map<string, HTMLCanvasElement>();
  function radialSprite(color: string): HTMLCanvasElement {
    let s = spriteCache.get(color);
    if (!s) {
      s = document.createElement('canvas');
      s.width = SPRITE_SIZE;
      s.height = SPRITE_SIZE;
      const c = s.getContext('2d');
      if (!c) throw new Error('2D context unavailable for glow sprite');
      const half = SPRITE_SIZE / 2;
      const g = c.createRadialGradient(half, half, 0, half, half, half);
      // Soft falloff: bright core, long tail, hard-zero edge.
      g.addColorStop(0, color);
      g.addColorStop(0.35, color + 'B0');
      g.addColorStop(0.7, color + '40');
      g.addColorStop(1, color + '00');
      c.fillStyle = g;
      c.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
      spriteCache.set(color, s);
    }
    return s;
  }

  // --- Resample-tier buffers (tier b), allocated lazily on first ctx access.
  // buffer: full device res with the scale baked in (identical drawSprite
  // calls land pixel-identical). half/quarter: successive bilinear halvings.
  let buffer: HTMLCanvasElement | null = null;
  let bufferCtx: CanvasRenderingContext2D | null = null;
  let half: HTMLCanvasElement | null = null;
  let halfCtx: CanvasRenderingContext2D | null = null;
  let quarter: HTMLCanvasElement | null = null;
  let quarterCtx: CanvasRenderingContext2D | null = null;
  let bufferUsed = false;

  function ensureBuffer(): CanvasRenderingContext2D {
    if (!bufferCtx) {
      buffer = document.createElement('canvas');
      buffer.width = width * scale;
      buffer.height = height * scale;
      const c = buffer.getContext('2d');
      if (!c) throw new Error('2D context unavailable for glow buffer');
      c.imageSmoothingEnabled = false; // crisp authoring, like the main canvas
      c.setTransform(scale, 0, 0, scale, 0, 0); // logical-space authoring
      bufferCtx = c;

      half = document.createElement('canvas');
      half.width = Math.max(1, Math.floor((width * scale) / 2));
      half.height = Math.max(1, Math.floor((height * scale) / 2));
      halfCtx = half.getContext('2d');
      quarter = document.createElement('canvas');
      quarter.width = Math.max(1, Math.floor((width * scale) / 4));
      quarter.height = Math.max(1, Math.floor((height * scale) / 4));
      quarterCtx = quarter.getContext('2d');
      if (!halfCtx || !quarterCtx) throw new Error('2D context unavailable for glow resample');
      halfCtx.imageSmoothingEnabled = true; // bilinear — the halvings ARE the blur
      quarterCtx.imageSmoothingEnabled = true;
    }
    bufferUsed = true;
    return bufferCtx;
  }

  const halos: HaloCmd[] = [];
  const blooms: Bloom[] = [];
  let sinceLastBloom = Infinity;

  function effectiveIntensity(intensity: number, telegraph: boolean): number {
    const clamped = Math.min(MAX_SOURCE_INTENSITY, Math.max(0, intensity));
    // Damper: decorative + impact categories dampened; telegraphs exempt —
    // the urgency channel is never zeroed.
    return damped && !telegraph ? clamped * DAMP_FACTOR : clamped;
  }

  function blitHalo(target: CanvasRenderingContext2D, h: HaloCmd, envelope: number): void {
    // The composite cap SCALES every source (a x maxAlpha), it is not a
    // ceiling — so the worst-case peak (intensity 0.5 x maxAlpha 0.6 = 0.30
    // alpha) keeps every legal actor color >= 3.0:1 post-CRT by design.
    const a = effectiveIntensity(h.intensity, h.telegraph) * envelope * maxAlpha;
    if (a <= 0) return;
    target.globalAlpha = a;
    // Smoothing on for the scaled radial sprite (it is soft by construction).
    target.drawImage(radialSprite(h.color), h.x - h.radius, h.y - h.radius, h.radius * 2, h.radius * 2);
  }

  return {
    get ctx() {
      return ensureBuffer();
    },

    halo(x, y, radius, color, o = {}) {
      halos.push({
        x,
        y,
        radius,
        color,
        intensity: o.intensity ?? 0.35,
        telegraph: o.telegraph ?? false,
      });
    },

    bloom(x, y, radius, color, o = {}) {
      // Photosensitivity floor: refuse to start a flash train.
      if (sinceLastBloom < minBloomInterval) return;
      sinceLastBloom = 0;
      const duration = Math.min(0.2, Math.max(0.1, o.duration ?? 0.15));
      blooms.push({
        x,
        y,
        radius,
        color,
        intensity: o.intensity ?? MAX_SOURCE_INTENSITY,
        telegraph: o.telegraph ?? false,
        t: 0,
        duration,
      });
    },

    ring(ctx, x, y, radius, color) {
      // Crisp integer 1px midpoint circle — the gameplay contract line.
      ctx.fillStyle = color;
      const cx = Math.round(x);
      const cy = Math.round(y);
      const r = Math.round(radius);
      let dx = r;
      let dy = 0;
      let err = 1 - r;
      while (dx >= dy) {
        ctx.fillRect(cx + dx, cy + dy, 1, 1);
        ctx.fillRect(cx - dx, cy + dy, 1, 1);
        ctx.fillRect(cx + dx, cy - dy, 1, 1);
        ctx.fillRect(cx - dx, cy - dy, 1, 1);
        ctx.fillRect(cx + dy, cy + dx, 1, 1);
        ctx.fillRect(cx - dy, cy + dx, 1, 1);
        ctx.fillRect(cx + dy, cy - dx, 1, 1);
        ctx.fillRect(cx - dy, cy - dx, 1, 1);
        dy++;
        if (err < 0) err += 2 * dy + 1;
        else {
          dx--;
          err += 2 * (dy - dx) + 1;
        }
      }
    },

    update(dt) {
      sinceLastBloom += dt;
      if (frozen) return; // HOLD: envelopes pinned during hit-stop
      for (let i = blooms.length - 1; i >= 0; i--) {
        blooms[i].t += dt;
        if (blooms[i].t >= blooms[i].duration) blooms.splice(i, 1);
      }
    },

    setFrozen(f) {
      frozen = f;
    },

    setDamped(d) {
      damped = d;
    },

    composite(target) {
      // ONE save/restore around the whole pass. Never touch the transform:
      // everything composites under the ambient CTM (baked scale + shake).
      target.save();
      target.globalCompositeOperation = 'lighter';

      // Tier (b): resample blur of the authoring buffer, if it was used.
      if (bufferUsed && buffer && bufferCtx && half && halfCtx && quarter && quarterCtx) {
        // Successive bilinear halvings (never a single 4x jump).
        halfCtx.clearRect(0, 0, half.width, half.height);
        halfCtx.drawImage(buffer, 0, 0, half.width, half.height);
        quarterCtx.clearRect(0, 0, quarter.width, quarter.height);
        quarterCtx.drawImage(half, 0, 0, quarter.width, quarter.height);
        // One smoothed upscale, additive, under the current CTM (logical size).
        target.imageSmoothingEnabled = true;
        target.globalAlpha = maxAlpha;
        target.drawImage(quarter, 0, 0, width, height);
        // Clear the authoring buffer for next frame (transform-proof clear).
        bufferCtx.save();
        bufferCtx.setTransform(1, 0, 0, 1, 0, 0);
        bufferCtx.clearRect(0, 0, buffer.width, buffer.height);
        bufferCtx.restore();
        bufferUsed = false;
      }

      // Tier (a): radial-sprite halos + bloom transients.
      target.imageSmoothingEnabled = true;
      for (const h of halos) blitHalo(target, h, 1);
      halos.length = 0;
      for (const b of blooms) {
        const env =
          b.t < ATTACK ? b.t / ATTACK : Math.max(0, (b.duration - b.t) / (b.duration - ATTACK));
        blitHalo(target, b, env);
      }

      target.restore();
      // Exit invariant (restored by the paired save): filter='none',
      // op='source-over', alpha=1, imageSmoothingEnabled=false. A leaked
      // 'lighter' would neutralize CRT scanlines — asserted in validation.
    },
  };
}
