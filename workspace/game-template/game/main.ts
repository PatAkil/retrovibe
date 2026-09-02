// Reference game — the minimal complete game every skill points to. Title →
// play (move a ship, collect pickups, dodge a hazard; contact = lose) → game
// over → restart. Proves every engine rule: fixed-step loop, A/B/PAUSE actions
// with labels-in-code, scene machine, starfield, burst+shake+flash+hit-stop on
// death, chiptune sfx, safe-margin HUD, CRT filter, runtime messaging.
//
// It also shows the PRESENTATION patterns that separate a demo from a cabinet,
// each marked PATTERN below: one clock drives every animation, idle actors
// breathe, pickups pop a score, death escalates, every screen says what to
// press. And the ART rules: actors REDRAWN inside their existing footprint
// (cell count == rendered px, hitboxes never move) at PX=1, keyline authored
// INTO the rows; a 2-frame frameIndex loop per actor; a LAYERED background (a
// game-drawn far layer under the ambient, below the ambient band); an
// attract-screen title.
//
// STYLE CARD (this whole COMBINATION is RESERVED for the reference game — every
// generated game must diverge, see ensuring-arcade-visuals): palette PICO8 —
// bg 0, ship 12/7 (blue hull, white cockpit, keyline 1), pickup 10/9/7 (gem +
// travelling glint), hazard 8/2 (spiked mine, dark core, pulsing to 14) ·
// ambient 'stars' over a FAR LAYER of dithered horizon haze + a PICO8[1] planet
// · silhouettes arrow-ship / cut gem / spiked mine · juice: red death flash,
// hard freeze-frame, DEBRIS on death · "+10" SCORE POPS · BEST · "GET READY" ·
// attract title: logo, hero ship at px 5, hook line, pulsing prompt.

import {
  createPixelCanvas, createLoop, createInput, controlHints, createScenes,
  createParticles, createJuice, createAudio, createCrt, createRuntime,
  makeSprite, drawSprite, drawText, drawTextCentered, textWidth, frameIndex,
  fillDither, drawFrame, drawLogo, drawScore, hudText, dimScene, blink, pulse,
  BUTTON_KEY, PICO8, SAFE_MARGIN,
} from '../engine';

// --- Setup -------------------------------------------------------------------

const W = 240;
const H = 160;
const pc = createPixelCanvas({ width: W, height: H, scale: 3, parent: document.getElementById('screen') });
const audio = createAudio();
// Actions are DECLARED with their labels — controlHints renders the title
// screen's hints from them, so the labels can never drift.
const input = createInput(
  [{ button: 'A', label: 'start' }, { button: 'PAUSE', label: 'pause' }],
  { onFirstKey: () => audio.unlock() },
);
const scenes = createScenes();
const particles = createParticles({ width: W, height: H, ambient: 'stars' });
const juice = createJuice();
const crt = createCrt();
const runtime = createRuntime();

// --- Sprites -----------------------------------------------------------------
// PATTERN (art): PX=1 with a sprite whose CELL COUNT equals its rendered
// footprint — 10x8 ship, 6x6 pickup, 6x6 hazard, hitboxes unchanged. The dark
// keyline is AUTHORED INTO the rows ('o'), not baked by makeSprite's `outline`
// option (which would grow w/h and move the hitbox).
const PX = 1;
const HULL = PICO8[12]; // cool blue — the player's hue family
const SHIP_ROWS = ['....oo....', '...o##o...', '...owwo...', '..o#ww#o..',
  '.o##ww##o.', 'o########o', 'o#oo##oo#o'];
/** Engine flicker: two 8th rows, alternated by frameIndex — a ship that is ON. */
const shipFrames = [
  makeSprite([...SHIP_ROWS, '.e..ee..e.'], { o: PICO8[1], '#': HULL, w: PICO8[7], e: PICO8[7] }),
  makeSprite([...SHIP_ROWS, '....ee....'], { o: PICO8[1], '#': HULL, w: PICO8[7], e: PICO8[6] })];
// PATTERN: a same-shape, brighter twin is the cheapest "I felt that" flash.
const shipFlashSprite = makeSprite([...SHIP_ROWS, '.e..ee..e.'],
  { o: PICO8[12], '#': PICO8[7], w: PICO8[7], e: PICO8[7] });
// The ship is visibly GONE during the death tableau: debris replaces it.
const debrisSprite = makeSprite(['..d....d..', '.d#d..d#..', '....d.....',
  '.d..d#d...', '...d#d..d.', '.....d..#d', '..d#d.....', '....d.d...'],
  { '#': PICO8[6], d: PICO8[5] });
// A cut gem whose white glint MOVES between frames — that is the sparkle.
const GEM_A = ['..##..', '.w##d.', 'w####d', '#####d', '.d##d.', '..dd..'];
const GEM_B = ['..##..', '.##wd.', '#w###d', '####wd', '.d##d.', '..dd..'];
const GEM_MAP = { d: PICO8[9], '#': PICO8[10], w: PICO8[7] };
const GEM_HOT = { d: PICO8[10], '#': PICO8[9], w: PICO8[7] };
const pickupFrames = [makeSprite(GEM_A, GEM_MAP), makeSprite(GEM_B, GEM_MAP)];
const pickupHotFrames = [makeSprite(GEM_A, GEM_HOT), makeSprite(GEM_B, GEM_HOT)];
// A spiked mine with a dark core; the two frames tumble its barbs.
const MINE_MAP = { '#': PICO8[8], k: PICO8[2] };
const MINE_HOT = { '#': PICO8[14], k: PICO8[2] };
const MINE_A = ['#.##.#', '.####.', '##kk##', '##kk##', '.####.', '#.##.#'];
const MINE_B = ['..##..', '#.##.#', '.#kk#.', '.#kk#.', '#.##.#', '..##..'];
const hazardFrames = [makeSprite(MINE_A, MINE_MAP), makeSprite(MINE_B, MINE_MAP)];
const hazardHotFrames = [makeSprite(MINE_A, MINE_HOT), makeSprite(MINE_B, MINE_HOT)];
// FAR LAYER: a planet, terminator dithered by hand so the lit limb fades into
// the night side. ONE tone, PICO8[1] — 1.57:1 vs black, BELOW the ambient band,
// so it reads as depth, never as something you can touch.
const planetSprite = makeSprite(['....pppp....', '..pppppppp..', '.ppppppppp..',
  '.pppppppp.p.', 'ppppppppp.p.', 'pppppppp.p..', 'ppppppppp.p.', 'pppppppp.p..',
  '.pppppppp.p.', '.ppppppppp..', '..ppppppp...', '....pppp....'], { p: PICO8[1] });

// --- World state -------------------------------------------------------------

interface Entity { x: number; y: number; w: number; h: number }
interface Pop { x: number; y: number; life: number; text: string }
const SHIP_SPEED = 90;
const SHIP_W = 10; // hitboxes match the rendered sprite sizes within 1 px
const SHIP_H = 8;
const ITEM_SIZE = 6;
// Difficulty ramp: felt inside 30 s, threatening by ~2 min (endless bar).
const PICKUP_SPEEDUP = 1.12; // per pickup
const TIME_SPEEDUP = 0.01; // +1%/s compounding, so idling doesn't stall the ramp
const READY_TIME = 0.75; // "GET READY" beat before the hazard is armed
const POP_LIFE = 0.7;
const ship: Entity = { x: W / 2 - SHIP_W / 2, y: H - 30, w: SHIP_W, h: SHIP_H };
let pickup: Entity = { x: 0, y: 0, w: ITEM_SIZE, h: ITEM_SIZE };
const hazard: Entity & { vx: number; vy: number } =
  { x: 20, y: 20, w: ITEM_SIZE, h: ITEM_SIZE, vx: 55, vy: 40 };
// PATTERN: floating "+10" pops — a HUD number alone is invisible.
const pops: Pop[] = [];
let score = 0;
let best = 0; // module scope IS the persistence floor; storage below is a bonus
let dying = false; // death seen; GAME_OVER deferred until the hit-stop expires
let ready = 0; // > 0 while "GET READY" runs (hazard held, ship blinks)
let squash = 0; // > 0 briefly after a pickup — drives the ship flash
// PATTERN: ONE accumulated clock, fed by the fixed-step dt, drives every
// animation. Never Date.now()/setInterval (improving-game-quality §9).
let clock = 0;
// localStorage is wrapped: headless/sandboxed hosts can throw on access.
const BEST_KEY = 'retrovibe.reference.best';
try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch { /* module-scope best still works */ }

let beatBest = false; // captured before `best` moves, so a tie is not a record

function saveBest(): void {
  beatBest = score > best;
  if (!beatBest) return;
  best = score;
  try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* never break the game */ }
}

function placePickup(): void {
  const x = SAFE_MARGIN + Math.random() * (W - 2 * SAFE_MARGIN - ITEM_SIZE);
  const y = SAFE_MARGIN + 12 + Math.random() * (H - 2 * SAFE_MARGIN - 40 - ITEM_SIZE);
  pickup = { x, y, w: ITEM_SIZE, h: ITEM_SIZE };
}

function resetWorld(): void {
  ship.x = W / 2 - SHIP_W / 2; ship.y = H - 30;
  hazard.x = 20; hazard.y = 20; hazard.vx = 55; hazard.vy = 40;
  score = 0; dying = false; ready = READY_TIME; squash = 0;
  pops.length = 0;
  placePickup();
}

function overlaps(a: Entity, b: Entity): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function startPlaying(): void { resetWorld(); scenes.to('PLAYING'); }

// Scene-entry side effects: report every transition; terminal scenes bank BEST.
scenes.onEnter('TITLE', () => runtime.stateChanged('TITLE'));
scenes.onEnter('PLAYING', () => runtime.stateChanged('PLAYING'));
scenes.onEnter('PAUSED', () => runtime.stateChanged('PAUSED'));
scenes.onEnter('GAME_OVER', () => {
  saveBest(); runtime.stateChanged('GAME_OVER'); runtime.gameOver({ score, won: false });
});
// Nothing calls scenes.to('WIN') here — but THIS is the wiring to copy.
scenes.onEnter('WIN', () => {
  saveBest(); runtime.stateChanged('WIN'); runtime.gameOver({ score, won: true });
});

// --- Update ------------------------------------------------------------------

function update(dt: number): void {
  clock += dt;
  juice.update(dt);
  // Ambient drifts in EVERY scene, PAUSED included — only the world freezes.
  particles.update(dt);
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.life -= dt;
    p.y -= 18 * dt; // rises as it fades
    if (p.life <= 0) pops.splice(i, 1);
  }

  switch (scenes.current) {
    case 'TITLE': { if (input.pressed('A')) { audio.play('blip'); startPlaying(); } break; }
    case 'PLAYING': {
      // Death flow: the tableau renders for the whole hit-stop; GAME_OVER after.
      if (dying) { if (!juice.frozen) scenes.to('GAME_OVER'); break; }
      if (input.pressed('PAUSE')) { audio.play('blip'); scenes.to('PAUSED'); break; }
      if (juice.frozen) break; // hit-stop pauses the world
      if (squash > 0) squash = Math.max(0, squash - dt);
      // GET READY: steering works, the hazard is held — no run starts unfairly.
      if (ready > 0) ready = Math.max(0, ready - dt);

      // Ship movement, kept inside the safe play area.
      ship.x += input.dir.x * SHIP_SPEED * dt; ship.y += input.dir.y * SHIP_SPEED * dt;
      ship.x = Math.max(SAFE_MARGIN, Math.min(W - SAFE_MARGIN - ship.w, ship.x));
      ship.y = Math.max(SAFE_MARGIN, Math.min(H - SAFE_MARGIN - ship.h, ship.y));

      if (ready <= 0) {
        // The hazard bounces, and creeps faster over time, so the ramp is felt
        // even by a player who collects nothing.
        const timeRamp = 1 + TIME_SPEEDUP * dt;
        hazard.vx *= timeRamp; hazard.vy *= timeRamp;
        hazard.x += hazard.vx * dt; hazard.y += hazard.vy * dt;
        if (hazard.x < SAFE_MARGIN || hazard.x > W - SAFE_MARGIN - hazard.w) hazard.vx *= -1;
        if (hazard.y < SAFE_MARGIN || hazard.y > H - SAFE_MARGIN - hazard.h) hazard.vy *= -1;
      }

      // Pickup: score, a palette burst, a floating "+10", and a ship flash.
      if (overlaps(ship, pickup)) {
        score += 10; runtime.scoreChanged(score); audio.play('pickup');
        particles.burst(pickup.x + pickup.w / 2, pickup.y + pickup.h / 2, { count: 5, color: PICO8[10] });
        pops.push({ x: pickup.x + pickup.w / 2, y: pickup.y, life: POP_LIFE, text: '+10' });
        squash = 0.12;
        hazard.vx *= PICKUP_SPEEDUP; // difficulty ramps, so losing stays reachable
        hazard.vy *= PICKUP_SPEEDUP;
        placePickup();
      }

      // Hazard contact = lose: the world freezes in PLAYING so the tableau
      // shows. PATTERN: scale the feedback to what the run was worth.
      if (ready <= 0 && overlaps(ship, hazard)) {
        const mag = Math.min(1, score / 200); // 0 = fresh run, 1 = a great run
        audio.play('explosion');
        particles.burst(ship.x + ship.w / 2, ship.y + ship.h / 2, {
          count: 10 + Math.round(mag * 10), color: PICO8[8], speed: 140 + mag * 80, life: 0.7,
        });
        particles.burst(ship.x + ship.w / 2, ship.y + ship.h / 2,
          { count: 6, color: PICO8[7], speed: 70, life: 0.45 }); // white-hot core
        juice.shake(5 + mag * 3, 0.45 + mag * 0.15);
        juice.flash(PICO8[8], 0.35);
        juice.hitStop(0.15); // the tableau renders for its whole duration
        dying = true;
      }
      break;
    }
    case 'PAUSED': { if (input.pressed('PAUSE')) { audio.play('blip'); scenes.to('PLAYING'); } break; }
    case 'GAME_OVER':
    case 'WIN': { if (input.pressed('A')) { audio.play('blip'); startPlaying(); } break; }
  }
  input.endFrame();
}

// --- Render ------------------------------------------------------------------
// PATTERN: derive every animation value from `clock` in render — deterministic,
// and it pauses exactly when the loop does. Both wrap ENGINE helpers; never
// hand-roll timing maths. Named blinkHz/accentHz so they can't shadow the
// engine's own `blink`/`pulse` or juice.flash.
/** True for half of each 1/hz cycle — an even on/off blink. */
const blinkHz = (hz: number): boolean => blink(clock, 1 / hz, 0.5) === 1;
/** A SHORT highlight — `duty` is EXACTLY the accented fraction of each cycle.
 *  Keep it low or the eye stops reading the actor's base hue. */
const accentHz = (hz: number, duty = 0.2): boolean => blink(clock, 1 / hz, duty) === 1;

/** FAR LAYER, drawn before the starfield: dithered horizon haze, a corner
 *  planet, a hairline bezel. All under the ambient band; all static. */
function renderBackdrop(): void {
  // A flat dithered slab reads as a FLOOR, and a floor competes. Four sparse
  // strips under a rising alpha ramp read as haze thickening toward a horizon.
  for (let i = 0; i < 4; i++) {
    pc.ctx.globalAlpha = 0.2 + i * 0.16;
    fillDither(pc.ctx, 0, H - 26 + i * 7, W, 7, PICO8[0], PICO8[1], 'sparse');
  }
  pc.ctx.globalAlpha = 0.85;
  drawSprite(pc.ctx, planetSprite, W - 48, 12, 2);
  pc.ctx.globalAlpha = 1;
  drawFrame(pc.ctx, 0, 0, W, H, PICO8[1], 1);
}

function renderWorld(): void {
  // Idle actors BREATHE — a world that only moves when the player does is a mockup.
  const bob = Math.round((pulse(clock, 1 / 0.6) * 2 - 1) * 1.5);
  // PATTERN (art): 2-frame animation IS frameIndex(clock, fps, 2) — no new state.
  const gem = frameIndex(clock, 6, 2);
  drawSprite(pc.ctx, (accentHz(1.2, 0.25) ? pickupHotFrames : pickupFrames)[gem], pickup.x, pickup.y + bob, PX);
  const spin = frameIndex(clock, 8, 2);
  drawSprite(pc.ctx, (accentHz(2, 0.18) ? hazardHotFrames : hazardFrames)[spin], hazard.x, hazard.y, PX);

  if (dying) {
    drawSprite(pc.ctx, debrisSprite, ship.x, ship.y, PX); // the ship is gone
  } else if (ready <= 0 || blinkHz(6)) { // spawn blink during GET READY
    const ship2 = squash > 0 ? shipFlashSprite : shipFrames[frameIndex(clock, 12, 2)];
    drawSprite(pc.ctx, ship2, ship.x, ship.y, PX);
  }

  for (const p of pops) {
    pc.ctx.globalAlpha = Math.max(0, p.life / POP_LIFE);
    drawText(pc.ctx, p.text, p.x - textWidth(p.text, 1) / 2, p.y, { color: PICO8[10] });
  }
  pc.ctx.globalAlpha = 1; // pops are the only alpha in the world pass
  drawScore(pc, score);
}

/** GAME_OVER and WIN share one layout — only headline and colour differ. The
 *  world renders FIRST and is then dimmed: the player sees where they died. */
function renderTerminal(headline: string, color: string): void {
  renderWorld();
  dimScene(pc, 0.6);
  // A hairline bezel around the headline block turns a text card into a panel.
  drawFrame(pc.ctx, 44, 34, W - 88, 84, PICO8[5], 1);
  drawTextCentered(pc.ctx, headline, W, 44, { color, scale: 2 });
  drawTextCentered(pc.ctx, `SCORE ${score}`, W, 70, { color: PICO8[7] });
  // BEST turns a run into a session — only once there IS one, never a tie.
  if (best > 0) {
    drawTextCentered(pc.ctx, beatBest ? `NEW BEST ${best}` : `BEST ${best}`, W, 84, {
      color: beatBest ? PICO8[10] : PICO8[6],
    });
  }
  drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, W, 106, {
    color: blinkHz(1.2) ? PICO8[7] : PICO8[6],
  });
}

function renderTitle(): void {
  // An ATTRACT SCREEN, not a text card: lit logo, hero ship large and running,
  // a hook line, a breathing prompt, the hints.
  drawLogo(pc.ctx, 'RETROVIBE', W, 16, { color: PICO8[10], shade: PICO8[9], shadow: PICO8[1], scale: 3 });
  // A subtitle that SELLS the loop in one line — say the verbs, not the genre.
  drawTextCentered(pc.ctx, 'GRAB SPARKS - OUTRUN THE MINE', W, 38, { color: PICO8[6] });
  // The hero: the sprite the player will fly, at px 5 (50x40) — animated,
  // because a still hero looks like a screenshot.
  drawSprite(pc.ctx, shipFrames[frameIndex(clock, 12, 2)], (W - 50) / 2, 48, 5);
  // The prompt DIMS rather than disappearing — one that blinks off is missing
  // from half the screenshots.
  drawTextCentered(pc.ctx, `PRESS ${BUTTON_KEY.A.hint}`, W, 100, {
    color: blinkHz(1.2) ? PICO8[7] : PICO8[6], scale: 2,
  });
  // Control hints rendered FROM the action declarations — never hand-written.
  const hints = controlHints(input);
  hints.forEach((hint, i) => drawTextCentered(pc.ctx, hint, W, 116 + i * 9, { color: PICO8[6] }));
  drawTextCentered(pc.ctx, 'ARROWS/WASD MOVE', W, 116 + hints.length * 9, { color: PICO8[5] });
}

function render(): void {
  // Clear FIRST, un-shaken — clearing inside the shake leaves stale edge pixels.
  pc.clear(PICO8[0]);
  juice.preRender(pc.ctx);
  renderBackdrop(); // far layer BEHIND the starfield — depth is layer order
  particles.render(pc.ctx);

  switch (scenes.current) {
    case 'TITLE': renderTitle(); break;
    case 'PLAYING': {
      renderWorld();
      // No plate behind GET READY: it would hide the hazard being dodged.
      if (ready > 0) hudText(pc, 'GET READY', 'center', 'middle', { color: PICO8[7], scale: 2, plate: false });
      break;
    }
    case 'PAUSED': {
      renderWorld();
      // Dim BEFORE the overlay text — and dim OR plate, NEVER both.
      dimScene(pc, 0.6);
      hudText(pc, 'PAUSED', 'center', 'middle', { color: PICO8[10], scale: 2, plate: false });
      drawTextCentered(pc.ctx, `${BUTTON_KEY.PAUSE.hint} RESUME`, W, 96, { color: PICO8[6] });
      break;
    }
    case 'GAME_OVER': renderTerminal('GAME OVER', PICO8[8]); break;
    case 'WIN': renderTerminal('YOU WIN', PICO8[11]); break;
  }

  juice.postRender(pc.ctx, W, H);
  crt.render(pc.ctx, W, H, 1 / 60);
}

createLoop({ update, render }).start();
