import { lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const currentUid = typeof process.getuid === 'function' ? process.getuid() : null;
const uid = currentUid !== null ? String(currentUid) : 'user';
const EYES_DIR = join(tmpdir(), `retrovibe-${uid}`);
const WRAPPER = join(EYES_DIR, 'chromium');

function safeEntry(path, check) {
  try {
    const stat = lstatSync(path);
    return !stat.isSymbolicLink() && check(stat) && (currentUid === null || stat.uid === currentUid);
  } catch {
    return false;
  }
}

function safeWrapper() {
  return safeEntry(EYES_DIR, (s) => s.isDirectory()) && safeEntry(WRAPPER, (s) => s.isFile()) ? WRAPPER : undefined;
}

export function envOr(name, fallback) {
  const value = process.env[name];
  return value !== undefined && value !== '' ? value : fallback;
}

export function launchBrowser(options = {}) {
  const executablePath = envOr('CHROMIUM_PATH', safeWrapper());
  return chromium.launch(executablePath ? { ...options, executablePath } : options);
}

export function waitFrames(page, count) {
  return page.evaluate(
    (n) =>
      new Promise((resolve) => {
        let seen = 0;
        const tick = () => {
          seen += 1;
          if (seen >= n) {
            resolve(seen);
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    count,
  );
}

export function collectErrors(page, errors) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`console.error: ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
}
