export type Palette = readonly string[];

type FixedPalette<N extends number, Acc extends readonly string[] = readonly []> = Acc['length'] extends N
  ? Acc
  : FixedPalette<N, readonly [...Acc, string]>;

export const PICO8: FixedPalette<16> = [
  '#000000',
  '#1D2B53',
  '#7E2553',
  '#008751',
  '#AB5236',
  '#5F574F',
  '#C2C3C7',
  '#FFF1E8',
  '#FF004D',
  '#FFA300',
  '#FFEC27',
  '#00E436',
  '#29ADFF',
  '#83769C',
  '#FF77A8',
  '#FFCCAA',
];
export const GAMEBOY: FixedPalette<4> = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'];
export const DUSK: FixedPalette<8> = [
  '#0d0221', '#241734', '#3b2352', '#5a3a7e',
  '#7b5aa6', '#a678de', '#d59bf6', '#f6c6ea',
];

export const NEON: FixedPalette<8> = [
  '#0b0221', '#1d0f3c', '#33125c', '#6e2594',
  '#ff2975', '#ff6ec7', '#00f0ff', '#f8f8ff',
];

export const SUNSET: FixedPalette<8> = [
  '#1f0a24', '#45152e', '#7a2130', '#b0413e',
  '#e2703a', '#ff9b54', '#ffd166', '#fff1d0',
];

export const OCEAN: FixedPalette<8> = [
  '#04101e', '#0a2239', '#134a6b', '#1f7a8c',
  '#2ab7ca', '#5ce1e6', '#a9f0d1', '#f0fff1',
];

export const PALETTES: Readonly<Record<string, Palette>> = {
  pico8: PICO8,
  gameboy: GAMEBOY,
  dusk: DUSK,
  neon: NEON,
  sunset: SUNSET,
  ocean: OCEAN,
};
export function swapPalette(p: Palette, mapping: Record<number, number>): Palette {
  return p.map((color, i) => {
    const target = mapping[i];
    return target !== undefined && p[target] !== undefined ? p[target] : color;
  });
}
export function parseHex(color: string): readonly [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (hex === undefined) {return null;}
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const linear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number => {
  const rgb = parseHex(hex);
  if (!rgb) {return 0;}
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
};
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}