# ▚ Retrovibe

Describe a retro game to Claude — the repo's skills turn it into a playable,
high-quality TypeScript + Canvas 2D arcade game. No game framework, no asset
files: a small transparent engine encodes the quality rules (fixed-timestep
loop, screen shake, chiptune synth, CRT filter, safe-margin HUD) as defaults.

**Loop:** create → play → iterate → reset → repeat. Deploy comes post-MVP,
but every game already builds to a self-contained, subpath-deployable `dist/`.

## Quickstart

```sh
npm install                        # once, at the root — games share these devDeps
npx playwright install chromium    # once — the headless browser the smoke gate drives
```

(Skip the browser install only if your environment already provides Playwright
browsers via `PLAYWRIGHT_BROWSERS_PATH`.)

Then ask Claude for a game ("make me a game where a frog dodges traffic").
Claude clones `workspace/game-template` to `workspace/<game-name>`, writes the
game, validates it (`npm run check` / `build` / `smoke`), and hands you:

```
http://localhost:5173/
```

You play; you tell Claude what to change; it iterates. Ask for a reset and
Claude wipes the games you confirm by name (committed games stay recoverable
from git history).

## How it's put together

- `workspace/game-template/` — pristine, self-contained template. Each game is
  a plain `cp -r` clone carrying its own copy of `engine/` (11 modules), the
  arcade-shell `index.html`, a reference game, and a headless smoke gate
  (`smoke.mjs`, real Chromium via Playwright).
- `.claude/skills/` — eleven skills that carry all game-making knowledge and
  all commands. Start at `creating-a-game` (the orchestrator).
- `CLAUDE.md` — repo conventions (defined once) and the frozen engine API.
- `harness/` — parent-frame harness proving the `postMessage` host contract.

What "done" means for any game: typecheck + production build green, **and**
a headless browser boots it with a live canvas and zero uncaught errors. The
human playtest is yours — Claude never claims to have played it.

## License

MIT — see [LICENSE](LICENSE). The games you generate are yours; nothing in the
engine or skills claims them.
