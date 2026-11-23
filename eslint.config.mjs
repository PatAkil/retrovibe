import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import local from './tools/eslint-no-comments.mjs';

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
    'process', 'console', 'URL', 'URLSearchParams', 'Buffer', 'fetch', 'performance', 'AbortController',
    'structuredClone', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'queueMicrotask',
  ].map((name) => [name, 'readonly']),
);

const COMMONJS_GLOBALS = { module: 'writable', require: 'readonly', __dirname: 'readonly', __filename: 'readonly' };

const GAME_ROOTS = ['workspace/*', 'verification/*'];

const DEFAULT_PROJECT = [
  '*.js', '*.mjs', '*.cjs', '.*.cjs', 'tools/*.mjs', 'harness/*.mjs', 'verification/*.mjs',
  ...GAME_ROOTS.flatMap((root) => [`${root}/*.mjs`, `${root}/scripts/*.mjs`, `${root}/sim/*.mjs`]),
];

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
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: DEFAULT_PROJECT,
          defaultProject: 'tools/tsconfig.default.json',
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 256,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { local },
    rules: {
      'local/no-comments': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      complexity: ['error', 10],
      'max-depth': ['error', 4],
      'max-params': ['error', 4],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: false }],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: false, IIFEs: true }],
      'max-nested-callbacks': ['error', 3],
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
    },
  },
  {
    files: ['**/game/**/*.ts', '**/engine/**/*.ts'],
    rules: { 'no-console': 'error' },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: NODE_GLOBALS },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-plus-operands': ['error', { allowAny: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowAny: true }],
    },
  },
  {
    files: ['eslint.config.mjs', '.dependency-cruiser.cjs'],
    rules: {
      '@typescript-eslint/naming-convention': ['error',
        { selector: 'default', format: ['camelCase'] },
        { selector: 'import', format: ['camelCase', 'PascalCase'] },
        { selector: 'variable', modifiers: ['const', 'global'], format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'objectLiteralProperty', format: null },
      ],
    },
  },
  {
    files: ['tools/**/*.mjs'],
    rules: {
      '@typescript-eslint/naming-convention': ['error',
        { selector: 'default', format: ['camelCase'] },
        { selector: 'variable', modifiers: ['const', 'global'], format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'objectLiteralProperty', format: ['camelCase'] },
        { selector: 'objectLiteralProperty', modifiers: ['requiresQuotes'], format: null },
        { selector: 'objectLiteralMethod', format: ['camelCase', 'PascalCase'] },
      ],
    },
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
    rules: { '@typescript-eslint/no-require-imports': 'off' },
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
