export type ButtonName = 'A' | 'B' | 'PAUSE';

export interface ActionDecl {
  button: ButtonName;
  label: string;
}

export const BUTTON_KEY: Readonly<Record<ButtonName, { codes: string[]; hint: string }>> = {
  A: { codes: ['Space', 'KeyZ'], hint: 'SPACE' },
  B: { codes: ['KeyX', 'KeyC'], hint: 'X' },
  PAUSE: { codes: ['KeyP', 'Escape'], hint: 'P' },
};
const DIR_KEYS: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 },
};
const CODE_TO_BUTTON: Record<string, ButtonName> = {};
for (const name of Object.keys(BUTTON_KEY) as ButtonName[]) {
  for (const code of BUTTON_KEY[name].codes) {CODE_TO_BUTTON[code] = name;}
}

const OWNED = new Set<string>([...Object.keys(DIR_KEYS), ...Object.keys(CODE_TO_BUTTON)]);
export interface Input {
  readonly dir: { x: number; y: number };
  pressed(button: ButtonName): boolean;
  held(button: ButtonName): boolean;
  released(button: ButtonName): boolean;
  readonly actions: readonly ActionDecl[];
  endFrame(): void;
  dispose(): void;
}
export interface InputOptions {
  onFirstKey?: () => void;
  target?: Window | HTMLElement;
}
export function createInput(actions: ActionDecl[], opts: InputOptions = {}): Input {
  const target = opts.target ?? window;
  const down = new Set<string>();
  const justPressed = new Set<ButtonName>();
  const justReleased = new Set<ButtonName>();
  let firstKeySeen = false;
  const buttonDown = (button: ButtonName): boolean =>
    BUTTON_KEY[button].codes.some((code) => down.has(code));
  const onKeyDown = (e: KeyboardEvent): void => {
    if (OWNED.has(e.code)) {e.preventDefault();}
    if (!firstKeySeen) {
      firstKeySeen = true;
      opts.onFirstKey?.();
    }
    const button = CODE_TO_BUTTON[e.code];
    if (!e.repeat && button && !buttonDown(button)) {justPressed.add(button);}
    down.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    if (OWNED.has(e.code)) {e.preventDefault();}
    down.delete(e.code);
    const button = CODE_TO_BUTTON[e.code];
    if (button && !buttonDown(button)) {justReleased.add(button);}
  };
  const onBlur = (): void => {
    down.clear();
  };
  target.addEventListener('keydown', onKeyDown as EventListener);
  target.addEventListener('keyup', onKeyUp as EventListener);
  window.addEventListener('blur', onBlur);
  return {
    get dir() {
      let x = 0;
      let y = 0;
      for (const code of down) {
        const d = DIR_KEYS[code];
        if (d) {
          x += d.x;
          y += d.y;
        }
      }
      return { x: Math.sign(x), y: Math.sign(y) };
    },
    pressed(button) {
      return justPressed.has(button);
    },
    held(button) {
      return buttonDown(button);
    },
    released(button) {
      return justReleased.has(button);
    },
    actions,
    endFrame() {
      justPressed.clear();
      justReleased.clear();
    },
    dispose() {
      target.removeEventListener('keydown', onKeyDown as EventListener);
      target.removeEventListener('keyup', onKeyUp as EventListener);
      window.removeEventListener('blur', onBlur);
    },
  };
}
export function controlHints(input: Input): string[] {
  return input.actions.map((a) => `${BUTTON_KEY[a.button].hint} ${a.label.toUpperCase()}`);
}