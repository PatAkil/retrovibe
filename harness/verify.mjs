import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';
import { received, startAndPause, sweep } from './sweep.mjs';

const HARNESS_PORT = 6180;
const DEFAULT_GAME_URL = 'http://localhost:5173/';
const GAME_URL = new URL(process.env.HARNESS_GAME_URL ?? DEFAULT_GAME_URL).href;
const REQUIRED = ['stateChanged', 'scoreChanged', 'gameOver'];
const template = readFileSync(fileURLToPath(new URL('./index.html', import.meta.url)), 'utf8');
const html = template.replace(DEFAULT_GAME_URL, GAME_URL);

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(HARNESS_PORT, resolve);
  });
}

function payloadProblem(m) {
  const p = m.payload ?? {};
  if (m.type === 'stateChanged' && typeof p.state !== 'string') {
    return 'stateChanged payload missing state';
  }
  if (m.type === 'scoreChanged' && typeof p.score !== 'number') {
    return 'scoreChanged payload missing score';
  }
  if (m.type === 'gameOver' && (typeof p.score !== 'number' || typeof p.won !== 'boolean')) {
    return 'gameOver payload missing score/won';
  }
  return null;
}

function assess(r, failures) {
  for (const t of REQUIRED) {
    if (!r.types.includes(t)) {
      failures.push(`never received a '${t}' message (got: ${r.types.length > 0 ? r.types.join(', ') : 'none'})`);
    }
  }
  if (!r.msgs.some((m) => m.type === 'stateChanged' && m.payload?.state === 'PAUSED')) {
    failures.push('never observed a PAUSED stateChanged — the P pause binding did not register');
  }
  if (r.violations.length > 0) {
    failures.push(`envelope violations: ${JSON.stringify(r.violations.slice(0, 3))}`);
  }
  for (const m of r.msgs) {
    const problem = payloadProblem(m);
    if (problem !== null) {
      failures.push(`${problem}: ${JSON.stringify(m)}`);
    }
  }
}

function countTypes(msgs) {
  const counts = {};
  for (const m of msgs) {
    counts[m.type] = (counts[m.type] ?? 0) + 1;
  }
  return counts;
}

async function drive(browser, failures) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => failures.push(`harness pageerror: ${e.message}`));
  await page.goto(`http://localhost:${HARNESS_PORT}/`, { waitUntil: 'load' });
  const frame = page.frames().find((f) => f.url().startsWith(new URL(GAME_URL).origin));
  if (!frame) {
    throw new Error(`game iframe did not load — is the dev server running on ${GAME_URL}?`);
  }
  await frame.waitForSelector('canvas', { state: 'attached', timeout: 8000 });
  await page.locator('#game').click();
  await startAndPause(page);
  await sweep(page);
  const r = await received(page);
  assess(r, failures);
  if (failures.length === 0) {
    console.log(`HARNESS OK: ${r.msgs.length} messages, all envelopes valid —`, JSON.stringify(countTypes(r.msgs)));
  }
}

async function main() {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  });
  try {
    await listen(server);
  } catch (e) {
    console.error('HARNESS FAIL:');
    console.error(`  - harness server could not listen on ${HARNESS_PORT}: ${e.message}`);
    process.exit(1);
  }
  const failures = [];
  const browser = await launchBrowser();
  try {
    await drive(browser, failures);
  } catch (e) {
    failures.push(e.message);
  } finally {
    await browser.close();
    server.close();
  }
  if (failures.length > 0) {
    console.error('HARNESS FAIL:');
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  }
}

await main();
