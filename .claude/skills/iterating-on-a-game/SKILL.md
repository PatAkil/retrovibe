---
name: iterating-on-a-game
description: Use when the request names a game whose workspace folder already exists ("make the ship faster", "add a second enemy") — the default path for edits. Modifies the game's modules in place; never clones; same check, lint, look and verify loop as creating-a-game, with no commits during the interaction.
---

# Iterating on a game

Modify an existing game in `workspace/<game-name>`. This skill **never clones** the template and never creates a game folder.

**`workspace/game-template` is never a game and never a valid target.** If a request resolves to it (e.g. a game named "game template"), refuse and route to **creating-a-game** under a different name — editing, committing, or deleting the template corrupts the baseline every future game is cloned from.

## Inverse guard — verify the target exists first

Before touching anything, check that `workspace/<name>` exists (e.g. `ls workspace/`). If it does **not** exist — after a reset, or a name mismatch — **never edit or create a missing folder**. Instead:

- If the user clearly wants a game that isn't there, hand off to **creating-a-game** (it owns cloning, with its collision guard and template-integrity check).
- If they may have misremembered the name, list the existing `workspace/` game folders and ask which game they meant.

## Workflow

0. **Eyes and server up.** If `/tmp/retrovibe-eyes.json` is missing or not `"ready":true`, run `npm run setup` at the repo root. Make sure this game's dev server is the one on 5173 (**playing-the-game** steps 1–2) so every save hot-reloads.
1. **Read before editing.** `STYLE.md` for anything visual, `DESIGN.md` first if the game has one (rules-heavy games), then `game/main.ts` to see how the modules are wired, then the one module that owns the change — tuning and the `Game` type in `state.ts`, rules in `play.ts` (or the seam files split from it), drawing in `view.ts` / `screens.ts`, palette roles in `theme.ts`, art in `sprites.ts`, scene dispatch in `frame.ts`, host messages in `flow.ts`. The engine API is the barrel `workspace/<game-name>/engine/index.ts` (import only from `'../engine'`; never modify engine files). A look that is just off can be seen first: `npm run look -- --scene <scene>`.
2. **Edit** the game to fulfill the request. Route to companion skills as needed: **handling-user-input** for control/label changes, **ensuring-arcade-visuals** for look, **building-platformer-games** for platformer mechanics, **improving-game-quality** for a feel & correctness pass, **messaging-game-over** for host messaging, **adding-easter-egg** for secrets. In a rules-heavy game a new or reshaped system goes through **designing-mechanics** first, and any rules or numbers change through **balancing-with-the-simulator**. A change to a style-card decision edits `STYLE.md` in the same milestone; a change to what the game can reach (a new scene, a removed win) updates `game/devhook.ts` (fixture builders, `UNSUPPORTED`). Stay inside the lint thresholds — a growing file splits along a natural seam into a new module.
3. **Validation loop** — after **every** edit:
   ```
   cd workspace/<game-name> && npm run check && npm run lint
   ```
   then look at what changed — `state` and `errors` first, the screenshot whenever the look changed:
   ```
   cd workspace/<game-name> && npm run look -- --scene playing --seed 7
   ```
4. **Before notifying the user**:
   ```
   cd workspace/<game-name> && npm run verify
   ```
   must print `TOTAL PASS`; after a structural change (new or moved modules, a new scene, a dev-hook change) also `npm run verify -- --full`. **playing-the-game** owns the dev-server lifecycle and the hand-off. A green build alone never means done. Claude may report what it looked at; it never claims to have played the game — report "builds, boots clean, ready to play at <URL>"; the user is the playtester. Escalation rule: if check, lint or the smoke gate fails twice on the same approach, escalate the writer one model tier for a fresh attempt (CLAUDE.md → Models & orchestration).

**No commits during the interaction** — the working tree holds the current game; recoverability lives at deletion moments (reset / overwrite safety commits). Explicit "commit/save my game" requests still commit, scoped to `workspace/<game-name>`, never `git add -A`.

**Restore routing:** for restore-flavored requests ("the old one was better", "bring back …"), check `git log --oneline -- workspace/<name>` for checkpoint commits and restore the whole folder with `git checkout <hash> -- workspace/<name>` — works in a fresh session with no chat history.
