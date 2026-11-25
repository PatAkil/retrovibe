import type { DevDriver, DevFixture, LoopCallbacks, RuntimeMessage, Scene } from '../engine';
import { createDevHook } from '../engine';
import { startPlaying } from './flow';
import { render, update } from './frame';
import { createGame } from './state';
import type { Entity, Game } from './state';

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

const UNSUPPORTED: readonly string[] = [];

function snapshot(g: Game, seed: number | null, messages: readonly RuntimeMessage[]): DevState {
  const { ship, pickup, hazard } = g;
  return {
    scene: g.app.scenes.current, seed, clock: g.clock, score: g.score, best: g.best, beatBest: g.beatBest,
    dying: g.dying, ready: g.ready, ship: { x: ship.x, y: ship.y }, pickup: { x: pickup.x, y: pickup.y },
    hazard: { x: hazard.x, y: hazard.y, vx: hazard.vx, vy: hazard.vy }, pops: g.pops.length, messages: messages.length,
  };
}

function fixtureBuilders(g: Game, driver: DevDriver): Record<DevFixture, () => void> {
  const playing = (): void => {
    startPlaying(g);
    driver.ticksUntil(() => g.ready <= 0);
  };
  const steerOnto = (target: Entity, done: () => boolean): void => {
    driver.ticksUntil(() => {
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
    driver.ticksUntil(() => g.app.scenes.is('GAME_OVER'));
  };
  return {
    title: () => undefined,
    playing,
    paused: () => { playing(); g.app.scenes.to('PAUSED'); },
    gameover: crashed,
    win: () => { scored(); g.app.scenes.to('WIN'); },
  };
}

export function installDevHook(g: Game): LoopCallbacks {
  return createDevHook({
    update: (dt) => { update(g, dt); },
    render: () => { render(g); },
    state: (seed, messages) => snapshot(g, seed, messages),
    setRng: (rng) => { g.rng = rng; },
    reset: () => {
      Object.assign(g, createGame(g.app), { best: 0 });
      g.app.scenes.to('TITLE');
    },
    fixtures: (driver) => {
      const builders = fixtureBuilders(g, driver);
      return {
        title: () => { g.best = 0; builders.title(); },
        playing: () => { g.best = 0; builders.playing(); },
        paused: () => { g.best = 0; builders.paused(); },
        gameover: () => { g.best = 0; builders.gameover(); },
        win: () => { g.best = 0; builders.win(); },
      };
    },
    unsupported: UNSUPPORTED,
  });
}
