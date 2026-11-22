import { mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { collectErrors, envOr, launchBrowser, waitFrames } from './browser.mjs';

const GAME = basename(join(dirname(fileURLToPath(import.meta.url)), '..'));
const BASE = envOr('LOOK_URL', envOr('SMOKE_URL', 'http://localhost:5173/'));
const SCENES = ['title', 'playing', 'paused', 'gameover', 'win'];
const SCENE_STATES = { title: 'TITLE', playing: 'PLAYING', paused: 'PAUSED', gameover: 'GAME_OVER', win: 'WIN' };
const KEY_NAMES = {
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  space: 'Space', esc: 'Escape', escape: 'Escape', enter: 'Enter',
};
const HOOK_ACTIONS = {
  arrowup: 'UP', keyw: 'UP', w: 'UP',
  arrowdown: 'DOWN', keys: 'DOWN', s: 'DOWN',
  arrowleft: 'LEFT', keya: 'LEFT', a: 'LEFT',
  arrowright: 'RIGHT', keyd: 'RIGHT', d: 'RIGHT',
  space: 'A', keyz: 'A', z: 'A',
  keyx: 'B', x: 'B', keyc: 'B', c: 'B',
  keyp: 'PAUSE', p: 'PAUSE', escape: 'PAUSE',
};
const EXIT_UNSUPPORTED = 2;

const { values: opts } = parseArgs({
  options: {
    scene: { type: 'string' },
    seed: { type: 'string' },
    keys: { type: 'string', default: '' },
    steps: { type: 'string', default: '30' },
    out: { type: 'string' },
    'no-shot': { type: 'boolean', default: false },
  },
});

const steps = Math.max(0, Math.floor(Number(opts.steps)) || 0);
const keys = opts.keys.split(',').map((k) => k.trim()).filter(Boolean).map((k) => KEY_NAMES[k.toLowerCase()] ?? k);
const seed = opts.seed ?? (opts.scene === undefined ? undefined : '1');

function emit(result, code) {
  console.log(JSON.stringify(result));
  process.exitCode = code;
}

function pageUrl() {
  const url = new URL(BASE);
  if (seed !== undefined) {
    url.searchParams.set('seed', seed);
  }
  if (opts.scene !== undefined) {
    url.searchParams.set('scene', opts.scene);
  }
  if (seed !== undefined || opts.scene !== undefined) {
    url.searchParams.set('hold', '1');
  }
  return url.href;
}

function shotPath() {
  if (opts.out !== undefined) {
    return opts.out;
  }
  const name = `${opts.scene ?? 'title'}-s${seed ?? 'r'}.png`;
  const artifacts = envOr('AIR_ARTIFACTS_DIR', '');
  const dir = artifacts === '' ? join('/tmp/retrovibe-look', GAME) : join(artifacts, 'look', GAME);
  return join(dir, name);
}

async function advance(page, hooked, ticks) {
  if (ticks <= 0) {
    return;
  }
  if (hooked) {
    await page.evaluate((n) => window.__retrovibe.step(n), ticks);
  } else {
    await waitFrames(page, ticks);
  }
}

async function pressKey(page, hooked, key) {
  const action = HOOK_ACTIONS[key.toLowerCase()];
  if (hooked && action !== undefined) {
    await page.evaluate((a) => window.__retrovibe.press(a), action);
  } else {
    await page.keyboard.press(key);
  }
  await advance(page, hooked, Math.max(steps, 1));
}

function readHook(page) {
  return page.evaluate(() => {
    const hook = window.__retrovibe;
    if (typeof hook?.state !== 'function') {
      return { hooked: false, unsupported: [] };
    }
    return { hooked: true, unsupported: Array.isArray(hook.unsupported) ? hook.unsupported.map(String) : [] };
  });
}

function sceneMismatch(state) {
  if (opts.scene === undefined || typeof state?.scene !== 'string') {
    return null;
  }
  const want = SCENE_STATES[opts.scene];
  return state.scene.toUpperCase() === want ? null : `asked for scene ${opts.scene} but the hook reports ${state.scene}`;
}

async function drive(page, errors) {
  const { hooked } = await readHook(page);
  if (!hooked && opts.scene !== undefined && opts.scene !== 'title') {
    errors.push(`--scene ${opts.scene} needs the dev hook, but the page has no window.__retrovibe`);
    return null;
  }
  for (const key of keys) {
    await pressKey(page, hooked, key);
  }
  if (keys.length === 0) {
    await advance(page, hooked, steps);
  }
  if (!hooked) {
    return null;
  }
  const state = await page.evaluate(() => JSON.parse(JSON.stringify(window.__retrovibe.state() ?? null)));
  const mismatch = keys.length === 0 ? sceneMismatch(state) : null;
  if (mismatch !== null) {
    errors.push(mismatch);
  }
  return state;
}

async function capture(canvas) {
  if (opts['no-shot'] || !canvas) {
    return null;
  }
  const path = shotPath();
  mkdirSync(dirname(path), { recursive: true });
  await canvas.screenshot({ path });
  return path;
}

async function unsupportedScene(page) {
  if (opts.scene === undefined) {
    return false;
  }
  const { unsupported } = await readHook(page);
  return unsupported.includes(opts.scene);
}

async function look(page, errors) {
  const result = { ok: false, state: null, errors, shot: null };
  await page.goto(pageUrl(), { waitUntil: 'domcontentloaded', timeout: 15000 });
  const canvas = await page.waitForSelector('canvas', { state: 'attached', timeout: 8000 }).catch(() => null);
  if (!canvas) {
    errors.push('no live <canvas> after module ran');
    return result;
  }
  if (await unsupportedScene(page)) {
    return { ...result, unsupported: true };
  }
  result.state = await drive(page, errors);
  result.shot = await capture(canvas);
  result.ok = errors.length === 0;
  return result;
}

async function main() {
  const errors = [];
  if (opts.scene !== undefined && !SCENES.includes(opts.scene)) {
    errors.push(`unknown --scene "${opts.scene}" (known: ${SCENES.join(', ')})`);
    emit({ ok: false, state: null, errors, shot: null }, 1);
    return;
  }
  let result = { ok: false, state: null, errors, shot: null };
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    collectErrors(page, errors);
    result = await look(page, errors);
  } catch (e) {
    errors.push(`look: ${e.message.split('\n')[0]}`);
  } finally {
    await browser.close();
  }
  emit(result, result.unsupported === true && errors.length === 0 ? EXIT_UNSUPPORTED : Number(!result.ok));
}

await main();
