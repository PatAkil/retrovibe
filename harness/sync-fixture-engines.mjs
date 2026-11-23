import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'workspace', 'game-template', 'engine');
const VERIFICATION = join(ROOT, 'verification');

for (const entry of readdirSync(VERIFICATION, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }
  const dir = join(VERIFICATION, entry.name);
  if (!existsSync(join(dir, 'tsconfig.json'))) {
    continue;
  }
  const target = join(dir, 'engine');
  rmSync(target, { recursive: true, force: true });
  cpSync(SOURCE, target, { recursive: true });
}
