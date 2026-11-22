import { BUTTON_KEY, controlHints, drawFrame, drawLogo, drawSprite, drawTextCentered, hudText, pulse } from '../engine';
import type { Game } from './state';
import { C_ACCENT, C_ACCENT_SHADE, C_BEZEL, C_DIM, C_FAR, C_TEXT, W } from './theme';
import { renderWorld, shipFrame } from './view';

interface Headline { text: string; color: string }

export function renderTitle(g: Game): void {
  const { pc, input } = g.app;
  drawLogo(pc.ctx, 'RETROVIBE', { width: W, y: 16 }, { color: C_ACCENT, shade: C_ACCENT_SHADE, shadow: C_FAR, scale: 3 });
  drawTextCentered(pc.ctx, 'COLLECT + DODGE', { width: W, y: 38 }, { color: C_DIM });
  drawSprite(pc.ctx, shipFrame(g.clock), { x: (W - 64) / 2, y: 46 }, 4);
  drawTextCentered(pc.ctx, `PRESS ${BUTTON_KEY.A.hint}`, { width: W, y: 100 }, {
    color: pulse(g.clock, 1.2) > 0.5 ? C_TEXT : C_DIM, scale: 2,
  });
  const hints = controlHints(input);
  for (const [i, hint] of hints.entries()) {
    drawTextCentered(pc.ctx, hint, { width: W, y: 116 + i * 9 }, { color: C_DIM, shadow: true });
  }
  drawTextCentered(pc.ctx, 'ARROWS/WASD MOVE', { width: W, y: 116 + hints.length * 9 }, { color: C_DIM, shadow: true });
}

export function renderPaused(g: Game): void {
  renderWorld(g);
  hudText(g.app.pc, 'PAUSED', { h: 'center', v: 'middle' }, { color: C_ACCENT, scale: 2 });
}

export function renderTerminal(g: Game, headline: Headline): void {
  const { ctx } = g.app.pc;
  drawFrame(ctx, { x: 44, y: 46, w: W - 88, h: 72 }, { color: C_BEZEL, thickness: 1 });
  drawTextCentered(ctx, headline.text, { width: W, y: 56 }, { color: headline.color, scale: 2 });
  drawTextCentered(ctx, `SCORE ${g.score}`, { width: W, y: 80 }, { color: C_TEXT });
  drawTextCentered(ctx, `${BUTTON_KEY.A.hint} RESTART`, { width: W, y: 100 }, { color: C_DIM });
}
