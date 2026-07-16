---
name: creating-a-game
description: Use when the user asks for a new game, or as the entry point when it is unclear which Retrovibe skill applies (this skill owns the routing list). Orchestrates creating a retro game from a chat description — elicit, route, clone the template, develop, validate, hand off.
---

# Creating a game

Turn a user's game description into a playable game folder under `workspace/<game-name>`, cloned from `workspace/game-template`. Follow the five steps in order. Never skip a gate.

**No commits during the interaction.** The create→play→iterate loop touches git zero times; the working tree simply holds the current game. Recoverability lives at the deletion moments instead: resetting-the-workspace's safety commit, and this skill's explicit-overwrite branch (Step 2). Explicit "commit/save my game" requests still commit, scoped to `workspace/<game-name>` (never `git add -A`).

**Restore routing:** for restore-flavored requests ("the old one was better", "bring back space-miner"), check `git log --oneline -- workspace/<name>` for checkpoint commits and restore with `git checkout <hash> -- workspace/<name>` — a fresh session can find the recovery without the original chat message.

## Skill routing — single source of truth

This is the canonical routing list for all eleven Retrovibe skills. CLAUDE.md links here; do not duplicate this list elsewhere.

| Skill | Route here when |
|---|---|
| creating-a-game | The user wants a new game, or you need to decide which skill applies (this list). |
| iterating-on-a-game | The request names a game whose `workspace/<name>` folder already exists ("make the ship faster"). |
| helping-the-user | The request is too vague to build from — elicit core loop, lose condition, controls. |
| ensuring-arcade-visuals | Work on the game's look: palette discipline, pixel scale, CRT filter integration. |
| handling-user-input | Anything touching controls: A/B/X/Y action declarations and labels, edge-vs-held semantics, audio unlock on first keypress. |
| building-platformer-games | The game is a platformer — jump feel, coyote time, jump buffering, AABB collision. |
| improving-game-quality | Feel & correctness pass — this skill owns the only quality checklist. |
| messaging-game-over | Posting state/score transitions to the host via the engine runtime. |
| adding-easter-egg | Palette-swap toggles or secret input sequences. |
| playing-the-game | Starting/stopping the dev server, the smoke check, handing the URL to the user — owns the whole dev-server lifecycle. |
| resetting-the-workspace | The request targets the workspace **as a whole** ("reset", "wipe everything", "start over from scratch") — zero-question wipe with an automatic safety commit. A request about one specific game ("this one's boring, start over") routes to iterating-on-a-game / creating-a-game instead, and "clean up" alone never routes here. |

## Step 1 — Elicit (gate)

If the request is vague, invoke **helping-the-user** first. Bar to proceed — all three known:
- core loop (what the player does, repeatedly)
- lose condition (how the run ends)
- controls (which inputs do what)

Do not clone or write code until the bar is met.

## Step 2 — Route (collision guard)

Derive the folder name from the game's name (if the user didn't name it, invent a short fitting one and tell them): lowercase, words joined with hyphens, folder-friendly (letters, digits, hyphens only — e.g. "Space Miner!" → `space-miner`).

**`game-template` is reserved and never a valid game name.** If the derived name is `game-template`, pick a different name (ask the user). The collision/iterate/overwrite branches below must never be applied to `workspace/game-template` — it is the pristine template, not a game.

Check whether `workspace/<game-name>` already exists:
- **Exists** → hand off to **iterating-on-a-game**, or ask the user: pick a new name, iterate on the existing game, or explicitly overwrite. **Overwrite means safety-commit, then delete, then clone:**
  1. Stop any dev server (`lsof -ti:5173 | xargs -r kill` — never delete a folder a live server is serving).
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

No dependency install is needed — devDeps live once at the repo root and games resolve bins by walking up.

## Step 4 — Develop

Start by launching the dev server in the background for this game (steps 1–2 of **playing-the-game** — port discipline as written). It hot-reloads every save, so runtime feedback is continuous and the final gate pays no startup cost.

Read budget: the engine API table in CLAUDE.md plus the cloned `workspace/<game-name>/game/main.ts` (the reference game) suffice to start; the API barrel is `workspace/<game-name>/engine/index.ts` — frozen, import only from there. Open a companion skill only when its domain is touched: **building-platformer-games** (platformers), **handling-user-input** (changing what buttons do), **ensuring-arcade-visuals**, **messaging-game-over**, **adding-easter-egg**. Run **improving-game-quality**'s checklist once before Step 5's full gate.

Write `game/main.ts` in 2–3 coherent milestone saves, not one monolithic write: (1) title + input declarations + movement, (2) core loop + lose condition, (3) juice/audio/difficulty/polish. Each milestone must pass `npm run check` before the next begins.

## Step 5 — Validation loop

- After **every** edit, fast typecheck:
  ```
  cd workspace/<game-name> && npm run check
  ```
- Before notifying the user, both of these must pass:
  ```
  cd workspace/<game-name> && npm run build
  ```
  **and** the runtime smoke check via **playing-the-game** (which owns the dev-server lifecycle and runs `npm run smoke`).

A green build alone never triggers "done" — it proves compilation, not that the game boots. The handoff state is **server up** (playing-the-game step 4): the dev server stays running after the gate and its liveness is re-verified immediately before the message is sent. And Claude never claims to have played the game: report "builds, boots clean, ready to play at <URL>". **The user is the playtester.**

**Escalation rule**: if `npm run check` or the smoke gate fails twice on the same approach, escalate the writer one model tier for a fresh attempt instead of a third patch (see CLAUDE.md → Models & orchestration).

There is no commit step — the finished game lives uncommitted in the working tree (see "No commits during the interaction" above).
