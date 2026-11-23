import { engineMissing, lintFiles, tail, toolsMissing, typeErrors } from './feedback-checks.mjs';
import { gateUnits } from './feedback-gate.mjs';
import { agentKey, fingerprint, gatedFiles, isSubagent, othersBusy, readState, statSnapshot, updateState } from './feedback-state.mjs';
import { GRAPHICS_REMINDER, ownFingerprints, TOOLING, touchesGraphics, unitFingerprint, unitOf, unitsOf } from './feedback-units.mjs';

const MAX_BLOCKS = 3;
const GATE_WAIT_MS = 400000;
const OUTPUT_LINES = 60;
const TYPED_KINDS = new Set(['user', 'template', 'fixture']);

function movedUnits(before, now) {
  if (!before) {
    return [];
  }
  const ids = new Set([...Object.keys(before), ...Object.keys(now)]);
  return [...ids].filter((id) => before[id] !== now[id]);
}

function baselineFor(input, state, key) {
  if (!isSubagent(key)) {
    return state.baselines[String(input.session_id ?? 'cli')];
  }
  return othersBusy(state, key, Date.now()).length === 0 ? state.agents[key]?.startFps : undefined;
}

const unitFromId = (root, id) => (id === TOOLING.id ? TOOLING : unitOf(root, `${id}/`));

function unitsToGate(repo, input, state, key) {
  const fromFiles = unitsOf(repo.root, state.agents[key]?.touched ?? []);
  const known = new Set(fromFiles.map((u) => u.id));
  const moved = movedUnits(baselineFor(input, state, key), ownFingerprints(repo.root));
  const fromMoves = moved.filter((id) => !known.has(id)).map((id) => unitFromId(repo.root, id));
  const all = gatedFiles(repo.root);
  return [...fromFiles, ...fromMoves]
    .filter((u) => u.kind !== 'gone')
    .filter((u) => state.green[u.id] !== unitFingerprint(repo.root, u, all));
}

function releaseReason(input, block, fp) {
  if (input.stop_hook_active !== true || block === undefined) {
    return null;
  }
  if (block.count >= MAX_BLOCKS) {
    return `Retrovibe gate: released after ${String(MAX_BLOCKS)} consecutive blocks with the changed games still red. Run npm run gate (or npm run verify in the game folder) and fix it before calling it done; the pre-commit hook refuses a red game.`;
  }
  if (block.fp === fp) {
    return 'Retrovibe gate: still red and no code changed since the last block, so the turn may end. Run npm run gate and fix it before calling it done; the pre-commit hook refuses a red game.';
  }
  return null;
}

function deferReason(input, state, key) {
  if (isSubagent(key)) {
    return null;
  }
  const background = Array.isArray(input.background_tasks) ? input.background_tasks.length : 0;
  const running = Object.keys(state.active).filter((k) => othersBusy(state, key, Date.now()).includes(k)).length;
  if (background + running === 0) {
    return null;
  }
  return 'Retrovibe gate deferred: background agents or tasks are still running in this tree; the gate runs at the end of the turn in which they are done.';
}

function settle(repo, key, message) {
  updateState(repo.dir, (state) => {
    Reflect.deleteProperty(state.blocks, key);
    Reflect.deleteProperty(state.active, key);
  });
  return message ? { code: 0, json: { systemMessage: message } } : { code: 0 };
}

async function scopedGate(repo, touched) {
  const files = touched.filter((p) => statSnapshot(repo.root, [p])[p] !== undefined);
  const own = new Set(touched);
  const units = unitsOf(repo.root, files).filter((u) => TYPED_KINDS.has(u.kind) && !engineMissing(repo.root, u));
  const [lint, ...types] = await Promise.all([lintFiles(repo.root, files), ...units.map((u) => typeErrors(repo.root, repo.dir, u))]);
  const problems = [...lint, ...types.flat().filter((e) => own.has(e.file))].map((p) => p.text);
  const name = 'scoped check (eslint + tsc on the files you changed; other writers are still running)';
  return { name, pass: problems.length === 0, out: problems.join('\n'), notes: [] };
}

function block(repo, input, key, result) {
  const count = updateState(repo.dir, (state) => {
    const prev = input.stop_hook_active === true ? (state.blocks[key]?.count ?? 0) : 0;
    state.blocks[key] = { count: prev + 1, fp: result.fp };
    return prev + 1;
  });
  const lines = [
    `Retrovibe end-of-turn gate FAILED (block ${String(count)} of ${String(MAX_BLOCKS)}): ${String(result.name)}.`,
    'Fix what is below, then re-run npm run gate at the root (or npm run verify inside a user game folder; never in the template) until it passes, then finish. If a failure is in a file another writer owns, name it in your report instead of editing it.',
    tail(String(result.out), OUTPUT_LINES),
    ...(result.reminder ? [result.reminder] : []),
  ];
  return { code: 2, stderr: `${lines.join('\n')}\n` };
}

function judge(repo, input, key, result) {
  const extra = [...(result.notes ?? []), ...(result.reminder ? [result.reminder] : [])].join('\n');
  if (result.pass) {
    return settle(repo, key, extra);
  }
  if (result.busy) {
    return settle(repo, key, 'Retrovibe gate: another gate held the lock for too long; this stop was not verified. Run npm run gate.');
  }
  if (result.unsettled) {
    return settle(repo, key, 'Retrovibe gate: files kept changing while the gate ran (another writer is still editing), so this stop was NOT verified. Run npm run gate once edits settle.');
  }
  if (result.unverifiable) {
    return settle(repo, key, 'Retrovibe gate: only the browser gates (eyes/smoke/look) failed and the headless browser is not ready; run npm run setup, then npm run verify in the game folder.');
  }
  return block(repo, input, key, result);
}

export async function handleStop(input, repo) {
  const key = agentKey(input);
  const state = readState(repo.dir);
  const units = unitsToGate(repo, input, state, key);
  if (units.length === 0) {
    return settle(repo, key, null);
  }
  const fp = fingerprint(repo.root);
  const early = releaseReason(input, state.blocks[key], fp) ?? deferReason(input, state, key);
  if (early) {
    return settle(repo, key, early);
  }
  if (toolsMissing(repo.root).length) {
    return settle(repo, key, 'Retrovibe gate skipped: node_modules is missing. Run npm install at the repo root, then npm run gate.');
  }
  const scoped = isSubagent(key) && othersBusy(state, key, Date.now()).some(isSubagent);
  const result = scoped ? await scopedGate(repo, state.agents[key]?.touched ?? []) : await gateUnits(repo, units, GATE_WAIT_MS);
  const reminder = touchesGraphics(units) ? GRAPHICS_REMINDER : '';
  return judge(repo, input, key, { ...result, fp, reminder });
}
