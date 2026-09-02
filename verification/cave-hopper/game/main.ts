// VERIFICATION FIXTURE — cave-hopper. FROZEN: edit only under the fixture rule
// in the verifying-graphics skill. Measures what space-dodge cannot: actors
// over STATIC SURFACES (tiles, ledges, spikes), a non-black warm background,
// 'embers' ambient, a lives HUD, a minor landing burst next to a major death
// tableau, respawn, and both terminal scenes (WIN flag, GAME_OVER on 0 lives).
//
// STYLE CARD: palette SUNSET — cave depth banded/dithered 0→1 with far rock
// humps (0) and stalactite + side-wall silhouettes (1) well under the ambient
// band; terrain = beveled slabs (fill 2, light 3, dark 1) with a dithered rock
// face and a lit top lip; the pit is a 1→0→black gradient, not a seam.
// Actors carry authored dark outlines and 2-frame animation: player cream 7
// with a 5 fold and a 3 visor (walk/idle + facing flip), coin gold 6 with a 7
// glint (wide/narrow spin), spikes a 4 body under a CREAM 7 tip with 3 only as
// the 1-px base shadow (body 4.72:1 vs the floor, 3.17:1 vs the slab; tip 7 is
// 13.4:1 / 8.98:1 — hazard and pickup differ in hue AND tip value), flag a 5
// pennant
// on a 7 pole (flutter) · ambient 'embers' at ambientCount 28 (the default 48
// read as dirt on the cave wall) · juice: orange death flash, hard
// freeze-frame, tiny landing puff; terminal screens dimScene the world behind a
// HOLLOW drawFrame bezel (dim OR plate, never both). TITLE: drawLogo + the
// player as a prop at px 2 on a ledge — the authored keyline scales with px, so
// a bigger prop needs a bigger sprite, not a bigger cell.

import {
  createPixelCanvas,
  createLoop,
  createInput,
  controlHints,
  createScenes,
  createParticles,
  createJuice,
  createAudio,
  createCrt,
  createRuntime,
  makeSprite,
  flipSprite,
  frameIndex,
  drawSprite,
  drawTextCentered,
  drawLogo,
  drawBevel,
  drawFrame,
  fillBands,
  fillDither,
  blink,
  drawScore,
  drawLives,
  hudText,
  dimScene,
  BUTTON_KEY,
  SUNSET,
} from '../engine';

// --- Setup -------------------------------------------------------------------

const W = 240;
const H = 160;
const PAL = SUNSET;

const pc = createPixelCanvas({
  width: W,
  height: H,
  scale: 3,
  parent: document.getElementById('screen'),
});

const audio = createAudio();
const input = createInput(
  [
    { button: 'A', label: 'jump' },
    { button: 'PAUSE', label: 'pause' },
  ],
  { onFirstKey: () => audio.unlock() },
);
const scenes = createScenes();
const particles = createParticles({ width: W, height: H, ambient: 'embers', ambientCount: 28 });
const juice = createJuice();
const crt = createCrt();
const runtime = createRuntime();

// --- Sprites (authored at 1 logical px per cell — footprints unchanged) -------

const PX = 1;

// Player: 8x12 cells. O = authored dark keyline, C = cream body, F = fold
// shading, V = visor. Two frames (stride / passing) + a mirrored facing set.
const PLAYER_MAP = { O: PAL[0], C: PAL[7], F: PAL[5], V: PAL[3] };
const PLAYER_TOP = [
  '..OOOO..',
  '.OCCCCO.',
  '.OCCVVO.',
  '.OCCCCO.',
  '..OCCO..',
  'OCCCCCCO',
  'OCFFFFCO',
  'OCFFFFCO',
  '.OFFFFO.',
  '.OCCCCO.',
];
const playerRight = [
  makeSprite([...PLAYER_TOP, '.OC..CO.', 'OCC..CCO'], PLAYER_MAP),
  makeSprite([...PLAYER_TOP, '.OC..CO.', '.OC..CO.'], PLAYER_MAP),
];
const playerLeft = playerRight.map(flipSprite);

// Coin: 6x6 cells, gold body with a cream glint and an orange rim. Two frames
// spin the disc wide→narrow.
const COIN_MAP = { d: PAL[4], G: PAL[6], H: PAL[7], O: PAL[0] };
const coinFrames = [
  makeSprite(
    ['.GGGG.', 'dGHHGd', 'dGHGGd', 'dGGGGd', 'dGGGGd', '.dddd.'],
    COIN_MAP,
  ),
  makeSprite(
    ['..dd..', '.dGHd.', '.dGHd.', '.dGGd.', '.dGGd.', '..dd..'],
    COIN_MAP,
  ),
];

// Spikes: 8x6 cells — a CREAM 7 tip over a 4 body, with 3 used ONLY as the
// 1-px base shadow. The old form put 3 across the lower half, the same tone as
// the slab's light lip, so the hazard read as a bump in the terrain; and its
// tip was gold 6, the coin's own body colour, so hazard and pickup shared a
// hue. Cream 7 separates them in BOTH hue and tip value (the coin's 7 is a
// 2-cell glint inside a gold disc; the spike's is the whole point).
// contrast(): body 4 vs cave floor 1 = 4.72:1, vs slab 2 = 3.17:1; tip 7 is
// 13.4:1 / 8.98:1. Authored black sides keep the silhouette off the rock.
const spikeSprite = makeSprite(
  [
    '...LL...',
    '..OWWO..',
    '..WWWW..',
    '.OWWWWO.',
    '.WWWWWW.',
    'ORRRRRRO',
  ],
  { L: PAL[7], W: PAL[4], R: PAL[3], O: PAL[0] },
);

// Flag: 8x12 cells — cream pole, peach pennant, 2-frame flutter.
const FLAG_MAP = { P: PAL[7], F: PAL[5], D: PAL[3], O: PAL[0] };
const flagFrames = [
  makeSprite(
    [
      '.PO.....',
      '.PFFFFO.',
      '.PFFFFFO',
      '.PFFFFO.',
      '.PFFO...',
      '.PO.....',
      '.PO.....',
      '.PO.....',
      '.PO.....',
      '.PO.....',
      '.PO.....',
      'DDDDO...',
    ],
    FLAG_MAP,
  ),
  makeSprite(
    [
      '.PO.....',
      '.PFFO...',
      '.PFFFFO.',
      '.PFFFFFO',
      '.PFFFFO.',
      '.PFFO...',
      '.PO.....',
      '.PO.....',
      '.PO.....',
      '.PO.....',
      '.PO.....',
      'DDDDO...',
    ],
    FLAG_MAP,
  ),
];

// --- Level -------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const solids: Rect[] = [
  { x: 0, y: 144, w: 104, h: 16 }, // ground, left of the pit
  { x: 136, y: 144, w: 104, h: 16 }, // ground, right of the pit
  { x: 56, y: 112, w: 32, h: 8 },
  { x: 136, y: 96, w: 40, h: 8 },
  { x: 192, y: 72, w: 40, h: 8 },
];
const spikes: Rect[] = [
  { x: 72, y: 138, w: 8, h: 6 },
  { x: 160, y: 138, w: 8, h: 6 },
];
const coinSpots: Rect[] = [
  { x: 40, y: 132, w: 6, h: 6 },
  { x: 68, y: 100, w: 6, h: 6 },
  { x: 152, y: 84, w: 6, h: 6 },
];
const goal: Rect = { x: 216, y: 60, w: 8, h: 12 };
const START = { x: 12, y: 132 };
const PIT = { x: 104, w: 32 };

// Cave dressing — fixed geometry, no randomness (the capture is deterministic).
const STALACTITES: Array<[number, number, number]> = [
  [4, 11, 15], [24, 7, 9], [42, 13, 20], [68, 8, 11], [90, 15, 24],
  [116, 9, 12], [136, 12, 17], [160, 7, 9], [178, 14, 21], [204, 8, 12],
  [222, 11, 16],
];
const FAR_ROCKS: Array<[number, number, number]> = [
  [-6, 44, 20], [50, 30, 13], [148, 46, 22], [198, 42, 15],
];
const SIDE_TEETH = [7, 4, 9, 5, 8, 4, 10, 6, 7, 5, 9, 4, 8, 6, 7, 5, 9, 4, 6, 8];

// Platformer tuning — starting points from building-platformer-games.
const GRAVITY = 900;
const JUMP_VELOCITY = -280;
const JUMP_CUT = 0.4;
const MOVE_SPEED = 90;
const MAX_FALL = 300;
const COYOTE_TIME = 0.1;
const JUMP_BUFFER = 0.12;

const player = {
  x: START.x, y: START.y, w: 8, h: 12,
  vx: 0, vy: 0, onGround: false, coyote: 0, buffer: 0, facing: 1,
};
let coins: Rect[] = [];
let score = 0;
let lives = 3;
let dying = false;
let clock = 0; // animation clock — drives walk cycles, coin spin, flutter, blink

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function respawn(): void {
  player.x = START.x;
  player.y = START.y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.coyote = 0;
  player.buffer = 0;
  player.facing = 1;
}

function resetWorld(): void {
  coins = coinSpots.map((c) => ({ ...c }));
  score = 0;
  lives = 3;
  dying = false;
  respawn();
}

scenes.onEnter('PLAYING', () => runtime.stateChanged('PLAYING'));
scenes.onEnter('TITLE', () => runtime.stateChanged('TITLE'));
scenes.onEnter('PAUSED', () => runtime.stateChanged('PAUSED'));
scenes.onEnter('GAME_OVER', () => {
  runtime.stateChanged('GAME_OVER');
  runtime.gameOver({ score, won: false });
});
scenes.onEnter('WIN', () => {
  runtime.stateChanged('WIN');
  runtime.gameOver({ score, won: true });
});

// --- Update ------------------------------------------------------------------

function loseLife(): void {
  audio.play('explosion');
  particles.burst(player.x + player.w / 2, player.y + player.h / 2, {
    count: 10, color: PAL[4], speed: 140,
  });
  juice.shake(5, 0.45);
  juice.flash(PAL[4], 0.35);
  juice.hitStop(0.15);
  lives -= 1;
  dying = true; // resolved when the hit-stop expires: respawn or GAME_OVER
}

function updatePlayer(dt: number): void {
  player.vx = input.dir.x * MOVE_SPEED;
  if (input.dir.x !== 0) player.facing = input.dir.x > 0 ? 1 : -1;

  if (input.pressed('A')) player.buffer = JUMP_BUFFER;
  else player.buffer = Math.max(0, player.buffer - dt);
  if (player.onGround) player.coyote = COYOTE_TIME;
  else player.coyote = Math.max(0, player.coyote - dt);

  if (player.buffer > 0 && player.coyote > 0) {
    player.vy = JUMP_VELOCITY;
    player.buffer = 0;
    player.coyote = 0;
    player.onGround = false;
    audio.play('jump');
  }
  if (input.released('A') && player.vy < 0) player.vy *= JUMP_CUT;

  player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL);
  const wasAirborne = !player.onGround;

  // X fully first...
  player.x += player.vx * dt;
  for (const s of solids) {
    if (!overlaps(player, s)) continue;
    if (player.vx > 0) player.x = s.x - player.w;
    else if (player.vx < 0) player.x = s.x + s.w;
  }
  player.x = Math.max(0, Math.min(W - player.w, player.x));

  // ...then Y.
  player.onGround = false;
  player.y += player.vy * dt;
  for (const s of solids) {
    if (!overlaps(player, s)) continue;
    if (player.vy > 0) {
      player.y = s.y - player.h;
      player.vy = 0;
      player.onGround = true;
    } else if (player.vy < 0) {
      player.y = s.y + s.h;
      player.vy = 0;
    }
  }

  // Landing — a minor event: small puff, tiny shake.
  if (wasAirborne && player.onGround) {
    particles.burst(player.x + player.w / 2, player.y + player.h, {
      count: 3, color: PAL[3], speed: 40, life: 0.3,
    });
    juice.shake(1, 0.08);
  }

  // Coins — minor pickup burst in the coin's own color.
  for (let i = coins.length - 1; i >= 0; i--) {
    if (!overlaps(player, coins[i])) continue;
    const c = coins[i];
    coins.splice(i, 1);
    score += 10;
    runtime.scoreChanged(score);
    audio.play('pickup');
    particles.burst(c.x + c.w / 2, c.y + c.h / 2, { count: 5, color: PAL[6] });
  }

  if (overlaps(player, goal)) {
    audio.play('pickup');
    juice.flash(PAL[6], 0.3);
    scenes.to('WIN');
    return;
  }

  // Lose: spikes, or falling into the pit.
  if (player.y > H || spikes.some((s) => overlaps(player, s))) loseLife();
}

function startPlaying(): void {
  resetWorld();
  scenes.to('PLAYING');
}

function update(dt: number): void {
  clock += dt;
  juice.update(dt);
  particles.update(dt);

  switch (scenes.current) {
    case 'TITLE': {
      if (input.pressed('A')) {
        audio.play('blip');
        startPlaying();
      }
      break;
    }
    case 'PLAYING': {
      if (dying) {
        if (!juice.frozen) {
          dying = false;
          if (lives <= 0) scenes.to('GAME_OVER');
          else respawn();
        }
        break;
      }
      if (input.pressed('PAUSE')) {
        audio.play('blip');
        scenes.to('PAUSED');
        break;
      }
      if (juice.frozen) break;
      updatePlayer(dt);
      break;
    }
    case 'PAUSED': {
      if (input.pressed('PAUSE')) {
        audio.play('blip');
        scenes.to('PLAYING');
      }
      break;
    }
    case 'GAME_OVER':
    case 'WIN': {
      if (input.pressed('A')) {
        audio.play('blip');
        startPlaying();
      }
      break;
    }
  }

  input.endFrame();
}

// --- Render ------------------------------------------------------------------

/** Downward-tapering silhouette (stalactite). */
function drawSpike(x: number, w: number, h: number, color: string): void {
  pc.ctx.fillStyle = color;
  for (let r = 0; r < h; r++) {
    const inset = Math.floor((r * (w / 2)) / h);
    const rw = w - 2 * inset;
    if (rw <= 0) break;
    pc.ctx.fillRect(x + inset, r, rw, 1);
  }
}

/** Rounded rock hump rising from `base`. */
function drawHump(x: number, w: number, h: number, base: number, color: string): void {
  pc.ctx.fillStyle = color;
  for (let r = 0; r < h; r++) {
    const inset = Math.floor(((h - r) * (w / 2.6)) / h);
    const rw = w - 2 * inset;
    if (rw <= 0) continue;
    pc.ctx.fillRect(x + inset, base - h + r, rw, 1);
  }
}

/** Two-band cave depth + far rock humps + stalactite / side-wall silhouettes. */
function drawCave(): void {
  const ctx = pc.ctx;
  fillBands(ctx, 0, 0, W, 104, [PAL[0], PAL[0]]);
  // A short ladder low in the frame reads as the floor of the cave lifting
  // toward the light; a tall one would read as stripes across the play area.
  fillDither(ctx, 0, 104, W, 5, PAL[0], PAL[1], 'sparse');
  fillDither(ctx, 0, 109, W, 5, PAL[0], PAL[1], 'checker');
  fillDither(ctx, 0, 114, W, 5, PAL[1], PAL[0], 'sparse');
  ctx.fillStyle = PAL[1];
  ctx.fillRect(0, 119, W, H - 119);

  for (const [x, w, h] of FAR_ROCKS) drawHump(x, w, h, 146, PAL[0]);
  for (const [x, w, h] of STALACTITES) drawSpike(x, w, h, PAL[1]);

  // Cave walls closing in from the sides.
  for (let i = 0; i < SIDE_TEETH.length; i++) {
    const y = i * 8;
    const t = SIDE_TEETH[i];
    ctx.fillStyle = y < 100 ? PAL[1] : PAL[0];
    ctx.fillRect(0, y, t, 8);
    ctx.fillRect(W - t, y, t, 8);
  }
}

/** A beveled rock slab with a dithered face and a lit top lip. */
function drawSlab(x: number, y: number, w: number, h: number): void {
  // The lit lip is a single dithered 2/4 row and the bevel light is 2, NOT 3:
  // 3 is the spike body's neighbour tone, and a slab lip in 3 made the hazards
  // read as part of the terrain they stand on.
  drawBevel(pc.ctx, x, y, w, h, PAL[2], PAL[2], PAL[1]);
  if (h > 3) fillDither(pc.ctx, x + 1, y + 3, w - 2, h - 4, PAL[2], PAL[1], 'sparse');
  fillDither(pc.ctx, x + 1, y + 1, w - 2, 1, PAL[2], PAL[4], 'sparse');
}

function drawLevel(): void {
  // The pit reads as depth, not a seam: a gradient falling away into black.
  fillBands(pc.ctx, PIT.x, 132, PIT.w, H - 132, [PAL[1], PAL[0], PAL[0]]);
  for (const s of solids) drawSlab(s.x, s.y, s.w, s.h);
  const coinFrame = coinFrames[frameIndex(clock, 3, coinFrames.length)];
  for (const s of spikes) drawSprite(pc.ctx, spikeSprite, s.x, s.y, PX);
  for (const c of coins) drawSprite(pc.ctx, coinFrame, c.x, c.y, PX);
  drawSprite(pc.ctx, flagFrames[frameIndex(clock, 4, flagFrames.length)], goal.x, goal.y, PX);
}

function playerFrame(): number {
  if (!player.onGround) return 1;
  if (player.vx === 0) return 0;
  return frameIndex(clock, 8, 2);
}

function drawPlayer(): void {
  const set = player.facing < 0 ? playerLeft : playerRight;
  drawSprite(pc.ctx, set[playerFrame()], Math.round(player.x), Math.round(player.y), PX);
}

function drawTerminal(headline: string, color: string): void {
  drawLevel();
  drawPlayer();
  // Dim OR plate, never both: the dim IS the backing, so the bezel is HOLLOW
  // and the world stays visible inside it (the reference game's treatment).
  dimScene(pc, 0.6);
  drawFrame(pc.ctx, 52, 38, 136, 62, PAL[3], 1);
  drawTextCentered(pc.ctx, headline, W, 48, { color, scale: 2 });
  drawTextCentered(pc.ctx, `SCORE ${score}`, W, 72, { color: PAL[7], shadow: true });
  // Always visible, breathing between two palette tones — never a missing prompt.
  drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, W, 88, {
    color: blink(clock, 1.0, 0.6) ? PAL[6] : PAL[5],
    shadow: true,
  });
}

function render(): void {
  pc.clear(PAL[0]);
  juice.preRender(pc.ctx);
  drawCave();
  particles.render(pc.ctx);

  switch (scenes.current) {
    case 'TITLE': {
      drawLogo(pc.ctx, 'CAVE HOPPER', W, 18, {
        color: PAL[6], shade: PAL[5], shadow: PAL[1], scale: 3,
      });
      drawTextCentered(pc.ctx, 'HOP THE SPIKES  REACH THE FLAG', W, 42, { color: PAL[5] });

      // The hero shot: the player big on a lit ledge, a coin waiting.
      drawSlab(40, 104, 68, 10);
      // px 2, not 4: the keyline is AUTHORED INTO THE ROWS, so it scales with
      // px — at 4 the 1-cell outline became 4-px black bands and the runner
      // read as a striped blob. At 2 the sprite still reads as a figure.
      drawSprite(pc.ctx, playerRight[frameIndex(clock, 3, 2)], 62, 80, 2);
      // The hero coin is a prop, not an actor — always the full disc.
      drawSprite(pc.ctx, coinFrames[0], 124, 92, 2);

      // Hint text sits at scale 1 over the dither ladder: it carries a shadow.
      drawTextCentered(pc.ctx, `PRESS ${BUTTON_KEY.A.hint} TO START`, W, 118, {
        color: blink(clock, 1.0, 0.6) ? PAL[7] : PAL[5],
        shadow: true,
      });
      const hints = controlHints(input);
      hints.forEach((hint, i) => {
        drawTextCentered(pc.ctx, hint, W, 130 + i * 8, { color: PAL[6], shadow: true });
      });
      drawTextCentered(pc.ctx, 'ARROWS/WASD MOVE', W, 130 + hints.length * 8, {
        color: PAL[3],
        shadow: true,
      });
      break;
    }
    case 'PLAYING':
    case 'PAUSED': {
      drawLevel();
      drawPlayer();
      drawScore(pc, score);
      drawLives(pc, lives);
      if (scenes.is('PAUSED')) {
        hudText(pc, 'PAUSED', 'center', 'middle', { color: PAL[6], scale: 2 });
      }
      break;
    }
    case 'GAME_OVER': {
      drawTerminal('GAME OVER', PAL[4]);
      break;
    }
    case 'WIN': {
      drawTerminal('YOU WIN', PAL[6]);
      break;
    }
  }

  juice.postRender(pc.ctx, W, H);
  crt.render(pc.ctx, W, H, 1 / 60);
}

createLoop({ update, render }).start();
