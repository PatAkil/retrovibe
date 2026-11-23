---
name: creating-a-game
description: Use when the user asks for a new game, or as the entry point when it is unclear which Retrovibe skill applies (this skill owns the routing list). Orchestrates creating a retro game from a chat description — elicit, route, clone the template, develop in modules, validate with look and verify, hand off.
---

# Creating a game

Turn a user's game description into a playable game folder under `workspace/<game-name>`, cloned from `workspace/game-template`. Follow the five steps in order. Never skip a gate.

**No commits during the interaction.** The create→play→iterate loop touches git zero times; the working tree simply holds the current game. Recoverability lives at the deletion moments instead: resetting-the-workspace's safety commit, and this skill's explicit-overwrite branch (Step 2). Explicit "commit/save my game" requests still commit, scoped to `workspace/<game-name>` (never `git add -A`).

**Restore routing:** for restore-flavored requests ("the old one was better", "bring back space-miner"), check `git log --oneline -- workspace/<name>` for checkpoint commits and restore with `git checkout <hash> -- workspace/<name>` — a fresh session can find the recovery without the original chat message.

## Skill routing — single source of truth

This is the canonical routing list for all fourteen Retrovibe skills. CLAUDE.md links here; do not duplicate this list elsewhere.

| Skill | Route here when |
|---|---|
| creating-a-game | The user wants a new game, or you need to decide which skill applies (this list). |
| iterating-on-a-game | The request names a game whose `workspace/<name>` folder already exists ("make the ship faster"). |
| helping-the-user | The request is too vague to build from — elicit core loop, lose condition, controls. |
| designing-mechanics | A **rules-heavy** game (RPG, roguelike, strategy, card, sim, management) is requested, or a system is added or reshaped in one ("add classes", "more replayable") — options on the table, the user decides, contract in `DESIGN.md` before code. Not for arcade action games. |
| balancing-with-the-simulator | A rules-heavy game with headless rules (`game/sim/`) changed its rules or numbers, or feels too easy / too hard / samey — the Monte Carlo simulator. |
| ensuring-arcade-visuals | Work on the game's look: palette discipline, pixel scale, sprite craft, backgrounds, title, CRT, `STYLE.md`. |
| handling-user-input | Anything touching controls: A/B/PAUSE action declarations and labels, edge-vs-held semantics, audio unlock on first keypress. |
| building-platformer-games | The game is a platformer — jump feel, coyote time, jump buffering, AABB collision. |
| improving-game-quality | Feel & correctness pass — this skill owns the only quality checklist. |
| messaging-game-over | Posting state/score transitions to the host via the engine runtime. |
| adding-easter-egg | Palette-swap toggles or secret input sequences. |
| playing-the-game | Eyes, starting/stopping the dev server, `look`, the `verify` gate, handing the URL to the user — owns the whole dev-server lifecycle. |
| verifying-graphics | A change to the engine, the template's reference game/shell, or a visual skill — anything that alters how EVERY game looks. Runs the fixture capture + visual judgement loop before the change is called done. Never for creating or iterating one game. |
| resetting-the-workspace | The request targets the workspace **as a whole** ("reset", "wipe everything", "start over from scratch") — zero-question wipe with an automatic safety commit. A request about one specific game ("this one's boring, start over") routes to iterating-on-a-game / creating-a-game instead, and "clean up" alone never routes here. |

## Step 1 — Elicit (gate)

If the request is vague, invoke **helping-the-user** first. Bar to proceed — all three known:
- core loop (what the player does, repeatedly)
- lose condition (how the run ends)
- controls (which inputs do what)

Do not clone or write code until the bar is met. **Rules-heavy genres** (RPG, roguelike, deck-builder, tactics, management sim) additionally go through **designing-mechanics** before Step 3: options on the table, the user picks, and the contract is written to the game's `DESIGN.md` (in the clone, as the first file after Step 3) before any module is written.

## Step 2 — Route (collision guard)

Derive the folder name from the game's name (if the user didn't name it, invent a short fitting one and tell them): lowercase, words joined with hyphens, folder-friendly (letters, digits, hyphens only — e.g. "Space Miner!" → `space-miner`).

**`game-template` is reserved and never a valid game name.** If the derived name is `game-template`, pick a different name (ask the user). The collision/iterate/overwrite branches below must never be applied to `workspace/game-template` — it is the pristine template, not a game.

Check whether `workspace/<game-name>` already exists:
- **Exists** → hand off to **iterating-on-a-game**, or ask the user: pick a new name, iterate on the existing game, or explicitly overwrite. **Overwrite means safety-commit, then delete, then clone:**
  1. Stop the game's dev server first — never delete a folder a live server is serving: `kill -- -$(cat /tmp/retrovibe-dev-<name>.pid) && rm /tmp/retrovibe-dev-<name>.pid` (no pid file → find it with `ps -eo pid,args | awk '/node .*vite/ && !/awk/'` and `readlink /proc/<pid>/cwd`, then `kill <pid>`).
  2. Pathspec-limited checkpoint of the old game (fixed message convention):
     `git add workspace/<name> && git commit -m "checkpoint <name> before overwrite" -- workspace/<name>`
     (skip only if `git status --porcelain workspace/<name>` is empty AND the folder is already in git history; a never-committed game must be committed here or the overwrite is unrecoverable data loss).
  3. `rm -rf workspace/<name>`, then clone (Step 3), then stage and commit the deletion together with nothing else riding along: `git add workspace/<name> && git commit -m "overwrite <name>" -- workspace/<name>` — note this stages the fresh clone too; that is fine, it IS the overwrite.
  4. The handoff message must name the safety commit hash and the whole-game restore command `git checkout <hash> -- workspace/<name>` — recovery the user isn't told about doesn't exist, and it must be findable by a fresh session (see restore routing above).
- **Does not exist** → continue.

**Never run `cp -r` onto an existing folder.** `cp -r workspace/game-template workspace/<game-name>` against an existing directory copies the template *inside* it (`workspace/<game-name>/game-template/`), nesting the template and corrupting the game.

## Step 3 — Setup workspace

1. Verify template integrity — this must print nothing:
   ```
   git status --porcelain workspace/game-template
   ```
2. If it prints anything, restore before proceeding:
   ```
   git checkout -- workspace/game-template && git clean -fd workspace/game-template
   ```
3. Only after the collision guard (Step 2) and the integrity check pass, clone:
   ```
   cp -r workspace/game-template workspace/<game-name>
   ```
4. Eyes: if `${TMPDIR:-/tmp}/retrovibe-<uid>/eyes.json` is missing or does not say `"ready":true`, run `npm run setup` at the repo root (idempotent, browser only — see **playing-the-game** step 1).

No dependency install is needed — devDeps live once at the repo root and games resolve bins by walking up.

## Step 4 — Develop

Start by launching the dev server in the background for this game (**playing-the-game** step 2 — pid file, readiness poll). It hot-reloads every save, so runtime feedback is continuous and the final gate pays no startup cost.

**Read budget:** CLAUDE.md's engine API, lint and *Agent eyes* sections, the cloned `game/` modules and `STYLE.md`. The engine barrel is `workspace/<game-name>/engine/index.ts` — import only from `'../engine'`, never modify engine files. The reference game shows every presentation pattern in a small module: score pops and the GET READY beat in `play.ts` / `screens.ts`, idle breathing and death-tableau debris in `view.ts`, BEST tracking in `state.ts`, host messages in `flow.ts`, the per-scene lookup tables in `frame.ts`, a pulsing-not-blinking prompt and the attract title in `screens.ts`. Copy from the code rather than re-deriving these from the skills. **The art rules are not optional reading.** A game that is legible and builds green still hands off as a demo unless its sprites, background, surfaces and title get the art pass — **ensuring-arcade-visuals** §3b (sprite craft) and §7 (backgrounds, beveled surfaces, `drawLogo` titles), gated by **improving-game-quality** item 11b. Beyond the reference game, the art-passed fixtures are worked examples a writer **may read** — `verification/cave-hopper/` (`game/sprites.ts`, `game/view.ts`, `game/screens.ts`, `STYLE.md`) and `verification/brick-bounce/` (the same modules). Fixtures are frozen: read only, **never run, never modify, never clone**, and never copy their look (their combinations are reserved by the divergence rule).

Open a companion skill only when its domain is touched: **building-platformer-games** (platformers), **handling-user-input** (changing what buttons do), **ensuring-arcade-visuals**, **messaging-game-over**, **adding-easter-egg**; for a rules-heavy game, **balancing-with-the-simulator** once its headless rules exist. Run **improving-game-quality**'s checklist once before Step 5's full gate.

**Style card before code:** before the first milestone save, derive 2–3 distinct visual directions from the game's fiction, pick one, and rewrite the clone's `STYLE.md` with it (keep its structure: the game in one paragraph, a decisions table, controls as presented, the dev hook). It must diverge from the reference game and from every game currently in `workspace/` (the rule and comparison set live in **ensuring-arcade-visuals** §0). Code carries no comments, so `STYLE.md` is where the art decisions live.

**Modules, not one file.** Keep the template's layout and rename or replace module contents per game: tuning, entities and the `Game` type in `state.ts`, rules in `play.ts` (split further along seams — `physics.ts`, `level.ts`, `enemies.ts` — once a file grows), palette roles in `theme.ts`, art in `sprites.ts`, drawing in `view.ts` / `screens.ts`, scene dispatch in `frame.ts`, wiring in `main.ts`. Every file stays inside the lint thresholds (CLAUDE.md → *Lint suite and thresholds*).

Write the game in 2–3 coherent milestone saves, not one monolithic write: (1) `STYLE.md`, theme, sprites, title + input declarations + movement; (2) core loop + lose condition; (3) juice, audio, difficulty, polish. After each save: `npm run check` and `npm run lint`, then `npm run look` on the scenes the milestone touched. Each milestone must be clean before the next begins.

**Dev hook as part of the game:** keep `game/devhook.ts` working for this game's own state — its `snapshot()` reports this game's fields, its fixture builders drive this game into `playing`, `paused`, `gameover` and `win` (steer onto a hazard, collect, or set the scene directly), and every scene the game cannot reach goes into its `UNSUPPORTED` list (a game with no win condition lists `'win'`). `STYLE.md`'s dev-hook paragraph describes what `state()` returns.

## Step 5 — Validation loop

- After **every** edit:
  ```
  cd workspace/<game-name> && npm run check && npm run lint
  ```
- Look at what changed — the state and errors first, the screenshot whenever the look changed:
  ```
  cd workspace/<game-name> && npm run look -- --scene title
  ```
- Before notifying the user, the full gate must print `TOTAL PASS`, and once per game (it is a structural change) the full set:
  ```
  cd workspace/<game-name> && npm run verify
  cd workspace/<game-name> && npm run verify -- --full
  ```
  `--full` adds knip, jscpd, depcruise, the no-hook build check and `look:all` (every scene, `unsupported` ones reported). **playing-the-game** owns the server and the hand-off.

A green build alone never triggers "done" — it proves compilation, not that the game boots. The handoff state is **server up** (playing-the-game step 5): the dev server stays running after the gate and its liveness is re-verified immediately before the message is sent. Claude may say what it saw through `look`; it never claims to have played the game: report "builds, boots clean, ready to play at <URL>". **The user is the playtester.**

**Escalation rule**: if `check`, `lint` or the smoke gate fails twice on the same approach, escalate the writer one model tier for a fresh attempt instead of a third patch (see CLAUDE.md → Models & orchestration).

There is no commit step — the finished game lives uncommitted in the working tree (see "No commits during the interaction" above).
