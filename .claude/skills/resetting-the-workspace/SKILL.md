---
name: resetting-the-workspace
description: Use when the user asks to reset, wipe, clean up, or start over with the workspace. Destructive and fully guarded — wipes user-created game folders after explicit per-name confirmation, preserving the pristine game-template and any games the user chooses to keep or checkpoint-commit.
---

# Resetting the workspace

Delete user-created game folders under `workspace/`. This is destructive, so it is maximally guarded: nothing is deleted that the user has not confirmed **by exact name**, and the skill never touches `workspace/game-template`, `.claude/skills/`, or any repo files — and verifies that claim at the end (the git status check in step 4) instead of assuming it.

## Steps

### 1. Stop any running dev server

```bash
lsof -ti:5173 | xargs -r kill
```

The same port-based teardown as playing-the-game. Port-based, not handle-based, so orphan servers from ended sessions are reclaimed too. Never delete a folder out from under a live server. The `-r` makes this a no-op when nothing is listening.

### 2. Enumerate and confirm the exact list by name

List the game folders: every directory under `workspace/` **except** `game-template`.

```bash
ls workspace/
```

Show the user the exact list of folder names slated for deletion and get confirmation on that named list. **A blanket "yes" without the named list shown is NOT confirmation** — if the user said "reset everything" before seeing the list, still show the list and confirm it.

For each game, offer per-game options before wiping:

- **Keep** — skip it; it stays in `workspace/` and is excluded from the delete-list.
- **Checkpoint-commit** — commit it first so it remains recoverable from git history after deletion:

```bash
git add workspace/<name> && git commit -m "checkpoint: <name> before workspace reset"
```

(Commits are always scoped to `workspace/<name>`, never `git add -A`.) Games already checkpoint-committed by creating-a-game / iterating-on-a-game are likewise recoverable from git history after the reset.

If there are no game folders, report that the workspace is already clean and stop.

### 3. Allowlist delete

Pre-delete guards — refuse to proceed unless **all three** hold:

- CWD is the repo root (`workspace/game-template` resolves from here);
- `workspace/game-template` exists;
- the template is clean **before** deleting anything: `git status --porcelain workspace/game-template` prints nothing (if dirty, restore first — same commands as step 4 — so a corrupted template is caught while everything is still recoverable, not after the wipe).

Then delete each confirmed folder **by its exact path, one command per folder**:

```bash
rm -rf workspace/<name>
```

**Never** use a wildcard, brace expansion, or exclusion glob (no `workspace/*`, no `find ... -not -name game-template`) — nothing that could ever match `game-template`. Only literal paths from the confirmed list.

After the deletions, re-check that `workspace/game-template` still exists. If it does not, stop immediately and restore it before anything else:

```bash
git checkout -- workspace/game-template && git clean -fd workspace/game-template
```

### 4. Verify

- Every folder on the confirmed delete-list is gone (`ls workspace/`).
- Only `game-template` **and any explicitly-kept games** remain — "only the template remains" is only the correct post-condition when nothing was kept.
- The template is untouched:

```bash
git status --porcelain workspace/game-template
```

This must print nothing. If it prints anything, restore the template:

```bash
git checkout -- workspace/game-template && git clean -fd workspace/game-template
```

(`git checkout` reverts tracked changes and deletions; `git clean -fd` removes untracked files, which checkout cannot — and it respects `.gitignore`, so build cruft is untouched.)

Report to the user: what was deleted, what was kept, what was checkpoint-committed (recoverable from git history), and that the template verified clean.
