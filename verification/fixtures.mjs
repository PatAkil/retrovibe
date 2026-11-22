const hold = (key, from, to) => [{ at: from, key, type: 'down' }, { at: to, key, type: 'up' }];
const tap = (key, at) => hold(key, at, at + 3);

function every(key, from, to, step) {
  const out = [];
  for (let f = from; f <= to; f += step) {
    out.push(...tap(key, f));
  }
  return out;
}

function lawnmower(from, passes) {
  const out = [];
  let f = from;
  for (let i = 0; i < passes; i++) {
    out.push(...hold(i % 2 ? 'ArrowLeft' : 'ArrowRight', f, f + 150), ...tap('Space', f + 40));
    f += 150;
    out.push(...hold(i < passes / 2 ? 'ArrowDown' : 'ArrowUp', f, f + 8));
    f += 8;
  }
  return out;
}

const SPACE_DODGE = {
  runs: [
    {
      fixed: { title: 40, play: 150, paused: 190 },
      shell: 40,
      events: [
        ...tap('Space', 60),
        ...hold('ArrowRight', 70, 130),
        ...hold('ArrowUp', 100, 150),
        ...tap('KeyP', 180),
        ...tap('KeyP', 210),
        ...hold('ArrowDown', 220, 256),
      ],
      expects: ['impact', 'end'],
      terminal: 'GAME_OVER',
    },
  ],
};

const CAVE_HOPPER = {
  runs: [
    {
      fixed: { title: 40, play: 110, paused: 150 },
      shell: 40,
      events: [
        ...tap('Space', 60),
        ...hold('ArrowRight', 70, 98),
        ...tap('KeyP', 140),
        ...tap('KeyP', 170),
        ...hold('ArrowRight', 180, 620),
      ],
      expects: ['score', 'impact', 'end'],
      terminal: 'GAME_OVER',
    },
    {
      fixed: {},
      events: [
        ...tap('Space', 60),
        ...hold('ArrowRight', 70, 260),
        ...hold('Space', 80, 102),
        ...hold('Space', 120, 142),
        ...hold('Space', 166, 188),
      ],
      expects: ['win'],
      terminal: 'WIN',
    },
  ],
};

const BRICK_BOUNCE = {
  runs: [
    {
      fixed: { title: 40, play: 130, paused: 170 },
      shell: 40,
      events: [
        ...tap('Space', 60),
        ...tap('Space', 80),
        ...tap('KeyP', 160),
        ...tap('KeyP', 190),
        ...hold('ArrowLeft', 200, 260),
        ...every('Space', 300, 3500, 45),
      ],
      expects: ['score', 'impact', 'end'],
      terminal: 'GAME_OVER',
    },
  ],
};

export const FIXTURES = {
  'space-dodge': SPACE_DODGE,
  'cave-hopper': CAVE_HOPPER,
  'brick-bounce': BRICK_BOUNCE,
};
export const FIXTURE_NAMES = Object.keys(FIXTURES).sort();
export const MOMENTS = ['shell', 'title', 'play', 'score', 'paused', 'impact', 'end', 'win'];

export const GENERIC_RUN = {
  fixed: { title: 40, play: 150, paused: 190 },
  shell: 40,
  events: [
    ...tap('Space', 60),
    ...hold('ArrowRight', 70, 130),
    ...hold('ArrowUp', 100, 150),
    ...tap('KeyP', 180),
    ...tap('KeyP', 210),
    ...lawnmower(220, 16),
  ],
  expects: [],
  terminal: null,
  sweepFrom: 220,
  stopAt: 2800,
};

export function runMoments(run) {
  return new Set([...Object.keys(run.fixed), ...run.expects, ...(run.shell !== undefined ? ['shell'] : [])]);
}

export function declaredMoments(name) {
  const set = new Set();
  for (const run of FIXTURES[name].runs) {
    for (const m of runMoments(run)) {
      set.add(m);
    }
  }
  return set;
}
