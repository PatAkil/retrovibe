import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { launchBrowser } from '../harness/browser.mjs';
import { buildCompare } from './compare.mjs';
import { FIXTURES, FIXTURE_NAMES, GENERIC_RUN } from './fixtures.mjs';
import { BASELINE, OUT, ROOT, VERIFY, captureFixture, captureRun, dataUrlToBuffer, startDevServer, stopAllServers } from './session.mjs';

const STATUS = resolve(OUT, 'status.json');
const FIRST_PORT = Number(process.env.VG_PORT_BASE) || 5301;
const GAME_PORT = FIRST_PORT + 98;
const LABEL_RE = /^[A-Za-z0-9_-]+$/;
const argv = process.argv.slice(2);

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    const code = signal === 'SIGINT' ? 130 : 143;
    void stopAllServers().finally(() => { process.exit(code); });
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readStatus() {
  try {
    return JSON.parse(readFileSync(STATUS, 'utf8'));
  } catch {
    return null;
  }
}

function accept() {
  const status = readStatus();
  if (!status) {
    fail('nothing to accept: run a capture first');
  }
  if (!status.ok) {
    fail(`refusing to accept: the last capture FAILED (${status.failures.join('; ')})`);
  }
  mkdirSync(BASELINE, { recursive: true });
  const candidates = readdirSync(OUT).filter((f) => f.endsWith('.png') && !f.startsWith('compare') && !f.startsWith('game-compare'));
  for (const f of candidates) {
    copyFileSync(resolve(OUT, f), resolve(BASELINE, f));
  }
  const stale = readdirSync(BASELINE).filter((f) => f.endsWith('.png') && !candidates.includes(f));
  for (const f of stale) {
    unlinkSync(resolve(BASELINE, f));
  }
  console.log(`ACCEPTED: ${candidates.length} frames promoted to verification/baseline/${stale.length ? `, ${stale.length} stale baseline frame(s) removed` : ''}`);
  process.exit(0);
}

function flagValue(flag, offset = 1) {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + offset];
}

function gameTarget() {
  const dir = resolve(ROOT, flagValue('--game') ?? '');
  const allowed = [resolve(ROOT, 'workspace'), VERIFY];
  if (!allowed.some((root) => dir.startsWith(`${root}/`))) {
    fail(`--game: ${dir} is outside workspace/ and verification/ — only game folders under those roots run here`);
  }
  if (!existsSync(resolve(dir, 'game/main.ts'))) {
    fail(`--game: ${dir} is not a game folder (no game/main.ts)`);
  }
  if (dir === resolve(ROOT, 'workspace/game-template')) {
    fail('--game: never run the template in place; clone it first');
  }
  const label = argv.includes('--label') ? flagValue('--label') : 'default';
  if (!LABEL_RE.test(label ?? '')) {
    fail('--label: letters, digits, - and _ only');
  }
  return { dir, label };
}

async function captureGame() {
  const { dir, label } = gameTarget();
  const gameOut = resolve(OUT, 'game', label);
  mkdirSync(gameOut, { recursive: true });
  const name = basename(dir);
  for (const f of readdirSync(gameOut).filter((file) => file.startsWith(`${name}-`))) {
    unlinkSync(resolve(gameOut, f));
  }
  const browser = await launchBrowser();
  const server = startDevServer(dir, GAME_PORT);
  try {
    await server.ready;
    const shots = await captureRun(browser, `game ${name}`, GAME_PORT, GENERIC_RUN);
    for (const [moment, png] of Object.entries(shots)) {
      writeFileSync(resolve(gameOut, `${name}-${moment}.png`), dataUrlToBuffer(png));
    }
    console.log(`frames written to verification/out/game/${label}/${name}-*.png — view them against the rubric; a generated game has no baseline (compare two labels with --compare-games)`);
  } catch (e) {
    console.error(`CAPTURE FAIL: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await server.stop();
    await browser.close();
  }
}

function gameStatLine(st, a, b) {
  if (st.sizeMismatch) {
    return `SIZE MISMATCH (${st.baseSize} vs ${st.candSize})`;
  }
  if (st.hasBase && st.hasCand) {
    return `${st.pct.toFixed(2).padStart(6)} % | ${st.vis.toFixed(2).padStart(6)} %`;
  }
  return st.hasBase ? `only in ${a}` : `only in ${b}`;
}

async function compareGames() {
  const [a, b] = [flagValue('--compare-games'), flagValue('--compare-games', 2)];
  if (!LABEL_RE.test(a ?? '') || !LABEL_RE.test(b ?? '')) {
    fail('--compare-games <labelA> <labelB>: labels may contain letters, digits, - and _ only');
  }
  const dirA = resolve(OUT, 'game', a);
  const dirB = resolve(OUT, 'game', b);
  if (!existsSync(dirA) || !existsSync(dirB)) {
    fail('--compare-games <labelA> <labelB>: both labels must exist under verification/out/game/');
  }
  const names = [...new Set([...readdirSync(dirA), ...readdirSync(dirB)].filter((f) => f.endsWith('.png')))].sort();
  const rows = names.map((f) => ({ name: f.replace(/\.png$/, ''), moment: '', baseFile: resolve(dirA, f), candFile: resolve(dirB, f) }));
  const outFile = resolve(OUT, `game-compare-${a}-vs-${b}.png`);
  const browser = await launchBrowser();
  try {
    const stats = await buildCompare(browser, { rows, outFile, left: a, right: b });
    console.log(`\n${a} | ${b} — any change | visible change. Generated games differ run to run: judge the pattern by LOOKING at verification/out/game-compare-${a}-vs-${b}.png:`);
    for (const st of stats) {
      console.log(`  ${st.name.padEnd(30)} ${gameStatLine(st, a, b)}`);
    }
  } finally {
    await browser.close();
  }
}

function resetOut() {
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT).filter((name) => name !== 'game')) {
    rmSync(resolve(OUT, f), { recursive: true, force: true });
  }
  const unknown = readdirSync(VERIFY, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !['out', 'baseline'].includes(d.name) && !FIXTURES[d.name])
    .map((d) => d.name);
  if (unknown.length) {
    console.warn(`warning: directories under verification/ with no input script in fixtures.mjs are ignored: ${unknown.join(', ')}`);
  }
}

function statCell(s, failures) {
  if (!s.hasCand && s.declared === false) {
    return 'stale — --accept will prune';
  }
  if (!s.hasCand) {
    failures.push(`${s.name}-${s.moment} missing`);
    return 'MISSING';
  }
  if (!s.hasBase) {
    return 'no baseline';
  }
  if (s.sizeMismatch) {
    return `SIZE MISMATCH (${s.baseSize} vs ${s.candSize})`;
  }
  return `${s.pct.toFixed(2).padStart(6)} % | ${s.vis.toFixed(2).padStart(6)} %`;
}

async function captureAll(browser, failures) {
  for (const [i, name] of FIXTURE_NAMES.entries()) {
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
    console.log(`  ${s.name.padEnd(14)} ${s.moment.padEnd(8)} ${statCell(s, failures)}`);
  }
}

async function captureFixtures() {
  resetOut();
  const failures = [];
  const browser = await launchBrowser();
  try {
    await captureAll(browser, failures);
  } finally {
    await browser.close();
  }
  writeFileSync(STATUS, JSON.stringify({ ok: failures.length === 0, failures, at: new Date().toISOString() }));
  if (failures.length) {
    console.error(`\nCAPTURE FAILED: ${failures.join('; ')}`);
  }
  process.exitCode = failures.length ? 1 : 0;
}

if (argv.includes('--accept')) {
  accept();
} else if (argv.includes('--game')) {
  await captureGame();
} else if (argv.includes('--compare-games')) {
  await compareGames();
} else {
  await captureFixtures();
}
