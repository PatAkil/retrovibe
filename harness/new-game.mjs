import { spawn, spawnSync } from 'node:child_process';
import { closeSync, cpSync, existsSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EYES_MARKER } from './browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = join(ROOT, 'workspace');
const TEMPLATE = join(WORKSPACE, 'game-template');
const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/;
const SKIP_CLONE = new Set(['dist', '.claude', 'node_modules']);
const DEV_URL = process.env.JBCENTRAL_EXPOSED_PORT_URL_5173 || 'http://localhost:5173/';

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function validateName(name) {
  if (!name || !VALID_NAME.test(name) || name === 'game-template') {
    fail('usage: node harness/new-game.mjs <game-name> (lowercase letters, digits, hyphens; not game-template)');
  }
}

function ensureTemplateClean(allowDirty) {
  if (allowDirty) {
    return;
  }
  const status = spawnSync('git', ['status', '--porcelain', 'workspace/game-template'], { cwd: ROOT, encoding: 'utf8' });
  if (status.status === 0 && status.stdout.trim() !== '') {
    fail(`workspace/game-template has uncommitted changes:\n${status.stdout.trim()}\nRestore it with: git checkout -- workspace/game-template && git clean -fd workspace/game-template (or pass --allow-dirty-template)`, 3);
  }
}

function cloneTemplate(dest) {
  cpSync(TEMPLATE, dest, {
    recursive: true,
    filter: (src) => !SKIP_CLONE.has(src.slice(TEMPLATE.length + 1).split('/')[0]),
  });
}

function ensureEyes() {
  try {
    if (JSON.parse(readFileSync(EYES_MARKER, 'utf8')).ready === true) {
      return 'ready (cached)';
    }
  } catch {
    void 0;
  }
  const r = spawnSync(process.execPath, [join(ROOT, 'harness', 'setup-eyes.mjs')], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    return `not ready (${(r.stderr || r.stdout).trim().slice(0, 120)})`;
  }
  return 'ready (initialized)';
}

function styleSummary(gameDir) {
  const file = join(gameDir, 'STYLE.md');
  if (!existsSync(file)) {
    return null;
  }
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('---'))
    .slice(0, 6);
  return lines.join(' | ').slice(0, 220);
}

function styleDigest(excludeName) {
  const digest = [];
  for (const entry of readdirSync(WORKSPACE, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'game-template' || entry.name === excludeName) {
      continue;
    }
    const summary = styleSummary(join(WORKSPACE, entry.name));
    if (summary !== null) {
      digest.push(`${entry.name}: ${summary}`);
    }
  }
  return digest.sort();
}

function killPidFile(pidPath) {
  try {
    const pid = Number.parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        process.kill(pid, 'SIGTERM');
      }
    }
  } catch {
    void 0;
  }
  rmSync(pidPath, { force: true });
}

function reclaimPort() {
  for (const name of readdirSync('/tmp')) {
    if (name.startsWith('retrovibe-dev-') && name.endsWith('.pid')) {
      killPidFile(join('/tmp', name));
    }
  }
}

async function waitForLog(logPath, child) {
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) {
      const out = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
      fail(`vite exited early (${String(child.exitCode)}):\n${out}`);
    }
    if (existsSync(logPath)) {
      const text = readFileSync(logPath, 'utf8');
      if (text.includes('Local') && text.includes('5173')) {
        return;
      }
    }
    await sleep(50);
  }
  fail(`vite did not report ready on 5173 within 15s (see ${logPath})`);
}

async function startDevServer(name, dest) {
  reclaimPort();
  const viteBin = join(ROOT, 'node_modules', '.bin', 'vite');
  if (!existsSync(viteBin)) {
    fail('node_modules/.bin/vite not found — run npm install at repo root');
  }
  const logPath = `/tmp/retrovibe-dev-${name}.log`;
  const pidPath = `/tmp/retrovibe-dev-${name}.pid`;
  const fd = openSync(logPath, 'w');
  const child = spawn(viteBin, [], {
    cwd: dest,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    stdio: ['ignore', fd, fd],
    detached: true,
  });
  closeSync(fd);
  writeFileSync(pidPath, `${String(child.pid)}\n`);
  await waitForLog(logPath, child);
  child.unref();
  return { pid: child.pid, logPath, pidPath };
}

async function main() {
  const args = process.argv.slice(2);
  const allowDirty = args.includes('--allow-dirty-template');
  const name = args.find((a) => !a.startsWith('--'));
  validateName(name);
  const dest = join(WORKSPACE, name);
  if (existsSync(dest)) {
    fail(`workspace/${name} already exists`, 2);
  }
  ensureTemplateClean(allowDirty);
  cloneTemplate(dest);
  const eyes = ensureEyes();
  const digest = styleDigest(name);
  const server = await startDevServer(name, dest);
  console.log(JSON.stringify({
    ok: true,
    game: `workspace/${name}`,
    url: DEV_URL,
    pid: server.pid,
    eyes,
    styleDigest: digest,
  }, null, 2));
}

await main();
