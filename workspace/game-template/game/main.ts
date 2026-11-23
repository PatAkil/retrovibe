import { createLoop } from '../engine';
import { createApp } from './app';
import { installDevHook } from './devhook';
import { wireScenes } from './flow';
import { render, update } from './frame';
import { createGame } from './state';

const g = createGame(createApp());
wireScenes(g);

const shipped = {
  update: (dt: number): void => { update(g, dt); },
  render: (): void => { render(g); },
};

createLoop(import.meta.env.DEV ? installDevHook(g) : shipped).start();
