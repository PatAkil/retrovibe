---
name: improving-game-quality
description: Use when a game is about to be handed off to the user, after substantial gameplay changes, or when it feels flat, unfair, broken on resume, or is missing feedback (particles, shake, sound, HUD). Runs the feel-and-correctness pass — the repo's ONLY quality checklist.
---

# Improving game quality

**Editing this skill's visual items (margins, contrast, particles, feedback sizing) or the engine changes how every future game looks — run **verifying-graphics** before calling such an edit done.** This skill itself is for one game's quality pass.

This skill owns the **only** quality checklist in the repo — **creating-a-game** and **iterating-on-a-game** defer here instead of carrying their own. Scope is *feel & correctness*; pure look (palette, pixel scale, sprite art, CRT) belongs to **ensuring-arcade-visuals** — the scopes are disjoint by design, but margins/readability live **here**, not there.

Work through every item below. Each has a *check* (how to detect the problem by reading `game/main.ts` and playing) and a *fix* (the engine primitive to use). All imports come from `'../engine'`; the reference implementation is `workspace/game-template/game/main.ts`. After every fix: `cd workspace/<game-name> && npm run check`.

## 1. Margins & readability

**Check:** No HUD element, hint, or score sits closer to a screen edge than `SAFE_MARGIN` (8 logical px). Text is legible: scale 1 minimum for body, dim colors only for secondary info, no text overlapping moving gameplay. **Entity size floors** (owned by **ensuring-arcade-visuals** §3, re-verified here): player ≥ 1/12 of logical height in its larger rendered dimension (≈14 px at 160; 16×12 is the arcade target), other gameplay-critical entities ≥ 1/20 (≈8 px) — measure the *rendered* bounding box (`px` × cells) — and every hitbox `{w, h}` within ~1 px of that rendered size. **Contrast floor** (ensuring-arcade-visuals §1b): every critical entity ≥ 3:1 via `contrast()` against the clear color and any scenery it overlaps; ambient in the 1.8–2.5:1 band; pickup vs hazard unambiguous in grayscale (never red-vs-green as the only distinction).

**Fix:** Use the enforcing helpers instead of hand-placed `drawText` for HUD:

```ts
import { SAFE_MARGIN, drawScore, drawLives, hudText } from '../engine';

drawScore(pc, score);                                  // top-left, inside SAFE_MARGIN
drawLives(pc, lives);                                  // top-right, inside SAFE_MARGIN
hudText(pc, 'LEVEL 2', 'center', 'bottom');            // any edge/corner, always inset
hudText(pc, 'PAUSED', 'center', 'middle', { scale: 2 });
```

`hudText` anchors: `'left' | 'center' | 'right'` × `'top' | 'middle' | 'bottom'`. For gameplay entities, clamp positions to the same inset (the reference ship clamps to `SAFE_MARGIN`) so nothing playable hides in the CRT vignette.

## 1b. Prompts pulse — they never blink fully off

**Check:** Any "PRESS A" / "RESTART" style prompt must stay visible at every instant — it may swap between two visible tones (a bright and a dim palette index) on a clock-driven cycle, but it must never disappear entirely for part of the cycle. A prompt that goes fully transparent for its "off" half fails this check even if it reads fine while watching — a screenshot taken during the off half shows a broken screen, and a first-time player's first glance may land there.

**Fix:** Drive the color swap from the accumulated game clock (never `Date.now()`/`setInterval` — see item 9), using `blink`/`pulse` from `engine/draw.ts` (exported via the barrel) or an equivalent local clock-driven helper as the reference game's own `blinkHz(hz)`/`accentHz(hz, duty)` wrappers do — both alternate *color*, never toggle the draw call itself. `clock` below is the game's own accumulated `dt`, and `blink(clock, period, onRatio)` returns 1/0:

```ts
drawTextCentered(pc.ctx, `PRESS ${BUTTON_KEY.A.hint}`, W, 84, {
  color: blink(clock, 1 / 1.2, 0.5) === 1 ? PICO8[7] : PICO8[6], scale: 2,
});
```

## 2. Always-playable loop with a REACHABLE lose condition

**Check:** Trace the scene machine (`createScenes`): `TITLE → PLAYING ⇄ PAUSED → (GAME_OVER | WIN) → restart`. From every scene, a keypress path leads back to `PLAYING`. Then verify the lose condition can *actually occur*: a hazard that never intersects the player's reachable area, moves too slowly to ever catch them, or spawns behind a wall means the game cannot be lost — that fails this check even though it compiles and runs.

**GET READY beat — no unfair first frame.** Games with a hazard live from the instant `PLAYING` starts (the endless/score kind this item already targets) need a short beat where the player can look around and orient before a hazard can kill them — a death within the first frame or two of a fresh run reads as broken, not hard. Hold the hazard inert (or off-screen) for ~0.5–1 s while the player can already move, show a `hudText(pc, 'GET READY', 'center', 'middle', ...)` overlay for that window, and gate it as a timer *inside* `PLAYING` (the reference's `ready` variable) rather than a new scene — the scene machine stays untouched. Finite-goal/spatial-difficulty games are exempt per item 2's ramp exemption above.

**Fix:** Wire missing transitions with `scenes.to(...)` on input edges (the reference: `A` restarts from `GAME_OVER`/`WIN`). Make the hazard's path cover the player's space. **In endless/score games — and only there; finite-goal games (a climb, a flag) are exempt, their difficulty is spatial by design — difficulty must be *felt within the first 30 seconds* of active play and put a competent player under real pressure by ~2 minutes.** The reference combines a per-pickup multiplier with a slow time-based component so idling doesn't stall the ramp:

```ts
hazard.vx *= 1.12;               // per pickup (1.10–1.15 is the working range)
hazard.vy *= 1.12;
// plus, every update tick while PLAYING:
const timeRamp = 1 + 0.01 * dt;  // +1%/s compounding
hazard.vx *= timeRamp;
hazard.vy *= timeRamp;
```

A barely-felt ramp (e.g. ×1.06 per pickup alone — doubling only after ~12 pickups) fails this check in an endless game. Never demand a ramp of a finite-goal game — losing must still be genuinely possible on the way, nothing more.

Level advance is a `PLAYING → PLAYING` re-entry (allowed by the machine). Note `scenes.to` *warns and ignores* illegal transitions — a `console.warn` in playtesting means a mis-wired transition even though nothing crashed.

## 3. Ambient particles fit the game world

**Check:** There is an ambient layer, and its preset matches the fiction — `'stars'` for space, `'rain'` for noir city, `'snow'` for ice, `'embers'` for lava, `'bubbles'` for underwater. A desert game with snow fails.

**Fix:** `createParticles({ width: W, height: H, ambient: 'stars' })` at setup, or `particles.setAmbient('embers')` per level; `null` to disable. Preset choice guidance lives in **ensuring-arcade-visuals**; this item verifies fit.

## 3b. Idle world alive

**Check:** An entity that never animates while nothing is happening near it reads as a static mockup, not a game. At minimum: a pickup bobs and/or pulses in place, and a hazard pulses toward a hotter/brighter twin of itself, even while the player is elsewhere on screen and not interacting with either.

**Fix:** Drive both off the same accumulated clock as item 1b, and swap sprites/offsets rather than animating shape:

```ts
const bob = Math.round((pulse(clock, 1 / 0.6) * 2 - 1) * 1.5); // smooth 0..1 sine, remapped to -1..1
drawSprite(pc.ctx, blink(clock, 1 / 1.2, 0.2) === 1 ? pickupHotSprite : pickupSprite, pickup.x, pickup.y + bob, PX);
drawSprite(pc.ctx, blink(clock, 1 / 2, 0.18) === 1 ? hazardHotSprite : hazardSprite, hazard.x, hazard.y, PX);
```

`blink`'s third argument IS the duty, exactly (`onRatio`), so the accented fraction is what you typed — no sine threshold to guess at. Keep the hazard's `duty` (the fraction of each cycle spent in the hot frame) low — 0.15–0.25 — so its base hue still dominates at a glance; a hazard that's pink half the time reads as pink, not red, and breaks the role-hue contract (**ensuring-arcade-visuals** §1b). The hot frame must stay in the same hue family as the base sprite (yellow → orange, red → pink) — never borrow another actor's hue for a pulse.

## 4. Impact particles TUNED TO SIGNIFICANCE

**Check:** Significant events emit a burst, and burst size scales with how much the event matters. Uniform bursts everywhere (or none) fail. **The arm's-length test:** every significant event must be visible without looking for it, from arm's length, with the CRT filter on.

**Fix:** `particles.burst(x, y, opts)` with count by significance (transient particles render at 2–3 logical px; speeds should clear the sprite silhouette):

- **Destruction / death / explosion:** ~5–10 particles, faster and hotter:
  ```ts
  particles.burst(ship.x + ship.w / 2, ship.y + ship.h / 2, { count: 10, color: PICO8[8], speed: 140 });
  ```
- **Minor events** (landing, bullet-vs-wall, small pickup): 3–5, gentler:
  ```ts
  particles.burst(pickup.x + pickup.w / 2, pickup.y + pickup.h / 2, { count: 5, color: PICO8[10] });
  ```

`BurstOptions`: `count` (default 8), `color`, `speed` (px/s, default 90), `life` (s, default 0.5). Burst at the event's center, colored from the **game's own palette** (never the engine default yellow — see ensuring-arcade-visuals). Ambient particle sizes are deliberately small (1–2 px) — never bump them to make atmosphere "pop"; they'd read as pickups.

## 4b. A score pop on every score change

**Check:** When score changes, something leaves the point of the event, not only the HUD number. A pickup that just increments `SCORE 40` in the corner is invisible feedback — the player has to glance away from the action to notice they scored.

**Fix:** Push a short-lived floating text at the event's position that rises and fades, drawn with `drawText`/`textWidth` and a manual alpha — plain data, no engine primitive owns this (the reference's `pops` array is the pattern to copy):

```ts
pops.push({ x: pickup.x + pickup.w / 2, y: pickup.y, life: POP_LIFE, text: '+10' });
// in update: p.life -= dt; p.y -= 18 * dt;
// in render: pc.ctx.globalAlpha = Math.max(0, p.life / POP_LIFE); drawText(...); pc.ctx.globalAlpha = 1;
```

Pair it with a burst (item 4) and a brief flash-twin of the player sprite (a same-shape, brighter palette recolor swapped in for a few frames) so the reward reads on the player's own sprite too, not only at the pickup's old position.

## 5. Shake on impactful events — and the render ORDER rule

**Check:** Player damage/death shakes the screen; the biggest moments also flash and hit-stop — all above the floors: **shake ≥ 4–6 px amplitude for ≥ 0.4 s on major events (death/explosion); give the death flash ≥ 0.3 s so its held peak (the first 12 % of the duration) covers the hit-stop and the fall is still visible on the tableau, and pass the death point as the flash origin (`juice.flash(color, 0.35, {x, y})`) so it radiates from the impact instead of washing the whole viewport to one hue; the hit-stop's frozen tableau is actually rendered** (≥1 frame of frozen world visible before the terminal screen — see the death-flow pattern below). Apply the arm's-length test: a death must be unmissable without looking for it. Then check the frame order in `render()` — the single most common juice bug is clearing inside the shake transform, which smears stale pixels along the canvas edges.

**Death feedback must scale with significance, not just event type.** A death after 10 seconds and a death after 2 minutes of a good run should not feel identical — bigger runs deserve a bigger send-off. Derive a `0..1` magnitude from something the player earned (score, distance, combo) and scale shake/burst/flash off it, on top of the escalation-by-event-type below:

```ts
const mag = Math.min(1, score / 200); // 0 = fresh run, 1 = a great run
juice.shake(5 + mag * 3, 0.45 + mag * 0.15);
particles.burst(ship.x + ship.w / 2, ship.y + ship.h / 2, {
  count: 10 + Math.round(mag * 10), color: PICO8[8], speed: 140 + mag * 80,
});
```

**The player sprite is replaced by debris during the death tableau.** During the frozen death frame (`dying === true` / `juice.frozen`), stop drawing the normal player sprite and draw a scattered-debris sprite in its place — a ship standing intact in the middle of an explosion reads as broken, not dead. Build the debris as its own `makeSprite` (loose pixels in the player's own dim palette index), swapped in only while dying:

```ts
if (dying) {
  drawSprite(pc.ctx, debrisSprite, ship.x, ship.y, PX); // ship is gone
} else {
  drawSprite(pc.ctx, shipSprite, ship.x, ship.y, PX);
}
```

**Fix:** Escalate with significance:

```ts
juice.shake(2, 0.2);            // solid hit
// biggest events — death, boss kill — add:
juice.shake(5, 0.45);           // >= 4-6 px, >= 0.4 s
juice.flash(PICO8[8], 0.35, { x: ship.x + ship.w / 2, y: ship.y + ship.h / 2 });
                                // flash in a SATURATED palette accent — never white or near-white:
                                //   a white flash bleaches the whole tableau. The third arg is the
                                //   DEATH POINT (logical px): the flash radiates from there, so the
                                //   impact glows with the burst readable inside it while the HUD and
                                //   the far side of the frame keep their own colours. Omit it (WIN,
                                //   pickups) and the flash is the uniform full-screen overlay.
juice.hitStop(0.15);            // freeze-frame emphasis
```

**Hit-stop must be visible — defer the death transition.** Transitioning to `GAME_OVER` in the same tick as `hitStop()` means the frozen tableau never draws (the terminal screen replaces it immediately). The pattern, from the reference game: stay in `PLAYING` while frozen — burst/shake/flash play out over the frozen world — and transition only when the hit-stop expires:

```ts
// on hazard contact: effects + a flag, NOT scenes.to
juice.shake(5, 0.45); juice.flash(PICO8[8], 0.35, { x: ship.x + ship.w / 2, y: ship.y + ship.h / 2 }); juice.hitStop(0.15);
dying = true;
// at the top of the PLAYING branch, before the pause/freeze checks:
if (dying) {
  if (!juice.frozen) scenes.to('GAME_OVER');
  break;
}
```

The mandatory frame order:

```ts
function update(dt: number): void {
  juice.update(dt);                 // always — counts timers down
  if (juice.frozen) { /* skip world simulation during hit-stop */ }
  // ...
}

function render(): void {
  pc.clear(PICO8[0]);               // 1. clear FIRST, un-shaken
  juice.preRender(pc.ctx);          // 2. shake transform on (save)
  // ...everything in the world...
  juice.postRender(pc.ctx, W, H);   // 3. restore + flash overlay (radial when an origin was given)
  crt.render(pc.ctx, W, H, 1 / 60); // 4. CRT — last, always
}
```

`preRender`/`postRender` must be paired, and `juice.frozen` must actually gate the world simulation or `hitStop` does nothing.

## 6. Scene transitions complete — PAUSED and WIN included

**Check:** `PAUSED` is reachable from `PLAYING` and exitable back to `PLAYING` (the machine also allows `PAUSED → TITLE` — optional, the reference doesn't use it). If the game has a goal, `WIN` is reachable via `scenes.to('WIN')` and exitable to restart. Every state renders something (a paused game showing a frozen frame with no `PAUSED` text fails). Games with no win condition may omit `WIN`, but never `PAUSED`.

**Overlay text sits on a plate or a dimmed scene — never bare over a live/frozen frame.** `PAUSED`/`GAME_OVER`/`WIN` text must be visually separated from whatever's behind it: `hudText`'s large-centered-text default plate (`ui.ts`, on automatically at `h:'center', v:'middle', scale >= 2`) handles single lines; for a whole terminal screen with the world still visible behind it (PAUSED keeping gameplay frozen in view), dim the world first with `dimScene(pc, alpha)` before drawing text over it, as the reference game does — and pass `{ plate: false }` to `hudText` there: dim OR plate, never both. Skipping both and drawing text straight over a busy background fails this check even if it's technically legible in a screenshot.

**BEST is shown on the terminal screens.** `GAME_OVER`/`WIN` must display a running best score, not just this run's score — a single run with no memory of past runs fails to turn play into a session. Track it in module scope (survives restarts within the tab) and treat `localStorage` as a bonus, wrapped in `try`/`catch` since sandboxed/headless hosts can throw on access:

```ts
let best = 0; // module scope IS the persistence floor
try { best = Number(localStorage.getItem(KEY)) || 0; } catch { /* module scope still works */ }
function saveBest(): void {
  if (score <= best) return;
  best = score;
  try { localStorage.setItem(KEY, String(best)); } catch { /* never let persistence break the game */ }
}
```

Call `saveBest()` on entering `GAME_OVER`/`WIN` (`scenes.onEnter`), and call out a new record distinctly from a plain best (`NEW BEST ${best}` vs `BEST ${best}`, different color) rather than silently overwriting.

**Fix:** Pause toggle on the dedicated `PAUSE` button's edge (`input.pressed('PAUSE')` — P or Escape; never a gameplay button), `hudText(pc, 'PAUSED', 'center', 'middle', ...)` overlay, and `scenes.onEnter(...)` for entry side effects (world reset, host messages via **messaging-game-over**).

## 7. Audio coverage

**Check:** Every significant event has a sound. Map events to the five `Sfx` presets: `'jump'`, `'pickup'`, `'explosion'`, `'hit'`, `'blip'` (UI/menu). A silent pickup or a silent death fails.

**Fix:** `audio.play('pickup')` etc. at each event site. Audio must be unlocked by the first keypress — `createInput(actions, { onFirstKey: () => audio.unlock() })`; the unlock pattern is owned by **handling-user-input**, just verify it is wired. `play` before unlock is a silent no-op, so a missing unlock manifests as a mute game, not an error.

## 8. Title-screen control hints — present and truthful

**Check:** The title screen shows control hints, and they are **rendered from the action declarations** via `controlHints(input)` — never hand-written strings. Hand-written hints drift when a binding changes; that is the failure this check exists to catch. Labels themselves are owned by **handling-user-input**; here verify presence and truthfulness (every declared action does what its label says).

**Fix:**

```ts
controlHints(input).forEach((hint, i) => {
  drawTextCentered(pc.ctx, hint, W, 100 + i * 10, { color: PICO8[7] });
});
```

Movement (arrows/WASD) is implicit and not in `controlHints` — add a static line for it as the reference does.

## 9. Alt-tab resume works

**Check:** The engine loop (`createLoop`) already clamps the per-frame delta and resets the clock on refocus — so the *engine* is safe. What fails this check is **game code** that assumes unclamped wall time: anything using `Date.now()` / `performance.now()` deltas for gameplay, timers counted in real time instead of accumulated `dt`, or spawn schedules keyed to absolute timestamps. After alt-tab those all jump.

**Fix:** All gameplay time derives from the `dt` passed to `update(dt)` — accumulate it (`elapsed += dt`) for timers and spawners. Verify: alt-tab 30s, return; no freeze, no teleport, no burst of queued spawns.

## 10. Performance sanity

**Check:** Simulation runs in the fixed-step `update(dt)` (via `createLoop`), not in `render`. Hot loops (per-frame, per-entity) don't allocate visibly: creating arrays/objects/closures every frame, string-building in render, or re-calling `makeSprite` per frame all cause GC stutter.

**Fix:** Build sprites once at module scope (as the reference does). Reuse entity objects; mutate rather than reallocate. Keep `render` pure drawing. The engine's particle system already pools ambient particles and prunes transients — use it instead of a hand-rolled per-frame particle array.

## 11. Visual distinctness across the workspace

**Check:** Would a screenshot of this game be mistaken for the reference game or another game currently in the workspace? If yes, the visual pass failed — apply **ensuring-arcade-visuals**' style-card divergence rule (§0 there): differ on sprite silhouettes AND at least one other axis (palette scheme, ambient preset, or burst colors).

## 11b. Art direction — not a demo

**Check:** (owned by **ensuring-arcade-visuals** §3b/§7, re-verified here — this is the item that catches a game that builds, plays and still looks like a placeholder.) All five must hold: gameplay sprites are **multi-tone (2–3 palette tones) and outlined**, authored at `px = 1` at their full rendered size (not a one-color blob scaled up with `px`); the background has **at least two depth planes** (a far band/ramp plus dark silhouettes), both at or below the ambient band; platforms/bricks/panels are **beveled slabs**, not flat rectangles, and pits/edges read as depth; the title screen uses a **drawn logo** plus a large hero prop, not text alone; and everything alive has a **2-frame animation**.

**Fix:** The engine art helpers, all from `'../engine'` and all cheap: `makeSprite(rows, map, { outline })` / an authored keyline char + `flipSprite` + `frameIndex(clock, fps, count)` for sprites; `fillBands` / `fillDither` for background planes; `drawBevel` for surfaces and `drawFrame` for arena walls; `drawLogo(ctx, text, W, y, { color, shade, shadow })` for the title; `dimScene` plus a **HOLLOW** `drawFrame` bezel for terminal screens (dim OR plate, never both — an opaque plate on top of the dim throws away the world context the dim exists to keep); `drawPanel` only where there is no dim. Worked examples to read (never run or modify): `verification/cave-hopper/game/main.ts` and `verification/brick-bounce/game/main.ts`.

## Sign-off

The pass is done when all fifteen items hold (1, 1b, 2, 3, 3b, 4, 4b, 5, 6, 7, 8, 9, 10, 11, 11b), `npm run check` and `npm run build` pass in the game folder, and the smoke check via **playing-the-game** is green. The user remains the real playtester — report what was verified, never "playtested".
