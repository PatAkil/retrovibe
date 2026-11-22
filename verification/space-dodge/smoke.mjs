import { collectErrors, envOr, launchBrowser, waitFrames } from './scripts/browser.mjs';

const URL = envOr('SMOKE_URL', 'http://localhost:5173/');
const FRAMES = 40;
const errors = [];

async function probe(page) {
  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 15000 });
    await page.waitForSelector('canvas', { state: 'attached', timeout: 8000 });
  } catch (e) {
    errors.push(`load/canvas: ${e.message}`);
    return false;
  }
  try {
    await waitFrames(page, FRAMES);
  } catch (e) {
    errors.push(`frames: ${e.message}`);
  }
  return true;
}

function report(canvasFound) {
  if (canvasFound && errors.length === 0) {
    console.log('SMOKE OK: canvas live in DOM, zero uncaught errors');
    return;
  }
  console.error('SMOKE FAIL:');
  if (!canvasFound) {
    console.error('  - no live <canvas> after module ran');
  }
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exitCode = 1;
}

const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  collectErrors(page, errors);
  report(await probe(page));
} finally {
  await browser.close();
}
