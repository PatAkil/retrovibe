import {
  BUTTON_KEY, controlHints, dimScene, drawFrame, drawLives, drawLogo, drawScore, drawTextCentered, hudText, pulse,
} from '../engine';
import type { Game } from './state';
import { PAL, W } from './theme';
import { renderPreview, renderWorld } from './view';

interface Headline { text: string; color: string }

function renderHints(g: Game): void {
  const { ctx } = g.app.pc;
  const hints = controlHints(g.app.input);
  const lastHint = hints[hints.length - 1];
  if (lastHint !== undefined) {
    drawTextCentered(ctx, lastHint, { width: W, y: 128 }, { color: PAL[13], shadow: true });
  }
  drawTextCentered(ctx, 'ARROWS/WASD MOVE', { width: W, y: 138 }, { color: PAL[13], shadow: true });
}

export function renderTitle(g: Game): void {
  const { ctx } = g.app.pc;
  drawLogo(ctx, 'BRICK BOUNCE', { width: W, y: 26 }, { color: PAL[10], shade: PAL[9], shadow: PAL[1] });
  drawTextCentered(ctx, 'ONE PADDLE. THIRTY-TWO SHELLS.', { width: W, y: 48 }, { color: PAL[6], shadow: true });
  renderPreview(g);
  ctx.save();
  ctx.globalAlpha = 0.45 + 0.55 * pulse(g.clock);
  drawTextCentered(ctx, `${BUTTON_KEY.A.hint} TO LAUNCH`, { width: W, y: 114 }, { color: PAL[10], shadow: true });
  ctx.restore();
  renderHints(g);
}

export function renderPlaying(g: Game): void {
  const { pc } = g.app;
  renderWorld(g);
  drawScore(pc, g.score);
  drawLives(pc, g.lives);
}

export function renderPaused(g: Game): void {
  renderPlaying(g);
  hudText(g.app.pc, 'PAUSED', { h: 'center', v: 'middle' }, { color: PAL[10], scale: 2 });
}

export function renderTerminal(g: Game, headline: Headline): void {
  const { pc } = g.app;
  renderWorld(g);
  dimScene(pc, 0.6);
  drawFrame(pc.ctx, { x: 52, y: 64, w: W - 104, h: 60 }, { color: PAL[5], thickness: 1 });
  drawTextCentered(pc.ctx, headline.text, { width: W, y: 76 }, { color: headline.color, scale: 2 });
  drawTextCentered(pc.ctx, `SCORE ${g.score}`, { width: W, y: 100 }, { color: PAL[7], shadow: true });
  drawTextCentered(pc.ctx, `${BUTTON_KEY.A.hint} RESTART`, { width: W, y: 114 }, { color: PAL[6], shadow: true });
}
