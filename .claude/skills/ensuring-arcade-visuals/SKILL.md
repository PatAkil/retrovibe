---
name: ensuring-arcade-visuals
description: Use when creating or editing a game's visual presentation, or when a game looks flat, modern, or off-brand. Ensures the arcade-cabinet look — palette discipline, low pixel resolution, ASCII sprites, retro bitmap text, CRT filter, ambient particles.
---

# Ensuring arcade visuals

Scope is **look only** (margins/readability live in **improving-game-quality**). Editing this skill or any engine module it describes triggers **verifying-graphics**. Import only from `'../engine'`. Read [`references/examples.md`](references/examples.md) only if a visual pass fails or you need worked code examples.

## 0. Style card & forced divergence

Before writing code, derive 2–3 visual directions from the game's fiction, pick one, and rewrite `STYLE.md` (never comments in code — comments are a lint error). Keep the template's structure and record: **palette** + bg/actor indices, **sprite tones** (2–3 tones + keyline + 2-frame animation), **background planes**, **surface treatment** (`drawBevel`/texture/pits), **`drawLogo` colors** + title hero prop, **ambient preset**, **juice personality**, and **terminal-screen treatment**.

**Diverge from:**
- **Reserved combos:** reference game (`PICO8` / black + haze + planet / blue arrow-ship / yellow gem / red mine / `'stars'`), `cave-hopper` (`SUNSET` / cave + stalactites / cream hopper / gold coin / fang spikes / `'embers'`), and `brick-bounce` (`PICO8` navy underwater / coral + bezel / white pearl / beveled shell rows / `'bubbles'`).
- **Existing `workspace/` games:** use the compact 1-line-per-game `STYLE.md` digest provided in your brief — do **not** read every `workspace/*/STYLE.md` file one by one.

Differ on **sprite silhouettes AND ≥1 other axis** (palette-index scheme, ambient preset, or burst colors — bursts always use the game's own palette, never engine default yellow). **Never flee `PICO8` just to diverge:** default to `PICO8` for >2 actor roles or multi-row target sets, and ensure target sets span ≥3 hue families (never one hue at three values).

## 1. Palette, contrast & red-green safety

Pick **ONE** named `Palette` and index it via a tuple `const PAL = PICO8` (zero ad-hoc hex strings in `game/`):

| Export | Character | Size |
|---|---|---|
| `PICO8` | Bright, versatile PICO-8 16-color set (default for >2 roles / multi-row targets) | 16 |
| `GAMEBOY` | Muted 4-tone green Game Boy ramp (0 darkest → 3 brightest) | 4 |
| `DUSK` | Purple dusk/twilight ramp (0 → 7) | 8 |
| `NEON` | Synthwave — hot magenta/cyan on deep violet (0 → 7) | 8 |
| `SUNSET` | Warm sunset — dusk sky to ember highlights (0 → 7) | 8 |
| `OCEAN` | Cold ocean — abyss blues to foam (0 → 7) | 8 |

**Hard contrast & color floors (`contrast()`):**
- **Actors:** `>= 3.0:1` on pure black, **`>= 4.5:1` authored on any non-black clear color** (CRT phosphor lift lowers effective contrast on dark non-black grounds), and `>= 3.0:1` against any overlapped scenery.
- **Ambient band:** `1.8–2.5:1` vs clear color (retune `ambientColor` / `setAmbient` on non-black grounds).
- **Red-green safety:** never red-vs-green alone — require ≥2 of hue family, brightness, silhouette (distinguishable in grayscale).
- **Role-hue contract:** player, pickup (brightest warm accent), and hazard (red-family or spiky) use **3 distinct hue families + 3 distinct silhouettes**.

## 2. Pixel scale & sprite craft

- **Canvas:** `createPixelCanvas` at low logical resolution (160–320 wide; reference `240×160` at `scale: 3`). Draw strictly in logical px; `pc.clear(PAL[0])` un-shaken at frame start.
- **Size floors:** player `>= H/12` (≈14 px at 160; `16×12` target); other gameplay-critical entities (hazards, pickups, projectiles) `>= H/20` (≈8 px at 160). Hitboxes `{w, h}` within ~1 px of rendered size.
- **Sprite craft (`makeSprite` / `drawSprite`):** author gameplay sprites at **`px = 1` at full rendered size** with **2–3 palette tones** (body/shade/highlight) + a **dark keyline** (authored `O` char preferred so footprint stays honest, or `{ outline }` with hitbox on inner size). Keyline must clear `3:1` against both the entity and any textured surface it overlaps.
- **Animation & facing:** every living entity gets a **2-frame animation** (`frameIndex(clock, fps, 2)`, 3–8 fps) built once at module scope; mirror facing once at setup with `flipSprite` (never per frame).

## 3. Text, CRT & ambient

- **Text:** all text via `drawText` / `drawTextCentered` / `textWidth` (3×5 bitmap font, 5-wide M/W — always measure with `textWidth`; `TextOptions` default to outline at `scale >= 2` — keyline at `scale >= 3`, shadow at `scale 2` — and shadow on HUD).
- **CRT:** `createCrt()` (`CrtOptions`) once at setup; `crt.render(pc.ctx, W, H, 1/60)` is ALWAYS the **last** draw call of every frame, after `juice.postRender`.
- **Ambient:** `createParticles` with an `AmbientPreset` matching the fiction (`'stars'`, `'rain'`, `'snow'`, `'embers'`, `'bubbles'`), rendered after the backdrop and behind the world.

## 4. Backgrounds, surfaces, title & terminal screens

- **Backgrounds (≥2 depth planes):** a far horizon band (`fillBands` or solid rect) in the **top or bottom quarter only** (≤1.3:1 vs clear color, **solid step — never a dithered horizon or mid-field band**) plus dark framing silhouettes. Both planes sit at or below the ambient band; keep the play field calm (`fillDither` belongs on small surfaces — slab faces, lips, seabeds — never tiled under fast actors).
- **Surfaces:** every platform, brick, paddle, or panel is a `drawBevel` slab with ≤1 texture strip; pits fall away via `fillBands` into `PAL[0]` (stay in palette); add a `drawFrame` bezel where the fiction has walls.
- **Title screen:** real game name via `drawLogo` (`color`/`shade`/`shadow` from palette) + 1-line hook + **large hero prop** (`px` 2–4; a row-authored keyline scales past `px: 2` only when `<= 2:1` vs ground, else author a dedicated poster sprite) + pulsing prompt (`blink`/`pulse`) + `controlHints(input)` (`BUTTON_KEY`, `{ shadow: true }` over texture).
- **Terminal screens (`GAME_OVER`/`WIN`):** `dimScene(pc, 0.6)` + **HOLLOW `drawFrame` bezel** around the headline — dim OR opaque `drawPanel` plate, never both.

## Visual sign-off

- [ ] `STYLE.md` rewritten with art decisions; diverges from reference, fixtures, and `workspace/` digest (§0).
- [ ] One named palette, zero ad-hoc hex; contrast floors (`>= 3:1` black / `>= 4.5:1` non-black / `1.8–2.5:1` ambient), red-green safety, and 3-family role-hue contract met (§1).
- [ ] Low logical res; `px = 1` full-size multi-tone outlined sprites meeting `>= H/12` (player) & `>= H/20` (other) with matching hitboxes, 2-frame animations, setup-time `flipSprite` (§2).
- [ ] ≥2 calm depth planes (solid horizon in top/bottom quarter), `drawBevel` slabs, `drawLogo` + hero prop title, `dimScene` + hollow `drawFrame` terminal screens, `crt.render` last, fiction-matched ambient (§3–4).
- [ ] `npm run look -- --scenes title,playing,gameover` screenshots read with zero errors.
