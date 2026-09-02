// Reference game — the minimal complete game every skill points to. Title →
// play (move a ship, collect pickups, dodge a hazard; contact = lose) → game
// over → restart. Proves every engine rule: fixed-step loop, A/B/PAUSE actions
// with labels-in-code, scene machine, starfield, burst+shake+flash+hit-stop
// (freeze-frame actually rendered) on death, chiptune sfx (unlocked on the
// first keypress), safe-margin HUD, CRT filter, runtime messaging.
//
// It also shows the PRESENTATION patterns that separate a demo from a cabinet —
// each marked PATTERN below and meant to be copied: one accumulated clock drives
// every animation, idle actors breathe, pickups pop a floating score, death
// escalates with significance, and every screen tells you what to press.
//
// STYLE CARD (this whole COMBINATION is RESERVED for the reference game — every
// generated game must diverge, see ensuring-arcade-visuals): palette PICO8 —
// bg 0 (black), ship 12 (blue), pickup 10 (yellow), hazard 8 (red, pulsing to
// 14 pink) · ambient 'stars' · silhouettes arrow-ship / plus / cross · juice:
// red death flash, hard freeze-frame, the ship replaced by scattered DEBRIS on
// death · floating "+10" SCORE POPS · a BEST line that calls out a new record ·
// a "GET READY" arming beat.

import {
  createPixelCanvas, createLoop, createInput, controlHints, createScenes,
  createParticles, createJuice, createAudio, createCrt, createRuntime,
  makeSprite, drawSprite, drawText, drawTextCentered, textWidth,
  drawScore, hudText, dimScene, blink, pulse,
  BUTTON_KEY, PICO8, SAFE_MARGIN,
} from '../engine';

// --- Setup -------------------------------------------------------------------

const W = 240;
const H = 160;
const pc = createPixelCanvas({ width: W, height: H, scale: 3, parent: document.getElementById('screen') });
const audio = createAudio();
// Actions are DECLARED with their labels — the title screen renders its hints
// from these declarations (controlHints), so the labels can never drift.
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
// PATTERN (sizes): PX=2 logical px per cell meets the size floors (player >= H/16 = 10 px, other
// critical entities >= H/26 ≈ 6 px). Hitboxes below match the rendered size.
const PX = 2;
const SHIP_ART = ['..#..', '.###.', '#####', '#.#.#'];
const shipSprite = makeSprite(SHIP_ART, { '#': PICO8[12] }); // 5x4 cells → 10x8 px
// PATTERN: a same-shape, brighter twin of the player sprite is the cheapest
// "I felt that" flash — the silhouette never changes, so nothing is lost.
const shipFlashSprite = makeSprite(SHIP_ART, { '#': PICO8[7] });
// The ship is visibly GONE during the death tableau: debris replaces it, so the
// freeze-frame reads as a wreck rather than a ship standing in fire.
const debrisSprite = makeSprite(['#...#', '..#..', '#.#..', '...#.'], { '#': PICO8[5] });
// Accent frames stay inside each actor's own hue family (yellow → orange,
// red → pink): an accent must never borrow another role's hue or the roles blur.
const pickupSprite = makeSprite(['.#.', '###', '.#.'], { '#': PICO8[10] });
const pickupHotSprite = makeSprite(['.#.', '###', '.#.'], { '#': PICO8[9] });
const hazardSprite = makeSprite(['#.#', '.#.', '#.#'], { '#': PICO8[8] });
const hazardHotSprite = makeSprite(['#.#', '.#.', '#.#'], { '#': PICO8[14] });
// --- World state -------------------------------------------------------------

interface Entity { x: number; y: number; w: number; h: number }
interface Pop { x: number; y: number; life: number; text: string }
const SHIP_SPEED = 90;
const SHIP_W = 10; // hitboxes match the rendered sprite sizes within 1 px
const SHIP_H = 8;
const ITEM_SIZE = 6;
// Difficulty ramp: felt inside 30 s, threatening by ~2 min (endless game bar).
const PICKUP_SPEEDUP = 1.12; // per pickup
const TIME_SPEEDUP = 0.01; // +1%/s compounding, so idling doesn't stall the ramp
const READY_TIME = 0.75; // "GET READY" beat before the hazard is armed
const POP_LIFE = 0.7;
const ship: Entity = { x: W / 2 - SHIP_W / 2, y: H - 30, w: SHIP_W, h: SHIP_H };
let pickup: Entity = { x: 0, y: 0, w: ITEM_SIZE, h: ITEM_SIZE };
const hazard: Entity & { vx: number; vy: number } = {
  x: 20, y: 20, w: ITEM_SIZE, h: ITEM_SIZE, vx: 55, vy: 40,
};
// PATTERN: floating "+10" pops. A score that only moves a HUD number is
// invisible; a number that leaves the pickup says what the input earned.
const pops: Pop[] = [];
let score = 0;
let best = 0; // module scope IS the persistence floor; storage below is a bonus
let dying = false; // death seen; GAME_OVER deferred until the hit-stop expires
let ready = 0; // > 0 while the "GET READY" beat runs (world held, ship blinks)
let squash = 0; // > 0 briefly after a pickup — drives the ship flash
// PATTERN: ONE accumulated clock, fed by the fixed-step dt, drives every
// animation (blink, bob, pulse). Never Date.now()/setInterval — those desync
// from the loop and jump after an alt-tab (improving-game-quality §9).
let clock = 0;
// localStorage is wrapped: headless/sandboxed hosts can throw on access.
const BEST_KEY = 'retrovibe.reference.best';
try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch { /* module-scope best still works */ }

function saveBest(): void {
  if (score <= best) return;
  best = score;
  try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* never let persistence break the game */ }
}

function placePickup(): void {
  pickup = {
    x: SAFE_MARGIN + Math.random() * (W - 2 * SAFE_MARGIN - ITEM_SIZE),
    y: SAFE_MARGIN + 12 + Math.random() * (H - 2 * SAFE_MARGIN - 12 - 28 - ITEM_SIZE),
    w: ITEM_SIZE, h: ITEM_SIZE,
  };
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

function startPlaying(): void {
  resetWorld();
  scenes.to('PLAYING');
}

// Scene-entry side effects: tell the host about every transition (GAME_OVER
// also banks the best score).
scenes.onEnter('TITLE', () => runtime.stateChanged('TITLE'));
scenes.onEnter('PLAYING', () => runtime.stateChanged('PLAYING'));
scenes.onEnter('PAUSED', () => runtime.stateChanged('PAUSED'));
scenes.onEnter('GAME_OVER', () => {
  saveBest();
  runtime.stateChanged('GAME_OVER');
  runtime.gameOver({ score, won: false });
});

// --- Update ------------------------------------------------------------------
function update(dt: number): void {
  clock += dt;
  juice.update(dt);
  // Ambient keeps drifting in EVERY scene, PAUSED included: a starfield that
  // halts makes the pause read as a crash. Only the world simulation freezes.
  particles.update(dt);
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.life -= dt;
    p.y -= 18 * dt; // rises as it fades
    if (p.life <= 0) pops.splice(i, 1);
  }

  switch (scenes.current) {
    case 'TITLE': {
      if (input.pressed('A')) { audio.play('blip'); startPlaying(); }
      break;
    }
    case 'PLAYING': {
      // Death flow: the frozen tableau renders for the whole hit-stop —
      // transition to GAME_OVER only when it expires (see juice.ts floors).
      if (dying) {
        if (!juice.frozen) scenes.to('GAME_OVER');
        break;
      }
      if (input.pressed('PAUSE')) { audio.play('blip'); scenes.to('PAUSED'); break; }
      if (juice.frozen) break; // hit-stop pauses the world
      if (squash > 0) squash = Math.max(0, squash - dt);
      // GET READY: the player may steer, but the hazard is held and cannot kill
      // — no run starts on an unfair frame. A timer INSIDE PLAYING, so the
      // scene contract is untouched.
      if (ready > 0) ready = Math.max(0, ready - dt);

      // Ship movement, kept inside the safe play area.
      ship.x += input.dir.x * SHIP_SPEED * dt;
      ship.y += input.dir.y * SHIP_SPEED * dt;
      ship.x = Math.max(SAFE_MARGIN, Math.min(W - SAFE_MARGIN - ship.w, ship.x));
      ship.y = Math.max(SAFE_MARGIN, Math.min(H - SAFE_MARGIN - ship.h, ship.y));

      if (ready <= 0) {
        // The hazard bounces around the arena, and creeps faster over time so
        // the ramp is felt even by a player who collects nothing.
        const timeRamp = 1 + TIME_SPEEDUP * dt;
        hazard.vx *= timeRamp; hazard.vy *= timeRamp;
        hazard.x += hazard.vx * dt; hazard.y += hazard.vy * dt;
        if (hazard.x < SAFE_MARGIN || hazard.x > W - SAFE_MARGIN - hazard.w) hazard.vx *= -1;
        if (hazard.y < SAFE_MARGIN || hazard.y > H - SAFE_MARGIN - hazard.h) hazard.vy *= -1;
      }

      // Pickup: score, a burst in the game's own palette, a floating "+10", and
      // a brief ship flash so the reward lands on the player's sprite too.
      if (overlaps(ship, pickup)) {
        score += 10;
        runtime.scoreChanged(score);
        audio.play('pickup');
        particles.burst(pickup.x + pickup.w / 2, pickup.y + pickup.h / 2, { count: 5, color: PICO8[10] });
        pops.push({ x: pickup.x + pickup.w / 2, y: pickup.y, life: POP_LIFE, text: '+10' });
        squash = 0.12;
        hazard.vx *= PICKUP_SPEEDUP; // difficulty ramps, so losing stays reachable
        hazard.vy *= PICKUP_SPEEDUP;
        placePickup();
      }

      // Hazard contact = lose: burst, shake, flash, hit-stop — the world freezes
      // in PLAYING so the tableau is visible; GAME_OVER comes after. PATTERN:
      // scale the feedback to what the run was worth — a death at 300 points
      // must hit harder than one on the first pickup.
      if (ready <= 0 && overlaps(ship, hazard)) {
        const mag = Math.min(1, score / 200); // 0 = fresh run, 1 = a great run
        audio.play('explosion');
        particles.burst(ship.x + ship.w / 2, ship.y + ship.h / 2, {
          count: 10 + Math.round(mag * 10), color: PICO8[8], speed: 140 + mag * 80, life: 0.7,
        });
        particles.burst(ship.x + ship.w / 2, ship.y + ship.h / 2, {
          count: 6, color: PICO8[7], speed: 70, life: 0.45, // white-hot core
        });
        juice.shake(5 + mag * 3, 0.45 + mag * 0.15);
        juice.flash(PICO8[8], 0.35);
        juice.hitStop(0.15); // the tableau renders for its whole duration
        dying = true;
      }
      break;
    }
    case 'PAUSED': {
      if (input.pressed('PAUSE')) { audio.play('blip'); scenes.to('PLAYING'); }
      break;
    }
    case 'GAME_OVER':
    case 'WIN': {
      if (input.pressed('A')) { audio.play('blip'); startPlaying(); }
      break;
    }
  }
  input.endFrame();
}

// --- Render ------------------------------------------------------------------
// PATTERN: derive every animation value from `clock` in render — a pure function
// of accumulated game time, so the look is deterministic and pauses exactly when
// the loop does. Both wrap ENGINE helpers (draw.ts); never hand-roll timing maths.
/** True for half of each 1/hz cycle — an even on/off blink. */
const flash = (hz: number): boolean => blink(clock, 1 / hz, 0.5) === 1;
/** A SHORT highlight (`duty` ≈ the accented fraction of each cycle), not a 50/50
 *  blink: keep it low or the eye stops reading the actor's base hue. */
const accent = (hz: number, duty = 0.2): boolean => pulse(clock, 1 / hz) > 1 - duty;

function renderWorld(): void {
  // Idle actors BREATHE: the pickup bobs and pulses, the hazard pulses hot — a
  // world that only moves when the player does reads as a mockup.
  const bob = Math.round((pulse(clock, 1 / 0.6) * 2 - 1) * 1.5);
  drawSprite(pc.ctx, accent(1.2, 0.25) ? pickupHotSprite : pickupSprite, pickup.x, pickup.y + bob, PX);
  drawSprite(pc.ctx, accent(2, 0.18) ? hazardHotSprite : hazardSprite, hazard.x, hazard.y, PX);

  if (dying) {
    drawSprite(pc.ctx, debrisSprite, ship.x, ship.y, PX); // the ship is gone
  } else if (ready <= 0 || flash(6)) {
    // Spawn blink during GET READY; the white twin for the pickup flash.
    drawSprite(pc.ctx, squash > 0 ? shipFlashSprite : shipSprite, ship.x, ship.y, PX);
  }

  for (const p of pops) {
    pc.ctx.globalAlpha = Math.max(0, p.life / POP_LIFE);
    drawText(pc.ctx, p.text, p.x - textWidth(p.text, 1) / 2, p.y, { color: PICO8[10] });
  }
  pc.ctx.globalAlpha = 1;
  drawScore(pc, score);
}

/** The terminal screens (GAME_OVER, WIN) share one layout — only the headline
 *  word and colour differ. The world renders FIRST and is then dimmed, so the
 *  player sees where they died instead of a text card on an empty screen. */
function renderTerminal(headline: string, color: string): void {
  renderWorld();
  dimScene(pc, 0.6);
  drawTextCentered(pc.ctx, headline, W, 44, { color, scale: 2 });
  drawTextCentered(pc.ctx, `SCORE ${score}`, W, 70, { color: PICO8[7] });
  // BEST turns a single run into a session: always show it, and call out a new
  // record instead of silently overwriting the old one.
  const isBest = score >= best && score > 0;
  drawTextCentered(pc.ctx, isBest ? `NEW BEST ${best}` : `BEST ${best}`, W, 84, {
    color: isBest ? PICO8[10] : PICO8[6],
  });
  drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, W, 106, {
    color: flash(1.2) ? PICO8[7] : PICO8[6],
  });
}

function renderTitle(): void {
  drawTextCentered(pc.ctx, 'RETROVIBE', W, 26, { color: PICO8[10], scale: 3 });
  drawTextCentered(pc.ctx, 'COLLECT + DODGE', W, 50, { color: PICO8[7] });
  // A subtitle that SELLS the loop in one line — say the verbs, not the genre.
  drawTextCentered(pc.ctx, 'GRAB SPARKS - OUTRUN THE MINE', W, 62, { color: PICO8[6] });
  // The prompt DIMS rather than disappearing — a prompt that blinks off is
  // missing from half the screenshots. The key name comes from BUTTON_KEY, so a
  // rebinding can never make this line lie.
  drawTextCentered(pc.ctx, `PRESS ${BUTTON_KEY.A.hint}`, W, 84, {
    color: flash(1.2) ? PICO8[7] : PICO8[6], scale: 2,
  });
  // Control hints rendered FROM the action declarations — never hand-written.
  const hints = controlHints(input);
  hints.forEach((hint, i) => drawTextCentered(pc.ctx, hint, W, 108 + i * 10, { color: PICO8[6] }));
  drawTextCentered(pc.ctx, 'ARROWS/WASD MOVE', W, 108 + hints.length * 10, { color: PICO8[5] });
}

function render(): void {
  // Clear FIRST, un-shaken — clearing inside the shake translate would leave
  // stale pixels along the canvas edges for the duration of the shake.
  pc.clear(PICO8[0]);
  juice.preRender(pc.ctx);
  particles.render(pc.ctx);

  switch (scenes.current) {
    case 'TITLE': renderTitle(); break;
    case 'PLAYING': {
      renderWorld();
      // No plate behind GET READY: it sits over the LIVE arena during the arming
      // beat, and a dark panel there would hide the hazard the player is about
      // to have to dodge. The terminal screens dim the world instead.
      if (ready > 0) hudText(pc, 'GET READY', 'center', 'middle', { color: PICO8[7], scale: 2, plate: false });
      break;
    }
    case 'PAUSED': {
      renderWorld();
      // Dim the world BEFORE the overlay text: the frame stays readable as
      // context while the text owns the foreground.
      dimScene(pc, 0.6);
      hudText(pc, 'PAUSED', 'center', 'middle', { color: PICO8[10], scale: 2 });
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
