import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const WRAPPER = '/tmp/retrovibe-chromium';

export function envOr(name, fallback) {
  const value = process.env[name];
  return value !== undefined && value !== '' ? value : fallback;
}

export function launchBrowser() {
  const executablePath = envOr('CHROMIUM_PATH', existsSync(WRAPPER) ? WRAPPER : undefined);
  return chromium.launch(executablePath ? { executablePath } : {});
}

export function waitFrames(page, count) {
  return page.evaluate(
    (n) =>
      new Promise((resolve) => {
        let seen = 0;
        const tick = () => {
          seen += 1;
          if (seen >= n) {
            resolve(seen);
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    count,
  );
}

export function collectErrors(page, errors) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`console.error: ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
}
