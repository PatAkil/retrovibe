export type AmbientPreset = 'stars' | 'rain' | 'snow' | 'embers' | 'bubbles';

type Depth = 0 | 1 | 2 | 3;

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  seed: number;
  rate: number;
  base: number;
  amp: number;
  sharp: number;
  wob: number;
  wobRate: number;
  gloss: string;
}

interface Layer {
  depth: Depth;
  z: number;
  tint: string;
  gloss: boolean;
}

export interface AmbientField {
  readonly width: number;
  readonly height: number;
  readonly count: number;
}

interface Clump {
  cx: number;
  cy: number;
}

const TAU = Math.PI * 2;
const SPARK_DEPTH = 3;
const WRAP_PAD = 4;
const AMBIENT_TINT: Readonly<Record<AmbientPreset, string>> = {
  stars: '#45413F',
  rain: '#104668',
  snow: '#3B444C',
  embers: '#5C3B00',
  bubbles: '#453F53',
};
const DEPTH_SHADE: Readonly<Record<Depth, number | null>> = { 0: 0.85, 1: null, 2: 1.1, 3: 1.15 };
const GLOSS_SHADE = 1.15;
const STAR_TWINKLE: Readonly<Record<Depth, { base: number; amp: number }>> = {
  0: { base: 0.88, amp: 0.12 },
  1: { base: 0.92, amp: 0.08 },
  2: { base: 0.82, amp: 0.18 },
  3: { base: 0.6, amp: 0.4 },
};

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

function shade(hex: string, f: number): string {
  const h = hex.replace('#', '');
  let out = '#';
  for (let i = 0; i < 3; i++) {
    const v = Math.min(255, Math.max(0, Math.round(parseInt(h.slice(i * 2, i * 2 + 2), 16) * f)));
    out += v.toString(16).padStart(2, '0');
  }
  return out;
}

function toneFor(tint: string, depth: Depth): string {
  const f = DEPTH_SHADE[depth];
  return f === null ? tint : shade(tint, f);
}

const TUNE: Readonly<Record<AmbientPreset, (p: Mote, layer: Layer) => void>> = {
  stars(p, { depth, z }) {
    p.vy = rand(1.5, 5) + z * 7;
    p.base = STAR_TWINKLE[depth].base;
    p.amp = STAR_TWINKLE[depth].amp;
    if (depth === SPARK_DEPTH) {p.rate = rand(1.1, 2.4);}
  },
  rain(p, { depth, z }) {
    p.h = depth >= 2 ? 3 : 2;
    p.vx = -22 - z * 22;
    p.vy = 130 + z * 130;
    p.base = 1;
    p.amp = 0;
  },
  snow(p, { z }) {
    p.vy = 10 + z * 26;
    p.wob = 1 + z * 2;
    p.wobRate = rand(0.4, 1.1);
    p.base = 0.88;
    p.amp = 0.12;
  },
  embers(p, { depth, z }) {
    p.vy = -(14 + z * 34);
    p.vx = rand(-5, 5);
    p.wob = 1 + z * 2;
    p.wobRate = rand(0.6, 1.6);
    p.sharp = 3;
    const spark = depth === SPARK_DEPTH;
    p.base = spark ? 0.5 : 0.85;
    p.amp = spark ? 0.5 : 0.15;
    p.rate = spark ? rand(1.0, 2.2) : rand(0.5, 1.4);
  },
  bubbles(p, { depth, z, tint, gloss }) {
    p.vy = -(8 + z * 24);
    p.vx = rand(-3, 3);
    p.wob = 1.5 + z * 2.5;
    p.wobRate = rand(0.5, 1.3);
    p.base = 0.9;
    p.amp = 0.1;
    if (depth === 2 && gloss) {p.gloss = shade(tint, GLOSS_SHADE);}
  },
};

function spawnMote(preset: AmbientPreset, layer: Layer, x: number, y: number): Mote {
  const size = layer.depth === 2 ? 2 : 1;
  const p: Mote = {
    x, y, vx: 0, vy: 0,
    w: size,
    h: size,
    color: toneFor(layer.tint, layer.depth),
    seed: rand(0, TAU),
    rate: rand(0.6, 1.8),
    base: 0.92,
    amp: 0.08,
    sharp: 1,
    wob: 0,
    wobRate: rand(0.5, 1.4),
    gloss: '',
  };
  TUNE[preset](p, layer);
  return p;
}

function depthOf(i: number, count: number, sparks: boolean): Depth {
  if (sparks && i % 17 === 5) {return SPARK_DEPTH;}
  const r = i / count;
  return r < 0.5 ? 0 : r < 0.82 ? 1 : 2;
}

function clumpedPosition(field: AmbientField, clump: Clump, i: number, spread: { x: number; y: number }): [number, number] {
  const { width, height } = field;
  if (i % 4 === 0) {
    clump.cx = rand(0, width);
    clump.cy = rand(0, height);
    return [clump.cx, clump.cy];
  }
  const x = (clump.cx + rand(-spread.x, spread.x) + width) % width;
  const y = (clump.cy + rand(-spread.y, spread.y) + height) % height;
  return [x, y];
}

function clumpSpread(preset: AmbientPreset, depth: Depth, height: number): { x: number; y: number } {
  const rising = preset === 'embers' || preset === 'bubbles';
  return rising
    ? { x: 6 + depth * 3, y: height * 0.45 }
    : { x: 14 + depth * 10, y: 14 + depth * 10 };
}

export function buildAmbient(field: AmbientField, preset: AmbientPreset, color: string | undefined): Mote[] {
  const { width, height, count } = field;
  const sparks = preset === 'stars' || preset === 'embers';
  const clumps = preset !== 'rain';
  const tint = color ?? AMBIENT_TINT[preset];
  const clump: Clump = { cx: rand(0, width), cy: rand(0, height) };
  const motes: Mote[] = [];
  for (let i = 0; i < count; i++) {
    const depth = depthOf(i, count, sparks);
    const [x, y] = clumps
      ? clumpedPosition(field, clump, i, clumpSpread(preset, depth, height))
      : [rand(0, width), rand(0, height)];
    const layer: Layer = { depth, z: depth === SPARK_DEPTH ? 0.7 : depth / 2, tint, gloss: i % 2 === 0 };
    motes.push(spawnMote(preset, layer, x, y));
  }
  return motes;
}

function wrap(p: Mote, field: AmbientField): void {
  const { width, height } = field;
  if (p.x < -WRAP_PAD) {p.x = width + WRAP_PAD;}
  else if (p.x > width + WRAP_PAD) {p.x = -WRAP_PAD;}
  if (p.y < -WRAP_PAD) {p.y = height + WRAP_PAD;}
  else if (p.y > height + WRAP_PAD) {p.y = -WRAP_PAD;}
}

export function driftAmbient(motes: readonly Mote[], field: AmbientField, dt: number): void {
  for (const p of motes) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    wrap(p, field);
  }
}

function moteAlpha(p: Mote, clock: number): number {
  let u = 0.5 + 0.5 * Math.sin(clock * p.rate + p.seed);
  if (p.sharp !== 1) {u = u ** p.sharp;}
  const a = p.base + p.amp * u;
  return a > 1 ? 1 : a;
}

export function renderAmbient(ctx: CanvasRenderingContext2D, motes: readonly Mote[], clock: number): void {
  for (const p of motes) {
    ctx.globalAlpha = moteAlpha(p, clock);
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
}
