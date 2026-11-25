---
name: improving-game-quality
description: Use when a game is about to be handed off to the user, after substantial gameplay changes, or when it feels flat, unfair, broken on resume, or is missing feedback (particles, shake, sound, HUD). Runs the feel-and-correctness pass — the repo's ONLY quality checklist.
---

# Improving game quality

Owns the **only** quality checklist in the repo (feel & correctness + margins/readability; pure look lives in **ensuring-arcade-visuals**). Editing this skill's visual items or the engine triggers **verifying-graphics**. Import only from `'../engine'`. Read [`references/examples.md`](references/examples.md) only if a check fails or you need worked code examples.

## The 15-item pre-handoff checklist

- [ ] **1. Margins & readability:** All HUD/hints sit inside `SAFE_MARGIN` (8 px) via `drawScore`, `drawLives`, `hudText`; gameplay entities clamp to `SAFE_MARGIN`. Size floors met: player `>= H/12` (≈14 px at 160), other critical `>= H/20` (≈8 px), hitboxes within ~1 px of rendered size. Contrast floors (`contrast()`): `>= 3:1` on black, `>= 4.5:1` authored on non-black clear, `>= 3:1` vs overlapped scenery; ambient `1.8–2.5:1`; grayscale-safe.
- [ ] **1b. Prompts pulse, never blink off:** Every `PRESS A` / `RESTART` prompt alternates two visible palette tones via clock-driven `blink`/`pulse` — never disappears completely.
- [ ] **2. Playable loop, reachable lose, GET READY & difficulty ramp:** `createScenes` wires `TITLE → PLAYING ⇄ PAUSED → (GAME_OVER | WIN) → restart` with a genuinely reachable lose condition. **Endless/score games** (finite-goal games exempt): hold hazards inert for 0.5–1 s at run start with a `GET READY` overlay (timer inside `PLAYING`), and ramp difficulty noticeably within 30 s / real pressure by ~2 min (`×1.10–1.15` per pickup + `~+1%/s` compounding time ramp).
- [ ] **3. Ambient fits the world:** `createParticles` / `setAmbient` preset matches the fiction (`'stars'`, `'rain'`, `'snow'`, `'embers'`, `'bubbles'`, or `null` indoors).
- [ ] **3b. Idle world alive:** Pickups bob/pulse (`pulse`/`blink`) and hazards pulse to a hotter same-hue twin (`blink` duty `0.15–0.25`) even while the player is elsewhere.
- [ ] **4. Impact bursts tuned to significance:** `particles.burst` (`BurstOptions`) in the game's own palette (never engine default yellow), visible at arm's length under CRT — destruction/death 5–10+ fast/hot (`speed >= 140`), minor events 3–5 gentler.
- [ ] **4b. Score pop on every score change:** Floating rising/fading `+N` text leaves the event position (`drawText`/`textWidth`), paired with a burst and brief player flash-twin.
- [ ] **5. Juice floors, scaling, debris & render order:** `createJuice` — solid hit `shake(2, 0.2)`; major death `shake >= 4–6 px` for `>= 0.4 s`, saturated `flash >= 0.3 s` with death-point origin `{x, y}` (never white; uniform only on WIN/pickup), `hitStop(0.15)` with deferred `GAME_OVER` transition (`dying` flag) so ≥1 frozen frame renders. Scale death shake/burst by run significance (`mag 0..1`). Replace intact player sprite with a debris sprite while dying. Mandatory frame order: `update` runs `juice.update(dt)` first and gates simulation on `juice.frozen`; `render` runs `pc.clear` (un-shaken) → `juice.preRender` → world → `juice.postRender` → `crt.render` **LAST**.
- [ ] **6. Complete scenes, overlay separation & BEST:** `PAUSED` toggles on `input.pressed('PAUSE')` (never a gameplay button); `WIN` wired if goal-based. Overlay text sits on `dimScene` + hollow `drawFrame` OR `hudText` plate (dim OR plate, never both, never bare over busy scene). Track `BEST` in module scope + `try`/`catch` `localStorage`, save in `scenes.onEnter`, and call out `NEW BEST` distinctly.
- [ ] **7. Audio coverage:** `createAudio` unlocked via `createInput(actions, { onFirstKey: () => { audio.unlock(); } })`; every significant event plays an `Sfx` preset (`'jump'`, `'pickup'`, `'explosion'`, `'hit'`, `'blip'`).
- [ ] **8. Truthful control hints:** Title screen renders `controlHints(input)` (never hand-written) plus a static movement line; every declared action matches its label.
- [ ] **9. Alt-tab resume:** `createLoop` clamps/pauses automatically; game code uses accumulated `dt` only — zero `Date.now()`/`performance.now()` gameplay timers.
- [ ] **10. Performance sanity:** Simulation runs in fixed `update(dt)`, `render` is pure drawing; sprites built once at module scope, no per-frame allocations.
- [ ] **11. Visual distinctness:** Diverges from the reference game, fixtures, and `workspace/` digest (**ensuring-arcade-visuals** §0).
- [ ] **11b. Art direction — not a demo:** `px = 1` full-size multi-tone outlined sprites (`makeSprite`/`flipSprite`/`frameIndex`), ≥2 calm background depth planes (`fillBands`/`fillDither`), `drawBevel`/`drawFrame` surfaces, `drawLogo` + large hero prop title, `dimScene` + hollow `drawFrame` terminal screens (`drawPanel` only without dim).

## Sign-off

Done when all 15 items hold, scenes have been inspected via `npm run look -- --scenes title,playing,gameover`, and `npm run verify` prints `TOTAL PASS` in the game folder. Never claim to have playtested — the user is the playtester.
