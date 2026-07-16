---
name: improving-game-quality
description: Use when a game is about to be handed off to the user, after substantial gameplay changes, or when it feels flat, unfair, broken on resume, or is missing feedback (particles, shake, sound, HUD). Runs the feel-and-correctness pass — the repo's ONLY quality checklist.
---

# Improving game quality

This skill owns the **only** quality checklist in the repo — **creating-a-game** and **iterating-on-a-game** defer here instead of carrying their own. Scope is *feel & correctness*; pure look (palette, pixel scale, sprite art, CRT) belongs to **ensuring-arcade-visuals** — the scopes are disjoint by design, but margins/readability live **here**, not there.

Work through every item below. Each has a *check* (how to detect the problem by reading `game/main.ts` and playing) and a *fix* (the engine primitive to use). All imports come from `'../engine'`; the reference implementation is `workspace/game-template/game/main.ts`. After every fix: `cd workspace/<game-name> && npm run check`.

## 1. Margins & readability

**Check:** No HUD element, hint, or score sits closer to a screen edge than `SAFE_MARGIN` (8 logical px). Text is legible: scale 1 minimum for body, dim colors only for secondary info, no text overlapping moving gameplay. **Entity size floors** (owned by **ensuring-arcade-visuals** §3, re-verified here): player ≥ 1/16 of logical height in its larger rendered dimension, other gameplay-critical entities ≥ 1/26 — measure the *rendered* bounding box (`px` × cells) — and every hitbox `{w, h}` within ~1 px of that rendered size. **Contrast floor** (ensuring-arcade-visuals §1b): every critical entity ≥ 3:1 via `contrast()` against the clear color and any scenery it overlaps; ambient in the 1.8–2.5:1 band; pickup vs hazard unambiguous in grayscale (never red-vs-green as the only distinction).

**Fix:** Use the enforcing helpers instead of hand-placed `drawText` for HUD:

```ts
import { SAFE_MARGIN, drawScore, drawLives, hudText } from '../engine';

drawScore(pc, score);                                  // top-left, inside SAFE_MARGIN
drawLives(pc, lives);                                  // top-right, inside SAFE_MARGIN
hudText(pc, 'LEVEL 2', 'center', 'bottom');            // any edge/corner, always inset
hudText(pc, 'PAUSED', 'center', 'middle', { scale: 2 });
```

`hudText` anchors: `'left' | 'center' | 'right'` × `'top' | 'middle' | 'bottom'`. For gameplay entities, clamp positions to the same inset (the reference ship clamps to `SAFE_MARGIN`) so nothing playable hides in the CRT vignette.

## 2. Always-playable loop with a REACHABLE lose condition

**Check:** Trace the scene machine (`createScenes`): `TITLE → PLAYING ⇄ PAUSED → (GAME_OVER | WIN) → restart`. From every scene, a keypress path leads back to `PLAYING`. Then verify the lose condition can *actually occur*: a hazard that never intersects the player's reachable area, moves too slowly to ever catch them, or spawns behind a wall means the game cannot be lost — that fails this check even though it compiles and runs.

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

## 5. Shake on impactful events — and the render ORDER rule

**Check:** Player damage/death shakes the screen; the biggest moments also flash and hit-stop — all above the floors: **shake ≥ 4–6 px amplitude for ≥ 0.4 s on major events (death/explosion); full-screen death flash holds ≥ 0.3 s; the hit-stop's frozen tableau is actually rendered** (≥1 frame of frozen world visible before the terminal screen — see the death-flow pattern below). Apply the arm's-length test: a death must be unmissable without looking for it. Then check the frame order in `render()` — the single most common juice bug is clearing inside the shake transform, which smears stale pixels along the canvas edges.

**Fix:** Escalate with significance:

```ts
juice.shake(2, 0.2);            // solid hit
// biggest events — death, boss kill — add:
juice.shake(5, 0.45);           // >= 4-6 px, >= 0.4 s
juice.flash(PICO8[8], 0.35);    // full-screen color flash, holds >= 0.3 s
juice.hitStop(0.15);            // freeze-frame emphasis
```

**Hit-stop must be visible — defer the death transition.** Transitioning to `GAME_OVER` in the same tick as `hitStop()` means the frozen tableau never draws (the terminal screen replaces it immediately). The pattern, from the reference game: stay in `PLAYING` while frozen — burst/shake/flash play out over the frozen world — and transition only when the hit-stop expires:

```ts
// on hazard contact: effects + a flag, NOT scenes.to
juice.shake(5, 0.45); juice.flash(PICO8[8], 0.35); juice.hitStop(0.15);
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
  juice.postRender(pc.ctx, W, H);   // 3. restore + flash overlay
  crt.render(pc.ctx, W, H, 1 / 60); // 4. CRT — last, always
}
```

`preRender`/`postRender` must be paired, and `juice.frozen` must actually gate the world simulation or `hitStop` does nothing.

## 6. Scene transitions complete — PAUSED and WIN included

**Check:** `PAUSED` is reachable from `PLAYING` and exitable back to `PLAYING` (the machine also allows `PAUSED → TITLE` — optional, the reference doesn't use it). If the game has a goal, `WIN` is reachable via `scenes.to('WIN')` and exitable to restart. Every state renders something (a paused game showing a frozen frame with no `PAUSED` text fails). Games with no win condition may omit `WIN`, but never `PAUSED`.

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

## Sign-off

The pass is done when all eleven items hold, `npm run check` and `npm run build` pass in the game folder, and the smoke check via **playing-the-game** is green. The user remains the real playtester — report what was verified, never "playtested".
