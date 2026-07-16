---
name: playing-the-game
description: Runs the dev-server lifecycle and headless smoke check for a game in workspace/ — reclaim port 5173, launch Vite in the background, run the smoke gate, and hand the URL to the user for playtesting. Invoked by creating-a-game and iterating-on-a-game as the pre-handoff runtime gate, and whenever the user asks to play, run, or try a game.
---

# Playing the game

Start the dev server for one game under `workspace/`, verify it boots clean with the headless smoke check, and hand the URL to the user — who is the playtester. Claude cannot see the canvas and never claims to have played.

**Never run the template in place.** `workspace/game-template` is pristine and is only ever cloned. Only run games at `workspace/<game-name>`.

One server at a time: the port is pinned to 5173 with `strictPort: true` in the game's `vite.config.ts`, so a second launch fails loudly instead of silently drifting to 5174.

## Steps

### 1. Reclaim port 5173

```bash
lsof -ti:5173 | xargs -r kill
```

Kill whatever is listening on 5173 before launching. This is port-based, never handle-based, deliberately: background-task handles do not survive across Claude sessions, so an orphan dev server left by an ended session would hold the pinned port forever and deadlock every future launch. The port-based kill reclaims it regardless of who started it. The `-r` makes empty input a no-op, so the command is harmless when nothing is listening.

### 2. Launch the dev server in the background

```bash
cd workspace/<game-name> && npm run dev
```

Run this **as a background task, never foreground** — Vite never exits, so a foreground run would hang the session indefinitely. Poll the background task's output until the readiness line appears:

```
Local:   http://localhost:5173/
```

If the launch errors instead (e.g. port still in use), `strictPort` guarantees it fails loudly rather than moving to another port — fix the cause (re-run step 1) and relaunch; never proceed on a server that did not print the readiness line.

### 3. Runtime smoke check

```bash
cd workspace/<game-name> && npm run smoke
```

This runs the game's `smoke.mjs` (template code, copied into every game), which drives a real headless Chromium via Playwright — resolved by walk-up from the root `node_modules` devDeps, no per-game install — against `http://localhost:5173/`. It asserts:

- the page loads,
- a `<canvas>` element is attached in the **live DOM** after the game module runs (proving `game/main.ts` executed far enough to mount, not just that `index.html` parsed),
- zero uncaught `console.error` / `pageerror` events fired (it lets the loop run a few frames so async errors surface).

It exits nonzero on any failure — treat a nonzero exit as a hard gate failure: read the `SMOKE FAIL` output, fix the game, and repeat from step 2. A real browser executes the JS; curl could never make these assertions.

### 4. Hand off to the user

Give the user the URL **http://localhost:5173/** and this human playtest checklist:

- Title screen renders, with control hints that match the actual controls
- Controls work (move, action buttons)
- Audio unlocks on the first keypress
- Pickups increase the score
- Hazard contact triggers screen shake and game over
- Restart works after game over
- Ambient background particles and the CRT filter are visible
- HUD respects the safe margins from the viewport edges

**The user is the playtester.** Claude cannot see the canvas. Report exactly: "builds, boots clean, ready to play at http://localhost:5173/" — never "playtested", never any claim of having seen or played the game. (The full quality bar lives in improving-game-quality; this checklist is only what the human verifies at handoff.)

### 5. Teardown

When the user is done, or before resetting-the-workspace runs:

```bash
lsof -ti:5173 | xargs -r kill
```

Same port-based kill as step 1, so it works even on a server this session didn't start.
