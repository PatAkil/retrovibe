# space-dodge verification fixture — style card

The visual contract for the **space-dodge** fixture. The fixture is **FROZEN**: change it
only under the fixture rule in the **verifying-graphics** skill, and edit this card in the
same change. The code carries no comments, so the art decisions live here.

It is a verbatim copy of the reference game's archetype and measures the engine under the
canonical style card: PICO8 on black, the `stars` ambient, three hue-separated actors, a
red death flash with hit-stop. That combination is **reserved for the reference game** —
generated games diverge from it (see **ensuring-arcade-visuals**).

## The game in one paragraph

Title → play → game over → restart. You move a ship around a starfield collecting a gem
for +10 while a barbed mine bounces off the walls. Every pickup speeds the mine up by
12 %, and it creeps 1 % faster every second (compounding), so the ramp is felt within
30 s even if you idle. Touching the mine is the only lose condition: burst, shake, a red
radial flash and a 0.15 s hit-stop whose frozen tableau is rendered in PLAYING; GAME_OVER
follows only when the hit-stop expires. There is no win condition; the WIN scene is
drawn but unreachable.

## Decisions

| Axis | Decision |
|---|---|
| Palette | **PICO8**. Background a flat black void (`PICO8[0]`). |
| Resolution | 240×160 logical px at scale 3; actors drawn at px 1, so cell count = rendered size = hitbox. |
| Ship | 16×12 swept fighter: hull 12, keyline and under-wing shade 1, leading-edge highlight 6, cockpit 7 (three tones plus the cockpit). The keyline is authored into the rows, never baked on. A 12th row of engine flame alternates two frames (10 wide, 9 narrow) at 12 fps. |
| Pickup | 8×8 cut gem, 10 body / 9 shade / 7 glint; the glint moves between two frames at 6 fps while the silhouette stays fixed. |
| Hazard | 10×10 barbed mine, 8 body / 2 core / 14 rim; barbs on the axes, then on the diagonals (two frames at 8 fps) read as a slow tumble. |
| Background planes | Far layer behind the ambient: three low-alpha `PICO8[1]` haze bands thickening toward the bottom edge (alpha 0.10 / 0.18 / 0.28), a one-tone `PICO8[1]` planet with a hand-dithered terminator at px 2 top right (alpha 0.85; 1.52:1 vs black, under the ambient band, so it never reads as touchable), a 1-px `PICO8[1]` arena border. |
| Ambient | `stars`. |
| Text | Score top left via `drawScore`; PAUSED in yellow (10) via `hudText` with its default plate, over the live world (no dim). |
| Logo | `drawLogo` "RETROVIBE", color 10, shade 9, shadow 1, scale 3. |
| Title | Attract screen: logo, hook line `COLLECT + DODGE` (6), the ship at px 4 (64×48) with its flame running, `PRESS SPACE` at scale 2 switching 7↔6 on `pulse(clock, 1.2) > 0.5`, control hints from the declared actions plus `ARROWS/WASD MOVE`, all scale-1 hints with a shadow because they sit over the haze. |
| Juice | Pickup: 5-particle yellow (10) burst, `pickup` sfx. Death: 10 red (8) particles at speed 140, shake 5 px / 0.45 s, a red **radial** flash centred on the ship (0.35 s), 0.15 s hit-stop. |
| Terminal screens | No world, no dim: a hollow grey (5) bezel over the backdrop, headline at scale 2 (GAME OVER red 8, YOU WIN green 11), `SCORE n` in 7, `SPACE RESTART` in 6. |

## Controls (as presented)

Arrows or WASD steer; **A** (Space / Z) starts and restarts; **PAUSE** (P / Esc) pauses
and resumes. B is undeclared; the title's hints come from the declared actions
(`start`, `pause`).

## Determinism

No dev hook: `verification/capture.mjs` drives the fixture with its own virtual clock and
a seeded `Math.random`, and its input script in `verification/fixtures.mjs` is
frame-indexed. Keep the number and order of `Math.random()` calls (pickup placement) and
of draw calls unchanged, or every later frame shifts.
