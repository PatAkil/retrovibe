---
name: messaging-game-over
description: Use when wiring scene transitions, score updates, or win/lose reporting — or when host messaging looks missing or wrong. Covers when and how a game posts state, score, and game-over transitions to the host via the engine runtime.
---

# Messaging game over (and every other transition)

`engine/runtime.ts` enforces the wire format — this skill only decides **when** to send. Import from the barrel: `import { createRuntime } from '../engine';` (the reference game creates it once, in `game/app.ts`). Validate from the game folder with `npm run check && npm run lint`.

## The pinned wire format

Every message is exactly:

```ts
{ source: 'retrovibe', type: 'gameOver' | 'scoreChanged' | 'stateChanged', payload }
```

You never build this object yourself — call the typed helpers on the `Runtime` returned by `createRuntime({ targetOrigin, onStandalone })` (both optional):

- `runtime.gameOver({ score, won })` — terminal state reached (payload fields optional; `won: false` for GAME_OVER, `won: true` for WIN).
- `runtime.scoreChanged(score)` — score changed to a new value.
- `runtime.stateChanged(state)` — scene transition, e.g. `'TITLE' | 'PLAYING' | 'PAUSED' | 'WIN'`.

Embed detection is `window.parent !== window` (exposed as `runtime.embedded`). When embedded, the runtime posts to the parent frame via `postMessage` (default `targetOrigin: '*'`). Standalone — how the dev server and a plain `dist/` run — it dispatches each message as a `window` CustomEvent named `'retrovibe'` with the message in `event.detail`, or hands it to `onStandalone(message)` instead when that callback is passed. It never writes to the console (`no-console` is a lint error in `engine/` and `game/`). The dev hook listens for that event and keeps every message in `window.__retrovibe.messages`, so `npm run look` reports the running count in `state.messages`, and `npm run look -- --scene gameover` / `--scene win` print a `state` whose `scene` is `GAME_OVER` or `WIN` with the final `score` — proof the terminal transitions fire. The graphics instrument (`verification/capture.mjs`) reads the same event. For end-to-end proof of the **embedded** path, run the repo's parent-frame harness from the repo root while the game's dev server is up (see **playing-the-game**): `node harness/verify.mjs` embeds the game cross-origin, drives it, and exits nonzero unless all three message types arrive with the pinned envelope (`HARNESS_GAME_URL` points it at a server other than `http://localhost:5173/`).

## When to send

1. **`stateChanged` on every scene transition.** Wire it once through `scenes.onEnter` handlers so no transition can be missed — the reference game does it in one place, `wireScenes` in `game/flow.ts`, which also saves the best score on the terminal entries. The pattern — the three non-terminal scenes in one loop, each terminal scene with its `gameOver`:

   ```ts
   for (const scene of ['TITLE', 'PLAYING', 'PAUSED'] as const) {
     scenes.onEnter(scene, () => { runtime.stateChanged(scene); });
   }
   scenes.onEnter('GAME_OVER', () => {
     runtime.stateChanged('GAME_OVER');
     runtime.gameOver({ score, won: false });
   });
   ```

2. **`scoreChanged` whenever the score changes** — at the point of mutation, e.g. the pickup in the reference's `collectPickup` (`game/play.ts`):

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
