// Headless runtime smoke check — TEMPLATE CODE (copied per game, like engine/),
// not a repo helper script. Skills only ever run `npm run smoke`.
//
// Drives a real headless Chromium (Playwright, resolved from the shared root
// node_modules by walking up) against the running dev server. A real browser
// executes the page JS, so this can make assertions curl never could:
//   1. the page loads,
//   2. a <canvas> exists in the LIVE DOM after game/main.ts runs (proving the
//      module executed far enough to mount — not just that index.html parsed),
//   3. zero uncaught console.error / pageerror fired.
// Exits nonzero on any failure so it has teeth as a validation gate.
//
// Requires the dev server already running (playing-the-game launches it first):
//   npm run dev &   # then, once "Local: http://localhost:5173/" appears:
//   npm run smoke
import { chromium } from 'playwright';

const URL = process.env.SMOKE_URL || 'http://localhost:5173/';
const errors = [];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  let canvasFound = false;
  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 15000 });
    // The game module creates and mounts the <canvas>. If main.ts throws before
    // that, the selector never appears and this rejects — a real failure.
    await page.waitForSelector('canvas', { state: 'attached', timeout: 8000 });
    canvasFound = true;
    // Let the loop run a few frames so async/runtime errors have time to surface.
    await page.waitForTimeout(700);
  } catch (e) {
    errors.push(`load/canvas: ${e.message}`);
  }

  if (!canvasFound || errors.length > 0) {
    console.error('SMOKE FAIL:');
    if (!canvasFound) console.error('  - no live <canvas> after module ran');
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
  } else {
    console.log('SMOKE OK: canvas live in DOM, zero uncaught errors');
  }
} finally {
  await browser.close();
}
