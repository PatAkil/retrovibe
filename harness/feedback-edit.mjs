import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, relative } from 'node:path';
import { engineMissing, lintFiles, toolsMissing, typed, typeErrors } from './feedback-checks.mjs';
import {
  acquire, agentKey, claimedByOther, diffSnapshots, gatedFiles, isGated, isSubagent, othersBusy, readState, release,
  statSnapshot, updateState,
} from './feedback-state.mjs';
import { GRAPHICS_REMINDER, ownFingerprints, touchesGraphics, unitsOf } from './feedback-units.mjs';

const SLACK_MS = 2000;
const FALLBACK_WINDOW_MS = 15000;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const TEMPLATE_CLONE = /^\s*cp\s+-[a-zA-Z]*[rRa][a-zA-Z]*\s+['"]?(?:\.\/)?workspace\/game-template\/?['"]?\s+['"]?(?:\.\/)?workspace\/[^/\s'"]+\/?['"]?\s*$/;
const MAX_LINES = 40;
const TYPED_KINDS = new Set(['user', 'template', 'fixture']);
const BRAND = 'Retrovibe per-edit check';

const editChecksEnabled = () => process.env.RETROVIBE_EDIT_CHECKS === '1';

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

function gatedNamedPaths(input, root) {
  const toolInput = input.tool_input ?? {};
  const realRoot = realPathOrSelf(root);
  return [...new Set([toolInput.file_path, toolInput.notebook_path]
    .filter((p) => typeof p === 'string' && p !== '')
    .map((p) => normalizeNamedPath(p, realRoot))
    .filter((p) => isGated(p) && !p.startsWith('../') && p !== '..'))];
}

function mentions(command, path) {
  if (command.includes(path)) {
    return true;
  }
  const base = basename(path);
  return base.length > 4 && command.includes(base);
}

function attributed(ctx, change) {
  if (mentions(ctx.command, change.path)) {
    return true;
  }
  if (claimedByOther(ctx.state, ctx.key, change.path, ctx.now)) {
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

function attributionContext(input, state, key) {
  const now = Date.now();
  const command = input.tool_input?.command;
  return {
    state, key, now,
    windowStart: now - commandWindowMs(input) - SLACK_MS,
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

function recordPlan(input, repo, state, opts) {
  const { key, now, mine, snap } = opts;
  const agent = state.agents[key];
  for (const path of mine) {
    state.claims[path] = { agent: key, at: now };
  }
  const touched = [...new Set([...(agent?.touched ?? []), ...mine])];
  const remind = needsReminder(repo, agent, mine);
  const next = { ...agent, seen: now, touched, reminded: remind ? true : agent?.reminded === true };
  if (snap !== undefined) {
    next.snap = snap;
  }
  state.agents[key] = next;
  const event = input.hook_event_name === 'PostToolUseFailure' ? 'PostToolUseFailure' : 'PostToolUse';
  return { key, event, mine, remind, others: othersBusy(state, key, now), seen: new Set(agent?.reported ?? []), claims: { ...state.claims } };
}

function planChecks(input, repo, state, prep) {
  const key = agentKey(input);
  const ctx = attributionContext(input, state, key);
  const changes = diffSnapshots(previousSnapshot(state.agents[key], prep.current, ctx.windowStart), prep.current, ctx.now);
  storeBaseline(state, prep);
  const mine = changes.filter((c) => attributed(ctx, c)).map((c) => c.path);
  return recordPlan(input, repo, state, { key, now: ctx.now, mine, snap: prep.current });
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
  const blocking = [...section('ESLint', checks.lint), ...section('tsc', sorted.own)];
  const head = `Files checked: ${plan.mine.join(', ')}`;
  if (blocking.length) {
    const intro = `${BRAND}: what you just changed has lint or type errors. Fix them before moving on (no eslint-disable, fix the code, not the config).`;
    return { code: 2, stderr: `${[intro, head, ...clip(blocking), ...checks.notes].join('\n')}\n`, shown: sorted.shown };
  }
  if (sorted.elsewhere.length) {
    const note = plan.others.length
      ? `${BRAND}: your files are clean, but tsc reports errors in files you did not change. Other agents (${plan.others.join(', ')}) are working in this tree, so these may be their work in progress: fix them only if your change caused them.`
      : `${BRAND}: your files are clean, but tsc reports errors in other files (non-blocking until end-of-turn gate):`;
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
    lintFiles(repo.root, existing, { RETROVIBE_FAST_LINT: '1' }),
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
  const all = gatedFiles(repo.root);
  return {
    session,
    current: statSnapshot(repo.root, all),
    baseline: needsBaseline ? ownFingerprints(repo.root, all) : null,
  };
}

async function finalizePlan(plan, repo) {
  if (!editChecksEnabled()) {
    return plan.remind ? context(plan, [GRAPHICS_REMINDER], []) : { code: 0 };
  }
  if (toolsMissing(repo.root).length) {
    return warnMissingOnce(repo, plan.key);
  }
  const lock = join(repo.dir, 'check.lock');
  if (!acquire(lock, { waitMs: 20000, staleMs: 120000 })) {
    return { code: 1, stderr: 'agent-feedback: another per-edit check held the lock for 20s; skipped this one (the end-of-turn gate still runs).\n' };
  }
  try {
    const result = await runChecks(plan, repo);
    updateState(repo.dir, (state) => {
      state.agents[plan.key] = { ...state.agents[plan.key], reported: result.shown };
    });
    return result;
  } finally {
    release(lock);
  }
}

export async function handleEdit(input, repo) {
  const tool = String(input.tool_name ?? '');
  if (EDIT_TOOLS.has(tool)) {
    const mine = gatedNamedPaths(input, repo.root);
    if (mine.length === 0) {
      return { code: 0 };
    }
    const plan = updateState(repo.dir, (state) => recordPlan(input, repo, state, { key: agentKey(input), now: Date.now(), mine }));
    return finalizePlan(plan, repo);
  }
  const command = typeof input.tool_input?.command === 'string' ? input.tool_input.command : '';
  if (TEMPLATE_CLONE.test(command)) {
    return { code: 0 };
  }
  const prep = preparePlan(input, repo);
  const plan = updateState(repo.dir, (state) => planChecks(input, repo, state, prep));
  if (plan.mine.length === 0) {
    return { code: 0 };
  }
  return finalizePlan(plan, repo);
}
