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
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(HARNESS_PORT, resolve);
  });
} catch (e) {
  console.error('HARNESS FAIL:');
  console.error(`  - harness server could not listen on ${HARNESS_PORT}: ${e.message}`);
  process.exit(1);
}

const failures = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => failures.push(`harness pageerror: ${e.message}`));
  await page.goto(`http://localhost:${HARNESS_PORT}/`, { waitUntil: 'load' });

  const frame = page.frames().find((f) => f.url().startsWith('http://localhost:5173'));
  if (!frame) throw new Error('game iframe did not load — is the dev server running on 5173?');
  await frame.waitForSelector('canvas', { state: 'attached', timeout: 8000 });

  // Focus the game frame, then drive it: Space starts (TITLE→PLAYING; button A
  // = Space/Z), P pauses/resumes (the dedicated PAUSE button, P/Escape —
  // deterministic stateChanged), then chase the hazard/pickups with a sweep
  // pattern until gameOver and scoreChanged have both been seen, pressing
  // Space to restart after each game over.
  await page.locator('#game').click();
  const received = () => page.evaluate(() => ({
    types: [...new Set(window.__messages.map((m) => m.type))],
    msgs: window.__messages,
    violations: window.__violations,
  }));

  await page.keyboard.press('Space'); // start (button A)
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyP'); // pause (button PAUSE)
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyP'); // resume
  await page.waitForTimeout(200);

  // Deterministic boustrophedon sweep: cover the arena in horizontal passes
  // spaced <= 6 logical px — the 8px-tall ship then overlaps any 6px pickup
  // whose band it crosses, so a full uninterrupted sweep MUST collect one
  // (scoreChanged). Hazard contact just ends the round (gameOver, also
  // required); restart with Space and sweep again. Break once all three types
  // have been seen. The step-down duration is computed from the reference
  // ship speed (90 px/s) and padded for keyboard/evaluate overhead so the
  // real step stays under 6px — timers alone under-measure the held time.
  const deadline = Date.now() + 150_000;
  const SHIP_SPEED = 90; // logical px/s, matches the reference game
  const STEP_MS = Math.round((4 / SHIP_SPEED) * 1000); // aim ~4px; overhead adds ~1px
  const allSeen = async () => {
    const r = await received();
    return ['gameOver', 'scoreChanged', 'stateChanged'].every((t) => r.types.includes(t));
  };
  const gameOverNow = async () => {
    const r = await received();
    const last = [...r.msgs].reverse().find((m) => m.type === 'stateChanged');
    return last?.payload?.state === 'GAME_OVER';
  };
  // Hold keys for ms; returns true when the sweep should restart (round over)
  // or stop (all types seen). Long holds poll conditions every ~90ms; short
  // holds (the step-down) skip mid-hold polling so evaluate round-trips don't
  // stretch the held time past the coverage budget — they check on release.
  const hold = async (keys, ms) => {
    for (const k of keys) await page.keyboard.down(k);
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const slice = Math.min(90, until - Date.now());
      await page.waitForTimeout(slice);
      if (slice === 90 && ((await allSeen()) || (await gameOverNow()))) break;
    }
    for (const k of keys) await page.keyboard.up(k);
    return (await allSeen()) || (await gameOverNow());
  };
  sweep: while (Date.now() < deadline && !(await allSeen())) {
    if (await gameOverNow()) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(300); // covers the deferred death transition + restart
    }
    // to the top-left corner, then serpentine down (26 rows x ~5px covers the
    // ship's full clamped y-range, a superset of the pickup spawn band)
    if (await hold(['ArrowUp', 'ArrowLeft'], 2200)) continue;
    for (let row = 0; row < 26; row++) {
      const dir = row % 2 === 0 ? 'ArrowRight' : 'ArrowLeft';
      if (await hold([dir], 2700)) continue sweep; // full-width pass
      if (await hold(['ArrowDown'], STEP_MS)) continue sweep;
    }
  }

  const r = await received();
  for (const t of ['stateChanged', 'scoreChanged', 'gameOver']) {
    if (!r.types.includes(t)) failures.push(`never received a '${t}' message (got: ${r.types.join(', ') || 'none'})`);
  }
  // The pause binding (P) must actually work: a PAUSED stateChanged must have
  // arrived — generic stateChanged traffic from TITLE/PLAYING/GAME_OVER must
  // not let a broken pause path pass green.
  if (!r.msgs.some((m) => m.type === 'stateChanged' && m.payload?.state === 'PAUSED'))
    failures.push(`never observed a PAUSED stateChanged — the P pause binding did not register`);
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
