import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { cacheFile, GAME, walkUp } from './paths.mjs';

const cmd = process.argv[2];
const extra = process.argv.slice(3);

function runBin(name, args) {
  const bin = walkUp(join('node_modules', '.bin', name));
  if (bin === null) {
    console.error(`node_modules/.bin/${name} not found walking up from ${GAME}`);
    process.exit(1);
  }
  const r = spawnSync(bin, args, { cwd: GAME, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

if (cmd === 'check') {
  runBin('tsc', ['--noEmit', '--incremental', '--tsBuildInfoFile', cacheFile('tsbuildinfo'), ...extra]);
} else if (cmd === 'lint') {
  runBin('eslint', ['.', '--cache', '--cache-location', cacheFile('eslintcache'), ...extra]);
} else {
  console.error('usage: node scripts/tool.mjs <check|lint> [...args]');
  process.exit(1);
}
