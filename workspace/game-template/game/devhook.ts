import type { LoopCallbacks, RuntimeMessage, Scene } from '../engine';
import { startPlaying } from './flow';
import { render, update } from './frame';
import type { Entity, Game, Rng } from './state';

type Action = 'A' | 'B' | 'PAUSE' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type Fixture = 'title' | 'playing' | 'paused' | 'gameover' | 'win';

interface DevState {
  scene: Scene;
  seed: number | null;
  clock: number;
  score: number;
  best: number;
  beatBest: boolean;
  dying: boolean;
  ready: number;
  ship: { x: number; y: number };
  pickup: { x: number; y: number };
  hazard: { x: number; y: number; vx: number; vy: number };
  pops: number;
  messages: number;
}

const FIXTURES: readonly Fixture[] = ['title', 'playing', 'paused', 'gameover', 'win'];
const UNSUPPORTED: string[] = [];
const KEY: Readonly<Record<Action, string>> = {
  A: 'Space', B: 'KeyX', PAUSE: 'KeyP', UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight',
};
const ACTIONS = Object.keys(KEY);
const DT = 1 / 60;
const MAX_FIXTURE_TICKS = 240;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOLD = import.meta.env.DEV && new URLSearchParams(location.search).has('hold');
if (HOLD) {
  Math.random = mulberry32(0x9e3779b9);
}

const isFixture = (raw: string): raw is Fixture => (FIXTURES as readonly string[]).includes(raw);
const isAction = (raw: string): raw is Action => ACTIONS.includes(raw);

function parseFixture(q: URLSearchParams): Fixture | null {
  const raw = q.get('scene');
  if (raw === null || raw === '') {
    return null;
  }
  if (isFixture(raw)) {
    return raw;
  }
  if (UNSUPPORTED.includes(raw)) {
    return null;
  }
  reportError(new Error(`[devhook] unknown scene "${raw}" (supported: ${FIXTURES.join(', ')})`));
  return null;
}

function parseSeed(q: URLSearchParams, fixture: Fixture | null): number | null {
  const seed = Number.parseInt(q.get('seed') ?? '', 10);
  if (Number.isFinite(seed) && seed >= 0) {
    return seed;
  }
  return fixture === null ? null : 1;
}

interface Driver {
  runTick(dt: number): void;
  press(action: string): void;
}

function createDriver(g: Game): Driver {
  const queued: string[] = [];
  const key = (type: 'keydown' | 'keyup', code: string): void => {
    window.dispatchEvent(new KeyboardEvent(type, { code }));
  };
  return {
    runTick(dt) {
      const codes = queued.splice(0);
      for (const code of codes) {
        key('keydown', code);
      }
      update(g, dt);
      for (const code of codes) {
        key('keyup', code);
      }
    },
    press(action) {
      if (!isAction(action)) {
        throw new Error(`unknown action ${action} (supported: ${ACTIONS.join(', ')})`);
      }
      queued.push(KEY[action]);
    },
  };
}

function fixtureBuilders(g: Game, driver: Driver): Record<Fixture, () => void> {
  const ticksUntil = (done: () => boolean): void => {
    for (let i = 0; i < MAX_FIXTURE_TICKS && !done(); i++) {
      driver.runTick(DT);
    }
  };
  const playing = (): void => {
    startPlaying(g);
    ticksUntil(() => g.ready <= 0);
  };
  const steerOnto = (target: Entity, done: () => boolean): void => {
    ticksUntil(() => {
      if (done()) {
        return true;
      }
      Object.assign(g.ship, { x: target.x, y: target.y });
      return false;
    });
  };
  const scored = (): void => {
    playing();
    const goal = g.score + 10;
    steerOnto(g.pickup, () => g.score >= goal);
  };
  const crashed = (): void => {
    scored();
    steerOnto(g.hazard, () => g.dying);
    ticksUntil(() => g.app.scenes.is('GAME_OVER'));
  };
  return {
    title: () => undefined,
    playing,
    paused: () => { playing(); g.app.scenes.to('PAUSED'); },
    gameover: crashed,
    win: () => { scored(); g.app.scenes.to('WIN'); },
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

function snapshot(g: Game, seed: number | null, messages: readonly RuntimeMessage[]): DevState {
  const { ship, pickup, hazard } = g;
  return {
    scene: g.app.scenes.current, seed, clock: g.clock, score: g.score, best: g.best, beatBest: g.beatBest,
    dying: g.dying, ready: g.ready, ship: { x: ship.x, y: ship.y }, pickup: { x: pickup.x, y: pickup.y },
    hazard: { x: hazard.x, y: hazard.y, vx: hazard.vx, vy: hazard.vy }, pops: g.pops.length, messages: messages.length,
  };
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

export function installDevHook(g: Game): LoopCallbacks {
  const q = new URLSearchParams(location.search);
  const fixture = parseFixture(q);
  const seed = parseSeed(q, fixture);
  if (seed !== null) {
    g.rng = mulberry32(seed);
  }
  const messages = recordMessages();
  const driver = createDriver(g);
  if (fixture !== null) {
    g.best = 0;
    preservingStorage(fixtureBuilders(g, driver)[fixture]);
  }
  let manual = HOLD;
  const api = {
    state: (): DevState => snapshot(g, seed, messages),
    step: (n = 1): DevState => {
      manual = true;
      for (let i = 0; i < n; i++) {
        driver.runTick(DT);
      }
      render(g);
      return snapshot(g, seed, messages);
    },
    press: (action: string): void => { driver.press(action); },
    messages,
    unsupported: UNSUPPORTED,
  };
  Object.assign(window, { __retrovibe: api });
  return {
    update: (dt) => {
      if (!manual) {
        driver.runTick(dt);
      }
    },
    render: () => {
      if (!HOLD) {
        render(g);
      }
    },
  };
}
