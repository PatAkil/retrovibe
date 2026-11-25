import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { envOr } from './browser.mjs';
import { killChild, servesGame, startServer } from './devserver.mjs';
import { cacheFile, GAME, walkUp } from './paths.mjs';

const FULL = process.argv.includes('--full');
const SCENES = ['title', 'playing', 'paused', 'gameover', 'win'];
const DEFAULT_URL = 'http://localhost:5173/';
const HOOK_GLOBAL = '__retrovibe';
const server = { url: envOr('LOOK_URL', envOr('SMOKE_URL', DEFAULT_URL)), stop: undefined };
const activeChildren = new Set();

function requestedScenes() {
  const idx = process.argv.indexOf('--scenes');
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return null;
  }
  return process.argv[idx + 1].split(',').map((s) => s.trim()).filter(Boolean);
}

const CUSTOM_SCENES = requestedScenes();

function run(cmd, args, options = {}) {
  return new Promise((resolve) => {
    let out = '';
    const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', SMOKE_URL: server.url, LOOK_URL: server.url, ...options.env };
    const child = spawn(cmd, args, { cwd: options.cwd ?? GAME, env, detached: true });
    activeChildren.add(child);
    const finish = (result) => {
      activeChildren.delete(child);
      resolve(result);
    };
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => { finish({ code: 127, out: `${out}${e.message}\n` }); });
    child.on('close', (code) => { finish({ code: code ?? 1, out }); });
  });
}

const missing = (what) => Promise.resolve({ code: 1, out: `${what} not found walking up from ${GAME}\n` });

function toolIn(options, name, ...args) {
  return () => {
    const bin = walkUp(join('node_modules', '.bin', name));
    return bin === null ? missing(`node_modules/.bin/${name}`) : run(bin, args, options);
  };
}

const tool = (name, ...args) => toolIn({}, name, ...args);

function rootConfig(file) {
  return walkUp(file) ?? join(GAME, file);
}

function knip() {
  const config = walkUp('knip.config.js');
  if (config === null) {
    return missing('knip.config.js');
  }
  const root = dirname(config);
  return toolIn({ cwd: root, env: { GAME: relative(root, GAME) } }, 'knip')();
}

const script = (file, ...args) => () => run(process.execPath, [join(GAME, file), ...args]);

function eyesMarkerReady() {
  const uid = typeof process.getuid === 'function' ? String(process.getuid()) : 'user';
  const marker = join(tmpdir(), `retrovibe-${uid}`, 'eyes.json');
  try {
    return JSON.parse(readFileSync(marker, 'utf8')).ready === true;
  } catch {
    return false;
  }
}

function eyes() {
  if (eyesMarkerReady()) {
    return Promise.resolve({ code: 0, out: '', note: 'ready (cached)' });
  }
  const setup = walkUp(join('harness', 'setup-eyes.mjs'));
  return setup === null ? missing('harness/setup-eyes.mjs') : run(process.execPath, [setup]);
}

async function serve() {
  const explicit = envOr('LOOK_URL', envOr('SMOKE_URL', '')) !== '';
  if (explicit) {
    return { code: 0, out: '', note: `using ${server.url}` };
  }
  if (await servesGame(server.url, GAME)) {
    return { code: 0, out: '', note: `reusing ${server.url}` };
  }
  const vite = walkUp(join('node_modules', '.bin', 'vite'));
  if (vite === null) {
    return missing('node_modules/.bin/vite');
  }
  try {
    const started = await startServer(GAME, vite, (stop) => { server.stop = stop; });
    server.url = started.url;
    server.stop = started.stop;
    return { code: 0, out: '', note: `started ${started.url} (pid ${started.pid}, stopped afterwards)` };
  } catch (e) {
    server.stop = undefined;
    return { code: 1, out: `${e.message}\n` };
  }
}

function simRates(out) {
  const rates = [...out.matchAll(/^(\S+)\s+win\s+(\d+)%/gm)].map((m) => `${m[1]} ${m[2]}%`);
  return rates.length > 0 ? rates.join(', ') : 'no win rates parsed';
}

function parseScenes(out) {
  const map = new Map();
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) {
      continue;
    }
    try {
      const item = JSON.parse(trimmed);
      if (typeof item?.scene === 'string') {
        map.set(item.scene, item);
      }
    } catch {
      continue;
    }
  }
  return map;
}

function sceneVerdict(scene, item, fallback) {
  if (!item) {
    return { scene, status: 'fail', detail: fallback };
  }
  if (item.ok === true) {
    return { scene, status: 'ok', shot: item.shot ?? null };
  }
  if (item.unsupported === true && (item.errors?.length ?? 0) === 0) {
    return { scene, status: 'unsupported' };
  }
  const detail = item.errors?.length > 0 ? item.errors.join('; ') : fallback;
  return { scene, status: 'fail', detail: detail.slice(0, 400) };
}

async function lookScenes(list) {
  const r = await run(process.execPath, [join(GAME, 'scripts', 'look.mjs'), '--scenes', list.join(',')]);
  const parsed = parseScenes(r.out);
  const fallback = r.out.trim().slice(0, 400);
  const verdicts = list.map((scene) => sceneVerdict(scene, parsed.get(scene), fallback));
  const failed = verdicts.filter((v) => v.status === 'fail');
  const skipped = verdicts.filter((v) => v.status === 'unsupported').map((v) => v.scene);
  const out = verdicts.map((v) => `${v.scene}: ${v.status}${v.detail ? ` ${v.detail}` : ''}`).join('\n');
  const ok = list.length - failed.length - skipped.length;
  const note = `${ok} scenes ok${skipped.length > 0 ? `, unsupported by the game: ${skipped.join(', ')}` : ''}`;
  return { code: failed.length > 0 ? 1 : 0, out: `${out}\n`, note: failed.length > 0 ? '' : note };
}

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function distClean() {
  const dist = join(GAME, 'dist');
  if (!existsSync(dist)) {
    return Promise.resolve({ code: 1, out: `${dist} does not exist (build first)\n` });
  }
  const files = filesUnder(dist);
  const hits = files.filter((f) => readFileSync(f).includes(HOOK_GLOBAL));
  if (hits.length > 0) {
    return Promise.resolve({ code: 1, out: `${HOOK_GLOBAL} found in:\n${hits.join('\n')}\n` });
  }
  return Promise.resolve({ code: 0, out: '', note: `${files.length} files clean` });
}

function simGates() {
  if (!existsSync(join(GAME, 'sim', 'run.mjs'))) {
    return [];
  }
  return [{ name: 'sim:quick', info: true, exec: script('sim/run.mjs', '--runs', '500', '--policy', 'balanced,random'), note: simRates }];
}

function fullGates() {
  const sources = ['game', 'engine', 'scripts', ...(existsSync(join(GAME, 'sim')) ? ['sim'] : [])];
  return [
    { name: 'knip', exec: knip },
    { name: 'jscpd', exec: tool('jscpd', '--config', rootConfig('.jscpd.json'), ...sources) },
    { name: 'depcruise', exec: tool('depcruise', 'game', 'engine', '--config', rootConfig('.dependency-cruiser.cjs')) },
    { name: 'dist:no-hook', light: true, after: ['build'], exec: distClean },
    { name: 'look:all', light: true, after: ['eyes', 'serve'], exec: () => lookScenes(SCENES) },
  ];
}

function browserGate() {
  if (FULL) {
    return [];
  }
  if (CUSTOM_SCENES !== null && CUSTOM_SCENES.length > 0) {
    return [{ name: 'look', light: true, after: ['eyes', 'serve'], exec: () => lookScenes(CUSTOM_SCENES) }];
  }
  return [{ name: 'smoke', light: true, after: ['eyes', 'serve'], exec: script('smoke.mjs') }];
}

export function gates() {
  const list = [
    { name: 'eyes', light: true, exec: eyes },
    { name: 'serve', light: true, exec: serve },
    { name: 'lint', exec: tool('eslint', '.', '--cache', '--cache-location', cacheFile('eslintcache')) },
    { name: 'check', exec: tool('tsc', '--noEmit', '--incremental', '--tsBuildInfoFile', cacheFile('tsbuildinfo')) },
    { name: 'build', exec: tool('vite', 'build', '--logLevel', 'warn') },
    ...browserGate(),
    ...simGates(),
  ];
  return FULL ? list.concat(fullGates()) : list;
}

export async function recordGreen() {
  if (process.env.RETROVIBE_SKIP_RECORD_GREEN === '1') {
    return;
  }
  const feedback = walkUp(join('harness', 'agent-feedback.mjs'));
  if (feedback === null) {
    return;
  }
  try {
    await run(process.execPath, [feedback, 'record-green', GAME]);
  } catch {
    return;
  }
}

export function stopChildren() {
  for (const child of activeChildren) {
    killChild(child);
  }
  activeChildren.clear();
}

export function stopServer() {
  const stop = server.stop;
  server.stop = undefined;
  stop?.();
}
