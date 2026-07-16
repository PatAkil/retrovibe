---
name: improving-game-quality
description: Runs the feel-and-correctness quality pass on a Retrovibe game — the repo's ONLY quality checklist. Invoke before any handoff to the user, after substantial gameplay changes, or whenever a game feels flat, unfair, broken on resume, or is missing feedback (particles, shake, sound, HUD).
---

# Improving game quality

This skill owns the **only** quality checklist in the repo — **creating-a-game** and **iterating-on-a-game** defer here instead of carrying their own. Scope is *feel & correctness*; pure look (palette, pixel scale, sprite art, CRT) belongs to **ensuring-arcade-visuals** — the scopes are disjoint by design, but margins/readability live **here**, not there.

Work through every item below. Each has a *check* (how to detect the problem by reading `game/main.ts` and playing) and a *fix* (the engine primitive to use). All imports come from `'../engine'`; the reference implementation is `workspace/game-template/game/main.ts`. After every fix: `cd workspace/<game-name> && npm run check`.

## 1. Margins & readability

**Check:** No HUD element, hint, or score sits closer to a screen edge than `SAFE_MARGIN` (8 logical px). Text is legible: scale 1 minimum for body, dim colors only for secondary info, no text overlapping moving gameplay.

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

**Fix:** Wire missing transitions with `scenes.to(...)` on input edges (the reference: `A` restarts from `GAME_OVER`/`WIN`). Make the hazard's path cover the player's space. Add a difficulty ramp so a competent player still eventually loses — the reference speeds the hazard up on every pickup:

```ts
hazard.vx *= 1.06;
hazard.vy *= 1.06;
```

Level advance is a `PLAYING → PLAYING` re-entry (allowed by the machine). Note `scenes.to` *warns and ignores* illegal transitions — a `console.warn` in playtesting means a mis-wired transition even though nothing crashed.

## 3. Ambient particles fit the game world

**Check:** There is an ambient layer, and its preset matches the fiction — `'stars'` for space, `'rain'` for noir city, `'snow'` for ice, `'embers'` for lava, `'bubbles'` for underwater. A desert game with snow fails.

**Fix:** `createParticles({ width: W, height: H, ambient: 'stars' })` at setup, or `particles.setAmbient('embers')` per level; `null` to disable. Preset choice guidance lives in **ensuring-arcade-visuals**; this item verifies fit.

## 4. Impact particles TUNED TO SIGNIFICANCE

**Check:** Significant events emit a burst, and burst size scales with how much the event matters. Uniform bursts everywhere (or none) fail.

**Fix:** `particles.burst(x, y, opts)` with count by significance:

- **Destruction / death / explosion:** ~5–10 particles, faster and hotter:
  ```ts
  particles.burst(ship.x + 2, ship.y + 2, { count: 10, color: PICO8[8], speed: 120 });
  ```
- **Minor events** (landing, bullet-vs-wall, small pickup): 3–5, gentler:
  ```ts
  particles.burst(pickup.x + 1, pickup.y + 1, { count: 5, color: PICO8[10] });
  ```

`BurstOptions`: `count` (default 8), `color`, `speed` (px/s, default 90), `life` (s, default 0.5). Burst at the event's location, colored like the thing that was hit.

## 5. Shake on impactful events — and the render ORDER rule

**Check:** Player damage/death shakes the screen; the biggest moments also flash and hit-stop. Then check the frame order in `render()` — the single most common juice bug is clearing inside the shake transform, which smears stale pixels along the canvas edges.

**Fix:** Escalate with significance:

```ts
juice.shake(2, 0.2);            // solid hit
// biggest events — death, boss kill — add:
juice.flash(PICO8[8], 0.25);    // full-screen color flash
juice.hitStop(0.12);            // freeze-frame emphasis
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

**Check:** `PAUSED` is reachable from `PLAYING` and exitable back (and to `TITLE`). If the game has a goal, `WIN` is reachable via `scenes.to('WIN')` and exitable to restart. Every state renders something (a paused game showing a frozen frame with no `PAUSED` text fails). Games with no win condition may omit `WIN`, but never `PAUSED`.

**Fix:** Pause toggle on an input edge (reference: button `X`), `hudText(pc, 'PAUSED', 'center', 'middle', ...)` overlay, and `scenes.onEnter(...)` for entry side effects (world reset, host messages via **messaging-game-over**).

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

**Fix:** All gameplay time derives from the `dt` passed to `update(dt)` — accumulate it (`elapsed += dt`) for timers and spawners. Verify by the plan's test: alt-tab 30s, return; no freeze, no teleport, no burst of queued spawns.

## 10. Performance sanity

**Check:** Simulation runs in the fixed-step `update(dt)` (via `createLoop`), not in `render`. Hot loops (per-frame, per-entity) don't allocate visibly: creating arrays/objects/closures every frame, string-building in render, or re-calling `makeSprite` per frame all cause GC stutter.

**Fix:** Build sprites once at module scope (as the reference does). Reuse entity objects; mutate rather than reallocate. Keep `render` pure drawing. The engine's particle system already pools ambient particles and prunes transients — use it instead of a hand-rolled per-frame particle array.

## Sign-off

The pass is done when all ten items hold, `npm run check` and `npm run build` pass in the game folder, and the smoke check via **playing-the-game** is green. The user remains the real playtester — report what was verified, never "playtested".
