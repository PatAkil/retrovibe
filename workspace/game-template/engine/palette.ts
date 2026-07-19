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

// --- Shade ladders (WS1: shaded sprites — metadata only, NO palette
// constants change) --------------------------------------------------------
//
// Each entry maps a palette color (exact hex spelling as it appears in the
// palette constant above — lookup is case-sensitive) to its ordered chain of
// darker on-palette steps: index 0 = one step down, index 1 = two steps down,
// etc. Ladders were AUDITED, not assumed: every step was computed against
// contrast() so the DARKEST step still clears the 3.0:1 actor floor vs every
// documented background color of its palette, and each step stays within a
// ~35 degree hue-drift band of its parent (near-grey colors are exempt from
// the hue check but chains were still hand-curated for hue coherence).
//
// DEGRADE-TO-FLAT IS EXPLICIT, never silent: any palette color absent from
// its SHADE_LADDERS record renders flat when a ramp is requested, and every
// such color is listed by name in SHADE_FLAT below. Notable audit outcomes:
// - Ramp palettes (SUNSET/OCEAN/DUSK/GAMEBOY/NEON) get ladders on their top
//   actor colors nearly for free; depth is capped by the darkest-step 3.0
//   floor (a mid-ramp actor is 0-1 bands before it fails the floor).
// - PICO8 is 16 distinct hues, not a ramp. The floor (vs backgrounds
//   0/1/2/5, including dark-grey #5F574F) eliminates most predicted
//   siblings: green's dark-green sibling is only 1.55:1 vs dark-grey, blue
//   has no darker sibling above the floor. Only white, yellow, and peach
//   carry ladders. Appending dark siblings to PICO8 is a fast-follow, not v1.

/** Per-color darker-step chains for one palette: hex -> ordered darker hexes. */
export type ShadeLadders = Readonly<Record<string, readonly string[]>>;

/** Audited shade-ladder metadata, keyed like PALETTES. Metadata only. */
export const SHADE_LADDERS: Readonly<Record<string, ShadeLadders>> = {
  pico8: {
    '#FFF1E8': ['#FFCCAA', '#C2C3C7'], // white -> peach -> light-grey (min 4.02:1 vs bg)
    '#FFEC27': ['#FFA300'],            // yellow -> orange (17deg drift, 3.54:1 floor)
    '#FFCCAA': ['#FFA300'],            // peach -> orange (14deg drift, 3.54:1 floor)
  },
  gameboy: {
    '#9bbc0f': ['#8bac0f'], // lightest -> light (5.03:1 vs darkest bg)
  },
  dusk: {
    '#d59bf6': ['#a678de'], // lavender -> mid-violet (4.11:1 vs bg 0-2)
    // '#f6c6ea' (pink-white) is FLAT: its only darker sibling drifts 37deg.
  },
  neon: {
    '#f8f8ff': ['#00f0ff'], // ghost-white -> cyan (10.79:1; near-grey parent)
    '#ff6ec7': ['#ff2975'], // hot-pink -> magenta (4.22:1 vs bg 0-2)
  },
  sunset: {
    '#fff1d0': ['#ffd166', '#ff9b54', '#e2703a'], // cream -> gold -> amber -> ember (3.17:1 floor)
    '#ffd166': ['#ff9b54', '#e2703a'],            // gold -> amber -> ember
    '#ff9b54': ['#e2703a'],                       // amber -> ember
  },
  ocean: {
    '#f0fff1': ['#a9f0d1', '#5ce1e6', '#2ab7ca'], // foam -> mint -> aqua -> teal (3.93:1 floor)
    '#a9f0d1': ['#5ce1e6', '#2ab7ca'],            // mint -> aqua -> teal
    '#5ce1e6': ['#2ab7ca'],                       // aqua -> teal
  },
};

/**
 * Colors that EXPLICITLY degrade to flat under a shading ramp (no ladder step
 * clears both the 3.0:1 darkest-step floor vs their palette's backgrounds and
 * the hue-drift band). Listed so the degradation is never silent.
 */
export const SHADE_FLAT: Readonly<Record<string, readonly string[]>> = {
  pico8: [
    '#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F',
    '#C2C3C7', '#FF004D', '#FFA300', '#00E436', '#29ADFF', '#83769C', '#FF77A8',
  ],
  gameboy: ['#0f380f', '#306230', '#8bac0f'],
  dusk: ['#0d0221', '#241734', '#3b2352', '#5a3a7e', '#7b5aa6', '#a678de', '#f6c6ea'],
  neon: ['#0b0221', '#1d0f3c', '#33125c', '#6e2594', '#ff2975', '#00f0ff'],
  sunset: ['#1f0a24', '#45152e', '#7a2130', '#b0413e', '#e2703a'],
  ocean: ['#04101e', '#0a2239', '#134a6b', '#1f7a8c', '#2ab7ca'],
};

// Merged hex -> ladder index across all palettes (hex spellings are unique
// across the six palettes, so a flat lookup is unambiguous).
const SHADE_INDEX: Record<string, readonly string[]> = {};
for (const ladders of Object.values(SHADE_LADDERS)) {
  for (const [hex, chain] of Object.entries(ladders)) SHADE_INDEX[hex] = chain;
}

/**
 * The audited darker-step chain for a palette color (exact hex spelling), or
 * an empty array when the color degrades to flat. Used by makeSprite's bake.
 */
export function shadeLadder(color: string): readonly string[] {
  return SHADE_INDEX[color] ?? [];
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
