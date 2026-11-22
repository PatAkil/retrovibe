import { join } from 'node:path';
import {
  browserOnlyFailure, buildGame, canVerify, engineMissing, lintFiles, lintPaths, typeErrors, verifyGame,
} from './feedback-checks.mjs';
import { acquire, gatedFiles, readState, release, updateState } from './feedback-state.mjs';
import { unitFiles, unitFingerprint } from './feedback-units.mjs';

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
    skipTypes ? Promise.resolve([]) : typeErrors(repo.root, repo.dir, unit),
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
  const out = build.pass ? 'PASS  lint + check + build (smoke skipped: the headless browser gate needs Linux)' : build.out;
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

async function gateUnitSettled(repo, unit) {
  for (let run = 1; ; run += 1) {
    const before = unitFingerprint(repo.root, unit, gatedFiles(repo.root));
    if (readState(repo.dir).green[unit.id] === before) {
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

function allCached(repo, units) {
  const green = readState(repo.dir).green;
  const all = gatedFiles(repo.root);
  return units.every((u) => green[u.id] === unitFingerprint(repo.root, u, all));
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

export async function gateUnits(repo, units, waitMs) {
  if (units.length === 0 || allCached(repo, units)) {
    return summarise(units.map((unit) => ({ unit, pass: true, cached: true, name: unit.id, out: '', failed: [] })));
  }
  const lock = join(repo.dir, 'gate.lock');
  if (!acquire(lock, { waitMs, staleMs: GATE_STALE_MS })) {
    return { ...summarise([]), pass: false, busy: true };
  }
  try {
    const results = [];
    for (const unit of units) {
      results.push(await gateUnitSettled(repo, unit));
    }
    return summarise(results);
  } finally {
    release(lock);
  }
}
