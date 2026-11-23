import { makeSprite, PICO8 } from '../engine';

const SHIP_ROWS = ['.......##.......', '......o##o......', '......o##o......',
  '.....o#ll#o.....', '.....o#ww#o.....', '....o##ww##o....', '...ol######lo...',
  '.ol##########lo.', 'ol############lo', 'o##oo######oo##o', '....o##oo##o....'];
const SHIP_MAP = { o: PICO8[1], '#': PICO8[12], l: PICO8[6], w: PICO8[7], e: PICO8[10] };
const FLAME_WIDE = '.....ee..ee.....';
const FLAME_NARROW = '......e..e......';

export const SHIP_FRAMES = [
  makeSprite([...SHIP_ROWS, FLAME_WIDE], SHIP_MAP),
  makeSprite([...SHIP_ROWS, FLAME_NARROW], { ...SHIP_MAP, e: PICO8[9] }),
];

export const SHIP_FLASH = makeSprite([...SHIP_ROWS, FLAME_WIDE],
  { o: PICO8[12], '#': PICO8[7], l: PICO8[7], w: PICO8[7], e: PICO8[7] });

export const DEBRIS = makeSprite(['..d..........d..', '.d#d...d....d#..',
  '....d.....d.....', '..d...d#d.......', '.......d#d....d.', '...d#d.......d..',
  '..........d#d...', '.d....d.........', '.....d...d....d.', '..d#d.......d#d.',
  '.......d........', '....d.....d.....'], { '#': PICO8[6], d: PICO8[5] });

const GEM_A = ['...##...', '..w###..', '.w#####.', '#w#####d',
  '#####ddd', '.####dd.', '..##dd..', '...dd...'];
const GEM_B = ['...##...', '..####..', '.######.', '##w####d',
  '###w#ddd', '.####dd.', '..##dd..', '...dd...'];
const GEM_MAP = { d: PICO8[9], '#': PICO8[10], w: PICO8[7] };
const GEM_HOT = { d: PICO8[10], '#': PICO8[9], w: PICO8[7] };

export const PICKUP_FRAMES = [makeSprite(GEM_A, GEM_MAP), makeSprite(GEM_B, GEM_MAP)];
export const PICKUP_HOT_FRAMES = [makeSprite(GEM_A, GEM_HOT), makeSprite(GEM_B, GEM_HOT)];

const MINE_MAP = { '#': PICO8[8], k: PICO8[2], h: PICO8[14] };
const MINE_HOT = { '#': PICO8[14], k: PICO8[2], h: PICO8[7] };
const MINE_A = ['....##....', '...####...', '..h#####..', '.#h######.', '####kk####',
  '####kk####', '.########.', '..######..', '...####...', '....##....'];
const MINE_B = ['##......##', '.##....##.', '..h#####..', '.#h######.', '.###kk###.',
  '.###kk###.', '.########.', '..######..', '.##....##.', '##......##'];

export const HAZARD_FRAMES = [makeSprite(MINE_A, MINE_MAP), makeSprite(MINE_B, MINE_MAP)];
export const HAZARD_HOT_FRAMES = [makeSprite(MINE_A, MINE_HOT), makeSprite(MINE_B, MINE_HOT)];

export const PLANET = makeSprite(['....pppp....', '..pppppppp..', '.ppppppppp..',
  '.pppppppp.p.', 'ppppppppp.p.', 'pppppppp.p..', 'ppppppppp.p.', 'pppppppp.p..',
  '.pppppppp.p.', '.ppppppppp..', '..ppppppp...', '....pppp....'], { p: PICO8[1] });
