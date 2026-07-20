// Reference game — the minimal complete game every skill points to.
// Title → play (move a ship, collect pickups, dodge a hazard; contact = lose)
// → game over → restart. Proves every engine rule: fixed-step loop, A/B/PAUSE
// actions with labels-in-code, scene machine, colored parallax starfield,
// burst+shake+flash+hit-stop (with the freeze-frame actually rendered) on
// death, chiptune sfx (unlocked on first keypress), safe-margin HUD, CRT
// filter, runtime messaging — plus the graphics-uplift levers, DEMONSTRATED
// NOT RESERVED (generated games are expected to reuse them):
//   - shaded ship: makeSprite ramp on a ramp-capable palette (OCEAN foam→mint)
//   - colored parallax stars: particles ambientColors (near-grey tints, all
//     inside the 1.8–2.5:1 ambient band vs the clear color, red-green safe)
//   - glow accents CO-FIRED with impacts: glow.bloom fires from the same
//     branches as particles.burst + juice.flash/shake, with glow.setFrozen
//     wired alongside juice hit-stop (frozen-hold — the bloom holds through
//     the emphasized tableau and decays after release)
//   - stacked multi-line HUD (SCORE over BEST), clear of SAFE_MARGIN
// Deliberately NOT used here (genre gating): createGrid — this game keeps the
// deep-space starfield depth metaphor, never both. Aberration stays OFF
// (opt-in; the title scene is text-primary) — draw order unchanged.
//
// STYLE CARD (this combination is RESERVED for the reference game — every
// generated game must diverge, see ensuring-arcade-visuals):
//   palette OCEAN — bg 0 (abyss), ship 7 (foam) shaded foam→mint, pickup 5
//   (aqua), hazard 4 (teal) · ambient 'stars' tinted blue/neutral/warm grey
//   · silhouettes: arrow-ship / plus / cross · juice: teal death flash +
//   aqua bloom, hard freeze-frame.

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
  createGlow,
  createRuntime,
  makeSprite,
  drawSprite,
  drawText,
  drawTextCentered,
  drawScore,
  hudText,
  BUTTON_KEY,
  OCEAN,
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
// Colored parallax stars: each particle picks ONE tint at spawn and keeps it.
// All three tints are low-saturation near-greys on the blue↔warm axis
// (red-green safe) inside the 1.8–2.5:1 ambient band vs OCEAN[0]:
//   #475463 blue-grey 2.47:1 · #4F4F4F neutral 2.33:1 · #564F47 warm 2.37:1
const particles = createParticles({
  width: W,
  height: H,
  ambient: 'stars',
  ambientColors: ['#475463', '#4F4F4F', '#564F47'],
});
const juice = createJuice();
const crt = createCrt(); // aberration stays unset (opt-in) — text-primary title
const glow = createGlow({ width: W, height: H, scale: pc.scale });
const runtime = createRuntime();

// Reduced motion — the engine modules read the media query once at creation,
// but ambient star drift has no engine damper (SKILL §8: dampen at the call
// site) and creation-time sampling misses mid-session OS toggles, so the game
// owns both: still stars under reduced motion, and a change listener keeps the
// runtime setters in sync.
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const applyMotionPreference = (reduce: boolean) => {
  glow.setDamped(reduce);
  particles.setAmbient(reduce ? null : 'stars'); // ambientColors mix is retained
};
applyMotionPreference(motionQuery.matches);
motionQuery.addEventListener('change', (e) => applyMotionPreference(e.matches));

// --- Sprites -----------------------------------------------------------------
// Rendered at PX=2 logical px per cell so gameplay entities meet the size
// floors (player >= H/16 = 10 px, other critical entities >= H/26 ≈ 6 px in
// their larger dimension). Entity hitboxes below match the rendered size.

const PX = 2;

// Shaded ship: OCEAN is a ramp palette with an audited shade ladder on foam
// (#f0fff1 → mint → aqua → teal, see palette.ts SHADE_LADDERS). ramp is "N
// steps down each color's own ladder" per band; band:1 with PX=2 gives a
// 2-logical-px band height — a multiple of 2, satisfying the moire rule.
// The fade is baked top-lit and the ship never rotates (fixed orientation).
// Darkest band is mint (14.6:1 vs bg — far above the 3.0 darkest-step floor).
const shipSprite = makeSprite(
  ['..#..', '.###.', '#####', '#.#.#'],
  { '#': OCEAN[7] },
  { ramp: [0, 0, 1, 1], band: 1 },
); // 5x4 cells → 10x8 px rendered; rows: foam, foam, mint, mint
const pickupSprite = makeSprite(
  ['.#.', '###', '.#.'],
  { '#': OCEAN[5] },
); // 3x3 cells → 6x6 px rendered (aqua, 12.2:1 vs bg)
const hazardSprite = makeSprite(
  ['#.#', '.#.', '#.#'],
  { '#': OCEAN[4] },
); // 3x3 cells → 6x6 px rendered (teal, 8.0:1 vs bg)

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
let best = 0; // session-best — feeds the stacked multi-line HUD
let dying = false; // death seen; GAME_OVER deferred until the hit-stop expires

// Stacked HUD geometry: line 1 (SCORE) sits at SAFE_MARGIN, line 2 (BEST) one
// glyph height + 2 px below — both inside the margin, so the pickup spawn
// band starts below the deeper HUD block.
const HUD_LINE_2_Y = SAFE_MARGIN + 5 + 2;
const HUD_BLOCK_BOTTOM = HUD_LINE_2_Y + 5;

function placePickup(): void {
  pickup = {
    x: SAFE_MARGIN + Math.random() * (W - 2 * SAFE_MARGIN - ITEM_SIZE),
    y: HUD_BLOCK_BOTTOM + 4 +
      Math.random() * (H - SAFE_MARGIN - (HUD_BLOCK_BOTTOM + 4) - 28 - ITEM_SIZE),
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
// terminal/title state, notify the host of every transition, and freeze the
// ambient parallax drift while PAUSED so "paused" reads as paused.
scenes.onEnter('PLAYING', () => {
  particles.setPaused(false);
  runtime.stateChanged('PLAYING');
});
scenes.onEnter('TITLE', () => runtime.stateChanged('TITLE'));
scenes.onEnter('PAUSED', () => {
  particles.setPaused(true);
  runtime.stateChanged('PAUSED');
});
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
  juice.update(dt);
  glow.update(dt); // bloom envelopes advance here; held while glow is frozen
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
        if (!juice.frozen) {
          glow.setFrozen(false); // release the held bloom — it decays now
          scenes.to('GAME_OVER');
        }
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

      // Pickup: score + celebratory burst CO-FIRED with a soft bloom accent —
      // same branch, same center, game-palette colors. The bloom renders
      // BEHIND the crisp sprites (decorative accent, never on a tracked edge).
      if (overlaps(ship, pickup)) {
        score += 10;
        best = Math.max(best, score);
        runtime.scoreChanged(score);
        audio.play('pickup');
        const cx = pickup.x + pickup.w / 2;
        const cy = pickup.y + pickup.h / 2;
        particles.burst(cx, cy, { count: 5, color: OCEAN[5] });
        glow.bloom(cx, cy, 12, OCEAN[5], { intensity: 0.3 });
        // Speed the hazard up so difficulty ramps and losing stays reachable.
        hazard.vx *= PICKUP_SPEEDUP;
        hazard.vy *= PICKUP_SPEEDUP;
        placePickup();
      }

      // Hazard contact = lose: big burst, shake, flash, hit-stop, AND an
      // impact bloom — all co-fired from this one branch. glow.setFrozen is
      // wired alongside juice.hitStop so the bloom HOLDS at peak through the
      // frozen tableau (frozen-hold contract) and decays only after release.
      if (overlaps(ship, hazard)) {
        audio.play('explosion');
        const cx = ship.x + ship.w / 2;
        const cy = ship.y + ship.h / 2;
        particles.burst(cx, cy, { count: 10, color: OCEAN[4], speed: 140 });
        juice.shake(5, 0.45);
        juice.flash(OCEAN[4], 0.35);
        juice.hitStop(0.15);
        glow.setFrozen(true);
        glow.bloom(cx, cy, 26, OCEAN[5], { intensity: 0.5 });
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

function render(): void {
  // Clear FIRST, un-shaken — clearing inside the shake translate would leave
  // stale pixels along the canvas edges for the duration of the shake.
  pc.clear(OCEAN[0]);
  juice.preRender(pc.ctx);
  particles.render(pc.ctx);
  // Glow composites UNDER the crisp world, inside the shake window, so blooms
  // register with the shaken frame and never blur a tracked actor's edge.
  glow.composite(pc.ctx);

  switch (scenes.current) {
    case 'TITLE': {
      drawTextCentered(pc.ctx, 'RETROVIBE', W, 48, { color: OCEAN[6], scale: 3 });
      drawTextCentered(pc.ctx, 'COLLECT + DODGE', W, 78, { color: OCEAN[5] });
      // Control hints rendered FROM the action declarations — never hand-written.
      controlHints(input).forEach((hint, i) => {
        drawTextCentered(pc.ctx, hint, W, 100 + i * 10, { color: OCEAN[7] });
      });
      drawTextCentered(pc.ctx, 'ARROWS/WASD MOVE', W, 100 + controlHints(input).length * 10, {
        color: OCEAN[3],
      });
      break;
    }
    case 'PLAYING':
    case 'PAUSED': {
      drawSprite(pc.ctx, pickupSprite, pickup.x, pickup.y, PX);
      drawSprite(pc.ctx, hazardSprite, hazard.x, hazard.y, PX);
      drawSprite(pc.ctx, shipSprite, ship.x, ship.y, PX);
      // Stacked multi-line HUD: SCORE (line 1, via drawScore at SAFE_MARGIN)
      // over BEST (line 2) — the whole block stays inside SAFE_MARGIN.
      drawScore(pc, score);
      drawText(pc.ctx, `BEST ${best}`, SAFE_MARGIN, HUD_LINE_2_Y, { color: OCEAN[5] });
      if (scenes.is('PAUSED')) {
        hudText(pc, 'PAUSED', 'center', 'middle', { color: OCEAN[6], scale: 2 });
      }
      break;
    }
    case 'GAME_OVER': {
      drawTextCentered(pc.ctx, 'GAME OVER', W, 56, { color: OCEAN[4], scale: 2 });
      drawTextCentered(pc.ctx, `SCORE ${score}`, W, 80, { color: OCEAN[7] });
      drawTextCentered(pc.ctx, `BEST ${best}`, W, 92, { color: OCEAN[5] });
      drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, W, 106, { color: OCEAN[4] });
      break;
    }
    case 'WIN': {
      drawTextCentered(pc.ctx, 'YOU WIN', W, 56, { color: OCEAN[6], scale: 2 });
      drawTextCentered(pc.ctx, `SCORE ${score}`, W, 80, { color: OCEAN[7] });
      drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, W, 100, { color: OCEAN[4] });
      break;
    }
  }

  juice.postRender(pc.ctx, W, H);
  crt.render(pc.ctx, W, H, 1 / 60);
}

createLoop({ update, render }).start();
