---
name: messaging-game-over
description: Use when wiring scene transitions, score updates, or win/lose reporting — or when host messaging looks missing or wrong. Covers when and how a game posts state, score, and game-over transitions to the host via the engine runtime.
---

# Messaging game over (and every other transition)

`engine/runtime.ts` enforces the wire format — this skill only decides **when** to send. Import from the barrel: `import { createRuntime } from '../engine';`. Validate with `cd workspace/<game-name> && npm run check`.

## The pinned wire format

Every message is exactly:

```ts
{ source: 'retrovibe', type: 'gameOver' | 'scoreChanged' | 'stateChanged', payload }
```

You never build this object yourself — call the typed helpers on the `Runtime` returned by `createRuntime()`:

- `runtime.gameOver({ score, won })` — terminal state reached (payload fields optional; `won: false` for GAME_OVER, `won: true` for WIN).
- `runtime.scoreChanged(score)` — score changed to a new value.
- `runtime.stateChanged(state)` — scene transition, e.g. `'TITLE' | 'PLAYING' | 'PAUSED' | 'WIN'`.

Embed detection is `window.parent !== window` (exposed as `runtime.embedded`). When embedded, the runtime posts to the parent frame via `postMessage` (default `targetOrigin: '*'` for MVP); standalone, it logs `'[retrovibe]'` messages to the console — so you can verify sends in the dev console without a host. For end-to-end proof of the embedded path, run the repo's parent-frame harness: with the game's dev server running on 5173 (see **playing-the-game**), run `node harness/verify.mjs` from the repo root — it embeds the game cross-origin, drives it, and exits nonzero unless all three message types arrive with the pinned envelope.

## When to send

1. **`stateChanged` on every scene transition.** Wire it once through `scenes.onEnter` handlers so no transition can be missed — exactly as `workspace/game-template/game/main.ts` does:

   ```ts
   scenes.onEnter('PLAYING', () => {
     runtime.stateChanged('PLAYING');
   });
   scenes.onEnter('TITLE', () => runtime.stateChanged('TITLE'));
   scenes.onEnter('PAUSED', () => runtime.stateChanged('PAUSED'));
   scenes.onEnter('GAME_OVER', () => {
     runtime.stateChanged('GAME_OVER');
     runtime.gameOver({ score, won: false });
   });
   ```

2. **`scoreChanged` whenever the score changes** — at the point of mutation, e.g. the pickup branch in `main.ts`:

   ```ts
   score += 10;
   runtime.scoreChanged(score);
   ```

3. **`gameOver` once, on entering `GAME_OVER`** (with `won: false`) — or on entering `WIN` with `won: true`:

   ```ts
   scenes.onEnter('WIN', () => {
     runtime.stateChanged('WIN');
     runtime.gameOver({ score, won: true });
   });
   ```

   Putting it in the `onEnter` handler guarantees exactly one send per terminal entry.

That's all. The module enforces the shape; a game that wires these three points is fully covered. **improving-game-quality** owns the checklist that verifies scene-transition coverage; anything about which button restarts belongs to **handling-user-input**.
