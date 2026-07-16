// palette.ts — curated retro palettes (PICO-8-style) + palette-swap support.
// Palettes are plain readonly arrays of hex strings; index by role. A swapped
// palette is a new array, so easter eggs can toggle between them cheaply.

export type Palette = readonly string[];

/** The default 16-colour PICO-8 palette. Indices are stable — refer by number. */
export const PICO8: Palette = [
  '#000000', // 0  black
  '#1D2B53', // 1  dark-blue
  '#7E2553', // 2  dark-purple
  '#008751', // 3  dark-green
  '#AB5236', // 4  brown
  '#5F574F', // 5  dark-grey
  '#C2C3C7', // 6  light-grey
  '#FFF1E8', // 7  white
  '#FF004D', // 8  red
  '#FFA300', // 9  orange
  '#FFEC27', // 10 yellow
  '#00E436', // 11 green
  '#29ADFF', // 12 blue
  '#83769C', // 13 lavender
  '#FF77A8', // 14 pink
  '#FFCCAA', // 15 peach
];

/** A muted 4-tone Game Boy palette (index 0 = darkest). */
export const GAMEBOY: Palette = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'];

/** A dusk/twilight ramp for moody scenes. */
export const DUSK: Palette = [
  '#0d0221', '#241734', '#3b2352', '#5a3a7e',
  '#7b5aa6', '#a678de', '#d59bf6', '#f6c6ea',
];

/** All named palettes, for enumeration in tooling/skills. */
export const PALETTES: Readonly<Record<string, Palette>> = {
  pico8: PICO8,
  gameboy: GAMEBOY,
  dusk: DUSK,
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
