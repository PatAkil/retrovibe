import { lstatSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const currentUid = typeof process.getuid === 'function' ? process.getuid() : null;
const uid = currentUid !== null ? String(currentUid) : 'user';

export const EYES_DIR = join(tmpdir(), `retrovibe-${uid}`);
export const WRAPPER = join(EYES_DIR, 'chromium');
export const EYES_MARKER = join(EYES_DIR, 'eyes.json');
export const EYES_LOCK = join(EYES_DIR, 'eyes.lock');
export const SETUP_LOG = join(EYES_DIR, 'setup.log');

function ownedBySelf(stat) {
  return currentUid === null || stat.uid === currentUid;
}

function safeStat(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

function isSafeDir(path) {
  const stat = safeStat(path);
  return stat !== null && !stat.isSymbolicLink() && stat.isDirectory() && ownedBySelf(stat);
}

function isSafeFile(path) {
  const stat = safeStat(path);
  return stat !== null && !stat.isSymbolicLink() && stat.isFile() && ownedBySelf(stat);
}

export function ensureEyesDir() {
  mkdirSync(EYES_DIR, { recursive: true, mode: 0o700 });
  if (!isSafeDir(EYES_DIR)) {
    throw new Error(`unsafe eyes directory: ${EYES_DIR}`);
  }
  return EYES_DIR;
}

export function chromiumPath() {
  const fromEnv = process.env.CHROMIUM_PATH;
  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv;
  }
  return isSafeDir(EYES_DIR) && isSafeFile(WRAPPER) ? WRAPPER : undefined;
}

export async function launchBrowser(options = {}) {
  const { chromium } = await import('playwright');
  const executablePath = chromiumPath();
  return chromium.launch(executablePath ? { ...options, executablePath } : options);
}
