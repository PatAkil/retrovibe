---
name: playing-the-game
description: Use when the user asks to play, run, or try a game — and as the pre-handoff runtime gate invoked by creating-a-game and iterating-on-a-game. Runs the eyes and dev-server lifecycle and the runtime gates — browser ready, one pid-tracked Vite server on 5173, look at the screens, npm run verify, hand the URL to the user for playtesting.
---

# Playing the game

Make sure the headless browser is ready and this game's dev server is the one on 5173, look at the game, prove it boots clean with the gates, and hand the URL to the user — who is the playtester. Claude can see the canvas through `look` (state JSON and screenshots) and must look before reporting; it still never claims to have played.

**Never run the template in place.** `workspace/game-template` is pristine and is only ever cloned. Only run games at `workspace/<game-name>`.

One server at a time: the port is pinned to 5173 with `strictPort: true` in the game's `vite.config.ts`, so a second launch fails loudly (`Port 5173 is already in use`) instead of silently drifting to 5174. The lifecycle is **pid-file based** — background-task handles do not survive across Claude sessions, no port-lookup tool is installed in this container, and `pkill -f` matches and kills your own shell. Every server is launched in its own process group with its pid in `/tmp/retrovibe-dev-<name>.pid`.

## Steps

### 1. Eyes up — the browser

```bash
cat /tmp/retrovibe-eyes.json
```

If the file is missing or does not say `"ready":true`, run at the repo root:

```bash
npm run setup
```

It is idempotent (a second run returns in well under a second) and touches only the browser — never a dev server. It uses `CHROMIUM_PATH` when set, else Playwright's own browser, else extracts Chromium from the `@sparticuz/chromium` devDependency behind the wrapper `/tmp/retrovibe-chromium`, proves a launch, and prints one line (`eyes: ready - … | chromium /tmp/retrovibe-chromium | 0.00s`). `NOT READY - <reason>` exits 1; details are in `/tmp/retrovibe-setup.log`; `--force` redoes everything. `npx playwright install chromium` is never required (it is blocked here).

### 2. This game's server on 5173

From the game folder, first ask whether 5173 already serves **this** game — if this prints `200`, skip to step 3:

```bash
cd workspace/<game-name> && curl -s -o /dev/null -w '%{http_code}' "http://localhost:5173/@fs$PWD/index.html"
```

Otherwise reclaim the port. Stop every server a pid file knows about, then check for orphans a past session left without one:

```bash
for f in /tmp/retrovibe-dev-*.pid; do [ -e "$f" ] && kill -- -"$(cat "$f")"; rm -f "$f"; done
ps -eo pid,args | awk '/node .*vite/ && !/awk/'
```

For each pid the second command prints, `readlink /proc/<pid>/cwd` names the folder it serves; a `workspace/<name>` server is ours to stop with `kill <pid>` (the whole `npm`/`sh`/`node` tree exits with it). Leave servers for `verification/` or other ports alone — they are not on 5173.

The port is 5173 by default; `VITE_PORT=<port>` in front of `npm run dev` overrides it (then pass `SMOKE_URL` / `LOOK_URL=http://localhost:<port>/` to `smoke` and `look`). The exposed-port settings apply only on 5173, so the user-facing server always uses the default.

Launch **in the background, never foreground** (Vite never exits; a foreground run hangs the session):

```bash
cd workspace/<game-name> && (setsid nohup npm run dev > /tmp/retrovibe-dev-<game-name>.log 2>&1 < /dev/null & echo $! > /tmp/retrovibe-dev-<game-name>.pid)
```

Poll the log for the readiness line, with a budget of ~15 seconds:

```bash
for i in $(seq 1 30); do grep -q 'Local:   http://localhost:5173/' /tmp/retrovibe-dev-<game-name>.log && break; sleep 0.5; done; tail -5 /tmp/retrovibe-dev-<game-name>.log
```

If the readiness line is not in the tail, read the log: `strictPort` guarantees a conflict fails loudly (`Port 5173 is already in use`) — reclaim again and relaunch. Never proceed on a server that did not print the readiness line, and never poll indefinitely.

### 3. Look

```bash
cd workspace/<game-name> && npm run look -- --scene title
cd workspace/<game-name> && npm run look -- --scene playing --seed 7 --keys "Left,Space"
cd workspace/<game-name> && npm run look -- --scene gameover
```

Each prints one JSON line — `ok`, the game's `state` (from the dev hook's `state()`), `errors` (every `console.error` and page error) and `shot`, the screenshot path (`$AIR_ARTIFACTS_DIR/look/<game>/…` when that is set, else `/tmp/retrovibe-look/<game>/`). Read the state first; read the screenshot whenever the look changed. Scenes: `title playing paused gameover win`; with `--scene` or `--seed` the dev hook holds the loop, so the same arguments give the same pixels. Exit 1 means errors or no canvas; exit 2 means the game lists that scene in `unsupported` (e.g. no WIN). `--no-shot` skips the screenshot, `--out f.png` names it, `--steps N` sets the ticks after each key (default 30).

### 4. Runtime gate

```bash
cd workspace/<game-name> && npm run verify
```

One line per gate — eyes, serve, lint, check, build, smoke (plus `sim:quick` as INFO when the game has `sim/run.mjs`) — then `TOTAL PASS` or `TOTAL FAIL (<gates>)` with the tail of each failing gate's output. `serve` reuses the server on 5173 only when it serves this game, else it starts its own on a free port and stops it afterwards. The smoke gate (`smoke.mjs`, template code copied into every game; `npm run smoke` runs it alone) drives the headless browser: the page loads, a `<canvas>` is attached in the **live DOM** after the game module ran, and zero `console.error` / `pageerror` fire over 40 frames. A nonzero exit is a hard gate failure: read the output, fix the game, repeat from step 3. After a structural change (new modules, a new scene, a dev-hook change) run `npm run verify -- --full` too: knip, jscpd, depcruise, `dist:no-hook`, `look:all`.

### 5. Hand off to the user — with the server UP

**The handoff state is server up.** After the gate passes, LEAVE the dev server running. Immediately before sending the handoff message, re-verify liveness from the game folder:

```bash
kill -0 "$(cat /tmp/retrovibe-dev-<game-name>.pid)" && echo alive
curl -s -o /dev/null -w '%{http_code}' "http://localhost:5173/@fs$PWD/index.html"
```

The first must print `alive`, the second `200`. If either fails, relaunch (step 2) and re-verify — never send "ready to play" against a dead port or another game's server.

**The URL**: when `JBCENTRAL_EXPOSED_PORT_URL_5173` is set (a cloud box with an exposed port — the game's `vite.config.ts` then binds 0.0.0.0 and serves HMR over wss), give that public URL once `curl -s -o /dev/null -w '%{http_code}' "$JBCENTRAL_EXPOSED_PORT_URL_5173"` prints 200; otherwise `http://localhost:5173/`.

The handoff is the payoff moment — the user is a **player**, not QA. Give exactly three things, nothing else:

1. **The URL.**
2. **The controls**, read from the game's declared action labels (the same declarations `controlHints` renders) plus movement — e.g. "Arrows/WASD move · SPACE punch · X kick · P pause".
3. **The goal and lose condition in one line** — e.g. "catch the stars — miss three and it's game over."

Report exactly: "builds, boots clean, ready to play at <URL>". Claude may add one line on what it saw through `look` ("title, play and game-over screens render clean"), but never "playtested", never a claim of having played. **The user is the playtester.** Do **not** send a checklist at handoff.

### 5b. After they've played — the internal verification frame

The checklist below is **Claude's, never the user's**. The full quality bar still lives in **improving-game-quality**, and the machine gates (`npm run verify`, `node harness/verify.mjs`) are unchanged — this frame is for the conversation after play. It has exactly two uses:

1. **One light follow-up** once the user has actually played: a single open question — "anything feel off — sound, restart, difficulty?" — never the list itself.
2. **Triage** when the user reports something wrong: walk the items privately, looking with `npm run look` where a screen is involved, to localize which layer failed before editing anything.

- Title screen renders, with control hints that match the actual controls
- Controls work (move, action buttons)
- Audio unlocks on the first keypress
- Scoring works (pickups, if present, increase the score)
- The lose condition triggers screen shake and game over (hazard contact, falling, etc. — whatever this game's lose is)
- Restart works after game over (and after WIN, if the game has one)
- Ambient background particles and the CRT filter are visible
- HUD respects the safe margins from the viewport edges

### 6. Teardown — only on three triggers

Teardown happens **only** on: a workspace reset (resetting-the-workspace), creating or switching to a *different* game (port handover — step 2 reclaims it), or the user explicitly asking to stop the server. Never tear down just because the gate finished — the default post-gate state is server up, URL live.

```bash
kill -- -$(cat /tmp/retrovibe-dev-<game-name>.pid) && rm /tmp/retrovibe-dev-<game-name>.pid
```

The negative pid signals the whole process group (`npm`, `sh`, `node`, esbuild), so nothing is left holding the port. With no pid file, use step 2's `ps … | awk` line and `kill <pid>`.
