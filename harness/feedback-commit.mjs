import { tail, toolsMissing } from './feedback-checks.mjs';
import { gateUnits } from './feedback-gate.mjs';
import { dirtyGatedPaths, gatedFiles, stagedChanges, unstagedGatedPaths } from './feedback-state.mjs';
import { GRAPHICS_REMINDER, touchesGraphics, unitFingerprint, unitOf, unitsOf } from './feedback-units.mjs';

const GATE_WAIT_MS = 300000;
const SHOWN = 8;

const live = (units) => units.filter((u) => u.kind !== 'gone');
const unitNames = (units) => units.map((u) => u.id).join(', ');

function unstagedIn(repo, units) {
  const ids = new Set(units.map((u) => u.id));
  return unstagedGatedPaths(repo.root).filter((p) => ids.has(unitOf(repo.root, p).id));
}

function unstagedRefusal(repo, units) {
  const files = unstagedIn(repo, units);
  if (!files.length) {
    return null;
  }
  const more = files.length > SHOWN ? ` (+${String(files.length - SHOWN)} more)` : '';
  return {
    code: 1,
    stderr: [
      `pre-commit: this commit touches ${unitNames(units)}, and these files of those units are on disk but not staged, so the verified tree would not be the committed tree:`,
      `  ${files.slice(0, SHOWN).join('\n  ')}${more}`,
      'pre-commit: Commit refused. Stage them too (git add <unit folder>), or (owner only) bypass with git commit --no-verify. Dirty files in other units are ignored.',
      '',
    ].join('\n'),
  };
}

function drifted(repo, result) {
  const all = gatedFiles(repo.root);
  return result.results.some((r) => r.unit !== undefined && r.fp !== undefined && unitFingerprint(repo.root, r.unit, all) !== r.fp);
}

function unitLines(result) {
  return result.results.map((r) => {
    let mark = r.pass ? 'PASS ' : 'FAIL ';
    if (r.cached === true) {
      mark = 'PASS (cached)';
    }
    return `  ${mark}  ${String(r.unit?.id ?? r.name)}${r.cached === true ? '' : `  ${String(r.name)}`}`;
  });
}

function failureText(label, result) {
  if (result.unsettled) {
    return `${label}: files kept changing while the gate ran, so they were NOT verified. Wait for edits to settle and try again.`;
  }
  if (result.busy) {
    return `${label}: another gate run held the lock for 5 minutes; try again.`;
  }
  const advice = label === 'pre-commit' ? 'Commit refused: a unit this commit touches fails its gate. Fix it, or (owner only) bypass with git commit --no-verify.' : 'Gate failed.';
  return `${tail(String(result.out), 80)}\n${label}: ${advice}`;
}

function report(label, units, result, secs) {
  const lines = [`${label}: ${unitNames(units)} (${secs}s)`, ...unitLines(result), ...result.notes];
  if (touchesGraphics(units)) {
    lines.push(`${label}: ${GRAPHICS_REMINDER}`);
  }
  if (!result.pass) {
    lines.push(failureText(label, result));
  }
  return { code: result.pass ? 0 : 1, stderr: `${lines.join('\n')}\n` };
}

async function runGate(repo, label, units) {
  if (toolsMissing(repo.root).length) {
    return { code: 0, stderr: `${label}: node_modules is missing, so ${unitNames(units)} was NOT verified. Run npm install at the repo root, then npm run gate.\n` };
  }
  const t0 = Date.now();
  const result = await gateUnits(repo, units, GATE_WAIT_MS);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (result.pass && label === 'pre-commit' && (drifted(repo, result) || unstagedIn(repo, units).length > 0)) {
    return { code: 1, stderr: 'pre-commit: files changed after the gate verified them, so this commit was NOT verified. Wait for edits to settle and try again.\n' };
  }
  return report(label, units, result, secs);
}

export function precommit(repo) {
  const staged = stagedChanges(repo.root);
  if (staged.length === 0) {
    return Promise.resolve({ code: 0 });
  }
  const units = live(unitsOf(repo.root, staged.map((c) => c.path)));
  if (units.length === 0) {
    return Promise.resolve({ code: 0, stderr: 'pre-commit: only deletions of whole game folders are staged; nothing to verify.\n' });
  }
  return Promise.resolve(unstagedRefusal(repo, units) ?? runGate(repo, 'pre-commit', units));
}

export function gateByHand(repo) {
  const units = live(unitsOf(repo.root, dirtyGatedPaths(repo.root)));
  if (units.length === 0) {
    return Promise.resolve({ code: 0, stderr: 'gate: no gated changes against HEAD; nothing to verify.\n' });
  }
  return runGate(repo, 'gate', units);
}
