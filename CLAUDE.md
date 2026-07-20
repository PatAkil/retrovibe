# Retrovibe

Describe a retro game in chat → skills turn it into a playable, high-quality
TypeScript + Canvas 2D game (no game framework). Loop: **create → play →
iterate → reset → repeat**. Deploy is post-MVP.

## Repo map

```
retrovibe/
├── package.json              # ONE install at the root: typescript, vite, playwright,
│                             #   @types/node. NO "workspaces" field (would break
│                             #   walk-up bin resolution).
├── workspace/
│   ├── game-template/        # pristine + self-contained; NEVER modified, NEVER run in place
│   │   ├── engine/           # 13 modules — copied with the template, each game standalone
│   │   ├── game/main.ts      # the reference game every skill points to
│   │   ├── smoke.mjs         # headless smoke gate (template code, not a repo helper script)
│   │   ├── vite.config.ts    # base:'./', port 5173 strictPort, external cacheDir
│   │   └── index.html        # arcade shell; game mounts into #screen
│   └── <game-name>/          # user games — clones of game-template
├── .claude/skills/           # eleven skills, commands baked in
└── harness/                  # parent-frame postMessage verification harness
```

## Conventions (single definition — skills rely on these)

- **Run game commands from the game folder**: `cd workspace/<game-name> && npm run <script>`.
  Scripts: `dev` (Vite, port 5173, strictPort), `check` (`tsc --noEmit`),
  `build` (`tsc --noEmit && vite build`), `smoke` (`node smoke.mjs`).
- **No install step per game.** Bins and modules resolve by walking up to the
  root `node_modules`. Never run `npm install` inside a game folder.
- **The smoke gate needs a browser once**: `npx playwright install chromium`
  at the root after `npm install` — unless the environment already provides
  Playwright browsers (`PLAYWRIGHT_BROWSERS_PATH` set, as in this container).
  Without it, `npm run smoke` fails with "Executable doesn't exist".
- **Dev server lifecycle is port-based** (handles don't survive sessions):
  reclaim/teardown with `lsof -ti:5173 | xargs -r kill`; always launch
  `npm run dev` in the background and poll for the readiness line
  `Local:   http://localhost:5173/`.
- **The template is never modified and never run in place.** Playtest clones.
  Creation is `cp -r workspace/game-template workspace/<game-name>` — only
  after the collision guard (folder must not already exist) and the integrity
  check pass.
- **Template integrity** (before every clone and every reset):
  `git status --porcelain workspace/game-template` must print nothing.
  Restore: `git checkout -- workspace/game-template && git clean -fd workspace/game-template`.
- **No commits during the create/iterate loop.** Git is touched only at
  deletion moments — resetting-the-workspace's safety commit and
  creating-a-game's overwrite branch — or on an explicit "commit/save my
  game" request. Every commit is pathspec-scoped
  (`git add workspace/<name> && git commit ... -- workspace/<name>`), never
  `git add -A`; deleted games stay recoverable via the reported
  `git checkout <hash> -- workspace/<name>`.
- **No helper scripts.** Skills carry all commands inline.
- **Skill frontmatter convention**: every SKILL.md description starts with
  `Use when <trigger conditions>.` followed by one sentence on what it does —
  triggers first, so the right skill is inferred before reading further.
- **Done means**: `npm run check` after every edit; `npm run build` **and**
  `npm run smoke` green before handing off. A green build alone is never
  "done" — and the user, not Claude, is the playtester. Claude reports
  "builds, boots clean, ready to play at <URL>", never "playtested".

## Engine API (frozen — authoritative surface is `engine/index.ts`)

Games import from `'../engine'`:

| Module | Key exports | Purpose |
|---|---|---|
| loop.ts | `createLoop({update, render})` → `.start()/.stop()` | Fixed-timestep (60 Hz) accumulator loop; frame-delta clamp (250 ms) + clock reset on focus; auto-pause on blur |
| input.ts | `createInput(actions, {onFirstKey})`, `controlHints(input)`, `BUTTON_KEY` | Arrows/WASD → `input.dir`; buttons A = Space/Z, B = X/C, PAUSE = P/Esc (dedicated, aliased — down while ≥1 alias down); `pressed/held/released`, `endFrame()` per tick; labels declared in code |
| scenes.ts | `createScenes()` → `.current/.is/.to/.onEnter` | Enforced machine `TITLE → PLAYING ⇄ PAUSED → (GAME_OVER | WIN) → restart` |
| draw.ts | `createPixelCanvas`, `makeSprite(rows, map, shade?)`, `drawSprite`, `drawText`, `drawTextCentered`, `textWidth` | Pixel-scaled canvas, ASCII-art sprites (optional `SpriteShade` ramp — solid bands down each color's shade ladder; unset = byte-identical flat), 3×5 bitmap font |
| palette.ts | `PICO8`, `GAMEBOY`, `DUSK`, `NEON`, `SUNSET`, `OCEAN`, `PALETTES`, `swapPalette`, `contrast`, `SHADE_LADDERS`, `SHADE_FLAT`, `shadeLadder` | Curated retro palettes (roles documented per index) + swap support + `contrast(a,b)` legality check (actors ≥3:1 vs static surfaces; ambient 1.8–2.5:1 band) + audited per-color shade ladders (`shadeLadder(color)`; colors in `SHADE_FLAT` degrade to flat) |
| particles.ts | `createParticles({width, height, ambient, ambientColor, ambientColors})` → `.update/.render/.burst/.setAmbient/.setPaused` | Ambient presets (stars/rain/snow/embers/bubbles; band-compliant default colors, overridable — `ambientColors` for a multi-color mix) + 2–3 px impact bursts; `setPaused` freezes ambient drift on PAUSED |
| background.ts | `createGrid(opts)` → `.update/.render/.setPaused/.setReducedMotion` | Scrolling background grid / parallax layer; draw between `juice.preRender` and the world pass; the game calls `setPaused(true)` on PAUSED (no scene awareness of its own) and `setReducedMotion` for the motion damper |
| juice.ts | `createJuice()` → `.shake/.flash/.hitStop/.frozen/.update/.preRender/.postRender` | Screen shake, flash, hit-stop. Order: clear → `preRender` → world → `postRender` → CRT |
| audio.ts | `createAudio()` → `.unlock/.play/.ready` | WebAudio chiptune sfx (`jump/pickup/explosion/hit/blip`); `unlock()` inside the first user gesture |
| ui.ts | `SAFE_MARGIN`, `drawScore`, `drawLives`, `hudText` | HUD helpers, enforced edge margin |
| glow.ts | `createGlow(opts)` → `.ctx/.halo/.bloom/.ring/.update/.setFrozen/.setDamped/.composite` | Additive glow layer — halos, impact blooms (rate-limited), crisp 1px boundary rings; `halo` is a per-frame queued command (re-issue every render frame — `composite` clears the queue) and `ring` draws immediately to the ctx passed, also per frame; `bloom` alone is a one-shot transient; `composite(target)` inside the shake window before crisp sprites; `setFrozen` mirrors `juice.frozen` |
| crt.ts | `createCrt({aberration?})` → `.render(ctx, w, h, dt, drawOverlay?)/.pulse/.setFrozen` | Scanlines + vignette + flicker; draw LAST. Chromatic aberration is strictly opt-in/default-off (`CrtOptions.aberration`); `pulse(mag, s)` fires a decaying split transient (rate-limited), `setFrozen` pauses its decay during hit-stop, `drawOverlay` draws HUD/text after the aberration pass so text stays crisp |
| runtime.ts | `createRuntime()` → `.gameOver/.scoreChanged/.stateChanged/.embedded/.send` | Host contract, pinned wire format `{source:'retrovibe', type, payload}` |

## Models & orchestration (revisit as models change — roles, not benchmarks)

Two repo agents in `.claude/agents/` make the tiering mechanical:

| Agent | Model tier | Owns |
|---|---|---|
| `lifecycle-runner` | fast/cheap (Haiku-class) | Clone, integrity checks, ports, dev server, smoke, reset/overwrite safety commits, resets — command-following only |
| `game-writer` | strong/fast (Sonnet-class) | Writing/editing game code — milestone saves, per-save `npm run check` |

- **Escalation rule**: if `npm run check` or the smoke gate fails **twice on
  the same approach**, escalate the writer one model tier (Sonnet → Opus;
  fast mode when available) for a fresh attempt instead of a third patch —
  a retry cascade costs more wall-clock than one stronger pass.
- **Warm-server ordering**: launch the dev server (per playing-the-game's
  port discipline) at the *start* of development, in the background — each
  milestone save hot-reloads, and the final smoke gate pays no startup. The
  handoff contract is unchanged: the user gets the URL only after build and
  smoke are green.
- **Read budget for writers**: CLAUDE.md's engine API table + the cloned
  `game/main.ts` suffice to start; open a companion skill only when its
  domain is actually touched.

## Skill routing

The routing list lives **once**, in the orchestrator:
[`.claude/skills/creating-a-game/SKILL.md`](.claude/skills/creating-a-game/SKILL.md).
Start there for any game request; it routes to the other ten skills.
