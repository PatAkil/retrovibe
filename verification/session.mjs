import { spawn } from 'node:child_process';
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { FIXTURES, runMoments } from './fixtures.mjs';
import { INIT_SCRIPT } from './page-runner.mjs';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const VERIFY = resolve(ROOT, 'verification');
export const OUT = resolve(VERIFY, 'out');
export const BASELINE = resolve(VERIFY, 'baseline');
const TEMPLATE_ENGINE = resolve(ROOT, 'workspace/game-template/engine');
const MAX_FRAMES = 60 * 60;
const RING = 16;
const READY_TIMEOUT_MS = 20000;
const STOP_GRACE_MS = 2000;
const activeServers = new Set();

export const dataUrlToBuffer = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

function refreshEngine(dir) {
  const dest = resolve(dir, 'engine');
  rmSync(dest, { recursive: true, force: true });
  cpSync(TEMPLATE_ENGINE, dest, { recursive: true });
}

function readiness(child, dir, port) {
  let output = '';
  return new Promise((res, rej) => {
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
      child.off('error', onError);
    };
    const onData = (chunk) => {
      output += chunk.toString();
      if (stripVTControlCharacters(output).includes(`http://localhost:${port}/`)) {
        cleanup();
        res();
      }
    };
    const onExit = (code) => {
      cleanup();
      rej(new Error(`dev server for ${basename(dir)} exited early (${code}):\n${output}`));
    };
    const onError = (err) => {
      cleanup();
      rej(new Error(`dev server for ${basename(dir)} failed to start: ${err.message}`));
    };
    const timer = setTimeout(() => {
      cleanup();
      rej(new Error(`dev server for ${basename(dir)} did not print its readiness line in 20s:\n${output}`));
    }, READY_TIMEOUT_MS);
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

function killGroup(child, signal) {
  if (child.pid === undefined) {
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      return;
    }
  }
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((res) => {
    const done = () => {
      clearTimeout(timer);
      child.off('exit', done);
      res();
    };
    const timer = setTimeout(done, timeoutMs);
    timer.unref();
    child.once('exit', done);
  });
}

function isGroupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function startDevServer(dir, port) {
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port)], {
    cwd: dir,
    env: { ...process.env, VITE_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const ready = readiness(child, dir, port);
  let stopping = null;
  const stop = () => {
    if (stopping) {
      return stopping;
    }
    stopping = (async () => {
      try {
        if (child.pid === undefined) {
          return;
        }
        killGroup(child, 'SIGTERM');
        await waitForExit(child, STOP_GRACE_MS);
        if (isGroupAlive(child.pid)) {
          killGroup(child, 'SIGKILL');
        }
      } finally {
        activeServers.delete(stop);
      }
    })();
    return stopping;
  };
  activeServers.add(stop);
  child.once('exit', () => { activeServers.delete(stop); });
  return { child, ready, stop };
}

export async function stopAllServers() {
  await Promise.all([...activeServers].map((stop) => stop()));
}

async function loadFocused(page, port) {
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
  await page.waitForSelector('canvas', { state: 'attached', timeout: 8000 });
  await page.click('canvas');
}

async function shellShot(page, port, frames) {
  await page.evaluate((n) => {
    for (let i = 0; i < n; i++) {
      window.__step();
    }
  }, frames);
  const png = await page.screenshot({ fullPage: false });
  await loadFocused(page, port);
  return `data:image/png;base64,${png.toString('base64')}`;
}

function checkRun(label, run, result, errors) {
  if (errors.length > 0) {
    throw new Error(`${label}: runtime errors\n  ${errors.join('\n  ')}`);
  }
  const { shots, frames, terminal } = result;
  if (run.terminal && terminal !== run.terminal) {
    const reached = terminal ? `reached ${terminal}` : `never reached a terminal scene in ${frames} frames`;
    throw new Error(`${label}: expected the run to end in ${run.terminal} but it ${reached}`);
  }
  const missing = [...runMoments(run)].filter((m) => typeof shots[m] !== 'string');
  if (missing.length > 0) {
    throw new Error(`${label}: script never produced moment(s): ${missing.join(', ')}`);
  }
  console.log(`  ${label}: ${frames} frames${terminal ? `, ended in ${terminal}` : ''} → ${Object.keys(shots).join(', ')}`);
}

export async function captureRun(browser, label, port, run) {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errors = [];
  const shots = {};
  let result;
  try {
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') {
        errors.push(`console.error: ${m.text()}`);
      }
    });
    await page.addInitScript(INIT_SCRIPT);
    await loadFocused(page, port);
    if (run.shell !== undefined) {
      shots.shell = await shellShot(page, port, run.shell);
    }
    result = await page.evaluate(([r, maxFrames, ring]) => window.__run(r, maxFrames, ring), [run, MAX_FRAMES, RING]);
    Object.assign(shots, result.shots);
  } finally {
    await page.close();
  }
  checkRun(label, run, { ...result, shots }, errors);
  return shots;
}

export async function captureFixture(browser, name, port) {
  const dir = resolve(VERIFY, name);
  refreshEngine(dir);
  const server = startDevServer(dir, port);
  try {
    await server.ready;
    const shots = {};
    const runs = FIXTURES[name].runs;
    for (const [r, run] of runs.entries()) {
      const label = `${name}${runs.length > 1 ? ` (run ${r + 1})` : ''}`;
      const got = await captureRun(browser, label, port, run);
      const keep = runMoments(run);
      for (const [moment, png] of Object.entries(got)) {
        if (keep.has(moment)) {
          shots[moment] = png;
        }
      }
    }
    for (const [moment, png] of Object.entries(shots)) {
      writeFileSync(resolve(OUT, `${name}-${moment}.png`), dataUrlToBuffer(png));
    }
  } finally {
    await server.stop();
  }
}
