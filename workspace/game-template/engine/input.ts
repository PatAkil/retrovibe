// input.ts — unified keyboard input + the A/B/PAUSE action model.
//
// Movement: arrows OR WASD → a direction vector.
// Actions: two action buttons plus a dedicated pause button, each with key
// aliases:  A (primary) = Space or Z · B (secondary) = X or C ·
// PAUSE = P or Escape. PAUSE is dedicated — never remap it to gameplay.
// (Shift is deliberately NOT a key: five rapid presses opens the OS Sticky
// Keys dialog on Windows, stealing focus mid-game.)
// Each game DECLARES its actions in code with a short human label (1-2 words);
// title-screen control hints render from these declarations (see controlHints),
// so a label can never drift from behaviour — change the binding, change the
// label, in one place.
//
// Edges: pressed() (down this frame), held(), released() (up this frame). Call
// endFrame() once per update tick, AFTER reading input, to clear the edges.
// The first keydown fires onFirstKey — the documented audio-unlock point.

export type ButtonName = 'A' | 'B' | 'PAUSE';

export interface ActionDecl {
  button: ButtonName;
  /** Short human label for the title-screen hint. One word, two max. */
  label: string;
}

/**
 * Physical keys bound to each button (first alias's name is the hint shown in
 * control hints). A logical button is DOWN while at least one of its alias
 * keys is down: pressed() fires on the 0→≥1 transition, released() only on
 * the ≥1→0 transition (last alias key up) — so holding Space and tapping Z
 * neither re-triggers pressed('A') nor fires released('A').
 */
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
  for (const code of BUTTON_KEY[name].codes) CODE_TO_BUTTON[code] = name;
}

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

  const buttonDown = (button: ButtonName): boolean =>
    BUTTON_KEY[button].codes.some((code) => down.has(code));

  const onKeyDown = (e: KeyboardEvent): void => {
    if (OWNED.has(e.code)) e.preventDefault();
    if (!firstKeySeen) {
      firstKeySeen = true;
      opts.onFirstKey?.();
    }
    // down.add must run even for e.repeat: after blur clears the set, the OS
    // auto-repeat events that resume on refocus are the only way a still-held
    // key re-registers. Only the pressed() edge stays gated on a real press —
    // and on the whole button being up (no alias held) before this keydown.
    const button = CODE_TO_BUTTON[e.code];
    if (!e.repeat && button && !buttonDown(button)) justPressed.add(button);
    down.add(e.code);
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    if (OWNED.has(e.code)) e.preventDefault();
    down.delete(e.code);
    // released() only when the LAST alias goes up — a jump held on Space must
    // not be cut by tapping and releasing Z.
    const button = CODE_TO_BUTTON[e.code];
    if (button && !buttonDown(button)) justReleased.add(button);
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

/**
 * Human-readable control hint lines derived from an Input's action declarations
 * — the single source of truth for the title screen. e.g. ['SPACE JUMP', 'X FIRE'].
 * Movement is implicit (arrows/WASD) and not included.
 */
export function controlHints(input: Input): string[] {
  return input.actions.map((a) => `${BUTTON_KEY[a.button].hint} ${a.label.toUpperCase()}`);
}
