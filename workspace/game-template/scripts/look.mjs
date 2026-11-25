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
    scenes: { type: 'string' },
    seed: { type: 'string' },
    keys: { type: 'string', default: '' },
    steps: { type: 'string', default: '30' },
    out: { type: 'string' },
    'no-shot': { type: 'boolean', default: false },
  },
});

const steps = Math.max(0, Math.floor(Number(opts.steps)) || 0);
const keys = opts.keys.split(',').map((k) => k.trim()).filter(Boolean).map((k) => KEY_NAMES[k.toLowerCase()] ?? k);

function seedFor(scene) {
  return opts.seed ?? (scene === undefined ? undefined : '1');
}

function emit(result, code) {
  console.log(JSON.stringify(result));
  process.exitCode = code;
}

function parseSceneSpec(raw) {
  if (raw === undefined) {
    return { scene: undefined, query: '' };
  }
  const idx = raw.indexOf('?');
  if (idx === -1) {
    return { scene: raw, query: '' };
  }
  return { scene: raw.slice(0, idx), query: raw.slice(idx + 1) };
}

function pageUrl(spec, seed) {
  const url = new URL(BASE);
  if (seed !== undefined) {
    url.searchParams.set('seed', seed);
  }
  if (spec.scene !== undefined) {
    url.searchParams.set('scene', spec.scene);
  }
  if (spec.query !== '') {
    for (const [k, v] of new URLSearchParams(spec.query)) {
      url.searchParams.set(k, v);
    }
  }
  if (seed !== undefined || spec.scene !== undefined) {
    url.searchParams.set('hold', '1');
  }
  return url.href;
}

function querySlug(query) {
  if (query === '') {
    return '';
  }
  return `-${query.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

function shotPath(spec, seed, multi) {
  if (!multi && opts.out !== undefined) {
    return opts.out;
  }
  const name = `${spec.scene ?? 'title'}${querySlug(spec.query)}-s${seed ?? 'r'}.png`;
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

function sceneMismatch(scene, state) {
  if (scene === undefined || typeof state?.scene !== 'string') {
    return null;
  }
  const want = SCENE_STATES[scene];
  return state.scene.toUpperCase() === want ? null : `asked for scene ${scene} but the hook reports ${state.scene}`;
}

async function drive(page, scene, errors) {
  const { hooked } = await readHook(page);
  if (!hooked && scene !== undefined && scene !== 'title') {
    errors.push(`--scene ${scene} needs the dev hook, but the page has no window.__retrovibe`);
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
  const mismatch = keys.length === 0 ? sceneMismatch(scene, state) : null;
  if (mismatch !== null) {
    errors.push(mismatch);
  }
  return state;
}

async function capture(canvas, spec, seed, multi) {
  if (opts['no-shot'] || !canvas) {
    return null;
  }
  const path = shotPath(spec, seed, multi);
  mkdirSync(dirname(path), { recursive: true });
  await canvas.screenshot({ path });
  return path;
}

async function unsupportedScene(page, scene) {
  if (scene === undefined) {
    return false;
  }
  const { unsupported } = await readHook(page);
  return unsupported.includes(scene);
}

async function lookOnPage(page, ctx) {
  const label = ctx.spec.query === '' ? ctx.spec.scene : `${ctx.spec.scene}?${ctx.spec.query}`;
  const base = ctx.multi ? { scene: label } : {};
  const result = { ...base, ok: false, state: null, errors: ctx.errors, shot: null };
  await page.goto(pageUrl(ctx.spec, ctx.seed), { waitUntil: 'domcontentloaded', timeout: 15000 });
  const canvas = await page.waitForSelector('canvas', { state: 'attached', timeout: 8000 }).catch(() => null);
  if (!canvas) {
    ctx.errors.push('no live <canvas> after module ran');
    return result;
  }
  if (await unsupportedScene(page, ctx.spec.scene)) {
    return { ...result, unsupported: true };
  }
  result.state = await drive(page, ctx.spec.scene, ctx.errors);
  result.shot = await capture(canvas, ctx.spec, ctx.seed, ctx.multi);
  result.ok = ctx.errors.length === 0;
  return result;
}

async function runScene(browser, spec, multi) {
  const errors = [];
  const seed = seedFor(spec.scene);
  const label = spec.query === '' ? spec.scene : `${spec.scene}?${spec.query}`;
  let page;
  try {
    page = await browser.newPage();
    collectErrors(page, errors);
    return await lookOnPage(page, { spec, seed, multi, errors });
  } catch (e) {
    errors.push(`look: ${e.message.split('\n')[0]}`);
    return { ...(multi ? { scene: label } : {}), ok: false, state: null, errors, shot: null };
  } finally {
    await page?.close().catch(() => undefined);
  }
}

function isPassed(result) {
  return result.ok || (result.unsupported === true && result.errors.length === 0);
}

async function runMulti() {
  const specs = opts.scenes.split(',').map((s) => s.trim()).filter(Boolean).map(parseSceneSpec);
  const bad = specs.filter((s) => !SCENES.includes(s.scene)).map((s) => s.scene);
  if (specs.length === 0 || bad.length > 0) {
    const msg = specs.length === 0 ? '--scenes requires at least one scene' : `unknown --scenes "${bad.join(', ')}" (known: ${SCENES.join(', ')})`;
    emit({ ok: false, state: null, errors: [msg], shot: null }, 1);
    return;
  }
  let browser;
  try {
    browser = await launchBrowser();
    const results = await Promise.all(specs.map((spec) => runScene(browser, spec, true)));
    for (const r of results) {
      console.log(JSON.stringify(r));
    }
    process.exitCode = results.every(isPassed) ? 0 : 1;
  } catch (e) {
    emit({ ok: false, state: null, errors: [`look: ${e.message.split('\n')[0]}`], shot: null }, 1);
  } finally {
    await browser?.close();
  }
}

async function runSingle() {
  const spec = parseSceneSpec(opts.scene);
  if (spec.scene !== undefined && !SCENES.includes(spec.scene)) {
    emit({ ok: false, state: null, errors: [`unknown --scene "${spec.scene}" (known: ${SCENES.join(', ')})`], shot: null }, 1);
    return;
  }
  let browser;
  let result = { ok: false, state: null, errors: [], shot: null };
  try {
    browser = await launchBrowser();
    result = await runScene(browser, spec, false);
  } catch (e) {
    result.errors.push(`look: ${e.message.split('\n')[0]}`);
  } finally {
    await browser?.close();
  }
  emit(result, result.unsupported === true && result.errors.length === 0 ? EXIT_UNSUPPORTED : Number(!result.ok));
}

async function main() {
  if (opts.scenes !== undefined) {
    await runMulti();
    return;
  }
  await runSingle();
}

await main();
