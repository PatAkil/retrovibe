---
name: playing-the-game
description: Use when the user asks to play, run, or try a game — and as the pre-handoff runtime gate invoked by creating-a-game and iterating-on-a-game. Runs the dev-server lifecycle and headless smoke check — reclaim port 5173, launch Vite in the background, run the smoke gate, hand the URL to the user for playtesting.
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

Give the poll a budget of ~15 seconds. If the readiness line hasn't appeared by then, stop and read the task's output: `strictPort` guarantees a port conflict fails loudly (`Port 5173 is already in use`) rather than moving to another port — fix the cause (re-run step 1) and relaunch. Never proceed on a server that did not print the readiness line, and never poll indefinitely.

### 3. Runtime smoke check

```bash
cd workspace/<game-name> && npm run smoke
```

This runs the game's `smoke.mjs` (template code, copied into every game), which drives a real headless Chromium via Playwright — resolved by walk-up from the root `node_modules` devDeps, no per-game install — against `http://localhost:5173/`. It asserts:

- the page loads,
- a `<canvas>` element is attached in the **live DOM** after the game module runs (proving `game/main.ts` executed far enough to mount, not just that `index.html` parsed),
- zero uncaught `console.error` / `pageerror` events fired (it lets the loop run a few frames so async errors surface).

It exits nonzero on any failure — treat a nonzero exit as a hard gate failure: read the `SMOKE FAIL` output, fix the game, and repeat from step 2. A real browser executes the JS; curl could never make these assertions.

**Run smoke only immediately after steps 1–2 launched *this* game's server.** The gate validates whatever is serving port 5173, not the folder you run it from — out of order (another game's server still holding the port), a green result belongs to the wrong game.

### 4. Hand off to the user

The handoff is the payoff moment — the user is a **player**, not QA. Give exactly three things, nothing else:

1. **The URL**: http://localhost:5173/
2. **The controls**, read from the game's declared action labels (the same declarations `controlHints` renders) plus movement — e.g. "Arrows/WASD move · Z punch · X kick".
3. **The goal and lose condition in one line** — e.g. "catch the stars — miss three and it's game over."

Report exactly: "builds, boots clean, ready to play at http://localhost:5173/" — never "playtested", never any claim of having seen or played the game. **The user is the playtester**; Claude cannot see the canvas. Do **not** send a checklist at handoff.

### 4b. After they've played — the internal verification frame

The checklist below is **Claude's, never the user's**. The full quality bar still lives in **improving-game-quality**, and the machine gates (`npm run smoke`, `harness/verify.mjs`) are unchanged — this frame is for the conversation after play. It has exactly two uses:

1. **One light follow-up** once the user has actually played: a single open question — "anything feel off — sound, restart, difficulty?" — never the list itself.
2. **Triage** when the user reports something wrong: walk the items privately to localize which layer failed before editing anything.

- Title screen renders, with control hints that match the actual controls
- Controls work (move, action buttons)
- Audio unlocks on the first keypress
- Scoring works (pickups, if present, increase the score)
- The lose condition triggers screen shake and game over (hazard contact, falling, etc. — whatever this game's lose is)
- Restart works after game over (and after WIN, if the game has one)
- Ambient background particles and the CRT filter are visible
- HUD respects the safe margins from the viewport edges

### 5. Teardown

When the user is done, or before resetting-the-workspace runs:

```bash
lsof -ti:5173 | xargs -r kill
```

Same port-based kill as step 1, so it works even on a server this session didn't start. Note: killing the server makes its background task report a nonzero exit (SIGTERM, typically 143) — that is the expected result of teardown, not a gate failure.

When the smoke check runs purely as a pre-handoff gate (no live playtester right now), tear down immediately after it passes and tell the user the game is ready — they get the URL and this skill relaunches the server (steps 1–2) when they want to play.
