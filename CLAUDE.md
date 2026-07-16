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
│   │   ├── engine/           # 11 modules — copied with the template, each game standalone
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
- **Checkpoint commits are scoped**: `git add workspace/<game-name> && git commit -m "..."` —
  never `git add -A`. Committed games stay recoverable after a reset.
- **No helper scripts.** Skills carry all commands inline.
- **Done means**: `npm run check` after every edit; `npm run build` **and**
  `npm run smoke` green before handing off. A green build alone is never
  "done" — and the user, not Claude, is the playtester. Claude reports
  "builds, boots clean, ready to play at <URL>", never "playtested".

## Engine API (frozen — authoritative surface is `engine/index.ts`)

Games import from `'../engine'`:

| Module | Key exports | Purpose |
|---|---|---|
| loop.ts | `createLoop({update, render})` → `.start()/.stop()` | Fixed-timestep (60 Hz) accumulator loop; frame-delta clamp (250 ms) + clock reset on focus; auto-pause on blur |
| input.ts | `createInput(actions, {onFirstKey})`, `controlHints(input)`, `BUTTON_KEY` | Arrows/WASD → `input.dir`; four buttons A/B/X/Y = Z/X/Space/Enter; `pressed/held/released`, `endFrame()` per tick; labels declared in code |
| scenes.ts | `createScenes()` → `.current/.is/.to/.onEnter` | Enforced machine `TITLE → PLAYING ⇄ PAUSED → (GAME_OVER | WIN) → restart` |
| draw.ts | `createPixelCanvas`, `makeSprite`, `drawSprite`, `drawText`, `drawTextCentered`, `textWidth` | Pixel-scaled canvas, ASCII-art sprites, 3×5 bitmap font |
| palette.ts | `PICO8`, `GAMEBOY`, `DUSK`, `PALETTES`, `swapPalette` | Curated retro palettes + swap support |
| particles.ts | `createParticles({width, height, ambient})` → `.update/.render/.burst/.setAmbient` | Ambient presets (stars/rain/snow/embers/bubbles) + impact bursts |
| juice.ts | `createJuice()` → `.shake/.flash/.hitStop/.frozen/.update/.preRender/.postRender` | Screen shake, flash, hit-stop. Order: clear → `preRender` → world → `postRender` → CRT |
| audio.ts | `createAudio()` → `.unlock/.play/.ready` | WebAudio chiptune sfx (`jump/pickup/explosion/hit/blip`); `unlock()` inside the first user gesture |
| ui.ts | `SAFE_MARGIN`, `drawScore`, `drawLives`, `hudText` | HUD helpers, enforced edge margin |
| crt.ts | `createCrt()` → `.render(ctx, w, h, dt)` | Scanlines + vignette + flicker; draw LAST |
| runtime.ts | `createRuntime()` → `.gameOver/.scoreChanged/.stateChanged/.embedded/.send` | Host contract, pinned wire format `{source:'retrovibe', type, payload}` |

## Skill routing

The routing list lives **once**, in the orchestrator:
[`.claude/skills/creating-a-game/SKILL.md`](.claude/skills/creating-a-game/SKILL.md).
Start there for any game request; it routes to the other ten skills.
