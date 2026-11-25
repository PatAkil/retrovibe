import { existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, parse, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GAME = join(dirname(fileURLToPath(import.meta.url)), '..');

export function walkUp(rel) {
  let dir = GAME;
  for (;;) {
    const candidate = join(dir, rel);
    if (existsSync(candidate)) {
      return candidate;
    }
    if (dir === parse(dir).root) {
      return null;
    }
    dir = dirname(dir);
  }
}

export function cacheFile(name) {
  const nodeModules = walkUp('node_modules');
  const base = nodeModules ?? join(GAME, 'node_modules');
  const tag = nodeModules === null
    ? basename(GAME)
    : relative(dirname(nodeModules), GAME).replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = join(base, '.cache', 'retrovibe', tag);
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}
