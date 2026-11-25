# Retrovibe

Describe a retro game in chat → skills turn it into a playable, high-quality
TypeScript + Canvas 2D game (no game framework). Loop: **create → play →
iterate → reset → repeat**. Deploy is post-MVP.

## Repo map

```
retrovibe/
├── package.json              # ONE install at the root: typescript, vite, playwright, eslint +
│                             #   typescript-eslint, knip@5, jscpd, dependency-cruiser, esbuild,
│                             #   @sparticuz/chromium. NO "workspaces" field (walk-up bin resolution).
├── eslint.config.mjs, knip.config.js, .jscpd.json, .dependency-cruiser.cjs   # the lint suite
├── tools/                    # eslint-no-comments.mjs (local rule), tsconfig.default.json
├── workspace/
│   ├── game-template/        # pristine + self-contained; NEVER modified, NEVER run in place
│   │   ├── engine/           # 18 modules behind the barrel engine/index.ts — copied with every clone
│   │   ├── game/             # the reference game, split into small modules (below)
│   │   ├── STYLE.md          # the reference game's style card (the art decisions)
│   │   ├── scripts/          # look.mjs, verify.mjs (+ browser, devserver, gates) — template code
│   │   ├── smoke.mjs         # headless boot gate — template code
│   │   ├── vite.config.ts    # base:'./', port 5173 strictPort (VITE_PORT overrides), external cacheDir
│   │   └── index.html        # arcade shell; game mounts into #screen
│   └── <game-name>/          # user games — clones of game-template
├── .claude/skills/           # fourteen skills, commands baked in
├── .claude/agents/           # game-writer, lifecycle-runner
├── harness/                  # setup-eyes.mjs (npm run setup), browser.mjs, verify.mjs + sweep.mjs +
│                             #   index.html (parent-frame postMessage harness)
└── verification/             # graphics verification: capture.mjs (+ fixtures, session, page-runner,
                              #   compare), 3 FROZEN modular fixture games (engine copies gitignored,
                              #   refreshed per run), baseline/ = the approved look
```

Reference game modules (`game/`): `main.ts` wiring only · `app.ts` engine services ·
`theme.ts` size + palette roles · `sprites.ts` · `state.ts` the `Game` type, tuning,
`g.rng`, best score · `flow.ts` scene hooks + host messages · `play.ts` the PLAYING
rules · `frame.ts` update/render lookup tables per scene · `view.ts` backdrop, actors,
HUD · `screens.ts` title, pause, terminal screens · `lookup.ts` `at()` ·
`devhook.ts` dev-only hook.

## Conventions (single definition — skills rely on these)

- **Run game commands from the game folder**: `cd workspace/<game-name> && npm run <script>`.
  Scripts: `dev` (Vite, 5173, strictPort), `check` (`tsc --noEmit`), `lint` (ESLint),
  `build` (`tsc --noEmit && vite build`), `smoke`, `look`, `verify` (see *Agent eyes*).
  Rules-heavy games that adopt the simulator add `sim` / `sim:quick`.
- **No install step per game.** Bins and modules resolve by walking up to the
  root `node_modules`. Never run `npm install` inside a game folder.
- **Eyes once per box**: `npm install` then `npm run setup` at the root. Setup is
  idempotent (well under a second when ready) and finds a browser on its own:
  `CHROMIUM_PATH`, else Playwright's, else Chromium extracted from `@sparticuz/chromium`
  behind the wrapper `${TMPDIR:-/tmp}/retrovibe-<uid>/chromium`. Marker `${TMPDIR:-/tmp}/retrovibe-<uid>/eyes.json`
  (`"ready":true`), log `${TMPDIR:-/tmp}/retrovibe-<uid>/setup.log`. `npx playwright install chromium` is
  never required (it is blocked in this container).
- **Dev server lifecycle is pid-file based** (handles don't survive sessions; port-lookup
  tools are not installed here and `pkill -f` kills your own shell). One server, on 5173:
  - launch (always in the background):
    `cd workspace/<name> && (setsid nohup npm run dev > /tmp/retrovibe-dev-<name>.log 2>&1 < /dev/null & echo $! > /tmp/retrovibe-dev-<name>.pid)`,
    then poll the log ≤ 15 s for `Local:   http://localhost:5173/`;
  - stop: `kill -- -$(cat /tmp/retrovibe-dev-<name>.pid) && rm /tmp/retrovibe-dev-<name>.pid`;
  - who holds the port without a pid file: `ps -eo pid,args | awk '/node .*vite/ && !/awk/'`,
    then `readlink /proc/<pid>/cwd` names the game; reclaim with `kill <pid>`;
  - liveness: `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/` → `200`;
    serving THIS game (from its folder): `curl -sf http://localhost:5173/__retrovibe_root | grep -Fq "\"$(pwd -P)\""` → exit 0 (endpoint returns `{"root":"<realpath>"}`).
- **Hand-off URL**: `$JBCENTRAL_EXPOSED_PORT_URL_5173` when it is set (the dev server
  then binds 0.0.0.0 with HMR over wss), else `http://localhost:5173/`.
- **The template is never modified and never run in place.** Playtest clones.
  Creation is `cp -r workspace/game-template workspace/<game-name>` — only
  after the collision guard (folder must not already exist) and the integrity
  check pass.
- **Template integrity** (before every clone and every reset):
  `git status --porcelain workspace/game-template` must print nothing.
  Restore: `git checkout -- workspace/game-template && git clean -fd workspace/game-template`.
- **No commits during the create/iterate loop.** Git is touched only at
  deletion moments — resetting-the-workspace's safety commit and
  creating-a-game's overwrite branch — on an explicit "commit/save my
  game" request, or when a verification baseline is accepted
  (verifying-graphics step 6, pathspec-scoped to `verification/baseline`). Every commit is pathspec-scoped
  (`git add workspace/<name> && git commit ... -- workspace/<name>`), never
  `git add -A`; deleted games stay recoverable via the reported
  `git checkout <hash> -- workspace/<name>`.
- **Tools are code, never ad-hoc.** Per-game tools are template code copied with every
  clone (`smoke.mjs`, `scripts/*.mjs`); repo-level tools live in `harness/` and
  `verification/`. Skills carry every command inline and never generate helper
  scripts — the one recipe a skill hands over, `sim/run.mjs`
  (balancing-with-the-simulator), becomes part of that game.
- **No comments, anywhere.** `//`, `/* */` and JSDoc are lint errors in every linted
  file. Intent goes into names, types and small functions; the art decisions go into
  the game's **`STYLE.md`** (copied from the template, rewritten per game, edited in the
  same change as the look); the rules of a rules-heavy game go into its `DESIGN.md`.
- **No console in `game/` or `engine/`.** A real fault is `reportError(new Error(...))`
  — a page error, so `look`, `smoke` and `verify` fail on it.
- **Every game keeps its dev hook working** (`game/devhook.ts`, see *Agent eyes*): its
  fixtures follow the game's own state, and scenes the game cannot reach go into
  `unsupported`.
- **Skill frontmatter convention**: every SKILL.md description starts with
  `Use when <trigger conditions>.` followed by one sentence on what it does —
  triggers first, so the right skill is inferred before reading further.
- **Done means**: batch writes per milestone, run `npm run check && npm run lint` once
  per milestone, look at the screens via batched `npm run look -- --scenes title,playing,gameover`
  (state and errors first, screenshots whenever the look changed), and `npm run verify`
  prints `TOTAL PASS` before handing off. Reserve `npm run verify -- --full` for
  structural/template changes, CI, or explicit full-audit requests. A green build alone
  is never "done" — and the user, not Claude, is the playtester. Claude reports
  "builds, boots clean, ready to play at <URL>" and may say what it saw through `look`;
  never "playtested".
- **Graphics changes are verified by looking, not only by building.** Any
  change under `workspace/game-template/` (engine, reference game, shell) or
  to a skill that directs visual choices is not done until the
  **verifying-graphics** loop has run: fixtures captured, `compare.png` and
  the full-size frames viewed, per-criterion verdicts reported, and the user
  has approved the new baseline. Ratios and byte-identity are gates, not
  quality; a monochrome palette passes every ratio and still looks worse.
  Not triggered by creating or iterating a user game.

## Lint suite and thresholds

A hard gate on the template, the fixtures, `harness/`, `verification/` **and every
generated game**. No suppressions (inline config is off, unused directives are errors),
no baseline files, no per-file overrides, no loosened numbers: **fix the code, never the
config**; if a rule is genuinely wrong for a case, stop and report it.

| Gate | Rule |
|---|---|
| `npm run lint` (ESLint strict + stylistic, type-checked) | no comments · `complexity` 10 · `max-depth` 4 · `max-params` 4 · `max-lines` 400/file · `max-lines-per-function` 80 (blank lines skipped) · `max-nested-callbacks` 3 · `eqeqeq` · `curly` (braces on every `if`) · template literals take numbers and strings only · `no-console` in `game/` and `engine/` · game imports the engine only via `'../engine'` |
| naming | camelCase; module-level `const` may be UPPER_CASE; types PascalCase; properties camelCase or UPPER_CASE (quoted keys and DOM key codes are free) |
| `tsconfig.json` | `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` |
| knip | no unused files, exports or dependencies. CLAUDE.md and the skills are entries: an engine export cited in them counts as used |
| jscpd | zero duplicated blocks (50 tokens / 5 lines) |
| dependency-cruiser | no cycles, no orphans, game → engine only via `engine/index.ts`, engine never imports game, headless rules (`game/types.ts`, `data.ts`, `sim.ts`, `sim/**`, `rules/**`) import nothing else |

`npm run verify -- --full` in a game runs knip, jscpd and depcruise for it; root
`npm run lint` / `npm run lint:full` cover the template and the repo.

Working within them:

- **Lookup tables over long switches.** A `Record<Scene, …>` of handlers is one line
  per case, complexity 1, and exhaustive by type (`UPDATE_SCENE` / `RENDER_SCENE` in the
  template's `frame.ts`).
- **Option and geometry objects over long parameter lists** — `{x, y}`, `{x, y, w, h}`,
  a style object, or the game object `g` every presentation function takes.
- **Guard indexed access honestly**: `at(list, i)` from `game/lookup.ts` throws a clear
  `RangeError`; palettes are fixed-length tuples, so `PICO8[7]` is a plain `string`.
  Never `!` or a cast.
- **Strings are not spread.** `[...row]` on a string trips `no-misused-spread`; use
  `row.split('')` (sprite mirror helpers).
- **Export only what another module imports.** knip (`verify -- --full`) fails on unused
  exports; its "Configuration hints" lines are informational, not failures.
- **Split along natural seams** — rules vs view vs screens, one concern per file — not
  at line counts. A new file must be imported by something and must not form a cycle.

## Agent eyes

| Command (in the game folder) | What it does |
|---|---|
| `npm run look -- [--scene S \| --scenes S1,S2,...] [--seed N] [--keys "Left,Space"] [--steps N] [--out f.png] [--no-shot]` | One JSON line per scene `{ok, state, errors, shot}` (`--scenes title,playing,gameover` batches multiple scenes in one browser launch); exit 1 on any console/page error or no canvas, exit 2 when the game lists the scene as `unsupported`. With `--scene`/`--scenes`/`--seed` the page holds the loop and each key is followed by `--steps` (default 30) fixed ticks — same arguments, same pixels. Scenes: `title playing paused gameover win`. Shots: `$AIR_ARTIFACTS_DIR/look/<game>/`, else `/tmp/retrovibe-look/<game>/` |
| `npm run smoke` | Page loads, a `<canvas>` attaches, zero `console.error`/page errors over 40 frames (`SMOKE_URL` overrides the target) |
| `npm run verify [-- --scenes S1,S2,...]` | eyes, serve, lint, check, build, smoke (or batched `look` when `--scenes` is given, avoiding a second Chromium launch) (+ `sim:quick` as INFO when `sim/run.mjs` exists); one `PASS/FAIL/INFO` line per gate, then `TOTAL`. Reuses a server on 5173 only if it serves THIS game, else starts its own on a free port and stops it |
| `npm run verify -- --full` | adds knip, jscpd, depcruise, `dist:no-hook` (no `__retrovibe` in `dist/`), `look:all` (every scene, replacing `smoke`) |

`LOOK_URL`/`SMOKE_URL` point any of them at another server.

**Dev hook contract** (`game/devhook.ts`, installed only under `import.meta.env.DEV`,
absent from the build): `?seed=<uint>` routes the game's random decisions through a
seeded PRNG (`g.rng`); `?scene=<title|playing|paused|gameover|win>` boots a deterministic
fixture (seed defaults to 1); `&hold=1` also seeds `Math.random` and stops the loop from
ticking or drawing. `window.__retrovibe = { state(), step(n), press(action), messages,
unsupported }`: `state()` is the game's JSON snapshot, `step(n)` runs n fixed ticks and
renders once, `press('A'|'B'|'PAUSE'|'UP'|'DOWN'|'LEFT'|'RIGHT')` queues one edge press
for the next tick, `messages` collects the runtime messages, `unsupported: string[]` lists
scenes the game cannot reach (e.g. `['win']`) — `look` exits 2 for them and `look:all`
reports them instead of failing.
A game without one of the five scenes (usually WIN) removes it from the hook's `Fixture` type
and `FIXTURES` list and names it in `UNSUPPORTED`; the hook then ignores `?scene=<name>`
silently, so `look` exits 2 instead of 1. The scene machine's type still requires `WIN`
entries in the `frame.ts` update/render tables — keep them as the terminal-screen no-ops.
`--steps N` applies after each key in `--keys`.

## Automatic feedback (hooks)

`.claude/settings.json` wires `harness/agent-feedback.mjs` into session/subagent hooks and `.githooks/pre-commit` into git: `PostToolUse` tracks touched files without blocking mid-refactor edits, `SubagentStop` runs fast scoped `eslint` + `tsc` on touched files, and `Stop` runs the full gate only on changed units not already remembered green. Full details live in [`MAINTAINING.md`](MAINTAINING.md).

## Engine API (authoritative surface is `engine/index.ts`)

Editing anything under `engine/` (or the template's `game/` / `index.html`) is a
graphics-generator change: not done until **verifying-graphics** has run. Games import
from `'../engine'` only. Geometry arguments are object literals — a point `{x, y}`, a
rect `{x, y, w, h}`, a centred row `{width, y}` (types `Point`, `Rect`, `CenterRow`);
rects snap to whole logical px and a non-positive size draws nothing.

| Module | Key exports | Purpose |
|---|---|---|
| loop.ts | `createLoop({update, render}, {step, maxFrame})` → `.start()/.stop()/.running` | Fixed 1/60 s step; frame delta clamped to `maxFrame` 0.25 s; throws `RangeError` on a non-positive option. Pauses on blur/hidden (keeps calling `render(0)`), resets the clock on focus |
| input.ts | `createInput(actions, {onFirstKey, target})`, `controlHints(input)`, `BUTTON_KEY` | Arrows/WASD → `input.dir`; A = Space/Z, B = X/C, PAUSE = P/Esc (aliased: down while ≥1 alias down); `pressed/held/released`, `endFrame()` once per tick, `actions`, `dispose()`; labels declared in code |
| scenes.ts | `createScenes(initial = 'TITLE', {onIllegal})` → `.current/.is/.to/.onEnter` | `TITLE → PLAYING ⇄ PAUSED → (GAME_OVER \| WIN) → restart`, plus `PLAYING → PLAYING`, `PAUSED → TITLE`. `to()` returns `false` on an illegal move, silently unless `onIllegal(from, to)` is given |
| canvas.ts | `createPixelCanvas({width, height, scale = 3, parent})` → `{canvas, ctx, width, height, scale, clear(color)}` | Smoothing off, scale baked into the transform — draw in logical px; throws when `parent` is `null` |
| sprite.ts | `makeSprite(rows, map, {outline, flipX})`, `flipSprite`, `drawSprite(ctx, sprite, {x, y}, px = 1)` | ASCII-art sprites; `.`/space/unmapped chars transparent. `outline` bakes a 1-cell keyline — the sprite grows 1 cell per side, hitboxes use the inner size |
| anim.ts | `frameIndex(time, fps, count)`, `blink(time, period = 0.9, onRatio = 0.6)` → 1/0, `pulse(time, period = 1.2)` → 0..1 | Clock-driven animation and breathing prompts |
| text.ts | `drawText(ctx, text, {x, y}, opts)`, `drawTextCentered(ctx, text, {width, y}, opts)`, `textWidth(text, scale = 1, spacing = 1)`, `drawLogo(ctx, text, {width, y}, {color, shade, shadow, scale = 3})` | 3×5 bitmap font, M/W 5 wide (proportional — always measure with `textWidth`), uppercased. `TextOptions` `color/scale/spacing/shadow/outline` (bool or colour, mutually exclusive). The keyline is drawn only at `scale >= 3` — below, it degrades to a drop shadow (a keyline closes the 1-px counters). `drawTextCentered` asks for an outline by default at `scale >= 2` unless `shadow` is given. `drawLogo` `color` is REQUIRED (throws) and comes from the palette |
| fills.ts | `fillBands(ctx, rect, colors)`, `fillDither(ctx, rect, {colorA, colorB, pattern})`, `drawBevel(ctx, rect, {fill, light, dark})`, `drawFrame(ctx, rect, {color, thickness = 1})` | Horizontal bands; 4×4 Bayer dither (`'checker'` 50 % default, `'sparse'` 25 %; cached per context); lit-top/left slab; hollow border |
| palette.ts | `PICO8`, `GAMEBOY`, `DUSK`, `NEON`, `SUNSET`, `OCEAN`, `PALETTES`, `swapPalette`, `contrast` | Fixed-length tuples (16/4/8/8/8/8) so `PICO8[7]` is a `string`; a `Palette` (`readonly string[]`, e.g. a `swapPalette` result) indexes to `string \| undefined`. `contrast(a, b)`: actors ≥ 3:1 vs static surfaces, ≥ 4.5:1 authored on any non-black ground; ambient 1.8–2.5:1 |
| particles.ts | `createParticles({width, height, ambient, ambientCount = 48, ambientColor})` → `.update/.render/.burst(x, y, {count, color, speed, life})/.setAmbient(preset, color?)` | Ambient `stars/rain/snow/embers/bubbles` as automatic depth layers with twinkle and clumping; 2–3 px bursts (defaults 8 / 90 / 0.5 s) |
| juice.ts | `createJuice()` → `.shake/.flash/.hitStop/.frozen/.update/.preRender/.postRender` | Order: clear → `preRender` → world → `postRender` → CRT. Shake rounded to whole px. `flash(color, duration, origin?)`: uniform overlay peaking at 0.55, or with an `origin` (logical px) a RADIAL flash centred there (0.75 at centre, clear at 0.55× the larger dimension). Origin on DEATH flashes; WIN/pickup flashes stay uniform |
| audio.ts | `createAudio()` → `.unlock/.play/.ready` | Chiptune sfx `jump/pickup/explosion/hit/blip`; `unlock()` inside the first gesture; `play` before it is a silent no-op |
| ui.ts | `SAFE_MARGIN` (8), `drawScore(pc, score, opts)`, `drawLives(pc, lives, opts)`, `hudText(pc, text, {h, v}, {color, scale, shadow, plate})`, `drawPanel(pc, rect, {color, border})`, `dimScene(pc, alpha = 0.55)` | HUD inside the margin with a 1-px shadow by default; `hudText` adds a plate behind centred text at `scale >= 2` unless `plate: false`; `dimScene` overscans 16 px so shake never exposes an edge. Dim OR plate, never both |
| crt.ts | `createCrt({scanlineAlpha, vignetteAlpha, flicker, halation, lift})` → `.render(ctx, w, h, dt)` | Draw LAST. Halation (cached snapshot ±1 device px, `'lighter'`, 0.09; 0 skips), phosphor lift (`'rgb(15,17,28)'`; `''` skips), multiply scanlines (0.09), vignette (0.35) + flicker (0.03) |
| runtime.ts | `createRuntime({targetOrigin = '*', onStandalone})` → `.gameOver/.scoreChanged/.stateChanged/.embedded/.send` | Wire format `{source:'retrovibe', type, payload}`; embedded → `postMessage` to the parent; standalone → a `window` CustomEvent `'retrovibe'` (message in `detail`), or `onStandalone(message)` instead when given |
| devhook.ts | `createDevHook({update, render, state, setRng, reset, fixtures, unsupported})`, `mulberry32(seed)` | Generic dev-only `?scene=`/`?seed=`/`&hold=1` + `window.__retrovibe` (`state`, `step`, `press`, `resetScene`, `messages`, `unsupported`); tree-shaken out of production builds |

Internal (not exported): `font.ts`, `ambient.ts`, `geometry.ts` helpers.

## Models & orchestration (revisit as models change — roles, not benchmarks)

| Agent | Model tier | Owns |
|---|---|---|
| `lifecycle-runner` | fast/cheap (Haiku-class) | Overwrite safety commits, workspace resets, manual server teardown — command-following only (standard new-game setup runs directly via `node harness/new-game.mjs <game-name>`) |
| `game-writer` | strong/fast (Sonnet-class) | Writing/editing one game's modules, `STYLE.md` and dev hook in 2 batched milestones, `check` + `lint` per milestone, batched `look --scenes`, `verify` before reporting |

- **Escalation rule**: if `check`, `lint` or the smoke gate fails **twice on the same
  approach**, escalate the writer one tier (Sonnet → Opus) for a fresh attempt instead
  of a third patch.
- **Warm-server ordering**: run `node harness/new-game.mjs <game-name>` at the *start* of
  development (~2–3 s) — it clones, checks eyes, prints the `STYLE.md` digest, and launches
  Vite in the background on 5173 so each save hot-reloads and the final gate pays no startup.
  If `npm run verify` reports `serve ... reusing http://localhost:5173/`, hand off directly.
  The user gets the URL only after `verify` is green.
- **Parallel 3-writer fast path (default for non-trivial games)**: once `STYLE.md` + `state.ts`
  (the shared `Game` contract) are written, split into parallel `game-writer` agents against
  the same warm dev server:
  - **Writer A (Rules)**: `play.ts`, `flow.ts`, `frame.ts`, `devhook.ts`, `main.ts`
  - **Writer B (Assets)**: `theme.ts`, `sprites.ts`
  - **Writer C (Renderer/UI)**: `view.ts`, `screens.ts` (owns `look --scenes` and fixes visual defects while context is hot)
  Name each writer's files in its brief; nobody restarts the dev server. While a peer
  is mid-change each writer checks only its own files (`npx tsc --noEmit 2>&1 | grep '^game/<file>'`,
  `npx eslint game/<files>`); the orchestrator runs `npm run verify -- --scenes title,playing,gameover`
  once all report.
- **Read budget for writers**: this file's engine API and lint sections + the cloned
  `game/` modules, `STYLE.md`, and the compact existing-games `STYLE.md` digest from
  setup suffice to start; open a companion skill only when its domain is touched, and
  read `verification/` fixtures only if a visual pass fails.

## Skill routing

The routing list lives **once**, in the orchestrator:
[`.claude/skills/creating-a-game/SKILL.md`](.claude/skills/creating-a-game/SKILL.md).
Start there for any game request; it routes to the other thirteen skills.
