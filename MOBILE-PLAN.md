# Retrovibe — Mobile Play Plan

Goal: every game created from chat is playable on a phone in the browser,
with touch, **without any per-game work**. Games keep reading `input.dir`
and `pressed/held/released('A'|'B'|'PAUSE')`; the engine grows a touch source
that feeds the same abstraction. One change in the template, every future
game inherits it.

Status: ☐ open · ☑ done

---

## Why this is small

The input contract already hides the keyboard behind a direction vector and
three logical buttons (`engine/input.ts`). Nothing in a game knows about
key codes except the hint strings (`BUTTON_KEY.<b>.hint`, `controlHints`).
So mobile support is three things: the shell has to fit a phone, the engine
needs a touch source for those same three buttons plus a direction, and the
hint strings have to say the right thing on a touch device. Everything else
(audio unlock, auto-pause, scenes, host messaging) already works on mobile
as is: `visibilitychange` pauses the loop when the phone locks or switches
apps, and `audio.unlock()` only needs a user gesture — a tap is one.

Deliberately out of scope (keep it simple): gamepad API, fullscreen API,
PWA/home-screen install, haptics, swipe gestures, per-game control layouts,
deploy/hosting. Each is a later, separate item.

---

## ☐ M1. The shell fits a phone (`index.html` only)

Today the cabinet has fixed padding (`20px` + `18px` bezel), a hint that
says "click the screen & press a key", and the canvas is CSS-shrunk with
`max-width:100%`. On a 390-px-wide phone that yields a ~300-px game with a
keyboard prompt nobody can act on.

Changes, all CSS/markup in the template's `index.html`:

- Viewport meta gains `viewport-fit=cover`; the cabinet pads with
  `env(safe-area-inset-*)` so the notch/home bar never covers a button.
- `@media (max-width: 600px)`: cabinet padding → 8 px, bezel padding →
  6 px, marquee → 11 px, `max-height` of the bezel → `60vh` in portrait
  (leaves room for the controls below, see M2).
- `touch-action: none` and `user-select: none` on `#cabinet`, plus
  `-webkit-tap-highlight-color: transparent` and a `contextmenu` listener
  that calls `preventDefault()` — stops pull-to-refresh, double-tap zoom,
  long-press menus and text selection while thumbing the controls.
- The `#hint` line reads from a `pointer: coarse` media query: "tap the
  screen to start" on touch devices, the current text elsewhere.
- Add a `#controls` mount div below `#bezel` (empty; M2 fills it). It has
  `display:none` unless the touch source is active, so desktop is
  pixel-identical.

Acceptance: open `http://<laptop-ip>:5173` on a phone (see M4) — the title
screen fills the width, nothing scrolls, nothing zooms on double-tap.

## ☐ M2. Touch source in the engine (`engine/input.ts`)

The core piece. `createInput` gains an opt-in-by-default touch overlay:

```ts
export interface InputOptions {
  onFirstKey?: () => void;
  target?: Window | HTMLElement;
  /** 'auto' (default): overlay on coarse-pointer devices or after the first
   *  touch event. true/false force it. */
  touch?: 'auto' | boolean;
  /** Where the overlay mounts (default: #controls, else document.body). */
  touchMount?: HTMLElement | null;
}
```

Behaviour:

- **Buttons.** The overlay builds DOM buttons (not canvas art): a floating
  joystick zone on the left, `A` and `B` on the right, a small `PAUSE`
  at the top. Pointer events (`pointerdown/move/up/cancel`) with
  `setPointerCapture`, so a thumb sliding off a button still releases it.
  Multi-touch works for free: one pointer per thumb.
- **Same edge semantics.** A virtual button is one more alias of the logical
  button: `buttonDown()` becomes "any key alias down OR the virtual button
  down". `pressed()` fires on the 0→≥1 transition, `released()` on the
  ≥1→0, exactly as for keys — holding Space and tapping the on-screen A
  neither re-triggers `pressed('A')` nor fires `released('A')`. This is
  what keeps variable-height jumps (`released('A')`) working untouched.
- **Direction.** The joystick zone is a floating stick: direction = offset
  from the touch-start point, dead zone 12 px, each axis snapped to
  `-1|0|1` (8-way, matching the keyboard). `input.dir` sums keyboard and
  stick, then `Math.sign`s per axis, so both sources coexist on an iPad
  with a keyboard.
- **Labels come from the declarations.** The `A`/`B` buttons render the
  action label from `input.actions` (`'START'`, `'JUMP'`, `'FIRE'`) under
  the letter. This keeps the single-source-of-truth rule: change the
  declaration, the on-screen button changes. Buttons with no declared
  action are still shown (dimmed) so the layout never shifts between
  scenes.
- **Hints.** On a touch device `BUTTON_KEY.A.hint`/`B.hint`/`PAUSE.hint`
  become `'A'`, `'B'`, `'PAUSE'` at module load (the objects are already
  mutable at runtime; the `Readonly` wrapper only guards the record). So
  the existing `` `PRESS ${BUTTON_KEY.A.hint}` `` and `controlHints()` output
  read "PRESS A", "A START" with zero game edits. A new export
  `MOVE_HINT` (`'ARROWS/WASD MOVE'` or `'STICK MOVES'`) replaces the one
  hand-written movement line in the reference game.
- **Audio unlock.** `onFirstKey` also fires on the first `pointerdown`
  *and* first `pointerup` (`unlock()` is idempotent). iOS historically only
  honours the gesture on the release event; firing on both costs nothing.
- **Blur.** The existing `blur` handler clears keys; it clears virtual
  buttons and the stick too, so backgrounding the app mid-hold can't leave
  a button stuck.
- `dispose()` removes the overlay.

Styling for the overlay lives inside `input.ts` (one injected `<style>`
tag, scoped under `#controls`): translucent dark circles, palette-neutral,
so the arcade look is not disturbed. Layout by orientation:

| Orientation | Layout |
|---|---|
| Portrait (default) | Controls in a bar **below** the screen, Game Boy style. Nothing covers the game; the HUD corners stay visible. |
| Landscape | Not enough height for a bar. The overlay becomes `position:fixed`, stick bottom-left, A/B bottom-right, 45 % opacity, over the cabinet chrome rather than the canvas where possible. |

Reference game (`game/main.ts`): swap the one hand-written
`'ARROWS/WASD MOVE'` for `MOVE_HINT`. That is the only game-code change.

Acceptance: on a phone, the reference game starts from the on-screen A,
the ship moves with the stick, pause/resume works, the title reads
"PRESS A" / "A START" / "STICK MOVES". On desktop nothing changes.

## ☐ M3. Gates stay honest

- **`npm run check`** — the touch code is plain TypeScript, no new deps.
- **Smoke gate** (`smoke.mjs`): add a second, mobile pass in the same run —
  `browser.newContext({ hasTouch: true, isMobile: true, viewport: {width: 390, height: 844} })`,
  load, `page.tap('#controls [data-button=A]')`, and assert the runtime
  posted a `TITLE → PLAYING` state message and no console errors. The
  desktop pass is untouched. One extra second per run.
- **verifying-graphics**: this is a change under `workspace/game-template/`,
  so the fixture loop runs. Expected result is **byte-identical frames**
  (the overlay is DOM, the canvas is not touched, hints only change on
  coarse-pointer devices and the capture context is not one). A non-zero
  diff is a bug, not a new baseline.
- **Frame rate on a real phone**: the CRT pass draws the frame three extra
  times per frame (halation ×2, lift, scanlines). At 720×480 backing store
  this should hold 60 Hz on any phone from the last five years. Check once
  with Safari/Chrome's FPS meter on a mid-range device. If it drops, the
  fix is `createCrt({ halation: 0 })` on coarse-pointer devices — one
  line, only if measured.

## ☐ M4. Reaching the phone during the create → play loop

The dev server binds to localhost. Add to **playing-the-game** step 2:

```bash
cd workspace/<game-name> && npm run dev -- --host
```

Vite then also prints a `Network:` line (`http://192.168.x.x:5173/`);
report that URL alongside the local one so the user can open it on a phone
on the same Wi-Fi. The readiness poll still watches for `Local:` — that line
is unchanged. `--host` is a Vite flag, not a helper script, and needs no
`vite.config.ts` change. Note: from a remote container the phone cannot
reach the server; this is for local runs.

## ☐ M5. Docs and skills (one paragraph each)

- **CLAUDE.md** engine table, `input.ts` row: mention the touch overlay,
  `MOVE_HINT`, and that hints flip to `A`/`B`/`PAUSE` on coarse pointers.
- **handling-user-input**: a "Touch" section — games never add touch
  listeners; declarations label the on-screen buttons; use `MOVE_HINT`, not
  a hand-written movement line.
- **playing-the-game**: the `--host` flag and the Network URL (M4).
- **improving-game-quality**: one checklist item — "tap-only start: the
  title's `A` must be enough to begin; no game may require a key that has
  no on-screen button".
- **iterating-on-a-game**: how an *existing* game picks this up. Games
  carry their own engine copy, so older clones don't change by themselves.
  Recipe: `cp -r workspace/game-template/engine/. workspace/<name>/engine/`
  then port the M1 blocks into the game's `index.html` (it may be
  customised). New games inherit everything on clone.

---

## Order and effort

| Step | Touches | Effort |
|---|---|---|
| M1 shell | `index.html` | ~1 h |
| M2 touch source | `engine/input.ts`, `engine/index.ts`, `game/main.ts` (one line) | ~half a day |
| M3 gates | `smoke.mjs`, one verifying-graphics run | ~1 h |
| M4 LAN URL | `playing-the-game` skill | 15 min |
| M5 docs | CLAUDE.md + four skills | ~1 h |

Total: about one working day. M1 and M4 can land first on their own and
already let a phone *see* every game; M2 makes them playable.

Final acceptance for the whole plan: describe a new game in chat, create it
the normal way, open the Network URL on a phone, play it with thumbs, pause
it, lose, restart — with no mobile-specific request having been made.
