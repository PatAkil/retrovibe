---
name: handling-user-input
description: Use when anything touches controls — declaring or relabeling actions, movement handling, edge-vs-held semantics (pressed/held/released, endFrame), title-screen control hints, or audio unlock on first keypress. The unified keyboard contract and owner of the A/B/X/Y action model.
---

# Handling user input

Every Retrovibe game uses `engine/input.ts` for all keyboard input. Import only from the barrel: `import { createInput, controlHints, BUTTON_KEY } from '../engine';`. The reference implementation is `workspace/game-template/game/main.ts` — copy its patterns. After any input edit: `cd workspace/<game-name> && npm run check`.

## Movement — arrows + WASD, one vector

`input.dir` returns `{ x, y }` with each axis in `-1 | 0 | 1`. Arrows and WASD are both bound; opposing keys cancel to 0. Never add your own key listeners for movement — read `dir` every update tick:

```ts
ship.x += input.dir.x * SHIP_SPEED * dt;
ship.y += input.dir.y * SHIP_SPEED * dt;
```

## The four buttons — A/B/X/Y

Actions are formalized as four buttons, each bound to a fixed physical key. The binding lives in the engine's `BUTTON_KEY` export (`Readonly<Record<ButtonName, { code: string; hint: string }>>`):

| Button (`ButtonName`) | Key (`code`) | Hint shown |
|---|---|---|
| `'A'` | `KeyZ` | `Z` |
| `'B'` | `KeyX` | `X` |
| `'X'` | `Space` | `SPACE` |
| `'Y'` | `Enter` | `ENTER` |

Games never rebind keys. They choose *which buttons mean what* via action declarations.

## Actions are DECLARED IN CODE — the single source of truth

`createInput(actions: ActionDecl[], opts?: InputOptions)` takes the game's action declarations. Each `ActionDecl` is `{ button: ButtonName; label: string }` — the label is a short human word (**one word, two max**, e.g. `'jump'`, `'fire'`, `'drop bomb'`).

This declaration is the **only** place a button's meaning is written down:

- Title-screen hints render **from** it via `controlHints(input)` — which returns lines like `['Z JUMP', 'X FIRE']` (key hint + uppercased label). Movement is implicit (arrows/WASD) and not included; render a movement line separately if desired, as the reference game does.
- **Never hand-write the title-screen control hints anywhere else.** A hand-written hint is a second source of truth that drifts. (Other screens may show contextual button text — e.g. the reference game-over screen's `Z RESTART` — but the key name must come from the same physical binding `BUTTON_KEY` documents, and the title screen always renders from the declarations.)
- When an edit changes what a button does, change the `label` in the **same declaration** in the same edit. There is no separate file to keep in sync — a wrong or missing label is visible the moment the game is played.

Complete setup, from `workspace/game-template/game/main.ts`:

```ts
import { createInput, controlHints, createAudio } from '../engine';

const audio = createAudio();
// Actions are DECLARED here with their labels — the title screen renders hints
// from these declarations (controlHints), so labels can never drift.
const input = createInput(
  [
    { button: 'A', label: 'start' },
    { button: 'X', label: 'pause' },
  ],
  { onFirstKey: () => audio.unlock() },
);
```

And the title-screen render, also from `main.ts`:

```ts
// Control hints rendered FROM the action declarations — never hand-written.
controlHints(input).forEach((hint, i) => {
  drawTextCentered(pc.ctx, hint, W, 100 + i * 10, { color: PICO8[7] });
});
drawTextCentered(pc.ctx, 'ARROWS/WASD MOVE', W, 100 + controlHints(input).length * 10, {
  color: PICO8[5],
});
```

## Edge vs held semantics

The `Input` interface exposes three queries per button:

- `pressed(button)` — went down **this frame**. Use for one-shot actions: start, pause toggle, fire-per-press, menu confirm.
- `held(button)` — currently down. Use for continuous actions: charging, thrusting, variable jump height.
- `released(button)` — went up **this frame**. Use for release-triggered actions (e.g. cutting a jump short).

**`endFrame()` must be called exactly once per update tick, after all input reads** — it clears the `pressed`/`released` edges. The reference game calls it as the last line of `update(dt)`:

```ts
function update(dt: number): void {
  // ... read input.dir, input.pressed(...), etc. ...
  input.endFrame();
}
```

Forgetting `endFrame()` makes every `pressed()` stick true forever; calling it before reading input makes edges invisible. Key repeat is filtered (`e.repeat` is ignored), so holding a key produces exactly one `pressed()`.

## Stuck keys on blur — automatic

The engine clears all held keys on `window` blur, so alt-tabbing mid-hold never leaves a key stuck down. Nothing to do in game code — do not add your own blur handling.

## Audio unlock on first keypress

Browsers block audio until a user gesture. The engine handles this by design: pass `onFirstKey` in `InputOptions` and wire it to `audio.unlock()` (see the `createInput` example above — that is the reference game's exact pattern). The engine fires it once, on the very first keydown; `audio.play(...)` before unlock is a silent no-op. Never create an `AudioContext` yourself and never call `unlock()` outside a user gesture.

## Cleanup

`input.dispose()` removes all listeners. Single-game pages (the normal case) never need it; it exists for teardown in embedding scenarios.

## Cross-references

- **improving-game-quality** owns the quality checklist (it verifies hints are present and truthful; label ownership stays here).
- **messaging-game-over** and **adding-easter-egg** defer to this skill for anything label- or binding-related.
