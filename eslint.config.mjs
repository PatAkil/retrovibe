import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import local from './tools/eslint-no-comments.mjs';

const FAST_LINT = process.env.RETROVIBE_FAST_LINT === '1';

const HEADLESS = [
  '**/game/types.ts', '**/game/data.ts', '**/game/sim.ts', '**/game/sim/**/*.ts', '**/game/rules/**/*.ts',
];

const DOM_GLOBALS = [
  'window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location', 'performance',
  'requestAnimationFrame', 'cancelAnimationFrame', 'AudioContext', 'Image', 'HTMLCanvasElement',
  'CanvasRenderingContext2D', 'addEventListener', 'removeEventListener',
];

const DOM_KEY_CODE = '^(Arrow(Left|Right|Up|Down)|Key[A-Z]|Digit[0-9]|Numpad[0-9]|Space|Enter|Escape|Tab|Backspace|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right))$';

const NODE_GLOBALS = Object.fromEntries(
  [
    'process', 'console', 'URL', 'URLSearchParams', 'Buffer', 'fetch', 'performance', 'AbortController', 'AbortSignal',
    'structuredClone', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'queueMicrotask',
  ].map((name) => [name, 'readonly']),
);

const COMMONJS_GLOBALS = { module: 'writable', require: 'readonly', __dirname: 'readonly', __filename: 'readonly' };

const CORE_RULES = {
  'local/no-comments': 'error',
  eqeqeq: ['error', 'always'],
  curly: ['error', 'all'],
  complexity: ['error', 10],
  'max-depth': ['error', 4],
  'max-params': ['error', 4],
  'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: false }],
  'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: false, IIFEs: true }],
  'max-nested-callbacks': ['error', 3],
};

const TS_TYPE_RULES = {
  '@typescript-eslint/restrict-template-expressions': ['error', {
    allowNumber: true,
    allowAny: false,
    allowBoolean: false,
    allowNullish: false,
    allowRegExp: false,
    allowNever: false,
    allowArray: false,
  }],
  '@typescript-eslint/naming-convention': ['error',
    { selector: 'default', format: ['camelCase'] },
    { selector: 'import', format: ['camelCase', 'PascalCase'] },
    { selector: 'variable', format: ['camelCase'] },
    { selector: 'variable', modifiers: ['const', 'global'], format: ['camelCase', 'UPPER_CASE'] },
    { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
    { selector: 'typeLike', format: ['PascalCase'] },
    { selector: 'enumMember', format: ['PascalCase', 'UPPER_CASE'] },
    { selector: ['objectLiteralProperty', 'objectLiteralMethod', 'typeProperty'], format: ['camelCase', 'UPPER_CASE'] },
    { selector: ['objectLiteralProperty', 'objectLiteralMethod', 'typeProperty'], modifiers: ['requiresQuotes'], format: null },
    { selector: 'objectLiteralProperty', filter: { regex: DOM_KEY_CODE, match: true }, format: null },
    { selector: ['typeProperty', 'objectLiteralProperty'], filter: { regex: '^__retrovibe$', match: true }, format: null },
  ],
};

const TS_CONFIG = FAST_LINT
  ? {
      files: ['**/*.ts'],
      extends: [tseslint.configs.recommended],
    }
  : {
      files: ['**/*.ts'],
      extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: import.meta.dirname,
        },
      },
      rules: TS_TYPE_RULES,
    };

export default defineConfig(
  {
    ignores: [
      '**/dist/**', '**/node_modules/**', '**/.vite/**', '.claude/worktrees/**',
      'verification/out/**', 'verification/baseline/**', 'verification/*/engine/**',
    ],
  },
  {
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
  },
  js.configs.recommended,
  {
    plugins: { local },
    rules: CORE_RULES,
  },
  TS_CONFIG,
  {
    files: ['**/game/**/*.ts', '**/engine/**/*.ts'],
    rules: { 'no-console': 'error' },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: NODE_GLOBALS },
  },
  {
    files: ['**/smoke.mjs', '**/scripts/**/*.mjs', 'harness/**/*.mjs', 'verification/*.mjs'],
    languageOptions: {
      globals: { window: 'readonly', document: 'readonly', requestAnimationFrame: 'readonly' },
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...NODE_GLOBALS, ...COMMONJS_GLOBALS } },
  },
  {
    files: ['**/game/**/*.ts'],
    ignores: HEADLESS,
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['**/engine/*'], message: 'Game code imports the engine only through its barrel: ../engine.' }],
      }],
    },
  },
  {
    files: HEADLESS,
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/engine', '**/engine/**'], message: 'Headless rules never import the engine.' },
          { group: ['**/main', '**/sprites'], message: 'Headless rules never import presentation modules.' },
        ],
      }],
      'no-restricted-globals': ['error', ...DOM_GLOBALS.map((name) => ({
        name,
        message: 'Headless rules stay DOM-free so the simulator can bundle them.',
      }))],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Headless rules take an injected rng.' }],
    },
  },
  {
    files: ['**/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['**/game', '**/game/**'], message: 'The engine never imports game code.' }],
      }],
    },
  },
);
