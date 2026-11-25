---
name: creating-a-game
description: Use when the user asks for a new game, or as the entry point when it is unclear which Retrovibe skill applies (this skill owns the routing list). Orchestrates creating a retro game from a chat description — elicit, route, clone the template, develop in modules, validate with look and verify, hand off.
---

# Creating a game

Turn a user's game description into a playable game folder under `workspace/<game-name>`, cloned from `workspace/game-template`. Follow the steps in order. Never skip a gate.

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

Do not clone or write code until the bar is met. **Rules-heavy genres** (RPG, roguelike, deck-builder, tactics, management sim) additionally go through **designing-mechanics** before Step 2: options on the table, the user picks, and the contract is written to the game's `DESIGN.md` (in the clone, as the first file after Step 2) before any module is written.

## Step 2 — Route, setup & warm server (single `lifecycle-runner` call)

Derive the folder name from the game's name (if the user didn't name it, invent a short fitting one and tell them): lowercase, words joined with hyphens, folder-friendly (letters, digits, hyphens only — e.g. "Space Miner!" → `space-miner`). **`game-template` is reserved and never a valid game name.**

Run **one** `lifecycle-runner` invocation to perform the entire mechanical setup in a single round-trip:

1. **Collision guard:** check whether `workspace/<game-name>` already exists.
   - **Exists** → stop and hand off to **iterating-on-a-game**, or ask the user: pick a new name, iterate on the existing game, or explicitly overwrite. **Overwrite means safety-commit, then delete, then clone:**
     1. Stop the game's dev server first: `kill -- -$(cat /tmp/retrovibe-dev-<name>.pid) && rm /tmp/retrovibe-dev-<name>.pid` (no pid file → `ps -eo pid,args | awk '/node .*vite/ && !/awk/'` + `readlink /proc/<pid>/cwd`, then `kill <pid>`).
     2. Pathspec-limited checkpoint of the old game: `git add workspace/<name> && git commit -m "checkpoint <name> before overwrite" -- workspace/<name>` (skip only if `git status --porcelain workspace/<name>` is empty AND the folder is already in git history).
     3. `rm -rf workspace/<name>`, clone, then commit the overwrite: `git add workspace/<name> && git commit -m "overwrite <name>" -- workspace/<name>`.
     4. Name the safety commit hash and restore command `git checkout <hash> -- workspace/<name>` in the handoff message.
   - **Never run `cp -r` onto an existing folder** (it nests `game-template/` inside it).
2. **Template integrity & clone:** `git status --porcelain workspace/game-template` must be empty (else `git checkout -- workspace/game-template && git clean -fd workspace/game-template`), then `cp -r workspace/game-template workspace/<game-name>`. No `npm install` needed — bins walk up to root `node_modules`.
3. **Eyes check:** if `${TMPDIR:-/tmp}/retrovibe-<uid>/eyes.json` is missing or not `"ready":true`, run `npm run setup` at the repo root (**playing-the-game** step 1).
4. **Existing-games `STYLE.md` digest:** extract a compact 1-line-per-game palette/ambient/silhouette digest of other `workspace/*/STYLE.md` files (excluding `game-template` and `<game-name>`, e.g. `head -n 12 workspace/*/STYLE.md`) and return it so the orchestrator includes it in `game-writer`'s brief.
5. **Warm dev server on 5173:** reclaim port 5173 and launch `npm run dev` in the background for `workspace/<game-name>` (**playing-the-game** step 2 — pid file + ≤15 s readiness poll).

## Step 3 — Develop

Overlap drafting the `STYLE.md` direction and `state.ts` contract while Step 2's `lifecycle-runner` finishes setup (write them into the clone as soon as Step 2 returns). Pass the compact `STYLE.md` digest from Step 2 directly in `game-writer`'s brief so it diverges without reading every `workspace/*/STYLE.md` file.

**Writer-brief guardrails (always include):**
- Draw the player sprite larger than its hitbox (forgiving arcade feel and clear hero silhouette).
- Keep the hostile/hazard color off the player and bosses so threats read unambiguously.
- Make end-screen panels (`GAME_OVER` / `WIN`) opaque with no world banners or HUD bleeding behind them.
- Batch multiple `Write` calls in parallel in the same turn (1–2 turns per writer, never one file per turn).
- Art writers run `npm run look -- --scenes ...` themselves (retrying outside the sandbox if blocked) and inspect their own screenshots before reporting — never draw blind.

**Read budget:** CLAUDE.md's engine API, lint and *Agent eyes* sections, the cloned `game/` modules and `STYLE.md`. Import only from `'../engine'`, never modify engine files. Copy presentation patterns from the cloned reference game (`play.ts`, `view.ts`, `screens.ts`, `state.ts`, `flow.ts`, `frame.ts`). **The art rules are not optional reading** — apply **ensuring-arcade-visuals** (`STYLE.md` divergence, `px = 1` multi-tone outlined sprites, ≥2 depth planes, beveled surfaces, `drawLogo` title), gated by **improving-game-quality** item 11b. Do **not** read `verification/{cave-hopper,brick-bounce}/` upfront; only consult them (read-only, frozen, never run/modify/clone) if a visual pass fails.

Open a companion skill only when its domain is touched: **building-platformer-games** (platformers), **handling-user-input** (changing what buttons do), **ensuring-arcade-visuals**, **messaging-game-over**, **adding-easter-egg**; for a rules-heavy game, **balancing-with-the-simulator** once headless rules exist.

**Modules, not one file.** Keep the template's layout (`state.ts`, `play.ts`, `theme.ts`, `sprites.ts`, `view.ts`, `screens.ts`, `frame.ts`, `flow.ts`, `main.ts`, `devhook.ts`) and stay inside the lint thresholds (CLAUDE.md → *Lint suite and thresholds*). Keep `game/devhook.ts` working for this game's own state and list unreachable scenes (e.g. `'win'`) in `UNSUPPORTED`.

**Batch writes into 2 milestones** (`PostToolUse` does not block mid-refactor edits, so write cohesive modules in parallel `Write` calls before running checks):
1. **Milestone 1 — Complete playable game:** rewrite `STYLE.md` + write all `game/*.ts` modules + `devhook.ts` in parallel → run `npm run check && npm run lint` once → run **one batched** `npm run look -- --scenes title,playing,gameover` (reuses one browser; supports extra query params like `playing?level=1,playing?level=2`) and view the screenshots.
2. **Milestone 2 — Visual & feel polish pass:** fix everything `look` showed + run **improving-game-quality**'s 15-item checklist → run `npm run verify` (and re-`look` any visually changed scene).

**Parallel writer fast paths (for non-trivial games):** once `STYLE.md` + `state.ts` (the shared `Game` contract) are written, spawn `game-writer` agents in parallel against the same warm dev server:
- **2-writer split (medium games):** Writer A (Rules: `play.ts`, `flow.ts`, `frame.ts`, `devhook.ts`, `main.ts`) · Writer B (Art/UI: `theme.ts`, `sprites.ts`, `view.ts`, `screens.ts`).
- **3-writer split (rich / multi-boss games):** Writer A (Rules) · Writer B (Hero, enemies, HUD, screens) · Writer C (Backdrops, bosses).

Art writers inspect their own `look --scenes` screenshots before reporting; once all finish, run `npm run verify` (plus at most one quick polish pass if needed).

## Step 4 — Validation & hand off

For new-game creation, run **once** before handing off:
```bash
cd workspace/<game-name> && npm run look -- --scenes title,playing,gameover
cd workspace/<game-name> && npm run verify
```
`npm run verify` must print `TOTAL PASS` and every `look` screenshot must be viewed with zero errors. Do **not** run `npm run verify -- --full` on standard new-game creation — reserve `--full` (`knip`, `jscpd`, `depcruise`, `dist:no-hook`, `look:all`) for structural/template changes, CI, or explicit full-audit requests.

**Server-up handoff (**playing-the-game** step 5):** leave the dev server running. If `npm run verify` just reported `serve ... reusing http://localhost:5173/`, skip the final `lifecycle-runner` liveness round-trip and hand off directly; otherwise re-verify liveness before messaging the user. Report "builds, boots clean, ready to play at `<URL>`" plus controls and goal/lose in one line — never claim to have playtested (**the user is the playtester**).

**Escalation rule:** if `check`, `lint` or the smoke gate fails twice on the same approach, escalate the writer one model tier for a fresh attempt instead of a third patch (see CLAUDE.md → *Models & orchestration*).

There is no commit step — the finished game lives uncommitted in the working tree.
