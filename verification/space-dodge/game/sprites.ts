import { makeSprite, PICO8 } from '../engine';

const SHIP_ROWS = ['.......##.......', '......o##o......', '......o##o......',
  '.....o#ll#o.....', '.....o#ww#o.....', '....o##ww##o....', '...ol######lo...',
  '.ol##########lo.', 'ol############lo', 'o##oo######oo##o', '....o##oo##o....'];
const SHIP_MAP = { o: PICO8[1], '#': PICO8[12], l: PICO8[6], w: PICO8[7], e: PICO8[10] };

export const SHIP_FRAMES = [
  makeSprite([...SHIP_ROWS, '.....ee..ee.....'], SHIP_MAP),
  makeSprite([...SHIP_ROWS, '......e..e......'], { ...SHIP_MAP, e: PICO8[9] }),
];

const GEM_MAP = { d: PICO8[9], '#': PICO8[10], w: PICO8[7] };

export const PICKUP_FRAMES = [
  makeSprite(['...##...', '..w###..', '.w#####.', '#w#####d',
    '#####ddd', '.####dd.', '..##dd..', '...dd...'], GEM_MAP),
  makeSprite(['...##...', '..####..', '.######.', '##w####d',
    '###w#ddd', '.####dd.', '..##dd..', '...dd...'], GEM_MAP),
];

const MINE_MAP = { '#': PICO8[8], k: PICO8[2], h: PICO8[14] };

export const HAZARD_FRAMES = [
  makeSprite(['....##....', '...####...', '..h#####..', '.#h######.', '####kk####',
    '####kk####', '.########.', '..######..', '...####...', '....##....'], MINE_MAP),
  makeSprite(['##......##', '.##....##.', '..h#####..', '.#h######.', '.###kk###.',
    '.###kk###.', '.########.', '..######..', '.##....##.', '##......##'], MINE_MAP),
];

export const PLANET = makeSprite(['....pppp....', '..pppppppp..', '.ppppppppp..',
  '.pppppppp.p.', 'ppppppppp.p.', 'pppppppp.p..', 'ppppppppp.p.', 'pppppppp.p..',
  '.pppppppp.p.', '.ppppppppp..', '..ppppppp...', '....pppp....'], { p: PICO8[1] });
