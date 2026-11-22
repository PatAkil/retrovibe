import type { Scene } from '../engine';
import type { Game } from './state';
import { resetWorld } from './state';

export function startPlaying(g: Game): void {
  resetWorld(g);
  g.app.scenes.to('PLAYING');
}

function finish(g: Game, state: Scene, won: boolean): void {
  g.app.runtime.stateChanged(state);
  g.app.runtime.gameOver({ score: g.score, won });
}

export function wireScenes(g: Game): void {
  const { scenes, runtime } = g.app;
  for (const scene of ['PLAYING', 'TITLE', 'PAUSED'] as const) {
    scenes.onEnter(scene, () => { runtime.stateChanged(scene); });
  }
  scenes.onEnter('GAME_OVER', () => { finish(g, 'GAME_OVER', false); });
  scenes.onEnter('WIN', () => { finish(g, 'WIN', true); });
}
