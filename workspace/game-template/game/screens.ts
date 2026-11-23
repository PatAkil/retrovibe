import { BUTTON_KEY, controlHints, dimScene, drawFrame, drawLogo, drawSprite, drawTextCentered, hudText } from '../engine';
import type { Game } from './state';
import { C_ACCENT, C_ACCENT_SHADE, C_BEZEL, C_DIM, C_FAR, C_TEXT, W } from './theme';
import { blinkHz, renderWorld, shipFrame } from './view';

interface Headline { text: string; color: string }

const breathe = (g: Game): string => (blinkHz(g.clock, 1.2) ? C_TEXT : C_DIM);

export function renderTitle(g: Game): void {
  const { pc, input } = g.app;
  drawLogo(pc.ctx, 'RETROVIBE', { width: W, y: 16 }, { color: C_ACCENT, shade: C_ACCENT_SHADE, shadow: C_FAR, scale: 3 });
  drawTextCentered(pc.ctx, 'GRAB SPARKS - OUTRUN THE MINE', { width: W, y: 38 }, { color: C_DIM });
  drawSprite(pc.ctx, shipFrame(g.clock), { x: (W - 64) / 2, y: 46 }, 4);
  drawTextCentered(pc.ctx, `PRESS ${BUTTON_KEY.A.hint}`, { width: W, y: 100 }, { color: breathe(g), scale: 2 });
  const hints = controlHints(input);
  const hintOpts = { color: C_DIM, shadow: true };
  for (const [i, hint] of hints.entries()) {
    drawTextCentered(pc.ctx, hint, { width: W, y: 116 + i * 9 }, hintOpts);
  }
  drawTextCentered(pc.ctx, 'ARROWS/WASD MOVE', { width: W, y: 116 + hints.length * 9 }, hintOpts);
}

export function renderPlaying(g: Game): void {
  renderWorld(g);
  if (g.ready > 0) {
    hudText(g.app.pc, 'GET READY', { h: 'center', v: 'middle' }, { color: C_TEXT, scale: 2, plate: false });
  }
}

export function renderPaused(g: Game): void {
  const { pc } = g.app;
  renderWorld(g);
  dimScene(pc, 0.6);
  hudText(pc, 'PAUSED', { h: 'center', v: 'middle' }, { color: C_ACCENT, scale: 2, plate: false });
  drawTextCentered(pc.ctx, `${BUTTON_KEY.PAUSE.hint} RESUME`, { width: W, y: 96 }, { color: C_DIM });
}

function renderBest(g: Game): void {
  if (g.best <= 0) {
    return;
  }
  const text = g.beatBest ? `NEW BEST ${g.best}` : `BEST ${g.best}`;
  drawTextCentered(g.app.pc.ctx, text, { width: W, y: 84 }, { color: g.beatBest ? C_ACCENT : C_DIM });
}

export function renderTerminal(g: Game, headline: Headline): void {
  const { pc } = g.app;
  renderWorld(g);
  dimScene(pc, 0.6);
  drawFrame(pc.ctx, { x: 44, y: 34, w: W - 88, h: 84 }, { color: C_BEZEL, thickness: 1 });
  drawTextCentered(pc.ctx, headline.text, { width: W, y: 44 }, { color: headline.color, scale: 2 });
  drawTextCentered(pc.ctx, `SCORE ${g.score}`, { width: W, y: 70 }, { color: C_TEXT });
  renderBest(g);
  drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, { width: W, y: 106 }, { color: breathe(g) });
}
