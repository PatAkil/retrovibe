import { makeSprite } from '../engine';
import { PAL } from './theme';

export const BALL = makeSprite(
  ['.####.', '######', '######', '#####s', '###sss', '.#sss.'],
  { '#': PAL[7], s: PAL[6] },
);

export const CORAL = makeSprite(['..#..', '#.#.#', '#.#.#', '.###.', '..#..'], { '#': PAL[2] });
export const ROCK = makeSprite(['..###..', '.#####.', '#######'], { '#': PAL[2] });

interface ShellStyle { fill: string; light: string; dark: string }

export const ROW_STYLE: readonly ShellStyle[] = [
  { fill: PAL[8], light: PAL[14], dark: PAL[2] },
  { fill: PAL[9], light: PAL[15], dark: PAL[4] },
  { fill: PAL[10], light: PAL[7], dark: PAL[9] },
  { fill: PAL[11], light: PAL[7], dark: PAL[3] },
];
