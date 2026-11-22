import {
  createPixelCanvas, createInput, createScenes, createParticles, createJuice, createAudio, createCrt, createRuntime,
} from '../engine';
import { H, PAL, W } from './theme';

export function createApp() {
  const pc = createPixelCanvas({ width: W, height: H, scale: 3, parent: document.getElementById('screen') });
  const audio = createAudio();
  const input = createInput(
    [{ button: 'A', label: 'launch' }, { button: 'PAUSE', label: 'pause' }],
    { onFirstKey: () => { audio.unlock(); } },
  );
  const scenes = createScenes();
  const particles = createParticles({ width: W, height: H, ambient: 'bubbles', ambientColor: PAL[5] });
  const juice = createJuice();
  const crt = createCrt();
  const runtime = createRuntime();
  return { pc, audio, input, scenes, particles, juice, crt, runtime };
}

export type App = ReturnType<typeof createApp>;
