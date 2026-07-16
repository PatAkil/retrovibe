// ui.ts — HUD helpers that keep score/lives/text a safe distance from the
// viewport edges. SAFE_MARGIN is the single enforced inset; readability rules
// live in the improving-game-quality skill.

import type { PixelCanvas } from './draw';
import { drawText, textWidth } from './draw';

/** Logical-pixel inset all HUD elements keep from the screen edge. */
export const SAFE_MARGIN = 8;

export interface HudOptions {
  color?: string;
  scale?: number;
}

/** Score, anchored inside the top-left safe corner. */
export function drawScore(pc: PixelCanvas, score: number, opts: HudOptions = {}): void {
  drawText(pc.ctx, `SCORE ${score}`, SAFE_MARGIN, SAFE_MARGIN, {
    color: opts.color ?? '#FFF1E8',
    scale: opts.scale ?? 1,
  });
}

/** Lives, anchored inside the top-right safe corner. */
export function drawLives(pc: PixelCanvas, lives: number, opts: HudOptions = {}): void {
  const scale = opts.scale ?? 1;
  const text = `LIVES ${lives}`;
  const x = pc.width - SAFE_MARGIN - textWidth(text, scale);
  drawText(pc.ctx, text, x, SAFE_MARGIN, { color: opts.color ?? '#FFF1E8', scale });
}

export type HAnchor = 'left' | 'center' | 'right';
export type VAnchor = 'top' | 'middle' | 'bottom';

/**
 * Draw HUD text anchored to a screen edge/corner, always inside SAFE_MARGIN.
 *   hudText(pc, 'PAUSED', 'center', 'middle')
 */
export function hudText(
  pc: PixelCanvas,
  text: string,
  h: HAnchor,
  v: VAnchor,
  opts: HudOptions = {},
): void {
  const scale = opts.scale ?? 1;
  const w = textWidth(text, scale);
  const glyphH = 5 * scale;
  let x: number;
  if (h === 'left') x = SAFE_MARGIN;
  else if (h === 'right') x = pc.width - SAFE_MARGIN - w;
  else x = Math.round((pc.width - w) / 2);
  let y: number;
  if (v === 'top') y = SAFE_MARGIN;
  else if (v === 'bottom') y = pc.height - SAFE_MARGIN - glyphH;
  else y = Math.round((pc.height - glyphH) / 2);
  drawText(pc.ctx, text, x, y, { color: opts.color ?? '#FFF1E8', scale });
}
