import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, relative } from 'node:path';
import { engineMissing, lintFiles, toolsMissing, typed, typeErrors } from './feedback-checks.mjs';
import {
  acquire, agentKey, claimedByOther, diffSnapshots, gatedFiles, isSubagent, othersBusy, readState, release,
  statSnapshot, updateState,
} from './feedback-state.mjs';
import { GRAPHICS_REMINDER, ownFingerprints, touchesGraphics, unitsOf } from './feedback-units.mjs';

const SLACK_MS = 2000;
const FALLBACK_WINDOW_MS = 15000;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const MAX_LINES = 40;
const TYPED_KINDS = new Set(['user', 'template', 'fixture']);
const BRAND = 'Retrovibe per-edit check';

function realPathOrSelf(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function resolveReal(path) {
  try {
    return realpathSync(path);
  } catch {
    const dir = dirname(path);
    return dir === path ? path : join(realPathOrSelf(dir), basename(path));
  }
}

function normalizeNamedPath(path, realRoot) {
  const rel = isAbsolute(path) ? relative(realRoot, resolveReal(path)) : normalize(path);
  return rel.replace(/\\/g, '/').replace(/^\.\//, '');
}

function namedPaths(input, root) {
  const toolInput = input.tool_input ?? {};
  const realRoot = realPathOrSelf(root);
  return new Set([toolInput.file_path, toolInput.notebook_path]
    .filter((p) => typeof p === 'string' && p !== '')
    .map((p) => normalizeNamedPath(p, realRoot)));
}

function mentions(command, path) {
  if (command.includes(path)) {
    return true;
  }
  const base = basename(path);
  return base.length > 4 && command.includes(base);
}

function attributed(ctx, change) {
  if (ctx.named.has(change.path) || mentions(ctx.command, change.path)) {
    return true;
  }
  if (EDIT_TOOLS.has(ctx.tool) || claimedByOther(ctx.state, ctx.key, change.path, ctx.now)) {
    return false;
  }
  return ctx.others.length === 0 || change.mtime >= ctx.windowStart;
}

function previousSnapshot(agent, current, windowStart) {
  if (agent?.snap) {
    return agent.snap;
  }
  return Object.fromEntries(Object.entries(current).filter(([, v]) => v[0] < windowStart));
}

function commandWindowMs(input) {
  const raw = Number(input.duration_ms);
  return Number.isFinite(raw) && raw > 0 ? raw : FALLBACK_WINDOW_MS;
}

function attributionContext(input, repo, state, key) {
  const now = Date.now();
  const command = input.tool_input?.command;
  return {
    state, key, now,
    windowStart: now - commandWindowMs(input) - SLACK_MS,
    tool: String(input.tool_name ?? ''),
    named: namedPaths(input, repo.root),
    command: typeof command === 'string' ? command : '',
    others: othersBusy(state, key, now),
  };
}

function needsReminder(repo, agent, mine) {
  return agent?.reminded !== true && touchesGraphics(unitsOf(repo.root, mine));
}

function storeBaseline(state, prep) {
  if (prep.baseline !== null) {
    state.baselines[prep.session] ??= prep.baseline;
  }
}

function planChecks(input, repo, state, prep) {
  const key = agentKey(input);
  const ctx = attributionContext(input, repo, state, key);
  const agent = state.agents[key];
  const changes = diffSnapshots(previousSnapshot(agent, prep.current, ctx.windowStart), prep.current, ctx.now);
  storeBaseline(state, prep);
  const mine = changes.filter((c) => attributed(ctx, c)).map((c) => c.path);
  for (const path of mine) {
    state.claims[path] = { agent: key, at: ctx.now };
  }
  const touched = [...new Set([...(agent?.touched ?? []), ...mine])];
  const remind = needsReminder(repo, agent, mine);
  state.agents[key] = { ...agent, snap: prep.current, seen: ctx.now, touched, reminded: remind ? true : agent?.reminded === true };
  const event = input.hook_event_name === 'PostToolUseFailure' ? 'PostToolUseFailure' : 'PostToolUse';
  return { key, event, mine, remind, others: ctx.others, seen: new Set(agent?.reported ?? []), claims: { ...state.claims } };
}

function sortTypeErrors(plan, types) {
  const own = new Set(plan.mine);
  const elsewhere = types.filter((e) => !own.has(e.file));
  const foreign = (e) => plan.others.length > 0 && plan.claims[e.file] !== undefined && plan.claims[e.file].agent !== plan.key;
  return {
    own: types.filter((e) => own.has(e.file)),
    elsewhere: elsewhere.filter((e) => !foreign(e) && !plan.seen.has(e.text)),
    shown: elsewhere.map((e) => e.text).slice(0, 60),
  };
}

const section = (title, items) => (items.length ? [`${title}:`, ...items.map((i) => `  ${i.text}`)] : []);

function clip(lines) {
  return lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), `  … ${String(lines.length - MAX_LINES)} more lines`] : lines;
}

function context(plan, lines, shown) {
  return { code: 0, json: { hookSpecificOutput: { hookEventName: plan.event, additionalContext: lines.join('\n') } }, shown };
}

function present(plan, checks) {
  const sorted = sortTypeErrors(plan, checks.types);
  const solo = plan.others.length === 0;
  const blocking = [...section('ESLint', checks.lint), ...section('tsc', sorted.own), ...(solo ? section('tsc, other files', sorted.elsewhere) : [])];
  const head = `Files checked: ${plan.mine.join(', ')}`;
  if (blocking.length) {
    const intro = `${BRAND}: what you just changed has lint or type errors. Fix them before moving on (no eslint-disable, fix the code, not the config).`;
    return { code: 2, stderr: `${[intro, head, ...clip(blocking), ...checks.notes].join('\n')}\n`, shown: sorted.shown };
  }
  if (!solo && sorted.elsewhere.length) {
    const note = `${BRAND}: your files are clean, but tsc reports errors in files you did not change. Other agents (${plan.others.join(', ')}) are working in this tree, so these may be their work in progress: fix them only if your change caused them.`;
    return context(plan, [note, head, ...clip(section('tsc', sorted.elsewhere)), ...checks.notes], sorted.shown);
  }
  return checks.notes.length ? context(plan, [`${BRAND}: ${head}`, ...checks.notes], sorted.shown) : { code: 0, shown: sorted.shown };
}

function typeTargets(repo, files) {
  const units = unitsOf(repo.root, typed(files)).filter((u) => TYPED_KINDS.has(u.kind));
  const skipped = units.filter((u) => engineMissing(repo.root, u));
  const notes = skipped.map((u) => `note: ${u.dir}/engine is missing (gitignored copy), tsc skipped for it; node verification/capture.mjs refreshes it.`);
  return { units: units.filter((u) => !skipped.includes(u)), notes };
}

async function runChecks(plan, repo) {
  const existing = plan.mine.filter((p) => statSnapshot(repo.root, [p])[p] !== undefined);
  const targets = typeTargets(repo, existing);
  const [lint, ...perUnit] = await Promise.all([
    lintFiles(repo.root, existing),
    ...targets.units.map((u) => typeErrors(repo.root, repo.dir, u, 'edit')),
  ]);
  const notes = [...targets.notes, ...(plan.remind ? [GRAPHICS_REMINDER] : [])];
  return present(plan, { lint, types: perUnit.flat(), notes });
}

function warnMissingOnce(repo, key) {
  const fresh = updateState(repo.dir, (state) => {
    const agent = state.agents[key] ?? { seen: Date.now(), touched: [] };
    state.agents[key] = { ...agent, warned: true };
    return agent.warned !== true;
  });
  return fresh ? { code: 1, stderr: 'agent-feedback: node_modules is missing, so per-edit lint and type feedback is off. Run npm install at the repo root.\n' } : { code: 0 };
}

function preparePlan(input, repo) {
  const key = agentKey(input);
  const session = String(input.session_id ?? 'cli');
  const existing = readState(repo.dir);
  const needsBaseline = !isSubagent(key) && !(session in existing.baselines);
  return {
    session,
    current: statSnapshot(repo.root, gatedFiles(repo.root)),
    baseline: needsBaseline ? ownFingerprints(repo.root) : null,
  };
}

export async function handleEdit(input, repo) {
  if (toolsMissing(repo.root).length) {
    return warnMissingOnce(repo, agentKey(input));
  }
  const lock = join(repo.dir, 'check.lock');
  if (!acquire(lock, { waitMs: 20000, staleMs: 120000 })) {
    return { code: 1, stderr: 'agent-feedback: another per-edit check held the lock for 20s; skipped this one (the end-of-turn gate still runs).\n' };
  }
  try {
    const prep = preparePlan(input, repo);
    const plan = updateState(repo.dir, (state) => planChecks(input, repo, state, prep));
    if (plan.mine.length === 0) {
      return { code: 0 };
    }
    const result = await runChecks(plan, repo);
    updateState(repo.dir, (state) => {
      state.agents[plan.key] = { ...state.agents[plan.key], reported: result.shown };
    });
    return result;
  } finally {
    release(lock);
  }
}
