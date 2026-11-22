import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = import.meta.dirname;
const GAME = relative(ROOT, resolve(ROOT, process.env.GAME ?? 'workspace/game-template')).split('\\').join('/');
const BARREL = join(ROOT, GAME, 'engine', 'index.ts');

const barrelExports = () => {
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

export default {
  ignoreDependencies: ['esbuild'],
  entry: [
    `${GAME}/game/main.ts`,
    `${GAME}/engine/index.ts`,
    `${GAME}/vite.config.ts`,
    `${GAME}/smoke.mjs`,
    `${GAME}/scripts/*.mjs`,
    `${GAME}/sim/*.mjs`,
    'harness/*.mjs',
    'verification/capture.mjs',
    'tools/*.mjs',
    'knip.config.js',
    'CLAUDE.md',
    '.claude/skills/*/SKILL.md',
  ],
  project: [
    `${GAME}/game/**/*.ts`,
    `${GAME}/engine/**/*.ts`,
    `${GAME}/scripts/**/*.mjs`,
    `${GAME}/*.{js,mjs,cjs,ts}`,
    'harness/*.mjs',
    'verification/*.mjs',
    'tools/**/*.mjs',
    '*.{js,mjs,cjs,ts}',
    '.*.cjs',
  ],
  compilers: {
    md: documentedEngineApi,
  },
};
