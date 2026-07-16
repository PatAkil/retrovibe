// Parent-frame postMessage verification — harness code (like smoke.mjs), driven
// by the same headless-Chromium mechanism: asserting *received* messages
// requires executing JS in a real parent page.
//
// Requires a game dev server already running on http://localhost:5173/
// (see the playing-the-game skill). Run:  node harness/verify.mjs
//
// Serves harness/index.html on its own port (6180 — a DIFFERENT origin than
// the game, so delivery is genuinely cross-origin), embeds the game in an
// iframe, drives it via keyboard, and asserts:
//   1. every message from the game matches the pinned envelope
//      { source: 'retrovibe', type: 'gameOver'|'scoreChanged'|'stateChanged', payload }
//      (envelope violations recorded by the page fail the run),
//   2. all three message types are actually received,
//   3. payload shapes: stateChanged {state}, scoreChanged {score}, gameOver {score, won}.
// Exits nonzero on any failure.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HARNESS_PORT = 6180;
const html = readFileSync(fileURLToPath(new URL('./index.html', import.meta.url)));
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(html);
});
await new Promise((resolve) => server.listen(HARNESS_PORT, resolve));

const failures = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => failures.push(`harness pageerror: ${e.message}`));
  await page.goto(`http://localhost:${HARNESS_PORT}/`, { waitUntil: 'load' });

  const frame = page.frames().find((f) => f.url().startsWith('http://localhost:5173'));
  if (!frame) throw new Error('game iframe did not load — is the dev server running on 5173?');
  await frame.waitForSelector('canvas', { state: 'attached', timeout: 8000 });

  // Focus the game frame, then drive it: Z starts (TITLE→PLAYING), Space
  // pauses/resumes (deterministic stateChanged), then chase the hazard/pickups
  // with a sweep pattern until gameOver and scoreChanged have both been seen,
  // pressing Z to restart after each game over.
  await page.locator('#game').click();
  const received = () => page.evaluate(() => ({
    types: [...new Set(window.__messages.map((m) => m.type))],
    msgs: window.__messages,
    violations: window.__violations,
  }));

  await page.keyboard.press('KeyZ'); // start
  await page.waitForTimeout(300);
  await page.keyboard.press('Space'); // pause
  await page.waitForTimeout(200);
  await page.keyboard.press('Space'); // resume
  await page.waitForTimeout(200);

  // Deterministic boustrophedon sweep: cover the arena in horizontal passes
  // 6 logical px apart — the 4px-tall ship overlaps any 3px pickup whose row
  // it crosses, so a full uninterrupted sweep MUST collect one (scoreChanged).
  // Hazard contact just ends the round (gameOver, also required); restart with
  // Z and sweep again. Break as soon as all three types have been seen.
  const deadline = Date.now() + 150_000;
  const allSeen = async () => {
    const r = await received();
    return ['gameOver', 'scoreChanged', 'stateChanged'].every((t) => r.types.includes(t));
  };
  const gameOverNow = async () => {
    const r = await received();
    const last = [...r.msgs].reverse().find((m) => m.type === 'stateChanged');
    return last?.payload?.state === 'GAME_OVER';
  };
  // hold keys for ms, aborting early on game over / completion
  const hold = async (keys, ms) => {
    for (const k of keys) await page.keyboard.down(k);
    const until = Date.now() + ms;
    let aborted = false;
    while (Date.now() < until) {
      await page.waitForTimeout(90);
      if ((await allSeen()) || (await gameOverNow())) { aborted = true; break; }
    }
    for (const k of keys) await page.keyboard.up(k);
    return aborted;
  };
  sweep: while (Date.now() < deadline && !(await allSeen())) {
    if (await gameOverNow()) {
      await page.keyboard.press('KeyZ');
      await page.waitForTimeout(150);
    }
    // to the top-left corner, then serpentine down
    if (await hold(['ArrowUp', 'ArrowLeft'], 2200)) continue;
    for (let row = 0; row < 22; row++) {
      const dir = row % 2 === 0 ? 'ArrowRight' : 'ArrowLeft';
      if (await hold([dir], 2700)) continue sweep; // full-width pass
      if (await hold(['ArrowDown'], 70)) continue sweep; // step down ~6px
    }
  }

  const r = await received();
  for (const t of ['stateChanged', 'scoreChanged', 'gameOver']) {
    if (!r.types.includes(t)) failures.push(`never received a '${t}' message (got: ${r.types.join(', ') || 'none'})`);
  }
  if (r.violations.length > 0) {
    failures.push(`envelope violations: ${JSON.stringify(r.violations.slice(0, 3))}`);
  }
  // Payload shapes
  for (const m of r.msgs) {
    if (m.type === 'stateChanged' && typeof m.payload?.state !== 'string')
      failures.push(`stateChanged payload missing state: ${JSON.stringify(m)}`);
    if (m.type === 'scoreChanged' && typeof m.payload?.score !== 'number')
      failures.push(`scoreChanged payload missing score: ${JSON.stringify(m)}`);
    if (m.type === 'gameOver' && (typeof m.payload?.score !== 'number' || typeof m.payload?.won !== 'boolean'))
      failures.push(`gameOver payload missing score/won: ${JSON.stringify(m)}`);
  }
  if (failures.length === 0) {
    const counts = {};
    for (const m of r.msgs) counts[m.type] = (counts[m.type] || 0) + 1;
    console.log(`HARNESS OK: ${r.msgs.length} messages, all envelopes valid —`, JSON.stringify(counts));
  }
} catch (e) {
  failures.push(e.message);
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error('HARNESS FAIL:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
