# Maintaining Retrovibe

Maintainer-only reference for hooks, fixtures, and template integrity (kept out of `CLAUDE.md` so game-writing subagents load less context).

## Automatic feedback (hooks)

Deterministic, not remembered: `.claude/settings.json` wires `harness/agent-feedback.mjs` into
every session and subagent, and `.githooks/pre-commit` into git (`npm install` runs `prepare`,
which sets `core.hooksPath=.githooks`; skipped when `CI` or `RETROVIBE_NO_GIT_HOOKS` is set).
State lives in `.git/retrovibe-feedback/` (`events.log` has one JSON line per hook run).

A **unit** is a game folder (`workspace/<name>` or `verification/<fixture>` with `game/main.ts`
and `package.json`) or "repo tooling" (everything else that is linted). Never gated: `*.md`,
`.claude/`, `.github/`, `.githooks/`, `verification/baseline/`.

| When | Effect |
|---|---|
| SessionStart / SubagentStart | records a per-unit fingerprint and file snapshot; on a cloud box also runs `npm run setup` in the background |
| `PostToolUse` (Edit / Write / MultiEdit / NotebookEdit) | tracks touched files without blocking mid-refactor edits (set `RETROVIBE_EDIT_CHECKS=1` to opt into fast per-edit `eslint` + incremental `tsc`). The first template or fixture edit adds the verifying-graphics reminder. When `RETROVIBE_EDIT_CHECKS !== '1'`, `Bash` calls skip full-repo stat snapshots |
| `SubagentStop` | runs `scopedGate` (fast `eslint` + incremental `tsc` on files the subagent touched) so parallel writers never trigger premature full browser `verify` |
| `Stop` (main session) | per unit changed this session and not remembered green — hits the green cache immediately when `npm run verify` already passed, and skips pristine template clones. Otherwise runs independent units concurrently with per-unit locks |
| `git commit` | only the units the staged paths touch: refuses if such a unit has unstaged or untracked gated files, or fails its gate. Other units' dirt is ignored. Deletion-only, docs-only and baseline-only commits run nothing |
| `npm run gate` (root) | the same gate by hand for every unit that differs from HEAD; remembers green results |

- **Fix what the hooks report.** The stop gate blocks at most 3 times in a row and releases at
  once when nothing changed since its last block; the tree is then still red and the commit
  hook will refuse it.
- **Degrades, never hangs.** Timeouts (60 s edit, 600 s stop) and a watchdog; without
  `node_modules` it says so once and steps aside; when only the browser gates fail and the
  browser is not ready it releases with a message. Bypass is the owner's call only:
  `git commit --no-verify`.
