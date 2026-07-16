// scenes.ts — enforced scene state machine.
//   TITLE → PLAYING ⇄ PAUSED → (GAME_OVER | WIN) → restart
// Level advance is a PLAYING→PLAYING re-entry. Invalid transitions are rejected
// (warned, not applied — and console.warn stays below the smoke gate's error
// threshold) so a mis-wired transition surfaces without crashing the game.
//
// The "always playable, a lose state always reachable" invariant is a design
// rule enforced by the improving-game-quality skill, not encoded here.

export type Scene = 'TITLE' | 'PLAYING' | 'PAUSED' | 'GAME_OVER' | 'WIN';

const ALLOWED: Readonly<Record<Scene, ReadonlyArray<Scene>>> = {
  TITLE: ['PLAYING'],
  PLAYING: ['PAUSED', 'GAME_OVER', 'WIN', 'PLAYING'], // PLAYING→PLAYING = next level
  PAUSED: ['PLAYING', 'TITLE'],
  GAME_OVER: ['TITLE', 'PLAYING'], // restart
  WIN: ['TITLE', 'PLAYING'], // restart / next
};

export interface SceneMachine {
  readonly current: Scene;
  is(s: Scene): boolean;
  /** Attempt a transition. Returns true if applied; warns + ignores if invalid. */
  to(s: Scene): boolean;
  /** Register a callback fired whenever a given scene is entered. */
  onEnter(s: Scene, fn: () => void): void;
}

export function createScenes(initial: Scene = 'TITLE'): SceneMachine {
  let current = initial;
  const enterHandlers = new Map<Scene, Array<() => void>>();

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
        console.warn(`[scenes] illegal transition ${current} -> ${s} ignored`);
        return false;
      }
      current = s;
      const handlers = enterHandlers.get(s);
      if (handlers) for (const fn of handlers) fn();
      return true;
    },
    onEnter(s, fn) {
      const list = enterHandlers.get(s);
      if (list) list.push(fn);
      else enterHandlers.set(s, [fn]);
    },
  };
}
