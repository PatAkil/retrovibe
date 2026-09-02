// Graphics verification capture — harness code (like harness/verify.mjs and
// the template's smoke.mjs), not a repo helper script. Driven by the
// verifying-graphics skill, which explains the loop; this file only executes it.
//
//   node verification/capture.mjs            capture every fixture → verification/out/
//   node verification/capture.mjs --accept   promote verification/out/ frames to
//                                            verification/baseline/ (the approved look)
//
// What one run does, per fixture under verification/<name>/:
//   1. Replaces the fixture's engine/ with a fresh copy of
//      workspace/game-template/engine — a fixture can never test a stale engine.
//   2. Starts the fixture's Vite dev server on its own port (5301+).
//   3. Drives the game in headless Chromium under a VIRTUAL CLOCK: the page's
//      requestAnimationFrame / performance.now are replaced so the loop is
//      stepped exactly one 1/60 s frame at a time, and Math.random is seeded —
//      the same input script produces the same frames run after run.
//   4. Follows the fixture's input script and grabs the canvas at fixed
//      MOMENTS — title, play, paused — plus SEMANTIC moments detected from the
//      runtime's console messages (`[retrovibe] scoreChanged / gameOver`):
//      score = first score change, impact = the death tableau (frozen frame
//      just after the fatal hit, taken from a ring buffer of recent frames),
//      end = the terminal scene 0.5 s after it is entered (flash and burst gone).
//   5. Writes verification/out/<fixture>-<moment>.png, and — when a baseline
//      exists — verification/out/compare.png (baseline | candidate | diff per
//      moment) with a changed-pixel percentage per moment printed to stdout.
//
// Exit code is nonzero when a fixture fails to boot, throws, or misses a
// moment its script promises — never for pixel differences: whether a change
// LOOKS better is judged by viewing compare.png, per the skill.

import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VERIFY = resolve(ROOT, 'verification');
const TEMPLATE_ENGINE = resolve(ROOT, 'workspace/game-template/engine');
const OUT = resolve(VERIFY, 'out');
const BASELINE = resolve(VERIFY, 'baseline');
const FIRST_PORT = 5301;
const MAX_FRAMES = 60 * 40; // 40 s of virtual time per fixture, hard stop
const RING = 16; // frames of history kept for the impact (death tableau) shot

// --- Fixture input scripts ----------------------------------------------------
// Frame-indexed key events. Fixed moments name the frame they are taken at;
// semantic moments come from runtime messages. Fixtures are frozen, so these
// scripts stay valid; if a fixture legitimately changes, update its script here.
// Keys are Playwright key names: ArrowLeft/Right/Up/Down, Space, KeyP.

const hold = (key, from, to) => [{ at: from, key, type: 'down' }, { at: to, key, type: 'up' }];
const tap = (key, at) => hold(key, at, at + 3);

const FIXTURES = {
  'space-dodge': {
    fixed: { title: 40, play: 150, paused: 190 },
    events: [
      ...tap('Space', 60), // start
      ...hold('ArrowRight', 70, 130),
      ...hold('ArrowUp', 100, 150),
      ...tap('KeyP', 180), // pause → shot at 190
      ...tap('KeyP', 210), // resume
      // Park on the hazard's (deterministic, RNG-free) bounce path: it arrives
      // ~frame 264 → death tableau (impact) → GAME_OVER (end).
      ...hold('ArrowDown', 220, 256),
    ],
    expects: ['impact', 'end'],
  },
  'cave-hopper': {
    fixed: { title: 40, play: 110, paused: 150 },
    events: [
      ...tap('Space', 60), // start
      ...hold('ArrowRight', 70, 98), // walk onto the first coin (score moment), stop short of the spikes
      ...tap('KeyP', 140), // pause → shot at 150
      ...tap('KeyP', 170), // resume
      // Walk into the spikes three times (respawn between) → GAME_OVER.
      ...hold('ArrowRight', 180, 260),
      ...hold('ArrowRight', 300, 380),
      ...hold('ArrowRight', 420, 500),
      ...hold('ArrowRight', 540, 620),
    ],
    expects: ['score', 'impact', 'end'],
  },
  'brick-bounce': {
    fixed: { title: 40, play: 130, paused: 170 },
    events: [
      ...tap('Space', 60), // start
      ...tap('Space', 80), // launch
      ...tap('KeyP', 160), // pause → shot at 170
      ...tap('KeyP', 190), // resume
      // Park the paddle at the left wall: the ball is lost three times → GAME_OVER
      // (bricks are struck on the way up first → score moment).
      ...hold('ArrowLeft', 200, 260),
      ...tap('Space', 400),
      ...tap('Space', 700),
      ...tap('Space', 1000),
      ...tap('Space', 1300),
      ...tap('Space', 1600),
    ],
    expects: ['score', 'impact', 'end'],
  },
};
const MOMENTS = ['title', 'play', 'score', 'paused', 'impact', 'end'];

// --- Virtual clock + seeded RNG, installed before any page script runs -------

const INIT_SCRIPT = `(() => {
  let now = 0;
  let queue = [];
  let seed = 0x9e3779b9 | 0;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  window.cancelAnimationFrame = () => {};
  window.__events = [];
  const log = console.log.bind(console);
  console.log = (...args) => {
    if (args[0] === '[retrovibe]' && args[1] && typeof args[1] === 'object') window.__events.push(args[1].type);
    log(...args);
  };
  window.__step = () => {
    now += 1000 / 60;
    const cbs = queue;
    queue = [];
    for (const cb of cbs) cb(now);
  };
  // Run a whole input script synchronously: dispatch synthetic key events (the
  // engine reads e.code), step one frame, snapshot moments. A ring of offscreen
  // canvases keeps recent frames so the death tableau can be recovered after
  // the fact; PNG encoding happens only for frames that become moments.
  window.__run = (spec, maxFrames, ringSize) => {
    const canvas = document.querySelector('canvas');
    const ring = [];
    for (let i = 0; i < ringSize; i++) {
      const c = document.createElement('canvas');
      c.width = canvas.width; c.height = canvas.height;
      ring.push(c);
    }
    let ringHead = 0;
    const snapshotRing = () => { const c = ring[ringHead % ringSize]; c.getContext('2d').drawImage(canvas, 0, 0); ringHead++; };
    const ringBack = (k) => ring[(ringHead - 1 - k + ringSize * 4) % ringSize].toDataURL('image/png');
    const shots = {};
    const seen = new Set();
    const events = [...spec.events].sort((a, b) => a.at - b.at);
    let ei = 0;
    let scoreAt = -1;
    let endAt = -1;
    let frames = 0;
    for (let frame = 1; frame <= maxFrames; frame++) {
      while (ei < events.length && events[ei].at === frame) {
        const ev = events[ei++];
        window.dispatchEvent(new KeyboardEvent(ev.type === 'down' ? 'keydown' : 'keyup', { code: ev.key, bubbles: true }));
      }
      window.__step();
      frames = frame;
      snapshotRing();
      for (const [moment, at] of Object.entries(spec.fixed)) if (at === frame) shots[moment] = canvas.toDataURL('image/png');
      for (const type of window.__events.splice(0)) {
        if (type === 'scoreChanged' && !seen.has('score')) { seen.add('score'); scoreAt = frame + 2; }
        if (type === 'gameOver' && !seen.has('impact')) {
          seen.add('impact');
          // The terminal scene is entered the frame the hit-stop (~9 frames)
          // expires; one frame back is the last frozen death tableau — burst,
          // shake and the (by design, still strong) death flash all visible.
          shots.impact = ringBack(1);
          endAt = frame + 30; // 0.5 s later: flash and burst have faded, the terminal screen reads clean
        }
      }
      if (frame === scoreAt) shots.score = canvas.toDataURL('image/png');
      if (frame === endAt) { shots.end = canvas.toDataURL('image/png'); break; }
    }
    return { shots, frames };
  };
})();`;

// --- Helpers ------------------------------------------------------------------

const fixtureNames = readdirSync(VERIFY, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== 'out' && d.name !== 'baseline')
  .map((d) => d.name)
  .sort();

function refreshEngine(name) {
  const dest = resolve(VERIFY, name, 'engine');
  rmSync(dest, { recursive: true, force: true });
  cpSync(TEMPLATE_ENGINE, dest, { recursive: true });
}

function startDevServer(name, port) {
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port)], {
    cwd: resolve(VERIFY, name),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // own process group, so npm AND its vite child can be killed together
  });
  let output = '';
  const ready = new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`dev server for ${name} did not print its readiness line in 20s:\n${output}`)), 20000);
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes(`http://localhost:${port}/`)) {
        clearTimeout(timer);
        res();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      rej(new Error(`dev server for ${name} exited early (${code}):\n${output}`));
    });
  });
  const stop = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ } };
  return { child, ready, stop };
}

const dataUrlToBuffer = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

async function captureFixture(browser, name, port, spec) {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  await page.addInitScript(INIT_SCRIPT);
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
  await page.waitForSelector('canvas', { state: 'attached', timeout: 8000 });
  await page.click('canvas'); // focus, as a player would

  const { shots, frames } = await page.evaluate(
    ([spec, maxFrames, ring]) => window.__run(spec, maxFrames, ring),
    [spec, MAX_FRAMES, RING],
  );
  console.log(`  ${name}: ran ${frames} frames`);

  await page.close();
  if (errors.length) throw new Error(`${name}: runtime errors\n  ${errors.join('\n  ')}`);
  const missing = spec.expects.filter((m) => typeof shots[m] !== 'string');
  if (missing.length) throw new Error(`${name}: script never produced moment(s): ${missing.join(', ')}`);
  return shots;
}

async function buildCompare(browser, captured) {
  const img = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null);
  const rows = [];
  for (const name of fixtureNames) {
    for (const moment of MOMENTS) {
      const cand = img(resolve(OUT, `${name}-${moment}.png`));
      if (!cand) continue;
      rows.push({ name, moment, base: img(resolve(BASELINE, `${name}-${moment}.png`)), cand });
    }
  }
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.setContent(`<body style="margin:0;background:#101014;color:#ddd;font:13px system-ui">
    <div id="grid" style="display:grid;grid-template-columns:150px repeat(3,1fr);gap:6px;padding:8px;align-items:center">
      <div></div><b style="text-align:center">baseline (approved)</b><b style="text-align:center">candidate (working tree)</b><b style="text-align:center">changed pixels</b>
    </div></body>`);
  const stats = await page.evaluate(async (rows) => {
    const grid = document.getElementById('grid');
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    const out = [];
    for (const r of rows) {
      const label = document.createElement('div');
      label.textContent = `${r.name} · ${r.moment}`;
      grid.appendChild(label);
      const cand = await load(r.cand);
      const base = r.base ? await load(r.base) : null;
      const cell = (src) => { const i = document.createElement('img'); i.src = src; i.style.width = '100%'; i.style.imageRendering = 'pixelated'; return i; };
      grid.appendChild(base ? cell(r.base) : Object.assign(document.createElement('div'), { textContent: 'no baseline yet' }));
      grid.appendChild(cell(r.cand));
      const diff = document.createElement('canvas');
      diff.width = cand.width; diff.height = cand.height;
      const dctx = diff.getContext('2d');
      let changed = 0;
      if (base && base.width === cand.width && base.height === cand.height) {
        const c = document.createElement('canvas'); c.width = cand.width; c.height = cand.height;
        const x = c.getContext('2d');
        x.drawImage(base, 0, 0); const a = x.getImageData(0, 0, c.width, c.height).data;
        x.drawImage(cand, 0, 0); const b = x.getImageData(0, 0, c.width, c.height).data;
        const d = dctx.createImageData(c.width, c.height);
        for (let i = 0; i < a.length; i += 4) {
          const same = a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2];
          if (!same) changed++;
          d.data[i] = same ? 20 : 255; d.data[i + 1] = same ? 20 : 60; d.data[i + 2] = same ? 24 : 60; d.data[i + 3] = 255;
        }
        dctx.putImageData(d, 0, 0);
      } else {
        dctx.fillStyle = '#222'; dctx.fillRect(0, 0, diff.width, diff.height);
      }
      diff.style.width = '100%';
      grid.appendChild(diff);
      out.push({ name: r.name, moment: r.moment, hasBase: !!base, pct: base ? (100 * changed) / (cand.width * cand.height) : null });
    }
    return out;
  }, rows);
  const shot = await page.screenshot({ fullPage: true });
  await page.close();
  writeFileSync(resolve(OUT, 'compare.png'), shot);
  return stats;
}

// --- Main ---------------------------------------------------------------------

if (process.argv.includes('--accept')) {
  if (!existsSync(OUT)) { console.error('nothing to accept: run a capture first'); process.exit(1); }
  mkdirSync(BASELINE, { recursive: true });
  let n = 0;
  for (const f of readdirSync(OUT)) {
    if (f === 'compare.png' || !f.endsWith('.png')) continue;
    copyFileSync(resolve(OUT, f), resolve(BASELINE, f));
    n++;
  }
  console.log(`ACCEPTED: ${n} frames promoted to verification/baseline/`);
  process.exit(0);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const servers = [];
let failed = false;
const browser = await chromium.launch();
try {
  const captured = {};
  for (let i = 0; i < fixtureNames.length; i++) {
    const name = fixtureNames[i];
    const spec = FIXTURES[name];
    if (!spec) { console.error(`CAPTURE FAIL: no input script for fixture ${name} in capture.mjs`); failed = true; continue; }
    const port = FIRST_PORT + i;
    refreshEngine(name);
    const server = startDevServer(name, port);
    servers.push(server);
    try {
      await server.ready;
      const shots = await captureFixture(browser, name, port, spec);
      for (const [moment, png] of Object.entries(shots)) {
        writeFileSync(resolve(OUT, `${name}-${moment}.png`), dataUrlToBuffer(png));
      }
      captured[name] = Object.keys(shots);
      console.log(`captured ${name}: ${Object.keys(shots).join(', ')}`);
    } catch (e) {
      failed = true;
      console.error(`CAPTURE FAIL: ${e.message}`);
    } finally {
      server.stop();
    }
  }
  const stats = await buildCompare(browser, captured);
  console.log('\nchanged pixels vs baseline (visual judgement still required — see verification/out/compare.png):');
  for (const s of stats) {
    console.log(`  ${s.name.padEnd(14)} ${s.moment.padEnd(8)} ${s.hasBase ? s.pct.toFixed(2).padStart(6) + ' %' : 'no baseline'}`);
  }
} finally {
  for (const s of servers) s.stop();
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
