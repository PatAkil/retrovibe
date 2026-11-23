import {
  blink, BUTTON_KEY, controlHints, dimScene, drawFrame, drawLives, drawLogo, drawScore, drawSprite, drawTextCentered,
  frameIndex,
  hudText,
} from '../engine';
import { at } from './lookup';
import { COIN_FRAMES, PLAYER_RIGHT } from './sprites';
import type { Game } from './state';
import { PAL, W } from './theme';
import { drawSlab, renderWorld } from './view';

interface Headline { text: string; color: string }

const breathe = (g: Game, on: string): string => (blink(g.clock, 1.0, 0.6) === 1 ? on : PAL[5]);

export function renderTitle(g: Game): void {
  const { pc, input } = g.app;
  const { ctx } = pc;
  drawLogo(ctx, 'CAVE HOPPER', { width: W, y: 18 }, { color: PAL[6], shade: PAL[5], shadow: PAL[1], scale: 3 });
  drawTextCentered(ctx, 'HOP THE SPIKES  REACH THE FLAG', { width: W, y: 42 }, { color: PAL[5] });
  drawSlab(ctx, { x: 40, y: 104, w: 68, h: 10 });
  drawSprite(ctx, at(PLAYER_RIGHT, frameIndex(g.clock, 3, 2)), { x: 62, y: 80 }, 2);
  drawSprite(ctx, at(COIN_FRAMES, 0), { x: 124, y: 92 }, 2);
  drawTextCentered(ctx, `PRESS ${BUTTON_KEY.A.hint} TO START`, { width: W, y: 118 }, {
    color: breathe(g, PAL[7]), shadow: true,
  });
  const hints = controlHints(input);
  for (const [i, hint] of hints.entries()) {
    drawTextCentered(ctx, hint, { width: W, y: 130 + i * 8 }, { color: PAL[6], shadow: true });
  }
  drawTextCentered(ctx, 'ARROWS/WASD MOVE', { width: W, y: 130 + hints.length * 8 }, { color: PAL[5], shadow: true });
}

export function renderPlaying(g: Game): void {
  const { pc } = g.app;
  renderWorld(g);
  drawScore(pc, g.score);
  drawLives(pc, g.lives);
}

export function renderPaused(g: Game): void {
  renderPlaying(g);
  hudText(g.app.pc, 'PAUSED', { h: 'center', v: 'middle' }, { color: PAL[6], scale: 2 });
}

export function renderTerminal(g: Game, headline: Headline): void {
  const { pc } = g.app;
  renderWorld(g);
  dimScene(pc, 0.6);
  drawFrame(pc.ctx, { x: 52, y: 38, w: 136, h: 62 }, { color: PAL[3], thickness: 1 });
  drawTextCentered(pc.ctx, headline.text, { width: W, y: 48 }, { color: headline.color, scale: 2 });
  drawTextCentered(pc.ctx, `SCORE ${g.score}`, { width: W, y: 72 }, { color: PAL[7], shadow: true });
  drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, { width: W, y: 88 }, {
    color: breathe(g, PAL[6]), shadow: true,
  });
}
