import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureEyesDir, EYES_LOCK, EYES_MARKER, SETUP_LOG, WRAPPER } from './browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = tmpdir();
const BIN = join(TMP, 'chromium');
const LIBS = join(TMP, 'al2023', 'lib');
const FONTS_DIR = join(TMP, 'fonts');
const FONTS = join(FONTS_DIR, 'fonts.conf');
const FORCE = process.argv.includes('--force');
const APT_PACKAGES = ['libnspr4', 'libnss3', 'libsqlite3-0'];
const PROBE_PAGE = '<canvas width="8" height="8"></canvas>';
const t0 = Date.now();
const shQuote = (s) => `'${s.replaceAll("'", "'\\''")}'`;

const WRAPPER_TEXT = [
  '#!/bin/sh',
  `export LD_LIBRARY_PATH=${shQuote(LIBS)}\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}`,
  `if [ -z "\${FONTCONFIG_PATH:-}" ]; then FONTCONFIG_PATH=${shQuote(FONTS_DIR)}; fi`,
  'export FONTCONFIG_PATH',
  `exec ${shQuote(BIN)} --headless=shell --no-sandbox --disable-gpu "$@"`,
  '',
].join('\n');

const log = (line) => { appendFileSync(SETUP_LOG, `${new Date().toISOString()} ${line}\n`); };
const seconds = () => ((Date.now() - t0) / 1000).toFixed(2);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const envChromium = () => process.env.CHROMIUM_PATH ?? '';
const lastLine = (text) => String(text).trim().split('\n').pop();
const firstLine = (text) => String(text).trim().split('\n')[0];

function readMarker() {
  try {
    return JSON.parse(readFileSync(EYES_MARKER, 'utf8'));
  } catch {
    return null;
  }
}

function writeMarker(ready, reason, chromium) {
  const marker = { ready, reason, chromium, at: new Date().toISOString() };
  writeFileSync(EYES_MARKER, `${JSON.stringify(marker)}\n`);
  log(`marker ${JSON.stringify(marker)}`);
  return marker;
}

function ensureNodeModules() {
  const need = ['playwright', join('@sparticuz', 'chromium')];
  if (need.every((name) => existsSync(join(ROOT, 'node_modules', name)))) {
    return;
  }
  const lockfile = existsSync(join(ROOT, 'package-lock.json'));
  const args = lockfile ? ['ci', '--no-audit', '--no-fund'] : ['install', '--no-audit', '--no-fund'];
  log(`npm ${args[0]}`);
  const r = spawnSync('npm', args, { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`npm ${args[0]} failed: ${lastLine(r.stderr)}`);
  }
}

async function launchCheck(executablePath) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), timeout: 20000 });
  try {
    const page = await browser.newPage();
    await page.setContent(PROBE_PAGE);
    const drew = await page.evaluate(() => document.querySelector('canvas')?.getContext('2d') !== null);
    if (!drew) {
      throw new Error('probe page has no 2d canvas context');
    }
  } finally {
    await browser.close();
  }
}

async function playwrightDefault() {
  const { chromium } = await import('playwright');
  const path = chromium.executablePath();
  if (!existsSync(path)) {
    return null;
  }
  try {
    await launchCheck(undefined);
    return path;
  } catch (e) {
    log(`playwright default browser failed: ${firstLine(e.message)}`);
    return null;
  }
}

async function ensureChromium() {
  if (existsSync(BIN) && existsSync(join(LIBS, 'libnss3.so')) && existsSync(FONTS)) {
    return;
  }
  log('extracting chromium from @sparticuz/chromium');
  const mod = await import('@sparticuz/chromium');
  const path = await mod.default.executablePath();
  if (path !== BIN) {
    throw new Error(`chromium extracted to ${path}, expected ${BIN}`);
  }
  await mod.inflate(join(ROOT, 'node_modules', '@sparticuz', 'chromium', 'bin', 'al2023.tar.br'));
}

function ensureWrapper() {
  if (existsSync(WRAPPER) && readFileSync(WRAPPER, 'utf8') === WRAPPER_TEXT) {
    return;
  }
  writeFileSync(WRAPPER, WRAPPER_TEXT, { mode: 0o755 });
}

function canApt() {
  return spawnSync('sudo', ['-n', 'true'], { stdio: 'ignore' }).status === 0;
}

function aptInstall() {
  log(`apt fallback: ${APT_PACKAGES.join(' ')}`);
  const env = { ...process.env, DEBIAN_FRONTEND: 'noninteractive' };
  const opts = { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8', env };
  spawnSync('sudo', ['-n', '-E', 'apt-get', 'update'], opts);
  const r = spawnSync('sudo', ['-n', '-E', 'apt-get', 'install', '-y', ...APT_PACKAGES], opts);
  if (r.status !== 0) {
    throw new Error(`apt-get install failed: ${lastLine(r.stderr)}`);
  }
}

async function wrapperLaunch() {
  try {
    await launchCheck(WRAPPER);
    return 'launch ok (extracted chromium, bundled libs via LD_LIBRARY_PATH)';
  } catch (e) {
    log(`wrapper launch failed: ${e.message}`);
    if (!canApt()) {
      const detail = /error while loading shared libraries[^\n]*/.exec(e.message)?.[0] ?? e.message.split('\n')[0];
      throw new Error(`browser launch failed: ${detail}`, { cause: e });
    }
  }
  aptInstall();
  await launchCheck(WRAPPER);
  return 'launch ok after apt fallback';
}

async function extractedSetup() {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error(`no Playwright browser and no extractable chromium on ${process.platform}/${process.arch}: run npx playwright install chromium at the repo root`);
  }
  await ensureChromium();
  ensureWrapper();
  return writeMarker(true, await wrapperLaunch(), WRAPPER);
}

async function fullSetup() {
  try {
    ensureNodeModules();
    if (envChromium() !== '') {
      await launchCheck(envChromium());
      if (envChromium() !== WRAPPER) {
        rmSync(WRAPPER, { force: true });
      }
      return writeMarker(true, 'launch ok (CHROMIUM_PATH)', envChromium());
    }
    const own = await playwrightDefault();
    if (own) {
      rmSync(WRAPPER, { force: true });
      return writeMarker(true, 'launch ok (playwright browser)', own);
    }
    return await extractedSetup();
  } catch (e) {
    return writeMarker(false, firstLine(e.message), envChromium() || WRAPPER);
  }
}

function exportEnv(marker) {
  const file = process.env.CLAUDE_ENV_FILE;
  if (!file || marker.chromium !== WRAPPER) {
    return;
  }
  const line = `export CHROMIUM_PATH=${shQuote(WRAPPER)}`;
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (!current.includes(line)) {
    appendFileSync(file, `${line}\n`);
  }
}

function report(marker) {
  const state = marker.ready ? 'ready' : 'NOT READY';
  console.log(`eyes: ${state} - ${marker.reason} | chromium ${marker.chromium} | ${seconds()}s`);
  if (marker.ready) {
    exportEnv(marker);
  } else {
    console.log(`eyes: details in ${SETUP_LOG}`);
    process.exitCode = 1;
  }
}

function wrapperStale(marker) {
  if (marker.chromium !== WRAPPER) {
    return false;
  }
  return !existsSync(BIN) || readFileSync(WRAPPER, 'utf8') !== WRAPPER_TEXT;
}

function fastPath() {
  const marker = FORCE ? null : readMarker();
  if (!marker?.ready || typeof marker.chromium !== 'string' || !existsSync(marker.chromium)) {
    return null;
  }
  const envMismatch = envChromium() !== '' && envChromium() !== marker.chromium;
  return envMismatch || wrapperStale(marker) ? null : marker;
}

function takeLock() {
  for (;;) {
    try {
      mkdirSync(EYES_LOCK);
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
      let mtimeMs;
      try {
        mtimeMs = statSync(EYES_LOCK).mtimeMs;
      } catch (statErr) {
        if (statErr.code === 'ENOENT') {
          continue;
        }
        throw statErr;
      }
      if (Date.now() - mtimeMs > 600000) {
        rmSync(EYES_LOCK, { recursive: true, force: true });
        continue;
      }
      return false;
    }
  }
}

async function waitForOtherRun() {
  for (let i = 0; i < 600 && existsSync(EYES_LOCK); i++) {
    await sleep(500);
  }
  return readMarker() ?? writeMarker(false, 'another setup run did not finish', WRAPPER);
}

async function main() {
  ensureEyesDir();
  const fast = fastPath();
  if (fast) {
    report(fast);
    return;
  }
  if (!takeLock()) {
    report(await waitForOtherRun());
    return;
  }
  try {
    log(FORCE ? 'setup (forced)' : 'setup');
    report(await fullSetup());
  } finally {
    rmSync(EYES_LOCK, { recursive: true, force: true });
  }
}

await main();
