import type { Rect } from '../engine';

export type Silhouette = readonly [x: number, w: number, h: number];

export const SOLIDS: readonly Rect[] = [
  { x: 0, y: 144, w: 104, h: 16 },
  { x: 136, y: 144, w: 104, h: 16 },
  { x: 56, y: 112, w: 32, h: 8 },
  { x: 136, y: 96, w: 40, h: 8 },
  { x: 192, y: 72, w: 40, h: 8 },
];
export const SPIKES: readonly Rect[] = [
  { x: 72, y: 138, w: 8, h: 6 },
  { x: 160, y: 138, w: 8, h: 6 },
];
export const COIN_SPOTS: readonly Rect[] = [
  { x: 40, y: 132, w: 6, h: 6 },
  { x: 68, y: 100, w: 6, h: 6 },
  { x: 152, y: 84, w: 6, h: 6 },
];
export const GOAL: Rect = { x: 216, y: 60, w: 8, h: 12 };
export const START = { x: 12, y: 132 };
export const PIT = { x: 104, w: 32 };

export const STALACTITES: readonly Silhouette[] = [
  [4, 11, 15], [24, 7, 9], [42, 13, 20], [68, 8, 11], [90, 15, 24],
  [116, 9, 12], [136, 12, 17], [160, 7, 9], [178, 14, 21], [204, 8, 12],
  [222, 11, 16],
];
export const FAR_ROCKS: readonly Silhouette[] = [
  [-6, 44, 20], [50, 30, 13], [148, 46, 22], [198, 42, 15],
];
export const SIDE_TEETH = [7, 4, 9, 5, 8, 4, 10, 6, 7, 5, 9, 4, 8, 6, 7, 5, 9, 4, 6, 8];
