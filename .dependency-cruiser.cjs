const HEADLESS = '(^|/)game/(types|data|sim)[.]ts$|(^|/)game/(sim|rules)/';

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      from: { orphan: true, pathNot: '[.]d[.]ts$' },
      to: {},
    },
    {
      name: 'headless-stays-headless',
      severity: 'error',
      from: { path: HEADLESS },
      to: { pathNot: HEADLESS },
    },
    {
      name: 'game-imports-engine-through-barrel',
      severity: 'error',
      from: { path: '(^|/)game/' },
      to: { path: '(^|/)engine/', pathNot: '(^|/)engine/index[.]ts$' },
    },
    {
      name: 'engine-never-imports-game',
      severity: 'error',
      from: { path: '(^|/)engine/' },
      to: { path: '(^|/)game/' },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.mjs', '.js', '.cjs'],
    },
  },
};
