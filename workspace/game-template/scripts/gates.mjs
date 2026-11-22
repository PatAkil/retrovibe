import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, parse, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { envOr } from './browser.mjs';
import { servesGame, startServer } from './devserver.mjs';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..');
const FULL = process.argv.includes('--full');
const SCENES = ['title', 'playing', 'paused', 'gameover', 'win'];
const EXIT_UNSUPPORTED = 2;
const DEFAULT_URL = 'http://localhost:5173/';
const HOOK_GLOBAL = '__retrovibe';
const server = { url: envOr('LOOK_URL', envOr('SMOKE_URL', DEFAULT_URL)), stop: undefined };

function walkUp(relative) {
  let dir = GAME;
  for (;;) {
    const candidate = join(dir, relative);
    if (existsSync(candidate)) {
      return candidate;
    }
    if (dir === parse(dir).root) {
      return null;
    }
    dir = dirname(dir);
  }
}

function run(cmd, args, options = {}) {
  return new Promise((resolve) => {
    let out = '';
    const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', SMOKE_URL: server.url, LOOK_URL: server.url, ...options.env };
    const child = spawn(cmd, args, { cwd: options.cwd ?? GAME, env });
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => { resolve({ code: 127, out: `${out}${e.message}\n` }); });
    child.on('close', (code) => { resolve({ code: code ?? 1, out }); });
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

function eyes() {
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
    const started = await startServer(GAME, vite);
    server.url = started.url;
    server.stop = started.stop;
    return { code: 0, out: '', note: `started ${started.url} (pid ${started.pid}, stopped afterwards)` };
  } catch (e) {
    return { code: 1, out: `${e.message}\n` };
  }
}

function simRates(out) {
  const rates = [...out.matchAll(/^(\S+)\s+win\s+(\d+)%/gm)].map((m) => `${m[1]} ${m[2]}%`);
  return rates.length > 0 ? rates.join(', ') : 'no win rates parsed';
}

function lastJson(out) {
  try {
    return JSON.parse(out.trim().split('\n').pop());
  } catch {
    return null;
  }
}

function sceneVerdict(scene, r) {
  if (r.code === 0) {
    return { scene, status: 'ok' };
  }
  if (r.code === EXIT_UNSUPPORTED && lastJson(r.out)?.unsupported === true) {
    return { scene, status: 'unsupported' };
  }
  return { scene, status: 'fail', detail: r.out.trim().slice(0, 400) };
}

async function lookAll() {
  const verdicts = [];
  for (const scene of SCENES) {
    const r = await run(process.execPath, [join(GAME, 'scripts', 'look.mjs'), '--scene', scene]);
    verdicts.push(sceneVerdict(scene, r));
  }
  const failed = verdicts.filter((v) => v.status === 'fail');
  const skipped = verdicts.filter((v) => v.status === 'unsupported').map((v) => v.scene);
  const out = verdicts.map((v) => `${v.scene}: ${v.status}${v.detail ? ` ${v.detail}` : ''}`).join('\n');
  const ok = SCENES.length - failed.length - skipped.length;
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
    { name: 'look:all', light: true, after: ['eyes', 'serve'], exec: lookAll },
  ];
}

export function gates() {
  const list = [
    { name: 'eyes', light: true, exec: eyes },
    { name: 'serve', light: true, exec: serve },
    { name: 'lint', exec: tool('eslint', '.') },
    { name: 'check', exec: tool('tsc', '--noEmit') },
    { name: 'build', exec: tool('vite', 'build', '--logLevel', 'warn') },
    { name: 'smoke', light: true, after: ['eyes', 'serve'], exec: script('smoke.mjs') },
    ...simGates(),
  ];
  return FULL ? list.concat(fullGates()) : list;
}

export function stopServer() {
  const stop = server.stop;
  server.stop = undefined;
  stop?.();
}
