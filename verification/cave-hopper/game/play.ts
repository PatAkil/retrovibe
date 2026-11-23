import { GOAL, SPIKES } from './level';
import { applyGravity, moveAndCollide, tryJump } from './physics';
import type { Game } from './state';
import { centerOf, overlaps, respawn } from './state';
import { H, PAL } from './theme';

function loseLife(g: Game): void {
  const { audio, particles, juice } = g.app;
  const center = centerOf(g.player);
  audio.play('explosion');
  particles.burst(center.x, center.y, { count: 10, color: PAL[4], speed: 140 });
  juice.shake(5, 0.45);
  juice.flash(PAL[4], 0.35, center);
  juice.hitStop(0.15);
  g.lives -= 1;
  g.dying = true;
}

function landingPuff(g: Game): void {
  const { player } = g;
  g.app.particles.burst(player.x + player.w / 2, player.y + player.h, { count: 3, color: PAL[3], speed: 40, life: 0.3 });
  g.app.juice.shake(1, 0.08);
}

function collectCoins(g: Game): void {
  const { runtime, audio, particles } = g.app;
  for (let i = g.coins.length - 1; i >= 0; i--) {
    const c = g.coins[i];
    if (c === undefined || !overlaps(g.player, c)) {
      continue;
    }
    g.coins.splice(i, 1);
    g.score += 10;
    runtime.scoreChanged(g.score);
    audio.play('pickup');
    const center = centerOf(c);
    particles.burst(center.x, center.y, { count: 5, color: PAL[6] });
  }
}

function reachGoal(g: Game): boolean {
  if (!overlaps(g.player, GOAL)) {
    return false;
  }
  g.app.audio.play('pickup');
  g.app.juice.flash(PAL[6], 0.3);
  g.app.scenes.to('WIN');
  return true;
}

function updatePlayer(g: Game, dt: number): void {
  const { player } = g;
  const { input, audio } = g.app;
  if (tryJump(player, input, dt)) {
    audio.play('jump');
  }
  applyGravity(player, input, dt);
  if (moveAndCollide(player, dt)) {
    landingPuff(g);
  }
  collectCoins(g);
  if (reachGoal(g)) {
    return;
  }
  if (player.y > H || SPIKES.some((s) => overlaps(player, s))) {
    loseLife(g);
  }
}

function resolveDeath(g: Game): void {
  if (g.app.juice.frozen) {
    return;
  }
  g.dying = false;
  if (g.lives <= 0) {
    g.app.scenes.to('GAME_OVER');
  } else {
    respawn(g);
  }
}

export function updatePlaying(g: Game, dt: number): void {
  const { input, juice, scenes, audio } = g.app;
  if (g.dying) {
    resolveDeath(g);
    return;
  }
  if (input.pressed('PAUSE')) {
    audio.play('blip');
    scenes.to('PAUSED');
    return;
  }
  if (!juice.frozen) {
    updatePlayer(g, dt);
  }
}
