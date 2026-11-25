import type { LoopCallbacks } from './loop';
import type { RuntimeMessage } from './runtime';

export type DevAction = 'A' | 'B' | 'PAUSE' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
export type DevFixture = 'title' | 'playing' | 'paused' | 'gameover' | 'win';

export interface DevDriver {
  runTick(dt: number): void;
  press(action: string): void;
  ticksUntil(done: () => boolean, maxTicks?: number): void;
}

export interface DevHookOptions<TState> {
  update: (dt: number) => void;
  render: () => void;
  state: (seed: number | null, messages: readonly RuntimeMessage[]) => TState;
  setRng: (rng: () => number) => void;
  reset?: () => void;
  fixtures: (driver: DevDriver) => Partial<Record<DevFixture, () => void>>;
  unsupported?: readonly string[];
}

const ALL_FIXTURES: readonly DevFixture[] = ['title', 'playing', 'paused', 'gameover', 'win'];
const KEY: Readonly<Record<DevAction, string>> = {
  A: 'Space', B: 'KeyX', PAUSE: 'KeyP', UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight',
};
const ACTIONS = Object.keys(KEY);
const DT = 1 / 60;
const DEFAULT_MAX_TICKS = 240;
const HOLD_SEED = 0x9e3779b9;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isAction = (raw: string): raw is DevAction => ACTIONS.includes(raw);
const isFixture = (raw: string): raw is DevFixture => (ALL_FIXTURES as readonly string[]).includes(raw);

function parseFixture(raw: string | null, unsupported: readonly string[]): DevFixture | null {
  if (raw === null || raw === '') {
    return null;
  }
  if (unsupported.includes(raw)) {
    return null;
  }
  if (isFixture(raw)) {
    return raw;
  }
  const supported = ALL_FIXTURES.filter((f) => !unsupported.includes(f));
  reportError(new Error(`[devhook] unknown scene "${raw}" (supported: ${supported.join(', ')})`));
  return null;
}

function parseSeed(raw: string | null, fixture: DevFixture | null): number | null {
  const seed = Number.parseInt(raw ?? '', 10);
  if (Number.isFinite(seed) && seed >= 0) {
    return seed;
  }
  return fixture === null ? null : 1;
}

function createDriver(update: (dt: number) => void): DevDriver {
  const queued: string[] = [];
  const key = (type: 'keydown' | 'keyup', code: string): void => {
    window.dispatchEvent(new KeyboardEvent(type, { code }));
  };
  const runTick = (dt: number): void => {
    const codes = queued.splice(0);
    for (const code of codes) {
      key('keydown', code);
    }
    update(dt);
    for (const code of codes) {
      key('keyup', code);
    }
  };
  return {
    runTick,
    press(action) {
      if (!isAction(action)) {
        throw new Error(`unknown action ${action} (supported: ${ACTIONS.join(', ')})`);
      }
      queued.push(KEY[action]);
    },
    ticksUntil(done, maxTicks = DEFAULT_MAX_TICKS) {
      for (let i = 0; i < maxTicks && !done(); i++) {
        runTick(DT);
      }
    },
  };
}

function readStorage(): [string, string][] | null {
  try {
    const stored: [string, string][] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = k === null ? null : localStorage.getItem(k);
      if (k !== null && v !== null) {
        stored.push([k, v]);
      }
    }
    return stored;
  } catch {
    return null;
  }
}

function restoreStorage(stored: readonly [string, string][]): void {
  try {
    localStorage.clear();
    for (const [k, v] of stored) {
      localStorage.setItem(k, v);
    }
  } catch {
    return;
  }
}

function preservingStorage(run: () => void): void {
  const stored = readStorage();
  try {
    run();
  } finally {
    if (stored !== null) {
      restoreStorage(stored);
    }
  }
}

function recordMessages(): RuntimeMessage[] {
  const messages: RuntimeMessage[] = [];
  window.addEventListener('retrovibe', (event) => {
    if (event instanceof CustomEvent) {
      messages.push(event.detail as RuntimeMessage);
    }
  });
  return messages;
}

export function createDevHook<TState>(opts: DevHookOptions<TState>): LoopCallbacks {
  const q = new URLSearchParams(location.search);
  const hold = import.meta.env.DEV && q.has('hold');
  if (hold) {
    Math.random = mulberry32(HOLD_SEED);
  }
  const unsupported = opts.unsupported ?? [];
  const messages = recordMessages();
  const driver = createDriver(opts.update);
  const builders = opts.fixtures(driver);
  let activeSeed: number | null = null;
  let manual = hold;

  const applyFixture = (fixture: DevFixture | null, seed: number | null): void => {
    activeSeed = seed;
    if (hold) {
      Math.random = mulberry32(HOLD_SEED);
    }
    if (seed !== null) {
      opts.setRng(mulberry32(seed));
    }
    if (fixture !== null) {
      const build = builders[fixture];
      if (build) {
        preservingStorage(build);
      }
    }
  };

  const initialFixture = parseFixture(q.get('scene'), unsupported);
  applyFixture(initialFixture, parseSeed(q.get('seed'), initialFixture));

  const api = {
    state: (): TState => opts.state(activeSeed, messages),
    step: (n = 1): TState => {
      manual = true;
      for (let i = 0; i < n; i++) {
        driver.runTick(DT);
      }
      opts.render();
      return opts.state(activeSeed, messages);
    },
    press: (action: string): void => { driver.press(action); },
    resetScene: opts.reset
      ? (scene: string, seed = 1): TState => {
          manual = true;
          messages.length = 0;
          opts.reset?.();
          const parsed = parseFixture(scene, unsupported);
          applyFixture(parsed, seed);
          opts.render();
          return opts.state(activeSeed, messages);
        }
      : undefined,
    messages,
    unsupported: [...unsupported],
  };
  Object.assign(window, { __retrovibe: api });
  return {
    update: (dt) => {
      if (!manual) {
        driver.runTick(dt);
      }
    },
    render: () => {
      if (!hold) {
        opts.render();
      }
    },
  };
}
