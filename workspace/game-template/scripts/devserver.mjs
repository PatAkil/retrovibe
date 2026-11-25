import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

function resolveRoot(dir) {
  try {
    return realpathSync(dir);
  } catch {
    return resolve(dir);
  }
}

function candidates(url, path) {
  const target = new URL(path, url);
  if (target.hostname !== 'localhost') {
    return [target];
  }
  return ['[::1]', '127.0.0.1'].map((host) => Object.assign(new URL(target), { hostname: host }));
}

async function status(target) {
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(1500) });
    return res.status;
  } catch {
    return 0;
  }
}

async function probeRoot(target) {
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(1500) });
    if (res.status !== 200) {
      return null;
    }
    const data = await res.json();
    return typeof data?.root === 'string' ? data.root : null;
  } catch {
    return null;
  }
}

async function answers(url, path = '') {
  const codes = await Promise.all(candidates(url, path).map(status));
  return codes.includes(200);
}

export async function servesGame(url, gameDir) {
  const expected = resolveRoot(gameDir);
  const roots = await Promise.all(candidates(url, '/__retrovibe_root').map(probeRoot));
  return roots.includes(expected);
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => { resolvePort(port); });
    });
  });
}

export function killChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  try {
    if (child.pid !== undefined) {
      process.kill(-child.pid, 'SIGTERM');
      return;
    }
  } catch {
    child.kill('SIGTERM');
    return;
  }
  child.kill('SIGTERM');
}

function stopper(child) {
  return () => {
    killChild(child);
  };
}

async function waitReady(child, url, output) {
  let readyFromStdout = false;
  const checkLine = () => {
    if (output.text.includes('Local') && output.text.includes('ready in')) {
      readyFromStdout = true;
    }
  };
  child.stdout.on('data', checkLine);
  try {
    for (let i = 0; i < 300; i++) {
      if (output.error !== null) {
        throw new Error(`dev server failed to start: ${output.error.message}`, { cause: output.error });
      }
      if (child.exitCode !== null) {
        throw new Error(`dev server exited early (${child.exitCode}):\n${output.text}`);
      }
      if (readyFromStdout || await answers(url)) {
        return;
      }
      await sleep(50);
    }
    throw new Error(`dev server did not answer on ${url} in 15s:\n${output.text}`);
  } finally {
    child.stdout.off('data', checkLine);
  }
}

export async function startServer(gameDir, viteBin, onSpawn) {
  const port = await freePort();
  const url = `http://localhost:${port}/`;
  const child = spawn(viteBin, ['--port', String(port), '--strictPort'], {
    cwd: gameDir,
    env: { ...process.env, VITE_PORT: String(port), FORCE_COLOR: '0', NO_COLOR: '1', RETROVIBE_LOCAL_HMR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const output = { text: '', error: null };
  const collect = (chunk) => { output.text += chunk.toString(); };
  child.once('error', (err) => { output.error = err; });
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const stop = stopper(child);
  onSpawn?.(stop);
  try {
    await waitReady(child, url, output);
  } catch (e) {
    stop();
    throw e;
  }
  return { url, pid: child.pid, stop };
}
