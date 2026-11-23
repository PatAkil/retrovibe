import { createLoop } from '../engine';
import { createApp } from './app';
import { wireScenes } from './flow';
import { render, update } from './frame';
import { createGame } from './state';

const g = createGame(createApp());
wireScenes(g);

createLoop({
  update: (dt: number): void => { update(g, dt); },
  render: (): void => { render(g); },
}).start();
