# brick-bounce verification fixture — style card

The visual contract for the **brick-bounce** fixture. The fixture is **FROZEN**: change it
only under the fixture rule in the **verifying-graphics** skill, and edit this card in the
same change. The code carries no comments, so the art decisions live here.

It measures what the other fixtures cannot: a small **fast-moving** actor (the ball) over
a **mid-navy ground** (`PICO8[1]` — the large mid-luminance field where scanline banding
and vignette crush show, the exact ground the motivating regression banded), a dense grid
of same-shape targets told apart by **hue**, the `bubbles` ambient retuned into the band
for a non-black ground, frequent minor impacts (bricks) beside a major one (lost ball),
and a WIN on clear. It diverges from space-dodge (same palette) on ground, ambient,
silhouettes and roles.

## The game in one paragraph

Breakout, underwater. The ball rides the paddle until A launches it at 45°; it bounces off
the three bezel walls, leaves the paddle at an angle set by where it struck (±60° off
vertical), and breaks one brick per tick (+10, 3 % speed-up, bounce on the shallower
overlap axis). Clearing all 32 bricks wins. A ball below the screen costs a life; when the
hit-stop expires the ball returns to the paddle, or GAME_OVER follows on the last life.

## Decisions

| Axis | Decision |
|---|---|
| Palette | **PICO8**, underwater; the frame clears to navy 1. |
| Resolution | 240×160 logical px at scale 3; ball and paddle at px 1. |
| Play field | A **calm flat navy 1** field, no texture under the fast ball — tiling it with dither crosshatched the arena and beat against the 6-px ball at 120 px/s. No light shafts: a sparse dither column read as dust on the glass wherever it was put. |
| Seabed | Below the paddle line (y ≥ 150): a 0/1 checker dither strip with coral and rock silhouettes in 2 at px 2 — scenery, never in play. |
| Bezel | A 4-px black (0) frame with a grey 5 keyline on the walls the ball bounces off (x = `SAFE_MARGIN`, y = `SAFE_MARGIN + 8`); the frame overshoots the bottom so no bar lands on the paddle line. |
| Bricks | Beveled shells, 24×6 with a 2-px gap, 8 × 4, fill by row 8 / 9 / 10 / 11 (red, orange, yellow, green), each with its own lighter/darker PICO8 pair: 14/2, 15/4, 7/9, 7/3 — every shell lit from the same direction without leaving the palette. |
| Paddle | 24×4, blue 12 beveled (light 7, dark 1) with a 5×1 white gloss. |
| Ball | A round 6×6 pearl, white 7 with a 6 shade toward the lower right and an unshaded top-left highlight. |
| Ambient | `bubbles` in 5 (≈1.95:1 vs navy — inside the 1.8–2.5 band everywhere). Every scenery tone (0, 2, 5 and the dithered mixes) stays at or below that band. |
| Contrast | Bricks are targets consumed on contact, not static surfaces, so the 4.5:1 floor applies to actors vs the ground: white 12.5:1, blue 5.6:1; bricks red 3.5:1, orange 6.9:1, yellow 11.4:1, green 8.0:1 — not ball vs brick. |
| HUD | `drawScore` + `drawLives`; PAUSED in 10 via `hudText` with its default plate, no dim. |
| Title | `drawLogo` "BRICK BOUNCE" (color 10, shade 9, shadow 1, default scale), hook `ONE PADDLE. THIRTY-TWO SHELLS.` in 6, a preview of a 4-column shell wall (20×5 bricks) + pearl + paddle, a `SPACE TO LAUNCH` prompt in 10 whose alpha pulses 0.45–1.0, then only the last control hint and `ARROWS/WASD MOVE` in 13. |
| Juice | Brick: 4-particle chip burst in the brick's fill (speed 70), `hit` sfx, 1-px / 0.08 s shake. Paddle: `blip`, 1-px / 0.06 s shake. Lost ball: a blue 12 splash (16, speed 160) plus white spray (6, speed 90) at the ball's last position **clamped inside the bezel**, so the frozen tableau shows the gap it went through; shake 5 / 0.45 s, red 8 radial flash there (never white), 0.15 s hit-stop. Clear: uniform green 11 flash 0.3 s, WIN. |
| Terminal screens | The live world + `dimScene(0.6)` + a **hollow** grey 5 card (dim OR plate, never both); headline at scale 2 (GAME OVER 8, YOU WIN 11), `SCORE n` in 7, `SPACE RESTART` in 6, both with shadow. |

## Controls (as presented)

Arrows or WASD move the paddle; **A** (Space / Z) launches, starts and restarts;
**PAUSE** (P / Esc) pauses and resumes. Declared actions: `launch`, `pause`.

## Determinism

No dev hook: `verification/capture.mjs` drives the fixture with its own virtual clock and
a seeded `Math.random`, and its input script in `verification/fixtures.mjs` is
frame-indexed (Space every 45 frames from frame 300 relaunches after each lost ball).
Keep draw-call order and constants unchanged, or every later frame shifts.
