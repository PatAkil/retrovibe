// palette.ts — curated retro palettes (PICO-8-style) + palette-swap support
// + the contrast() legality check.
// Palettes are plain readonly arrays of hex strings; index by role. A swapped
// palette is a new array, so easter eggs can toggle between them cheaply.
//
// COLOR LEGALITY (the floor is the gate; roles are guidance):
// every gameplay-critical entity color must have contrast(entity, surface)
// >= 3.0 against every STATIC surface it can overlap — the clear color and
// drawn scenery/terrain. Ambient particle colors sit in a prominence band
// just above the background: contrast vs the clear color between ~1.8 and
// ~2.5 (tune toward the top), at 1-2 px sizes — visible atmosphere that is
// structurally incapable of competing with actors.

export type Palette = readonly string[];

/**
 * The default 16-colour PICO-8 palette. Indices are stable — refer by number.
 * Roles (guidance — contrast() decides legality):
 *   background: 0, 1, 2, 5
 *   scenery:    3, 4, 6, 13, 15  (usable for terrain; still subject to the
 *               3:1 floor vs any actor that overlaps it)
 *   actor:      7, 8, 9, 10, 11, 12, 14
 */
export const PICO8: Palette = [
  '#000000', // 0  black        (background)
  '#1D2B53', // 1  dark-blue    (background)
  '#7E2553', // 2  dark-purple  (background)
  '#008751', // 3  dark-green   (scenery)
  '#AB5236', // 4  brown        (scenery)
  '#5F574F', // 5  dark-grey    (background)
  '#C2C3C7', // 6  light-grey   (scenery)
  '#FFF1E8', // 7  white        (actor)
  '#FF004D', // 8  red          (actor)
  '#FFA300', // 9  orange       (actor)
  '#FFEC27', // 10 yellow       (actor)
  '#00E436', // 11 green        (actor)
  '#29ADFF', // 12 blue         (actor)
  '#83769C', // 13 lavender     (scenery)
  '#FF77A8', // 14 pink         (actor)
  '#FFCCAA', // 15 peach        (scenery)
];

/** A muted 4-tone Game Boy palette (index 0 = darkest — background; 3 = actor). */
export const GAMEBOY: Palette = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'];

/** A dusk/twilight ramp for moody scenes (0-2 background, 3-4 scenery, 5-7 actor). */
export const DUSK: Palette = [
  '#0d0221', '#241734', '#3b2352', '#5a3a7e',
  '#7b5aa6', '#a678de', '#d59bf6', '#f6c6ea',
];

/** Neon/synthwave: hot magenta-cyan on deep violet (0-2 background, 3 scenery, 4-7 actor). */
export const NEON: Palette = [
  '#0b0221', '#1d0f3c', '#33125c', '#6e2594',
  '#ff2975', '#ff6ec7', '#00f0ff', '#f8f8ff',
];

/** Warm sunset: dusk sky to ember highlights (0-2 background, 3 scenery, 4-7 actor). */
export const SUNSET: Palette = [
  '#1f0a24', '#45152e', '#7a2130', '#b0413e',
  '#e2703a', '#ff9b54', '#ffd166', '#fff1d0',
];

/** Cold ocean: abyss blues to foam (0-2 background, 3 scenery, 4-7 actor). */
export const OCEAN: Palette = [
  '#04101e', '#0a2239', '#134a6b', '#1f7a8c',
  '#2ab7ca', '#5ce1e6', '#a9f0d1', '#f0fff1',
];

/** All named palettes, for enumeration in tooling/skills. */
export const PALETTES: Readonly<Record<string, Palette>> = {
  pico8: PICO8,
  gameboy: GAMEBOY,
  dusk: DUSK,
  neon: NEON,
  sunset: SUNSET,
  ocean: OCEAN,
};

/**
 * Return a new palette with the given index→index remapping applied.
 * Unmapped indices keep their original colour. Feeds palette-swap easter eggs.
 *   swapPalette(PICO8, { 8: 12, 12: 8 })  // swap red<->blue
 */
export function swapPalette(p: Palette, mapping: Record<number, number>): Palette {
  return p.map((color, i) => {
    const target = mapping[i];
    return target !== undefined && p[target] !== undefined ? p[target] : color;
  });
}

const linear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number => {
  const h = hex.replace('#', '');
  return (
    0.2126 * linear(parseInt(h.slice(0, 2), 16)) +
    0.7152 * linear(parseInt(h.slice(2, 4), 16)) +
    0.0722 * linear(parseInt(h.slice(4, 6), 16))
  );
};

/**
 * WCAG relative-luminance contrast ratio between two hex colors (1 to 21).
 * The legality gate: gameplay-critical entity vs any static surface it can
 * overlap must be >= 3.0; ambient particles vs the clear color sit in the
 * ~1.8-2.5 prominence band.
 */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
