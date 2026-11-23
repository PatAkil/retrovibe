# ▚ Retrovibe

Describe a retro game to Claude — the repo's skills turn it into a playable,
high-quality TypeScript + Canvas 2D arcade game. No game framework, no asset
files: a small transparent engine encodes the quality rules (fixed-timestep
loop, screen shake, chiptune synth, CRT filter, safe-margin HUD) as defaults.

**Loop:** create → play → iterate → reset → repeat. Deploy comes post-MVP,
but every game already builds to a self-contained, subpath-deployable `dist/`.

## Quickstart

```sh
npm install      # once, at the root — every game shares these devDeps
npm run setup    # once per machine — finds or extracts a headless Chromium for the gates
```

`npm run setup` uses `CHROMIUM_PATH` if set, else Playwright's own browser, else
the Chromium bundled in the `@sparticuz/chromium` devDependency — no separate
browser install step. It is idempotent; re-run it whenever a gate says the eyes
are not ready.

Then ask Claude for a game ("make me a game where a frog dodges traffic").
Claude clones `workspace/game-template` to `workspace/<game-name>`, writes the
game, looks at its screens, runs the gates, and hands you the URL
(`http://localhost:5173/`, or the public URL when the box exposes port 5173).

You play; you tell Claude what to change; it iterates. Ask for a reset and
Claude wipes the workspace's games after a safety commit, so every game stays
recoverable from git history.

## The gates

Every game folder carries its own tools (copied from the template):

| Command (in `workspace/<game-name>`) | What it proves |
|---|---|
| `npm run check` | TypeScript, strict, `noUncheckedIndexedAccess` |
| `npm run lint` | ESLint, strict type-checked — no comments, complexity ≤ 10, ≤ 400 lines per file, ≤ 80 per function, ≤ 4 parameters, engine imported only through its barrel |
| `npm run look -- --scene gameover` | one JSON line with the game's state, any console/page errors, and a screenshot — how Claude *sees* a screen |
| `npm run verify` | lint, check, build, smoke (a headless browser boots the game with a live canvas and zero errors) — one line per gate, then `TOTAL PASS` |
| `npm run verify -- --full` | adds knip, jscpd, dependency-cruiser, "no dev hook in the build", and a look at every scene |

"Done" for any game means `verify` green — and the human playtest is yours:
Claude reports what it built and what it looked at, never that it "playtested".

## How it's put together

- `workspace/game-template/` — pristine, self-contained template. Each game is
  a plain `cp -r` clone carrying its own copy of `engine/` (18 small modules
  behind one barrel), a reference game split into small modules under `game/`,
  its style card `STYLE.md`, a dev-only hook (`?scene=`, `?seed=`) that lets the
  tools reach every screen deterministically, and the gate scripts.
- `.claude/skills/` — fourteen skills that carry all game-making knowledge and
  all commands. Start at `creating-a-game` (the orchestrator). Rules-heavy games
  (RPGs, roguelikes, deck-builders) take an opt-in path: `designing-mechanics`
  writes a `DESIGN.md` contract, `balancing-with-the-simulator` adds headless
  rules and a Monte Carlo simulator.
- `CLAUDE.md` — repo conventions (defined once), the lint thresholds, the eyes
  commands and the engine API.
- `harness/` — `npm run setup` and the parent-frame harness proving the
  `postMessage` host contract.
- `verification/` — graphics verification: three frozen fixture games, a
  deterministic frame-capture driver, and the approved baseline frames (see the
  `verifying-graphics` skill).
- Root `npm run lint` / `npm run lint:full` lint the whole repo — the template,
  the fixtures, `harness/` and `verification/` included; there are no exemptions.

## License

MIT — see [LICENSE](LICENSE). The games you generate are yours; nothing in the
engine or skills claims them.
