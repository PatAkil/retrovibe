// input.ts — unified keyboard input + the A/B/X/Y action model.
//
// Movement: arrows OR WASD → a direction vector.
// Actions: four buttons A/B/X/Y, bound to Z / X / Space / Enter.
// Each game DECLARES its actions in code with a short human label (1-2 words);
// title-screen control hints render from these declarations (see controlHints),
// so a label can never drift from behaviour — change the binding, change the
// label, in one place.
//
// Edges: pressed() (down this frame), held(), released() (up this frame). Call
// endFrame() once per update tick, AFTER reading input, to clear the edges.
// The first keydown fires onFirstKey — the documented audio-unlock point.

export type ButtonName = 'A' | 'B' | 'X' | 'Y';

export interface ActionDecl {
  button: ButtonName;
  /** Short human label for the title-screen hint. One word, two max. */
  label: string;
}

/** Physical key bound to each button (also shown in control hints). */
export const BUTTON_KEY: Readonly<Record<ButtonName, { code: string; hint: string }>> = {
  A: { code: 'KeyZ', hint: 'Z' },
  B: { code: 'KeyX', hint: 'X' },
  X: { code: 'Space', hint: 'SPACE' },
  Y: { code: 'Enter', hint: 'ENTER' },
};

const DIR_KEYS: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 },
};

const CODE_TO_BUTTON: Record<string, ButtonName> = {
  KeyZ: 'A', KeyX: 'B', Space: 'X', Enter: 'Y',
};

// Keys we own — preventDefault so Space/arrows don't scroll the page.
const OWNED = new Set<string>([...Object.keys(DIR_KEYS), ...Object.keys(CODE_TO_BUTTON)]);

export interface Input {
  /** Direction from arrows/WASD; each axis in {-1,0,1}. */
  readonly dir: { x: number; y: number };
  pressed(button: ButtonName): boolean;
  held(button: ButtonName): boolean;
  released(button: ButtonName): boolean;
  readonly actions: ReadonlyArray<ActionDecl>;
  /** Clear per-frame edges. Call once per update tick, after reading input. */
  endFrame(): void;
  dispose(): void;
}

export interface InputOptions {
  /** Fired once, on the very first keydown (used to unlock audio). */
  onFirstKey?: () => void;
  /** Element to attach listeners to (default window). */
  target?: Window | HTMLElement;
}

export function createInput(actions: ActionDecl[], opts: InputOptions = {}): Input {
  const target = opts.target ?? window;
  const down = new Set<string>();
  const justPressed = new Set<ButtonName>();
  const justReleased = new Set<ButtonName>();
  let firstKeySeen = false;

  const onKeyDown = (e: KeyboardEvent): void => {
    if (OWNED.has(e.code)) e.preventDefault();
    if (!firstKeySeen) {
      firstKeySeen = true;
      opts.onFirstKey?.();
    }
    // down.add must run even for e.repeat: after blur clears the set, the OS
    // auto-repeat events that resume on refocus are the only way a still-held
    // key re-registers. Only the pressed() edge stays gated on a real press.
    const button = CODE_TO_BUTTON[e.code];
    if (!e.repeat && button && !down.has(e.code)) justPressed.add(button);
    down.add(e.code);
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    if (OWNED.has(e.code)) e.preventDefault();
    down.delete(e.code);
    const button = CODE_TO_BUTTON[e.code];
    if (button) justReleased.add(button);
  };

  // Losing focus mid-hold would otherwise leave a key "stuck" down forever.
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
      return down.has(BUTTON_KEY[button].code);
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

/**
 * Human-readable control hint lines derived from an Input's action declarations
 * — the single source of truth for the title screen. e.g. ['Z JUMP', 'X FIRE'].
 * Movement is implicit (arrows/WASD) and not included.
 */
export function controlHints(input: Input): string[] {
  return input.actions.map((a) => `${BUTTON_KEY[a.button].hint} ${a.label.toUpperCase()}`);
}
