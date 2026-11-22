export type Scene = 'TITLE' | 'PLAYING' | 'PAUSED' | 'GAME_OVER' | 'WIN';

const ALLOWED: Readonly<Record<Scene, readonly Scene[]>> = {
  TITLE: ['PLAYING'],
  PLAYING: ['PAUSED', 'GAME_OVER', 'WIN', 'PLAYING'],
  PAUSED: ['PLAYING', 'TITLE'],
  GAME_OVER: ['TITLE', 'PLAYING'],
  WIN: ['TITLE', 'PLAYING'],
};

export interface SceneMachine {
  readonly current: Scene;
  is(s: Scene): boolean;
  to(s: Scene): boolean;
  onEnter(s: Scene, fn: () => void): void;
}

export interface SceneOptions {
  onIllegal?(from: Scene, to: Scene): void;
}

export function createScenes(initial: Scene = 'TITLE', opts: SceneOptions = {}): SceneMachine {
  let current = initial;
  const enterHandlers = new Map<Scene, (() => void)[]>();

  return {
    get current() {
      return current;
    },
    is(s) {
      return current === s;
    },
    to(s) {
      if (s === current && !ALLOWED[current].includes(s)) {
        return false;
      }
      if (!ALLOWED[current].includes(s)) {
        opts.onIllegal?.(current, s);
        return false;
      }
      current = s;
      const handlers = enterHandlers.get(s);
      if (handlers) {for (const fn of handlers) {fn();}}
      return true;
    },
    onEnter(s, fn) {
      const list = enterHandlers.get(s);
      if (list) {list.push(fn);}
      else {enterHandlers.set(s, [fn]);}
    },
  };
}
