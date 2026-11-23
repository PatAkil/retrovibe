import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CLAIM_MS = 20 * 60 * 1000;
const LIVE_MS = 30 * 60 * 1000;
const RECENT_MS = 60 * 1000;
const FORGET_MS = 6 * 60 * 60 * 1000;
const MAX_BASELINES = 20;
const MAX_GREEN = 200;
const LOG_BYTES = 256 * 1024;
const NOT_GATED = ['.claude/', '.github/', '.githooks/', 'verification/baseline/'];
const SLEEPER = new Int32Array(new SharedArrayBuffer(4));
const activeLocks = new Set();

export const sleepSync = (ms) => {
  Atomics.wait(SLEEPER, 0, 0, ms);
};

export function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000, maxBuffer: 32 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

function fallbackDir(root) {
  return join(tmpdir(), `retrovibe-feedback-${createHash('sha1').update(root).digest('hex').slice(0, 10)}`);
}

export function findRepo(cwd) {
  const start = typeof cwd === 'string' && existsSync(cwd) ? cwd : SCRIPT_ROOT;
  const [top = '', gitDir = ''] = (git(start, ['rev-parse', '--show-toplevel', '--absolute-git-dir']) ?? '').trim().split('\n');
  const ours = top !== '' && existsSync(join(top, 'harness', 'agent-feedback.mjs'));
  const root = ours ? top : SCRIPT_ROOT;
  const dir = ours && gitDir !== '' ? join(gitDir, 'retrovibe-feedback') : fallbackDir(root);
  mkdirSync(dir, { recursive: true });
  return { root, dir };
}

export const isGated = (path) => path !== '' && !path.endsWith('/') && !path.endsWith('.md') && !NOT_GATED.some((p) => path.startsWith(p));

const splitZ = (out) => (out ?? '').split('\0').filter((p) => p !== '');

export function gatedFiles(root) {
  return [...new Set(splitZ(git(root, ['ls-files', '-z', '-co', '--exclude-standard'])).filter(isGated))].sort();
}

export function dirtyGatedPaths(root) {
  if (git(root, ['rev-parse', '--verify', '-q', 'HEAD']) === null) {
    return gatedFiles(root);
  }
  const tracked = splitZ(git(root, ['diff', '-z', '--name-only', 'HEAD']));
  const untracked = splitZ(git(root, ['ls-files', '-z', '--others', '--exclude-standard']));
  return [...new Set([...tracked, ...untracked].filter(isGated))].sort();
}

export function unstagedGatedPaths(root) {
  const unstaged = splitZ(git(root, ['diff', '-z', '--name-only']));
  const untracked = splitZ(git(root, ['ls-files', '-z', '--others', '--exclude-standard']));
  return [...new Set([...unstaged, ...untracked].filter(isGated))].sort();
}

export function stagedChanges(root) {
  const parts = splitZ(git(root, ['diff', '--cached', '-z', '--name-status', '--no-renames']));
  const changes = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    changes.push({ status: String(parts[i]), path: String(parts[i + 1]) });
  }
  return changes.filter((c) => isGated(c.path));
}

export function statSnapshot(root, files) {
  const snap = {};
  for (const file of files) {
    try {
      const s = statSync(join(root, file));
      snap[file] = [s.mtimeMs, s.size];
    } catch {
      continue;
    }
  }
  return snap;
}

export function diffSnapshots(before, after, now) {
  const changes = [];
  for (const [path, cur] of Object.entries(after)) {
    const prev = before[path];
    if (prev?.[0] !== cur[0] || prev[1] !== cur[1]) {
      changes.push({ path, mtime: cur[0], deleted: false });
    }
  }
  for (const path of Object.keys(before)) {
    if (!(path in after)) {
      changes.push({ path, mtime: now, deleted: true });
    }
  }
  return changes;
}

export function hashFiles(root, files) {
  const hash = createHash('sha1');
  for (const file of files) {
    hash.update(`${file}\0`);
    try {
      hash.update(readFileSync(join(root, file)));
    } catch {
      hash.update('<missing>');
    }
    hash.update('\0');
  }
  return hash.digest('hex');
}

export const fingerprint = (root) => hashFiles(root, gatedFiles(root));

function isStale(path, staleMs) {
  try {
    return Date.now() - statSync(path).mtimeMs > staleMs;
  } catch {
    return false;
  }
}

export function acquire(path, { waitMs, staleMs }) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      mkdirSync(path);
      activeLocks.add(path);
      return true;
    } catch {
      if (isStale(path, staleMs)) {
        rmSync(path, { recursive: true, force: true });
        continue;
      }
    }
    if (Date.now() >= deadline) {
      return false;
    }
    sleepSync(100);
  }
}

export function release(path) {
  activeLocks.delete(path);
  rmSync(path, { recursive: true, force: true });
}

export function releaseActiveLocks() {
  for (const path of [...activeLocks]) {
    release(path);
  }
}

const emptyState = () => ({ green: {}, baselines: {}, agents: {}, claims: {}, active: {}, blocks: {} });

export function readState(dir) {
  try {
    const saved = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'));
    const state = { ...emptyState(), ...saved };
    if (typeof state.green !== 'object' || state.green === null) {
      state.green = {};
    }
    return state;
  } catch {
    return emptyState();
  }
}

function prune(state, now) {
  state.claims = Object.fromEntries(Object.entries(state.claims).filter(([, c]) => now - c.at < CLAIM_MS));
  state.agents = Object.fromEntries(Object.entries(state.agents).filter(([, a]) => now - a.seen < FORGET_MS));
  state.active = Object.fromEntries(Object.entries(state.active).filter(([k]) => now - (state.agents[k]?.seen ?? 0) < LIVE_MS));
  state.baselines = Object.fromEntries(Object.entries(state.baselines).slice(-MAX_BASELINES));
  state.green = Object.fromEntries(Object.entries(state.green).slice(-MAX_GREEN));
  state.blocks = Object.fromEntries(Object.entries(state.blocks).filter(([k]) => k in state.agents || k.startsWith('main:')));
}

function writeState(dir, state) {
  prune(state, Date.now());
  const tmp = join(dir, `state.${String(process.pid)}.tmp`);
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, join(dir, 'state.json'));
}

export function updateState(dir, change) {
  const lock = join(dir, 'state.lock');
  const held = acquire(lock, { waitMs: 3000, staleMs: 10000 });
  try {
    const state = readState(dir);
    const value = change(state);
    writeState(dir, state);
    return value;
  } finally {
    if (held) {
      release(lock);
    }
  }
}

export function agentKey(input) {
  const id = input.agent_id;
  return typeof id === 'string' && id !== '' ? `agent:${id}` : `main:${String(input.session_id ?? 'cli')}`;
}

export const isSubagent = (key) => key.startsWith('agent:');

export function othersBusy(state, key, now) {
  const running = Object.keys(state.active).filter((k) => now - (state.agents[k]?.seen ?? 0) < LIVE_MS);
  const recent = Object.entries(state.agents).filter(([, a]) => now - a.seen < RECENT_MS).map(([k]) => k);
  return [...new Set([...running, ...recent])].filter((k) => k !== key);
}

export function claimedByOther(state, key, path, now) {
  const claim = state.claims[path];
  return claim !== undefined && claim.agent !== key && now - claim.at < CLAIM_MS;
}

export function freshAgent(root, extra) {
  return { snap: statSnapshot(root, gatedFiles(root)), seen: Date.now(), touched: [], ...extra };
}

export function logEvent(dir, entry) {
  const path = join(dir, 'events.log');
  try {
    if (statSync(path).size > LOG_BYTES) {
      renameSync(path, `${path}.1`);
    }
  } catch {
    mkdirSync(dir, { recursive: true });
  }
  appendFileSync(path, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}
