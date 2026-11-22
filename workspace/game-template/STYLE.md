# Retrovibe reference game — style card

The visual contract for the reference game. Read it before any change to the look,
sprites, palette or juice, and edit it in the same change when a decision below moves.
The code carries no comments, so the art decisions live here. The general rules behind
them (palette discipline, contrast floors, sprite craft, CRT) are in the
**ensuring-arcade-visuals** skill.

This whole **combination** is reserved for the reference game: every generated game
copies the structure of this file and fills it with its own, different decisions.

## The game in one paragraph

A single-screen arcade dodger. You fly a small ship around a starfield, grabbing a
gem ("spark") for +10 while a barbed mine bounces off the walls. Every pickup speeds
the mine up by 12 %, and it also creeps 1 % faster every second, so the run tightens
even if you collect nothing. Each run opens with a short GET READY beat in which you
can steer but the mine is held. Touching the mine ends the run: the ship bursts into
debris, the frame freezes for a beat, then GAME OVER shows the score and your best.
There is no win condition; the WIN scene is wired and drawn so generated games can
copy it.

## Decisions

| Axis | Decision |
|---|---|
| Palette | **PICO8**. Background a flat black void (`PICO8[0]`). |
| Resolution | 240×160 logical px at scale 3; actors drawn at px 1, so cell count = rendered size = hitbox. |
| Ship | 16×12 swept arrow: hull 12, keyline and under-wing shade 1, leading-edge highlight 6, cockpit 7. A 12th row of engine flame alternates two frames (10 wide, 9 narrow) at 12 fps. A same-shape white twin flashes for 0.12 s on each pickup. |
| Pickup | 8×8 cut gem, 10 body / 9 shade / 7 glint; the glint moves between two frames at 6 fps, the body bobs ±1.5 px, and a short hot-swap (9/10 swapped) accents it. |
| Hazard | 10×10 barbed mine, 8 body / 2 core / 14 rim; barbs on the axes then the diagonals (two frames at 8 fps) read as a tumble; a brief hot frame (14/7) pulses at 2 Hz. |
| Background planes | Far layer under the ambient: three low-alpha `PICO8[1]` haze bands along the bottom edge (alpha 0.10 / 0.18 / 0.28), a `PICO8[1]` planet with a hand-dithered terminator at px 2 top right (alpha 0.85), a 1-px `PICO8[1]` border. |
| Ambient | `stars`. |
| Text | Score top left via `drawScore`; floating yellow `+10` pops that rise and fade over 0.7 s; GET READY in white without a plate; PAUSED in yellow over a dim. |
| Logo | `drawLogo` "RETROVIBE", color 10, shade 9, shadow 1, scale 3. |
| Title | Attract screen: logo, the hook line `GRAB SPARKS - OUTRUN THE MINE`, the ship at px 4 (64×48) with its flame running, a breathing `PRESS SPACE` (dims 7↔6, never vanishes), control hints from the declared actions plus `ARROWS/WASD MOVE`. |
| Accent | Warm yellow (10) for pops, PAUSED and NEW BEST. |
| Juice | Pickup: 5-particle yellow burst, `pickup` sfx, ship flash. Death scales with the score (0 → 1 at 200): red burst of 10–20 particles plus a white core, shake 5–8 px, a red **radial** flash centred on the ship, 0.15 s hit-stop, debris replaces the ship. |
| Terminal screens | The live tableau + `dimScene(0.6)` + a hollow grey (5) bezel; headline at scale 2 (GAME OVER red 8, YOU WIN green 11), score, BEST or NEW BEST (only when a best exists, never on a tie), breathing `SPACE RESTART`. |

## Controls (as presented)

Arrows or WASD steer; **A** (Space / Z) starts and restarts; **PAUSE** (P / Esc)
pauses and resumes. **B is intentionally undeclared**; the title's hints come from the
declared actions (`start`, `pause`).

## Dev hook

`game/devhook.ts`, installed only under `import.meta.env.DEV` and absent from the build.
`?seed=<uint>` routes the game's random decisions (pickup placement) through a seeded
PRNG; `?scene=title|playing|paused|gameover|win` boots a deterministic fixture (seed
defaults to 1; `win` is forced from PLAYING after one pickup, since nothing in play
reaches it); `&hold=1` also seeds `Math.random` and stops the loop from ticking or
drawing. `window.__retrovibe.state()` returns `{scene, seed, clock, score, best,
beatBest, dying, ready, ship, pickup, hazard, pops, messages}` (the last two are
counts), `step(n)` runs n fixed ticks and renders once, `press(action)` queues one edge
press, `messages` holds the runtime messages seen so far.
