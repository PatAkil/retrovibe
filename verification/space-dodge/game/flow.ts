import type { Game } from './state';
import { resetWorld } from './state';

export function startPlaying(g: Game): void {
  resetWorld(g);
  g.app.scenes.to('PLAYING');
}

export function wireScenes(g: Game): void {
  const { scenes, runtime } = g.app;
  for (const scene of ['PLAYING', 'TITLE', 'PAUSED'] as const) {
    scenes.onEnter(scene, () => { runtime.stateChanged(scene); });
  }
  scenes.onEnter('GAME_OVER', () => {
    runtime.stateChanged('GAME_OVER');
    runtime.gameOver({ score: g.score, won: false });
  });
}
