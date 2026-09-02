// VERIFICATION FIXTURE — space-dodge. FROZEN: a verbatim copy of the reference
// game's archetype (see the verifying-graphics skill for when a fixture may
// change). Measures the engine under the canonical style card: PICO8 on black,
// 'stars' ambient, three hue-separated actors, red death flash + hit-stop.
//
// Reference game — the minimal complete game every skill points to.
// Title → play (move a ship, collect pickups, dodge a hazard; contact = lose)
// → game over → restart. Proves every engine rule: fixed-step loop, A/B/PAUSE
// actions with labels-in-code, scene machine, starfield, burst+shake+flash+
// hit-stop (with the freeze-frame actually rendered) on death, chiptune sfx
// (unlocked on first keypress), safe-margin HUD, CRT filter, runtime messaging.
//
// STYLE CARD (this combination is RESERVED for the reference game — every
// generated game must diverge, see ensuring-arcade-visuals):
//   palette PICO8 — bg 0 (black), ship 12 (blue), pickup 10 (yellow),
//   hazard 8 (red) · ambient 'stars' · silhouettes: arrow-ship / cut gem /
//   spiked mine · far layer: dithered horizon haze + a dark corner planet
//   · juice: red death flash, hard freeze-frame · attract-screen title (logo +
//   hero ship). ART: footprint-preserving PX=1 redraws, keyline authored into
//   the rows, 2-frame frameIndex animation, far layer under the ambient band.

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
  drawSprite,
  drawTextCentered,
  frameIndex,
  fillDither,
  drawFrame,
  drawLogo,
  pulse,
  drawScore,
  hudText,
  BUTTON_KEY,
  PICO8,
  SAFE_MARGIN,
} from '../engine';

// --- Setup -------------------------------------------------------------------

const W = 240;
const H = 160;

const pc = createPixelCanvas({
  width: W,
  height: H,
  scale: 3,
  parent: document.getElementById('screen'),
});

const audio = createAudio();
// Actions are DECLARED here with their labels — the title screen renders hints
// from these declarations (controlHints), so labels can never drift.
const input = createInput(
  [
    { button: 'A', label: 'start' },
    { button: 'PAUSE', label: 'pause' },
  ],
  { onFirstKey: () => audio.unlock() },
);
const scenes = createScenes();
const particles = createParticles({ width: W, height: H, ambient: 'stars' });
const juice = createJuice();
const crt = createCrt();
const runtime = createRuntime();

// --- Sprites -----------------------------------------------------------------
// ART (same language as the reference game): each actor is drawn at PX=1 with a
// sprite whose CELL COUNT equals its rendered footprint — 10x8 ship, 6x6 pickup,
// 6x6 hazard — so the hitboxes and every scripted collision below are unchanged.
// The 1-cell dark keyline is authored INTO the rows ('o'), never baked on.

const PX = 1;

const SHIP_ROWS = [
  '....oo....',
  '...o##o...',
  '...owwo...',
  '..o#ww#o..',
  '.o##ww##o.',
  'o########o',
  'o#oo##oo#o',
];
// Two 8th rows = a 2-frame engine flicker (frameIndex): a ship that is ON.
const shipFrames = [
  makeSprite([...SHIP_ROWS, '.e..ee..e.'], { o: PICO8[1], '#': PICO8[12], w: PICO8[7], e: PICO8[7] }),
  makeSprite([...SHIP_ROWS, '....ee....'], { o: PICO8[1], '#': PICO8[12], w: PICO8[7], e: PICO8[6] }),
];
// A cut gem whose white glint MOVES between the two frames — the sparkle is the
// animation; the silhouette never changes.
const GEM_MAP = { d: PICO8[9], '#': PICO8[10], w: PICO8[7] };
const pickupFrames = [
  makeSprite(['..##..', '.w##d.', 'w####d', '#####d', '.d##d.', '..dd..'], GEM_MAP),
  makeSprite(['..##..', '.##wd.', '#w###d', '####wd', '.d##d.', '..dd..'], GEM_MAP),
];
// A spiked mine with a dark core: spikes on the AXES, then on the DIAGONALS —
// alternating the two frames reads as a slow tumble.
const MINE_MAP = { '#': PICO8[8], k: PICO8[2] };
const hazardFrames = [
  makeSprite(['#.##.#', '.####.', '##kk##', '##kk##', '.####.', '#.##.#'], MINE_MAP),
  makeSprite(['..##..', '#.##.#', '.#kk#.', '.#kk#.', '#.##.#', '..##..'], MINE_MAP),
];
// FAR LAYER: a dark planet, terminator dithered by hand. One tone, PICO8[1]
// (1.57:1 vs black — under the ambient band): depth that can never be mistaken
// for something the player can touch.
const planetSprite = makeSprite(
  ['....pppp....', '..pppppppp..', '.ppppppppp..', '.pppppppp.p.',
   'ppppppppp.p.', 'pppppppp.p..', 'ppppppppp.p.', 'pppppppp.p..',
   '.pppppppp.p.', '.ppppppppp..', '..ppppppp...', '....pppp....'],
  { p: PICO8[1] },
);

// --- World state -------------------------------------------------------------

interface Entity {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SHIP_SPEED = 90;
// Hitboxes match the rendered sprite sizes (PX * cell counts) within 1 px.
const SHIP_W = 10;
const SHIP_H = 8;
const ITEM_SIZE = 6;
// Difficulty ramp: felt inside 30 s, threatening by ~2 min (endless game bar).
const PICKUP_SPEEDUP = 1.12; // per pickup
const TIME_SPEEDUP = 0.01; // +1%/s compounding, so idling doesn't stall the ramp

const ship: Entity = { x: W / 2 - SHIP_W / 2, y: H - 30, w: SHIP_W, h: SHIP_H };
let pickup: Entity = { x: 0, y: 0, w: ITEM_SIZE, h: ITEM_SIZE };
const hazard: Entity & { vx: number; vy: number } = {
  x: 20, y: 20, w: ITEM_SIZE, h: ITEM_SIZE, vx: 55, vy: 40,
};
let score = 0;
let dying = false; // death seen; GAME_OVER deferred until the hit-stop expires
let clock = 0; // ONE accumulated clock — drives every animation, nothing else

function placePickup(): void {
  pickup = {
    x: SAFE_MARGIN + Math.random() * (W - 2 * SAFE_MARGIN - ITEM_SIZE),
    y: SAFE_MARGIN + 12 + Math.random() * (H - 2 * SAFE_MARGIN - 12 - 28 - ITEM_SIZE),
    w: ITEM_SIZE,
    h: ITEM_SIZE,
  };
}

function resetWorld(): void {
  ship.x = W / 2 - SHIP_W / 2;
  ship.y = H - 30;
  hazard.x = 20;
  hazard.y = 20;
  hazard.vx = 55;
  hazard.vy = 40;
  score = 0;
  dying = false;
  placePickup();
}

function overlaps(a: Entity, b: Entity): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Scene-entry side effects: reset the world on (re)entering PLAYING from a
// terminal/title state, and notify the host of every transition.
scenes.onEnter('PLAYING', () => {
  runtime.stateChanged('PLAYING');
});
scenes.onEnter('TITLE', () => runtime.stateChanged('TITLE'));
scenes.onEnter('PAUSED', () => runtime.stateChanged('PAUSED'));
scenes.onEnter('GAME_OVER', () => {
  runtime.stateChanged('GAME_OVER');
  runtime.gameOver({ score, won: false });
});

// --- Update ------------------------------------------------------------------

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
      // Death flow: the frozen tableau renders for the whole hit-stop —
      // transition to GAME_OVER only when it expires (see juice.ts floors).
      if (dying) {
        if (!juice.frozen) scenes.to('GAME_OVER');
        break;
      }
      if (input.pressed('PAUSE')) {
        audio.play('blip');
        scenes.to('PAUSED');
        break;
      }
      if (juice.frozen) break; // hit-stop pauses the world

      // Ship movement, kept inside the safe play area.
      ship.x += input.dir.x * SHIP_SPEED * dt;
      ship.y += input.dir.y * SHIP_SPEED * dt;
      ship.x = Math.max(SAFE_MARGIN, Math.min(W - SAFE_MARGIN - ship.w, ship.x));
      ship.y = Math.max(SAFE_MARGIN, Math.min(H - SAFE_MARGIN - ship.h, ship.y));

      // Hazard bounces around the arena — and creeps faster over time, so the
      // ramp is felt even without collecting pickups.
      const timeRamp = 1 + TIME_SPEEDUP * dt;
      hazard.vx *= timeRamp;
      hazard.vy *= timeRamp;
      hazard.x += hazard.vx * dt;
      hazard.y += hazard.vy * dt;
      if (hazard.x < SAFE_MARGIN || hazard.x > W - SAFE_MARGIN - hazard.w) hazard.vx *= -1;
      if (hazard.y < SAFE_MARGIN || hazard.y > H - SAFE_MARGIN - hazard.h) hazard.vy *= -1;

      // Pickup: score + small celebratory burst (game-palette color, centered).
      if (overlaps(ship, pickup)) {
        score += 10;
        runtime.scoreChanged(score);
        audio.play('pickup');
        particles.burst(pickup.x + pickup.w / 2, pickup.y + pickup.h / 2, {
          count: 5, color: PICO8[10],
        });
        // Speed the hazard up so difficulty ramps and losing stays reachable.
        hazard.vx *= PICKUP_SPEEDUP;
        hazard.vy *= PICKUP_SPEEDUP;
        placePickup();
      }

      // Hazard contact = lose: big burst, shake, flash, hit-stop — the world
      // freezes in PLAYING so the tableau is visible; GAME_OVER comes after.
      if (overlaps(ship, hazard)) {
        audio.play('explosion');
        particles.burst(ship.x + ship.w / 2, ship.y + ship.h / 2, {
          count: 10, color: PICO8[8], speed: 140,
        });
        juice.shake(5, 0.45);
        juice.flash(PICO8[8], 0.35);
        juice.hitStop(0.15);
        dying = true;
      }
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

/** FAR LAYER: four sparse dither strips under a rising alpha ramp read as haze
 *  thickening toward a horizon (a flat slab would read as a FLOOR and compete),
 *  plus a corner planet and a hairline arena bezel. Static; all under the band. */
function renderBackdrop(): void {
  for (let i = 0; i < 4; i++) {
    pc.ctx.globalAlpha = 0.2 + i * 0.16;
    fillDither(pc.ctx, 0, H - 26 + i * 7, W, 7, PICO8[0], PICO8[1], 'sparse');
  }
  pc.ctx.globalAlpha = 0.85;
  drawSprite(pc.ctx, planetSprite, W - 48, 12, 2);
  pc.ctx.globalAlpha = 1;
  drawFrame(pc.ctx, 0, 0, W, H, PICO8[1], 1);
}

function render(): void {
  // Clear FIRST, un-shaken — clearing inside the shake translate would leave
  // stale pixels along the canvas edges for the duration of the shake.
  pc.clear(PICO8[0]);
  juice.preRender(pc.ctx);
  renderBackdrop(); // far layer BEHIND the starfield — depth is layer order
  particles.render(pc.ctx);

  switch (scenes.current) {
    case 'TITLE': {
      // An ATTRACT SCREEN, not a text card: a lit logo, the hero ship large and
      // running, one line of hook, then the hints.
      drawLogo(pc.ctx, 'RETROVIBE', W, 16, {
        color: PICO8[10], shade: PICO8[9], shadow: PICO8[1], scale: 3,
      });
      drawTextCentered(pc.ctx, 'COLLECT + DODGE', W, 38, { color: PICO8[6] });
      drawSprite(pc.ctx, shipFrames[frameIndex(clock, 12, 2)], (W - 50) / 2, 48, 5);
      drawTextCentered(pc.ctx, `PRESS ${BUTTON_KEY.A.hint}`, W, 100, {
        color: pulse(clock, 1.2) > 0.5 ? PICO8[7] : PICO8[6], scale: 2,
      });
      // Control hints rendered FROM the action declarations — never hand-written.
      const hints = controlHints(input);
      hints.forEach((hint, i) => {
        drawTextCentered(pc.ctx, hint, W, 116 + i * 9, { color: PICO8[6] });
      });
      drawTextCentered(pc.ctx, 'ARROWS/WASD MOVE', W, 116 + hints.length * 9, {
        color: PICO8[5],
      });
      break;
    }
    case 'PLAYING':
    case 'PAUSED': {
      drawSprite(pc.ctx, pickupFrames[frameIndex(clock, 6, 2)], pickup.x, pickup.y, PX);
      drawSprite(pc.ctx, hazardFrames[frameIndex(clock, 8, 2)], hazard.x, hazard.y, PX);
      drawSprite(pc.ctx, shipFrames[frameIndex(clock, 12, 2)], ship.x, ship.y, PX);
      drawScore(pc, score);
      if (scenes.is('PAUSED')) {
        hudText(pc, 'PAUSED', 'center', 'middle', { color: PICO8[10], scale: 2 });
      }
      break;
    }
    case 'GAME_OVER': {
      drawFrame(pc.ctx, 44, 46, W - 88, 72, PICO8[5], 1);
      drawTextCentered(pc.ctx, 'GAME OVER', W, 56, { color: PICO8[8], scale: 2 });
      drawTextCentered(pc.ctx, `SCORE ${score}`, W, 80, { color: PICO8[7] });
      drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, W, 100, { color: PICO8[6] });
      break;
    }
    case 'WIN': {
      drawFrame(pc.ctx, 44, 46, W - 88, 72, PICO8[5], 1);
      drawTextCentered(pc.ctx, 'YOU WIN', W, 56, { color: PICO8[11], scale: 2 });
      drawTextCentered(pc.ctx, `SCORE ${score}`, W, 80, { color: PICO8[7] });
      drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, W, 100, { color: PICO8[6] });
      break;
    }
  }

  juice.postRender(pc.ctx, W, H);
  crt.render(pc.ctx, W, H, 1 / 60);
}

createLoop({ update, render }).start();
