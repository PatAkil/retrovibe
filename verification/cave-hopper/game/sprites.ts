import { flipSprite, makeSprite } from '../engine';
import { PAL } from './theme';

const PLAYER_MAP = { O: PAL[0], C: PAL[7], F: PAL[5], V: PAL[3] };
const PLAYER_TOP = ['..OOOO..', '.OCCCCO.', '.OCCVVO.', '.OCCCCO.', '..OCCO..',
  'OCCCCCCO', 'OCFFFFCO', 'OCFFFFCO', '.OFFFFO.', '.OCCCCO.'];

export const PLAYER_RIGHT = [
  makeSprite([...PLAYER_TOP, '.OC..CO.', 'OCC..CCO'], PLAYER_MAP),
  makeSprite([...PLAYER_TOP, '.OC..CO.', '.OC..CO.'], PLAYER_MAP),
];
export const PLAYER_LEFT = PLAYER_RIGHT.map(flipSprite);

const COIN_MAP = { d: PAL[4], G: PAL[6], H: PAL[7], O: PAL[0] };

export const COIN_FRAMES = [
  makeSprite(['.GGGG.', 'dGHHGd', 'dGHGGd', 'dGGGGd', 'dGGGGd', '.dddd.'], COIN_MAP),
  makeSprite(['..dd..', '.dGHd.', '.dGHd.', '.dGGd.', '.dGGd.', '..dd..'], COIN_MAP),
];

export const SPIKE = makeSprite(
  ['...LL...', '..OWWO..', '..WWWW..', '.OWWWWO.', '.WWWWWW.', 'ORRRRRRO'],
  { L: PAL[6], W: PAL[5], R: PAL[3], O: PAL[0] },
);

const FLAG_MAP = { P: PAL[7], F: PAL[5], D: PAL[3], O: PAL[0] };
const POLE = '.PO.....';
const BASE = 'DDDDO...';

export const FLAG_FRAMES = [
  makeSprite(['.PO.....', '.PFFFFO.', '.PFFFFFO', '.PFFFFO.', '.PFFO...',
    POLE, POLE, POLE, POLE, POLE, POLE, BASE], FLAG_MAP),
  makeSprite(['.PO.....', '.PFFO...', '.PFFFFO.', '.PFFFFFO', '.PFFFFO.',
    '.PFFO...', POLE, POLE, POLE, POLE, POLE, BASE], FLAG_MAP),
];
