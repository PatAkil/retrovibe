import { join } from 'node:path';
import {
  browserOnlyFailure, buildGame, canVerify, engineMissing, lintFiles, lintPaths, typeErrors, verifyGame,
} from './feedback-checks.mjs';
import { acquire, gatedFiles, readState, release, updateState } from './feedback-state.mjs';
import { isPristineClone, unitFiles, unitFingerprint } from './feedback-units.mjs';

const GATE_STALE_MS = 11 * 60 * 1000;
const MAX_GATE_RUNS = 3;

function verdict(name, problems, notes = []) {
  const lines = [...problems.map((p) => p.text), ...notes];
  return { name, pass: problems.length === 0, out: lines.join('\n'), failed: problems.length ? [name] : [], notes };
}

async function staticGate(repo, unit) {
  if (unit.kind === 'tooling') {
    return verdict('eslint (repo tooling)', await lintFiles(repo.root, unitFiles(repo.root, unit)));
  }
  const skipTypes = engineMissing(repo.root, unit);
  const [lint, types] = await Promise.all([
    lintPaths(repo.root, [unit.dir]),
    skipTypes ? Promise.resolve([]) : typeErrors(repo.root, repo.dir, unit, 'gate'),
  ]);
  const notes = skipTypes ? [`note: ${unit.dir}/engine is missing (gitignored copy), tsc skipped; node verification/capture.mjs refreshes it`] : [];
  return verdict(`eslint + tsc (${unit.dir})`, [...lint, ...types], notes);
}

async function basicUserGate(repo, unit) {
  const first = await staticGate(repo, unit);
  if (!first.pass) {
    return first;
  }
  const build = await buildGame(repo.root, unit);
  const out = build.pass ? 'PASS  lint + check + build (no scripts/verify.mjs in this game folder)' : build.out;
  return { name: `lint + check + build (${unit.dir})`, pass: build.pass, out, failed: build.pass ? [] : ['build'] };
}

export function runUnitGate(repo, unit) {
  if (unit.kind === 'gone') {
    return Promise.resolve({ name: `${unit.dir} (deleted)`, pass: true, out: '', failed: [] });
  }
  if (unit.kind !== 'user') {
    return staticGate(repo, unit);
  }
  return canVerify(repo.root, unit) ? verifyGame(repo.root, unit) : basicUserGate(repo, unit);
}

async function gateUnitSettled(repo, unit, initialAll) {
  for (let run = 1; ; run += 1) {
    const beforeFiles = run === 1 && initialAll ? initialAll : gatedFiles(repo.root);
    const before = unitFingerprint(repo.root, unit, beforeFiles);
    if (readState(repo.dir).green[unit.id] === before || isPristineClone(repo.root, unit, beforeFiles)) {
      return { unit, pass: true, cached: true, name: unit.id, out: '', failed: [], fp: before };
    }
    const result = await runUnitGate(repo, unit);
    const after = unitFingerprint(repo.root, unit, gatedFiles(repo.root));
    if (after === before) {
      if (result.pass) {
        updateState(repo.dir, (s) => { s.green[unit.id] = after; });
      }
      return { ...result, unit, fp: before, unverifiable: browserOnlyFailure(result) };
    }
    if (run >= MAX_GATE_RUNS) {
      return { ...result, unit, pass: false, unsettled: true, fp: after };
    }
  }
}

function allCached(repo, units, all) {
  const green = readState(repo.dir).green;
  return units.every((u) => green[u.id] === unitFingerprint(repo.root, u, all) || isPristineClone(repo.root, u, all));
}

function summarise(results) {
  const red = results.filter((r) => !r.pass);
  return {
    pass: red.length === 0,
    cached: results.every((r) => r.cached === true),
    unsettled: red.some((r) => r.unsettled === true),
    unverifiable: red.length > 0 && red.every((r) => r.unverifiable === true),
    results,
    name: results.map((r) => r.name).join('; '),
    out: red.map((r) => `${r.name}: FAILED\n${r.out}`).join('\n\n'),
    notes: results.flatMap((r) => r.notes ?? []),
  };
}

const lockName = (id) => `gate-${id.replace(/[^\w-]+/g, '_')}.lock`;

async function gateUnitLocked(repo, unit, waitMs, all) {
  const lock = join(repo.dir, lockName(unit.id));
  if (!acquire(lock, { waitMs, staleMs: GATE_STALE_MS })) {
    return { unit, pass: false, busy: true, name: unit.id, out: '', failed: [] };
  }
  try {
    return await gateUnitSettled(repo, unit, all);
  } finally {
    release(lock);
  }
}

export async function gateUnits(repo, units, waitMs, all = gatedFiles(repo.root)) {
  if (units.length === 0 || allCached(repo, units, all)) {
    return summarise(units.map((unit) => ({ unit, pass: true, cached: true, name: unit.id, out: '', failed: [] })));
  }
  const results = await Promise.all(units.map((unit) => gateUnitLocked(repo, unit, waitMs, all)));
  const summary = summarise(results);
  return results.some((r) => r.busy === true) ? { ...summary, pass: false, busy: true } : summary;
}
