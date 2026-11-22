import type { Scene } from '../engine';
import { startPlaying } from './flow';
import { updatePlaying } from './play';
import { renderPaused, renderPlaying, renderTerminal, renderTitle } from './screens';
import type { Game, Pop } from './state';
import { C_BG, C_DANGER, C_WIN, H, W } from './theme';
import { renderBackdrop } from './view';

function updatePops(pops: Pop[], dt: number): void {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    if (p === undefined) {
      continue;
    }
    p.life -= dt;
    p.y -= 18 * dt;
    if (p.life <= 0) {
      pops.splice(i, 1);
    }
  }
}

function startOnA(g: Game): void {
  if (g.app.input.pressed('A')) {
    g.app.audio.play('blip');
    startPlaying(g);
  }
}

function resumeOnPause(g: Game): void {
  if (g.app.input.pressed('PAUSE')) {
    g.app.audio.play('blip');
    g.app.scenes.to('PLAYING');
  }
}

const UPDATE_SCENE: Readonly<Record<Scene, (g: Game, dt: number) => void>> = {
  TITLE: startOnA,
  PLAYING: updatePlaying,
  PAUSED: resumeOnPause,
  GAME_OVER: startOnA,
  WIN: startOnA,
};

const RENDER_SCENE: Readonly<Record<Scene, (g: Game) => void>> = {
  TITLE: renderTitle,
  PLAYING: renderPlaying,
  PAUSED: renderPaused,
  GAME_OVER: (g) => { renderTerminal(g, { text: 'GAME OVER', color: C_DANGER }); },
  WIN: (g) => { renderTerminal(g, { text: 'YOU WIN', color: C_WIN }); },
};

export function update(g: Game, dt: number): void {
  const { juice, particles, input, scenes } = g.app;
  g.clock += dt;
  juice.update(dt);
  particles.update(dt);
  updatePops(g.pops, dt);
  UPDATE_SCENE[scenes.current](g, dt);
  input.endFrame();
}

export function render(g: Game): void {
  const { pc, juice, particles, crt, scenes } = g.app;
  pc.clear(C_BG);
  juice.preRender(pc.ctx);
  renderBackdrop(g);
  particles.render(pc.ctx);
  RENDER_SCENE[scenes.current](g);
  juice.postRender(pc.ctx, W, H);
  crt.render(pc.ctx, W, H, 1 / 60);
}
