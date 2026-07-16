---
name: iterating-on-a-game
description: Use when the request names a game whose workspace folder already exists ("make the ship faster", "add a second enemy") — the default path for edits. Modifies the game in place; never clones; same validation loop, smoke check, and checkpoint commit as creating-a-game.
---

# Iterating on a game

Modify an existing game in `workspace/<game-name>`. This skill **never clones** the template and never creates a game folder.

**`workspace/game-template` is never a game and never a valid target.** If a request resolves to it (e.g. a game named "game template"), refuse and route to **creating-a-game** under a different name — editing, committing, or deleting the template corrupts the baseline every future game is cloned from.

## Inverse guard — verify the target exists first

Before touching anything, check that `workspace/<name>` exists (e.g. `ls workspace/`). If it does **not** exist — after a reset, or a name mismatch — **never edit or create a missing folder**. Instead:

- If the user clearly wants a game that isn't there, hand off to **creating-a-game** (it owns cloning, with its collision guard and template-integrity check).
- If they may have misremembered the name, list the existing `workspace/` game folders and ask which game they meant.

## Workflow

1. **Read before editing.** Read the game's current code — start with `workspace/<game-name>/game/main.ts` — and understand its current state, controls, and scene flow before changing anything. The engine API is the barrel `workspace/<game-name>/engine/index.ts` (frozen; import only from there — never modify engine files).
2. **Edit** the game code to fulfill the request. Route to companion skills as needed: **handling-user-input** for control/label changes, **ensuring-arcade-visuals** for look, **building-platformer-games** for platformer mechanics, **improving-game-quality** for a feel & correctness pass, **messaging-game-over** for host messaging, **adding-easter-egg** for secrets.
3. **Validation loop** — after **every** edit, fast typecheck:
   ```
   cd workspace/<game-name> && npm run check
   ```
4. **Before notifying the user**, both must pass:
   ```
   cd workspace/<game-name> && npm run build
   ```
   **and** the runtime smoke check via **playing-the-game** (it owns the dev-server lifecycle and runs `npm run smoke`). A green build alone never means done. Claude never claims to have played the game — report "builds, boots clean, ready to play at <URL>"; the user is the playtester. Escalation rule: if the typecheck or smoke gate fails twice on the same approach, escalate the writer one model tier for a fresh attempt (CLAUDE.md → Models & orchestration).
5. **Checkpoint commit** — scoped to the game folder, never `git add -A`:
   ```
   git add workspace/<game-name> && git commit -m "<game-name>: <what changed>"
   ```
