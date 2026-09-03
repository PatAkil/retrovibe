// Graphics verification capture — harness code (like harness/verify.mjs and
// the template's smoke.mjs), not a repo helper script. Driven by the
// verifying-graphics skill, which explains the loop; this file only executes it.
//
//   node verification/capture.mjs                  capture every fixture → verification/out/
//   node verification/capture.mjs --accept         promote verification/out/ frames to
//                                                  verification/baseline/ (the approved look)
//   node verification/capture.mjs --game <dir> [--label <tag>]
//                                                  capture ONE arbitrary game folder (e.g. a
//                                                  freshly generated workspace/<name>) with a
//                                                  generic input script — shell / title / play /
//                                                  paused always, plus best-effort score / impact
//                                                  (flash detected by a brightness jump) / end if
//                                                  the sweep reaches them; no baseline. For
//                                                  judging a change to generator GUIDANCE (a
//                                                  skill), where the fixtures cannot see it.
//                                                  Frames go to verification/out/game/<tag>/ and
//                                                  survive fixture captures.
//   node verification/capture.mjs --compare-games <tagA> <tagB>
//                                                  side-by-side composite of two labelled game
//                                                  captures (e.g. base vs candidate branch).
//
// What one fixture run does, per fixture under verification/<name>/:
//   1. Replaces the fixture's engine/ with a fresh copy of
//      workspace/game-template/engine — a fixture can never test a stale engine.
//   2. Starts the fixture's Vite dev server on its own port (5301 + index).
//   3. Drives the game in headless Chromium under a VIRTUAL CLOCK: the page's
//      requestAnimationFrame / performance.now are replaced so the loop is
//      stepped exactly one 1/60 s frame at a time; Math.random is seeded; the
//      AudioContext is stubbed (the engine's noise synth would otherwise burn
//      ~20k seeded draws only on machines where audio happens to be running).
//      The same input script therefore produces the same frames run after run.
//      Only rAF-driven work advances: timers and promises never fire inside a
//      run, so anything the engine drives from setTimeout is invisible here.
//   4. Follows each of the fixture's scripted RUNS (a fresh page load each) and
//      grabs the canvas at fixed MOMENTS — title, play, paused — plus SEMANTIC
//      moments detected from the runtime's `[retrovibe]` console messages:
//      score = 2 frames after the first scoreChanged; impact = the last frozen
//      death-tableau frame (the frame before stateChanged GAME_OVER, from a ring
//      buffer); end = 30 frames after GAME_OVER (flash and burst faded);
//      win = 30 frames after stateChanged WIN. `shell` is a full-page
//      screenshot of the title (the arcade cabinet around the canvas).
//   5. Writes verification/out/<fixture>-<moment>.png and, against
//      verification/baseline/, verification/out/compare.png (baseline |
//      candidate | diff per moment) plus two percentages per moment on stdout:
//      pixels changed at all, and pixels changed VISIBLY (largest channel delta
//      >= 24/255). A global tonal tweak touches most pixels by a little — high
//      "any", low "visible"; a real visual change moves both. Baseline moments
//      with no candidate are listed as MISSING.
//
// Exit code is nonzero when a fixture fails to boot, throws, misses a moment
// its script promises, or reaches a scene the script did not expect — never for
// pixel differences: whether a change LOOKS better is judged by viewing
// compare.png, per the skill. --accept refuses to promote a failed capture.

import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, basename } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VERIFY = resolve(ROOT, 'verification');
const TEMPLATE_ENGINE = resolve(ROOT, 'workspace/game-template/engine');
const OUT = resolve(VERIFY, 'out');
const BASELINE = resolve(VERIFY, 'baseline');
const STATUS = resolve(OUT, 'status.json');
const FIRST_PORT = Number(process.env.VG_PORT_BASE) || 5301; // VG_PORT_BASE lets parallel worktrees capture side by side
const GAME_PORT = FIRST_PORT + 98; // --game, well clear of the fixture range (5399 by default)
const MAX_FRAMES = 60 * 60; // 60 s of virtual time per run, hard stop
const RING = 16; // frames of history kept for the impact (death tableau) shot

// --- Fixture input scripts ----------------------------------------------------
// Frame-indexed key events (engine reads e.code: ArrowLeft/Right/Up/Down, Space,
// KeyP). Each fixture has one or more RUNS; a run names the frames its fixed
// moments are taken at, the semantic moments it promises, and the terminal
// scene it expects (any other terminal scene fails the run). Fixtures are
// frozen, so these scripts stay valid; a fixture change updates its script here.

const hold = (key, from, to) => [{ at: from, key, type: 'down' }, { at: to, key, type: 'up' }];
const tap = (key, at) => hold(key, at, at + 3);
const every = (key, from, to, step) => { const out = []; for (let f = from; f <= to; f += step) out.push(...tap(key, f)); return out; };
// Lawnmower sweep: full-width passes alternating right/left, stepping down a
// little between them, pressing A once per pass — covers a 240x160 arena at
// the template's 90 px/s in ~16 passes (~42 s), meeting whatever is there.
const lawnmower = (from, passes) => {
  const out = [];
  let f = from;
  for (let i = 0; i < passes; i++) {
    out.push(...hold(i % 2 ? 'ArrowLeft' : 'ArrowRight', f, f + 150), ...tap('Space', f + 40));
    f += 150;
    out.push(...hold(i < passes / 2 ? 'ArrowDown' : 'ArrowUp', f, f + 8));
    f += 8;
  }
  return out;
};

const FIXTURES = {
  'space-dodge': {
    runs: [
      {
        fixed: { title: 40, play: 150, paused: 190 },
        shell: 40,
        events: [
          ...tap('Space', 60), // start
          ...hold('ArrowRight', 70, 130),
          ...hold('ArrowUp', 100, 150),
          ...tap('KeyP', 180), // pause → shot at 190
          ...tap('KeyP', 210), // resume
          // Park on the hazard's bounce path (deterministic while no pickup is
          // collected — the parked ship collects none): it arrives ~frame 264 →
          // death tableau (impact) → GAME_OVER (end).
          ...hold('ArrowDown', 220, 256),
        ],
        expects: ['impact', 'end'],
        terminal: 'GAME_OVER',
      },
    ],
  },
  'cave-hopper': {
    runs: [
      {
        fixed: { title: 40, play: 110, paused: 150 },
        shell: 40,
        events: [
          ...tap('Space', 60), // start
          ...hold('ArrowRight', 70, 98), // onto the first coin (score), short of the spikes
          ...tap('KeyP', 140), // pause → shot at 150
          ...tap('KeyP', 170), // resume
          // Walk into the spikes three times (respawn between) → GAME_OVER.
          ...hold('ArrowRight', 180, 620),
        ],
        expects: ['score', 'impact', 'end'],
        terminal: 'GAME_OVER',
      },
      {
        // Platformer physics is RNG-free, so a fixed jump script reaches the flag.
        fixed: {},
        events: [
          ...tap('Space', 60), // start
          ...hold('ArrowRight', 70, 260),
          // Jump frames derived from the recipe's constants (x = 12 + 1.5 px/frame
          // from frame 70; apex 43 px at 0.31 s); each hold outlasts the apex so
          // the release edge cannot cut the jump short.
          ...hold('Space', 80, 102), // jump 1 → first ledge (lands ~x 69)
          ...hold('Space', 120, 142), // jump 2 → second ledge (lands ~x 136)
          ...hold('Space', 166, 188), // jump 3 → top ledge, then walk into the flag
        ],
        expects: ['win'],
        terminal: 'WIN',
      },
    ],
  },
  'brick-bounce': {
    runs: [
      {
        fixed: { title: 40, play: 130, paused: 170 },
        shell: 40,
        events: [
          ...tap('Space', 60), // start
          ...tap('Space', 80), // launch
          ...tap('KeyP', 160), // pause → shot at 170
          ...tap('KeyP', 190), // resume
          // Park the paddle at the left wall; re-serve on a fixed cadence (a
          // press while the ball is live is ignored by the game) until the
          // third lost ball → GAME_OVER. Bricks are struck first → score.
          // Assumes a parked paddle cannot return enough balls to clear all 32
          // bricks: if this run ever ends in WIN, the ball physics moved —
          // re-tune the cadence rather than suspect the instrument.
          ...hold('ArrowLeft', 200, 260),
          ...every('Space', 300, 3500, 45),
        ],
        expects: ['score', 'impact', 'end'],
        terminal: 'GAME_OVER',
      },
    ],
  },
};
const FIXTURE_NAMES = Object.keys(FIXTURES).sort();
const MOMENTS = ['shell', 'title', 'play', 'score', 'paused', 'impact', 'end', 'win'];

// Generic script for --game: a title, a moving frame, a pause, then a long
// sweep of the arena. The sweep is BEST EFFORT: the first scoreChanged gives
// `score`; a sudden jump in frame brightness (a flash) gives `impact` 4 frames
// later; a terminal scene gives `end` — whichever of those the unknown game
// happens to reach. Absent moments are simply not written.
const GENERIC_RUN = {
  fixed: { title: 40, play: 150, paused: 190 },
  shell: 40,
  events: [
    ...tap('Space', 60),
    ...hold('ArrowRight', 70, 130),
    ...hold('ArrowUp', 100, 150),
    ...tap('KeyP', 180),
    ...tap('KeyP', 210),
    ...lawnmower(220, 16),
  ],
  expects: [],
  terminal: null,
  sweepFrom: 220,
  stopAt: 2800,
};

// --- Virtual clock + seeded RNG + audio stub, installed before any page script --

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
  // Audio never "runs" here: the engine gates every sound on ctx.state === 'running',
  // so its noise synth (thousands of Math.random draws) can never touch the seed.
  // The stub is complete enough that unlock() succeeds without throwing and the
  // engine's own \`state === 'running'\` gate is what silences playback.
  const inert = () => { const n = { gain: {}, frequency: {}, connect() { return n; }, disconnect() {}, start() {}, stop() {} }; for (const k of ['gain', 'frequency']) n[k] = { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }; return n; };
  class SilentAudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 48000; this.destination = inert(); }
    resume() { return Promise.resolve(); }
    createGain() { return inert(); }
    createOscillator() { return inert(); }
    createBiquadFilter() { return inert(); }
    createBufferSource() { const n = inert(); n.buffer = null; return n; }
    createBuffer(ch, len) { return { getChannelData() { return new Float32Array(len); } }; }
  }
  window.AudioContext = SilentAudioContext;
  window.webkitAudioContext = SilentAudioContext;
  window.__events = [];
  const log = console.log.bind(console);
  console.log = (...args) => {
    const m = args[1];
    if (args[0] === '[retrovibe]' && m && typeof m === 'object') {
      window.__events.push({ type: m.type, state: m.payload && m.payload.state, won: m.payload && m.payload.won });
    }
    log(...args);
  };
  window.__step = () => {
    now += 1000 / 60;
    const cbs = queue;
    queue = [];
    for (const cb of cbs) cb(now);
  };
  // Run one scripted RUN synchronously: dispatch synthetic key events, step a
  // frame, snapshot moments. A ring of offscreen canvases keeps recent frames
  // so the death tableau can be recovered after the fact; PNG encoding happens
  // only for frames that become moments.
  window.__run = (run, maxFrames, ringSize) => {
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
    const events = [...run.events].sort((a, b) => a.at - b.at);
    let ei = 0;
    let scoreAt = -1;
    let endAt = -1;
    let winAt = -1;
    let impactAt = -1;
    let stopAt = run.stopAt || -1;
    let terminal = null;
    let frames = 0;
    // Brightness sweep (generic --game runs only): a 1/10-scale copy is cheap
    // to read back; a jump in mean luminance marks a full-screen flash.
    const sweepFrom = run.sweepFrom || -1;
    const probe = document.createElement('canvas');
    probe.width = Math.max(1, Math.floor(canvas.width / 10));
    probe.height = Math.max(1, Math.floor(canvas.height / 10));
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    let prevLum = -1;
    const meanLum = () => {
      pctx.drawImage(canvas, 0, 0, probe.width, probe.height);
      const d = pctx.getImageData(0, 0, probe.width, probe.height).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return sum / (d.length / 4) / 255;
    };
    for (let frame = 1; frame <= maxFrames; frame++) {
      while (ei < events.length && events[ei].at === frame) {
        const ev = events[ei++];
        // Once a terminal scene is reached the player is hands-off: a scripted
        // tap must not restart the game before the end/win frame is taken.
        if (terminal && ev.type === 'down') continue;
        window.dispatchEvent(new KeyboardEvent(ev.type === 'down' ? 'keydown' : 'keyup', { code: ev.key, bubbles: true }));
      }
      window.__step();
      frames = frame;
      snapshotRing();
      for (const [moment, at] of Object.entries(run.fixed)) if (at === frame) shots[moment] = canvas.toDataURL('image/png');
      for (const ev of window.__events.splice(0)) {
        if (ev.type === 'scoreChanged' && !seen.has('score')) { seen.add('score'); scoreAt = frame + 2; }
        if (ev.type === 'stateChanged' && (ev.state === 'GAME_OVER' || ev.state === 'WIN') && !terminal) {
          terminal = ev.state;
          if (ev.state === 'GAME_OVER') {
            // The fixtures enter GAME_OVER the frame the hit-stop clears; one
            // frame back is the last frozen death tableau — burst, shake and the
            // (by design, still strong) death flash all visible.
            shots.impact = ringBack(1);
            endAt = frame + 30;
          } else {
            winAt = frame + 30;
          }
        }
      }
      if (sweepFrom > 0 && frame >= sweepFrom && !shots.impact && impactAt < 0) {
        const lum = meanLum();
        if (prevLum >= 0 && lum - prevLum > 0.12) impactAt = frame + 4;
        prevLum = lum;
      }
      if (frame === impactAt && !shots.impact) shots.impact = canvas.toDataURL('image/png');
      if (frame === scoreAt) shots.score = canvas.toDataURL('image/png');
      if (frame === endAt) { shots.end = canvas.toDataURL('image/png'); break; }
      if (frame === winAt) { shots.win = canvas.toDataURL('image/png'); break; }
      if (frame === stopAt) break;
    }
    return { shots, frames, terminal };
  };
})();`;

// --- Helpers ------------------------------------------------------------------

function refreshEngine(dir) {
  const dest = resolve(dir, 'engine');
  rmSync(dest, { recursive: true, force: true });
  cpSync(TEMPLATE_ENGINE, dest, { recursive: true });
}

function startDevServer(dir, port) {
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port)], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // own process group, so npm AND its vite child can be killed together
  });
  let output = '';
  const ready = new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`dev server for ${basename(dir)} did not print its readiness line in 20s:\n${output}`)), 20000);
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
      rej(new Error(`dev server for ${basename(dir)} exited early (${code}):\n${output}`));
    });
  });
  const stop = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ } };
  return { child, ready, stop };
}

const dataUrlToBuffer = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

async function captureRun(browser, label, port, run) {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  await page.addInitScript(INIT_SCRIPT);
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
  await page.waitForSelector('canvas', { state: 'attached', timeout: 8000 });
  await page.click('canvas'); // focus, as a player would

  const shots = {};
  // The shell moment is a real page screenshot (bezel, marquee, hint) at the title.
  if (run.shell !== undefined) {
    await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__step(); }, run.shell);
    shots.shell = 'data:image/png;base64,' + (await page.screenshot({ fullPage: false })).toString('base64');
    // Re-run from a clean load so the scripted frames are unaffected.
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
    await page.waitForSelector('canvas', { state: 'attached', timeout: 8000 });
    await page.click('canvas');
  }

  const { shots: runShots, frames, terminal } = await page.evaluate(
    ([r, maxFrames, ring]) => window.__run(r, maxFrames, ring),
    [run, MAX_FRAMES, RING],
  );
  Object.assign(shots, runShots);
  await page.close();

  if (errors.length) throw new Error(`${label}: runtime errors\n  ${errors.join('\n  ')}`);
  if (run.terminal && terminal !== run.terminal) {
    throw new Error(`${label}: expected the run to end in ${run.terminal} but it ${terminal ? `reached ${terminal}` : `never reached a terminal scene in ${frames} frames`}`);
  }
  const missing = run.expects.filter((m) => typeof shots[m] !== 'string');
  if (missing.length) throw new Error(`${label}: script never produced moment(s): ${missing.join(', ')}`);
  console.log(`  ${label}: ${frames} frames${terminal ? `, ended in ${terminal}` : ''} → ${Object.keys(shots).join(', ')}`);
  return shots;
}

// Declared moments per fixture — what a capture must produce; anything else in
// baseline/ is stale and pruned by --accept rather than failing the run.
function declaredMoments(name) {
  const set = new Set();
  for (const run of FIXTURES[name].runs) {
    for (const m of Object.keys(run.fixed)) set.add(m);
    for (const m of run.expects) set.add(m);
    if (run.shell !== undefined) set.add('shell');
  }
  return set;
}

function fixtureRows() {
  const rows = [];
  const baselineFiles = new Set(existsSync(BASELINE) ? readdirSync(BASELINE) : []);
  for (const name of FIXTURE_NAMES) {
    const declared = declaredMoments(name);
    for (const moment of MOMENTS) {
      const file = `${name}-${moment}.png`;
      const candFile = resolve(OUT, file);
      const baseFile = resolve(BASELINE, file);
      const has = existsSync(candFile) || baselineFiles.has(file);
      if (!has) continue;
      rows.push({ name, moment, baseFile, candFile, declared: declared.has(moment) });
    }
  }
  return rows;
}

async function buildCompare(browser, rowsIn = fixtureRows(), outFile = resolve(OUT, 'compare.png'), leftLabel = 'baseline (approved)', rightLabel = 'candidate (working tree)') {
  const img = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null);
  const rows = rowsIn.map((r) => ({ ...r, base: img(r.baseFile), cand: img(r.candFile) }));
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.setContent(`<body style="margin:0;background:#101014;color:#ddd;font:13px system-ui">
    <div id="grid" style="display:grid;grid-template-columns:150px repeat(3,1fr);gap:6px;padding:8px;align-items:center">
      <div></div><b style="text-align:center">${leftLabel}</b><b style="text-align:center">${rightLabel}</b><b style="text-align:center">changed pixels (dim = subtle, bright = visible)</b>
    </div></body>`);
  const stats = await page.evaluate(async (rows) => {
    const grid = document.getElementById('grid');
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    const cell = (src) => { const i = document.createElement('img'); i.src = src; i.style.width = '100%'; i.style.imageRendering = 'pixelated'; return i; };
    const note = (text) => Object.assign(document.createElement('div'), { textContent: text, style: 'text-align:center;color:#f66' });
    const out = [];
    for (const r of rows) {
      grid.appendChild(Object.assign(document.createElement('div'), { textContent: r.moment ? `${r.name} · ${r.moment}` : r.name }));
      const cand = r.cand ? await load(r.cand) : null;
      const base = r.base ? await load(r.base) : null;
      grid.appendChild(base ? cell(r.base) : note('no baseline yet'));
      grid.appendChild(cand ? cell(r.cand) : note(r.declared === false ? 'stale baseline frame — no longer declared; --accept will prune it' : 'MISSING — the capture produced no frame for this moment'));
      const diff = document.createElement('canvas');
      const ref = cand || base;
      diff.width = ref.width; diff.height = ref.height;
      const dctx = diff.getContext('2d');
      let changed = 0;
      let visible = 0; // pixels whose largest channel delta is >= 24/255 — a change you can see
      if (base && cand && base.width === cand.width && base.height === cand.height) {
        const c = document.createElement('canvas'); c.width = cand.width; c.height = cand.height;
        const x = c.getContext('2d');
        x.drawImage(base, 0, 0); const a = x.getImageData(0, 0, c.width, c.height).data;
        x.drawImage(cand, 0, 0); const b = x.getImageData(0, 0, c.width, c.height).data;
        const d = dctx.createImageData(c.width, c.height);
        for (let i = 0; i < a.length; i += 4) {
          const delta = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
          const same = delta === 0;
          if (!same) changed++;
          const big = delta >= 24;
          if (big) visible++;
          // diff image: untouched = near-black, subtle = dim red, visible = bright red
          d.data[i] = same ? 20 : big ? 255 : 110; d.data[i + 1] = same ? 20 : big ? 60 : 30; d.data[i + 2] = same ? 24 : big ? 60 : 30; d.data[i + 3] = 255;
        }
        dctx.putImageData(d, 0, 0);
      } else {
        dctx.fillStyle = '#222'; dctx.fillRect(0, 0, diff.width, diff.height);
      }
      diff.style.width = '100%';
      grid.appendChild(diff);
      const total = ref.width * ref.height;
      out.push({ name: r.name, moment: r.moment, declared: r.declared, hasBase: !!base, hasCand: !!cand, pct: base && cand ? (100 * changed) / total : null, vis: base && cand ? (100 * visible) / total : null });
    }
    return out;
  }, rows);
  const shot = await page.screenshot({ fullPage: true });
  await page.close();
  writeFileSync(outFile, shot);
  return stats;
}

async function captureFixture(browser, name, port) {
  const dir = resolve(VERIFY, name);
  refreshEngine(dir);
  const server = startDevServer(dir, port);
  try {
    await server.ready;
    const shots = {};
    const runs = FIXTURES[name].runs;
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      const got = await captureRun(browser, `${name}${runs.length > 1 ? ` (run ${r + 1})` : ''}`, port, run);
      // A run contributes only the moments it declares (fixed + expects + shell),
      // so a later run cannot overwrite an earlier run's frame with its own.
      const keep = new Set([...Object.keys(run.fixed), ...run.expects, ...(run.shell !== undefined ? ['shell'] : [])]);
      for (const [moment, png] of Object.entries(got)) if (keep.has(moment)) shots[moment] = png;
    }
    for (const [moment, png] of Object.entries(shots)) writeFileSync(resolve(OUT, `${name}-${moment}.png`), dataUrlToBuffer(png));
  } finally {
    server.stop();
  }
}

// --- Main ---------------------------------------------------------------------

const argv = process.argv.slice(2);

if (argv.includes('--accept')) {
  let status = null;
  try { status = JSON.parse(readFileSync(STATUS, 'utf8')); } catch { /* no capture yet */ }
  if (!status) { console.error('nothing to accept: run a capture first'); process.exit(1); }
  if (!status.ok) { console.error(`refusing to accept: the last capture FAILED (${status.failures.join('; ')})`); process.exit(1); }
  mkdirSync(BASELINE, { recursive: true });
  const candidates = readdirSync(OUT).filter((f) => f.endsWith('.png') && !f.startsWith('compare') && !f.startsWith('game-compare'));
  let promoted = 0;
  for (const f of candidates) { copyFileSync(resolve(OUT, f), resolve(BASELINE, f)); promoted++; }
  let pruned = 0;
  for (const f of readdirSync(BASELINE)) {
    if (f.endsWith('.png') && !candidates.includes(f)) { unlinkSync(resolve(BASELINE, f)); pruned++; }
  }
  console.log(`ACCEPTED: ${promoted} frames promoted to verification/baseline/${pruned ? `, ${pruned} stale baseline frame(s) removed` : ''}`);
  process.exit(0);
}

const gameFlag = argv.indexOf('--game');
if (gameFlag !== -1) {
  const dir = resolve(ROOT, argv[gameFlag + 1] || '');
  const allowed = [resolve(ROOT, 'workspace'), VERIFY];
  if (!allowed.some((root) => dir.startsWith(root + '/'))) { console.error(`--game: ${dir} is outside workspace/ and verification/ — only game folders under those roots run here`); process.exit(1); }
  if (!existsSync(resolve(dir, 'game/main.ts'))) { console.error(`--game: ${dir} is not a game folder (no game/main.ts)`); process.exit(1); }
  if (dir === resolve(ROOT, 'workspace/game-template')) { console.error('--game: never run the template in place; clone it first'); process.exit(1); }
  const labelFlag = argv.indexOf('--label');
  const label = labelFlag !== -1 ? argv[labelFlag + 1] : 'default';
  if (!/^[A-Za-z0-9_-]+$/.test(label || '')) { console.error('--label: letters, digits, - and _ only'); process.exit(1); }
  const gameOut = resolve(OUT, 'game', label);
  mkdirSync(gameOut, { recursive: true });
  const name = basename(dir);
  for (const f of readdirSync(gameOut)) if (f.startsWith(name + '-')) unlinkSync(resolve(gameOut, f));
  const browser = await chromium.launch();
  const server = startDevServer(dir, GAME_PORT);
  try {
    await server.ready;
    const shots = await captureRun(browser, `game ${name}`, GAME_PORT, GENERIC_RUN);
    for (const [moment, png] of Object.entries(shots)) writeFileSync(resolve(gameOut, `${name}-${moment}.png`), dataUrlToBuffer(png));
    console.log(`frames written to verification/out/game/${label}/${name}-*.png — view them against the rubric; a generated game has no baseline (compare two labels with --compare-games)`);
  } catch (e) {
    console.error(`CAPTURE FAIL: ${e.message}`);
    process.exitCode = 1;
  } finally {
    server.stop();
    await browser.close();
  }
} else if (argv.includes('--compare-games')) {
  const i = argv.indexOf('--compare-games');
  const [a, b] = [argv[i + 1], argv[i + 2]];
  const dirA = resolve(OUT, 'game', a || ''), dirB = resolve(OUT, 'game', b || '');
  if (!a || !b || !existsSync(dirA) || !existsSync(dirB)) { console.error('--compare-games <labelA> <labelB>: both labels must exist under verification/out/game/'); process.exit(1); }
  const names = [...new Set([...readdirSync(dirA), ...readdirSync(dirB)].filter((f) => f.endsWith('.png')))].sort();
  const browser = await chromium.launch();
  try {
    const stats = await buildCompare(browser, names.map((f) => ({ name: f.replace(/\.png$/, ''), moment: '', baseFile: resolve(dirA, f), candFile: resolve(dirB, f) })), resolve(OUT, `game-compare-${a}-vs-${b}.png`), a, b);
    console.log(`\n${a} | ${b} — any change | visible change. Generated games differ run to run: judge the pattern by LOOKING at verification/out/game-compare-${a}-vs-${b}.png:`);
    for (const st of stats) console.log(`  ${st.name.padEnd(30)} ${st.hasBase && st.hasCand ? st.pct.toFixed(2).padStart(6) + ' % | ' + st.vis.toFixed(2).padStart(6) + ' %' : st.hasBase ? `only in ${a}` : `only in ${b}`}`);
  } finally {
    await browser.close();
  }
} else {
  // Wipe the last fixture capture but keep out/game/ (labelled --game captures
  // are meant to survive, so two branches' generations can be compared).
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f !== 'game') rmSync(resolve(OUT, f), { recursive: true, force: true });
  const unknown = readdirSync(VERIFY, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !['out', 'baseline'].includes(d.name) && !FIXTURES[d.name])
    .map((d) => d.name);
  if (unknown.length) console.warn(`warning: directories under verification/ with no input script in capture.mjs are ignored: ${unknown.join(', ')}`);

  const failures = [];
  const browser = await chromium.launch();
  try {
    for (let i = 0; i < FIXTURE_NAMES.length; i++) {
      const name = FIXTURE_NAMES[i];
      try {
        await captureFixture(browser, name, FIRST_PORT + i);
      } catch (e) {
        failures.push(e.message.split('\n')[0]);
        console.error(`CAPTURE FAIL: ${e.message}`);
      }
    }
    const stats = await buildCompare(browser);
    console.log('\npixels vs baseline — any change | visible change (channel delta >= 24/255). Judge by LOOKING at verification/out/compare.png:');
    for (const s of stats) {
      let cell;
      if (!s.hasCand && s.declared === false) cell = 'stale — --accept will prune';
      else if (!s.hasCand) { cell = 'MISSING'; failures.push(`${s.name}-${s.moment} missing`); }
      else if (!s.hasBase) cell = 'no baseline';
      else cell = `${s.pct.toFixed(2).padStart(6)} % | ${s.vis.toFixed(2).padStart(6)} %`;
      console.log(`  ${s.name.padEnd(14)} ${s.moment.padEnd(8)} ${cell}`);
    }
  } finally {
    await browser.close();
  }
  writeFileSync(STATUS, JSON.stringify({ ok: failures.length === 0, failures, at: new Date().toISOString() }));
  if (failures.length) console.error(`\nCAPTURE FAILED: ${failures.join('; ')}`);
  process.exitCode = failures.length ? 1 : 0;
}
