import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = import.meta.dirname;
const SCOPED = process.env.GAME !== undefined && process.env.GAME !== '';
const GAME = relative(ROOT, resolve(ROOT, SCOPED ? process.env.GAME : 'workspace/game-template')).split('\\').join('/');
const BARREL = join(ROOT, GAME, 'engine', 'index.ts');

let cachedBarrel = null;

const barrelExports = () => {
  if (cachedBarrel !== null) {
    return cachedBarrel;
  }
  const source = readFileSync(BARREL, 'utf8');
  const names = new Set();
  for (const [, list] of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const name of list.split(',')) {
      const trimmed = name.trim();
      if (trimmed) {
        names.add(trimmed);
      }
    }
  }
  cachedBarrel = names;
  return names;
};

const documentedEngineApi = (text, filename) => {
  const exported = barrelExports();
  const cited = new Set();
  const fenced = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(([, code]) => code);
  const prose = text.replace(/```[\s\S]*?```/g, '');
  const inline = [...prose.matchAll(/`([^`\n]+)`/g)].map(([, code]) => code);
  for (const code of [...fenced, ...inline]) {
    for (const [word] of code.matchAll(/[A-Za-z_$][\w$]*/g)) {
      if (exported.has(word)) {
        cited.add(word);
      }
    }
  }
  if (cited.size === 0) {
    return '';
  }
  const specifier = relative(dirname(filename), BARREL).replace(/\.ts$/, '');
  const path = specifier.startsWith('.') ? specifier : `./${specifier}`;
  return `import { ${[...cited].sort().join(', ')} } from '${path}';\n`;
};

const GAME_ENTRY = [
  `${GAME}/game/main.ts`,
  `${GAME}/game/sim.ts`,
  `${GAME}/engine/index.ts`,
  `${GAME}/vite.config.ts`,
  `${GAME}/smoke.mjs`,
  `${GAME}/scripts/*.mjs`,
  `${GAME}/sim/*.mjs`,
  'CLAUDE.md',
  '.claude/skills/*/SKILL.md',
];

const REPO_ENTRY = [
  'harness/*.mjs',
  'verification/capture.mjs',
  'tools/*.mjs',
  'knip.config.js',
];

const GAME_PROJECT = [
  `${GAME}/game/**/*.ts`,
  `${GAME}/engine/**/*.ts`,
  `${GAME}/scripts/**/*.mjs`,
  `${GAME}/*.{js,mjs,cjs,ts}`,
];

const REPO_PROJECT = [
  'harness/*.mjs',
  'verification/*.mjs',
  'tools/**/*.mjs',
  '*.{js,mjs,cjs,ts}',
  '.*.cjs',
];

export default {
  ignoreDependencies: ['esbuild'],
  entry: SCOPED ? GAME_ENTRY : [...GAME_ENTRY, ...REPO_ENTRY],
  project: SCOPED ? GAME_PROJECT : [...GAME_PROJECT, ...REPO_PROJECT],
  ...(SCOPED ? { exclude: ['dependencies', 'devDependencies', 'binaries'] } : {}),
  compilers: {
    md: documentedEngineApi,
  },
};
