import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

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

async function answers(url, path = '') {
  const codes = await Promise.all(candidates(url, path).map(status));
  return codes.includes(200);
}

export function servesGame(url, gameDir) {
  return answers(url, `@fs${gameDir}/index.html`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => { resolve(port); });
    });
  });
}

function stopper(child) {
  return () => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  };
}

async function waitReady(child, url, output) {
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) {
      throw new Error(`dev server exited early (${child.exitCode}):\n${output.text}`);
    }
    if (await answers(url)) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`dev server did not answer on ${url} in 15s:\n${output.text}`);
}

export async function startServer(gameDir, viteBin) {
  const port = await freePort();
  const url = `http://localhost:${port}/`;
  const child = spawn(viteBin, ['--port', String(port), '--strictPort'], {
    cwd: gameDir,
    env: { ...process.env, VITE_PORT: String(port), FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const output = { text: '' };
  const collect = (chunk) => { output.text += chunk.toString(); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const stop = stopper(child);
  try {
    await waitReady(child, url, output);
  } catch (e) {
    stop();
    throw e;
  }
  return { url, pid: child.pid, stop };
}
