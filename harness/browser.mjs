import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

export const WRAPPER = '/tmp/retrovibe-chromium';

export function chromiumPath() {
  const fromEnv = process.env.CHROMIUM_PATH;
  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv;
  }
  return existsSync(WRAPPER) ? WRAPPER : undefined;
}

export function launchBrowser(options = {}) {
  const executablePath = chromiumPath();
  return chromium.launch(executablePath ? { ...options, executablePath } : options);
}
