// engine/index.ts — barrel export. The reference game and all clones import the
// engine from here: `import { createLoop, createInput, ... } from '../engine';`

export { createLoop } from './loop';
export type { GameLoop, LoopCallbacks, LoopOptions } from './loop';

export { createInput, controlHints, BUTTON_KEY } from './input';
export type { Input, InputOptions, ButtonName, ActionDecl } from './input';

export { createScenes } from './scenes';
export type { SceneMachine, Scene } from './scenes';

export {
  createPixelCanvas,
  makeSprite,
  drawSprite,
  drawText,
  drawTextCentered,
  textWidth,
} from './draw';
export type {
  PixelCanvas,
  CreatePixelCanvasOptions,
  Sprite,
  SpriteMap,
  TextOptions,
} from './draw';

export { PICO8, GAMEBOY, DUSK, PALETTES, swapPalette } from './palette';
export type { Palette } from './palette';

export { createParticles } from './particles';
export type { ParticleSystem, ParticleOptions, AmbientPreset, BurstOptions } from './particles';

export { createJuice } from './juice';
export type { Juice } from './juice';

export { createAudio } from './audio';
export type { Audio, Sfx } from './audio';

export { SAFE_MARGIN, drawScore, drawLives, hudText } from './ui';
export type { HudOptions, HAnchor, VAnchor } from './ui';

export { createCrt } from './crt';
export type { Crt, CrtOptions } from './crt';

export { createRuntime } from './runtime';
export type { Runtime, RuntimeOptions, RuntimeMessage, RuntimeMessageType } from './runtime';
