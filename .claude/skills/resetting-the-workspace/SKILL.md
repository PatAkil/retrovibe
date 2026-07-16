---
name: resetting-the-workspace
description: Use when the user asks to reset, wipe, or start over with the workspace as a whole ("reset", "wipe everything", "start over from scratch"). Zero questions — safety-commits any dirty game, deletes all game folders, commits the deletions, and reports the restore command. NOT for requests about one specific game ("this one's boring, start over" routes to iterating-on-a-game / creating-a-game), and "clean up" alone never triggers a wipe.
---

# Resetting the workspace

Delete user-created game folders under `workspace/` and reach a neutral starting state — **asking the user nothing**. Recoverability comes from an automatic, pathspec-limited safety commit before the delete, not from a confirmation interview. The skill never touches `workspace/game-template`, `.claude/skills/`, or any repo files outside `workspace/` — and verifies that claim at the end instead of assuming it.

## Scope — routing, never questions

- The zero-question wipe applies only to requests targeting **the workspace as a whole**: "reset", "wipe everything", "start over from scratch".
- A request that plausibly targets **one game** ("this one's boring, let's start over", or any phrasing naming a specific game) is NOT a reset — route to **iterating-on-a-game** / **creating-a-game**.
- **"Clean up" alone never triggers a wipe** — it is ambiguous between tidying and deleting and is not in this skill's trigger set.
- **Kept-game escape hatch:** "reset everything except cave-hopper" is honored — skip that folder in steps 4–5. The skill honors stated exceptions; it just never *asks* for them.

## Steps

### 1. Stop any running dev server

```bash
lsof -ti:5173 | xargs -r kill
```

Port-based, not handle-based, so orphan servers from ended sessions are reclaimed too. Never delete a folder out from under a live server. The `-r` makes this a no-op when nothing is listening.

### 2. Enumerate game folders — the classifier

List directories under `workspace/` and classify. A directory is a **game** ONLY if it looks like a template clone — it contains **both** `game/main.ts` and `package.json`:

```bash
for d in workspace/*/; do
  name=$(basename "$d")
  [ "$name" = "game-template" ] && continue
  if [ -f "$d/game/main.ts" ] && [ -f "$d/package.json" ]; then echo "GAME: $name"; else echo "STRAY: $name"; fi
done
```

- `game-template` is never enumerated.
- Everything else that fails the classifier (`workspace/screenshots/`, `workspace/old-backup/`, stray files) is a **stray**: never enumerated, never committed, never deleted — named in the completion report for the user to deal with.
- If there are no game folders, report that the workspace is already clean (naming any strays) and stop.

### 3. Safety commit — only if needed, pathspec-limited

The commit trigger is `git status --porcelain workspace/<name>` non-empty for **at least one enumerated game folder** — never bare `workspace/` (a stray file like `workspace/notes.txt` would trip a workspace-wide trigger, stage nothing, and fail the commit with "nothing to commit").

When triggered — for exactly the dirty game folders:

```bash
git add workspace/<name> …
git commit -m "checkpoint before reset" -- workspace/<name> …
```

The pathspecs are exactly those folders, so unrelated staged changes never ride along. **Skip the commit entirely when no game folder is dirty.** Record the commit hash — the report needs it.

### 4. Allowlist delete

Pre-delete guards — refuse to proceed unless **all three** hold:

- CWD is the repo root (`workspace/game-template` resolves from here);
- `workspace/game-template` exists;
- the template is clean **before** deleting anything: `git status --porcelain workspace/game-template` prints nothing (if dirty, restore first — same commands as step 6 — so a corrupted template is caught while everything is still recoverable, not after the wipe).

Then delete each enumerated game folder (minus any user-stated keeps) **by its exact literal path, one command per folder**:

```bash
rm -rf workspace/<name>
```

**Never** use a wildcard, brace expansion, or exclusion glob (no `workspace/*`, no `find ... -not -name game-template`) — nothing that could ever match `game-template` or a stray. Only literal paths from the classifier's game list.

After the deletions, re-check that `workspace/game-template` still exists. If it does not, stop immediately and restore it before anything else (step 6 commands).

### 5. Commit the deletions

```bash
git add workspace/<name> …
git commit -m "reset workspace" -- workspace/<name> …
```

Same pathspec discipline (exactly the deleted folders). The reset leaves **no uncommitted deletions** behind — without this, ` D` porcelain noise compounds across resets.

### 6. Verify the end state

The neutral end state — scoped to what reset owns:

- only `game-template` (plus any explicitly-kept games) among the game folders in `workspace/` (`ls workspace/`);
- no dev server on 5173;
- template porcelain clean: `git status --porcelain workspace/game-template` prints nothing — if it prints anything, restore:

```bash
git checkout -- workspace/game-template && git clean -fd workspace/game-template
```

(`git checkout` reverts tracked changes and deletions; `git clean -fd` removes untracked files, which checkout cannot — and it respects `.gitignore`, so build cruft is untouched.)

- zero reset-induced porcelain: `git status --porcelain workspace/` shows nothing except stray non-game files that pre-dated the reset (which are reported).

Pre-existing changes **outside** `workspace/` are untouched — this skill never commits or destroys unrelated work.

### 7. Report — recovery the user isn't told about doesn't exist

The completion message names:

- what was deleted and what was kept;
- any strays left in `workspace/` (not touched);
- the safety commit hash (when one was made) and the exact **whole-game** restore command:

```
git checkout <hash> -- workspace/<name>
```

This restores the entire folder in place — `main.ts` alone is not the game (`index.html` is an explicit writer surface, and `git show` only prints one file to the terminal). The audience is git-naive; give the command verbatim, ready to paste.
