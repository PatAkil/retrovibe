import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { EYES_MARKER } from './browser.mjs';

const ENTRY = {
  eslint: 'node_modules/eslint/bin/eslint.js',
  tsc: 'node_modules/typescript/bin/tsc',
  vite: 'node_modules/vite/bin/vite.js',
};
const LINTABLE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;
const TYPED = /(?:\.ts|\/tsconfig\.json)$/;
const TS_ERROR = /^(.+?)\((\d+),(\d+)\): error TS\d+: /;
const CHECK_MS = 45000;
const GATE_MS = 480000;
const BROWSER_GATES = new Set(['eyes', 'smoke', 'look:all']);
const children = new Set();

export const toolsMissing = (root) => Object.values(ENTRY).filter((p) => !existsSync(join(root, p)));
export const lintable = (files) => files.filter((f) => LINTABLE.test(f));
export const typed = (files) => files.filter((f) => TYPED.test(f));

export function tail(text, lines) {
  return text.trimEnd().split('\n').slice(-lines).join('\n');
}

function signalGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function killGroup(child) {
  signalGroup(child, 'SIGTERM');
  setTimeout(() => { signalGroup(child, 'SIGKILL'); }, 3000).unref();
}

export function killChildren() {
  for (const child of children) {
    signalGroup(child, 'SIGTERM');
  }
}

export function execNode(cwd, args, timeoutMs) {
  return new Promise((resolve) => {
    const out = { stdout: '', stderr: '', timedOut: false };
    const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' };
    const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    children.add(child);
    const timer = setTimeout(() => {
      out.timedOut = true;
      killGroup(child);
    }, timeoutMs);
    child.stdout.on('data', (d) => (out.stdout += d));
    child.stderr.on('data', (d) => (out.stderr += d));
    const finish = (code) => {
      clearTimeout(timer);
      children.delete(child);
      resolve({ ...out, code });
    };
    child.on('error', (e) => { out.stderr += e.message; finish(127); });
    child.on('close', (code) => { finish(code ?? 1); });
  });
}

function eslintProblems(result, root) {
  return result.messages.map((m) => {
    const file = relative(root, result.filePath);
    return { file, text: `${file}:${m.line ?? 0}:${m.column ?? 0}  ${m.ruleId ?? 'parse-error'}  ${m.message}` };
  });
}

export async function lintPaths(root, targets) {
  if (targets.length === 0) {
    return [];
  }
  const r = await execNode(root, [join(root, ENTRY.eslint), '--no-warn-ignored', '--format', 'json', ...targets], CHECK_MS * 2);
  if (r.timedOut) {
    return [{ file: '(eslint)', text: `eslint timed out after ${String(CHECK_MS * 2 / 1000)}s` }];
  }
  try {
    return JSON.parse(r.stdout).flatMap((result) => eslintProblems(result, root));
  } catch {
    return r.code === 0 ? [] : [{ file: '(eslint)', text: tail(`${r.stdout}${r.stderr}`, 12) }];
  }
}

export const lintFiles = (root, files) => lintPaths(root, lintable(files));

function parseTsc(out) {
  const errors = [];
  for (const line of out.split('\n')) {
    const m = TS_ERROR.exec(line);
    const last = errors.at(-1);
    if (m) {
      errors.push({ file: String(m[1]), text: line });
    } else if (line.startsWith(' ') && last) {
      last.text += `\n${line}`;
    }
  }
  return errors;
}

const slug = (dir) => dir.replace(/[^\w-]+/g, '_');

export function engineMissing(root, unit) {
  return unit.kind === 'fixture' && !existsSync(join(root, unit.dir, 'engine', 'index.ts'));
}

export async function typeErrors(root, stateDir, unit, scope = '') {
  const tag = scope === '' ? String(process.pid) : scope;
  const info = join(stateDir, `tsc-${slug(unit.dir)}-${tag}.tsbuildinfo`);
  const project = join(unit.dir, 'tsconfig.json');
  const args = [join(root, ENTRY.tsc), '-p', project, '--noEmit', '--pretty', 'false', '--incremental', '--tsBuildInfoFile', info];
  try {
    const r = await execNode(root, args, CHECK_MS);
    if (r.timedOut) {
      return [{ file: '(tsc)', text: `tsc -p ${project} timed out after ${String(CHECK_MS / 1000)}s` }];
    }
    const errors = parseTsc(`${r.stdout}${r.stderr}`);
    return r.code !== 0 && errors.length === 0 ? [{ file: '(tsc)', text: tail(`${r.stdout}${r.stderr}`, 12) }] : errors;
  } finally {
    if (scope === '') {
      rmSync(info, { force: true });
    }
  }
}

export function eyesReady() {
  try {
    return JSON.parse(readFileSync(EYES_MARKER, 'utf8')).ready === true;
  } catch {
    return false;
  }
}

const failedGates = (out) => /TOTAL FAIL \(([^)]*)\)/.exec(out)?.[1]?.split(', ') ?? [];

export async function verifyGame(root, unit) {
  const cwd = join(root, unit.dir);
  const r = await execNode(cwd, [join(cwd, 'scripts', 'verify.mjs')], GATE_MS);
  const out = `${r.stdout}${r.stderr}${r.timedOut ? `\nverify timed out after ${String(GATE_MS / 1000)}s\n` : ''}`;
  return { name: `npm run verify in ${unit.dir}`, pass: r.code === 0 && !r.timedOut, out, failed: failedGates(r.stdout) };
}

export async function buildGame(root, unit) {
  const cwd = join(root, unit.dir);
  const r = await execNode(cwd, [join(root, ENTRY.vite), 'build', '--logLevel', 'warn'], GATE_MS / 2);
  const pass = r.code === 0 && !r.timedOut;
  return { name: 'build', pass, out: pass ? '' : tail(`${r.stdout}${r.stderr}`, 15) };
}

export const canVerify = (root, unit) => existsSync(join(root, unit.dir, 'scripts', 'verify.mjs'));

export const browserOnlyFailure = (result) =>
  !result.pass && result.failed.length > 0 && result.failed.every((g) => BROWSER_GATES.has(g)) && !eyesReady();
