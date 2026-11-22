# cave-hopper verification fixture — style card

The visual contract for the **cave-hopper** fixture. The fixture is **FROZEN**: change it
only under the fixture rule in the **verifying-graphics** skill, and edit this card in the
same change. The code carries no comments, so the art decisions live here.

It measures what space-dodge cannot: actors over **static surfaces** (slabs, ledges,
spikes), a non-black warm background, the `embers` ambient, a lives HUD, a minor landing
burst beside a major death tableau, respawn, and both terminal scenes (WIN on the flag,
GAME_OVER on 0 lives).

## The game in one paragraph

A one-screen platformer. Run and jump across beveled rock slabs, collect three coins
(+10 each), avoid two spike traps and the pit, and touch the flag to win. Spikes or a fall
below the screen cost a life: burst, shake, an orange radial flash and a 0.15 s hit-stop;
when the hit-stop expires you respawn at the start, or GAME_OVER follows on the last life.
Jumping uses the building-platformer-games recipe: gravity 900, jump −280 with a 0.4
jump-cut on release, move 90, max fall 300, 0.1 s coyote time, 0.12 s jump buffer, X
resolved fully before Y.

## Decisions

| Axis | Decision |
|---|---|
| Palette | **SUNSET**; the frame clears to 0 (SUNSET's darkest tone, not black). |
| Resolution | 240×160 logical px at scale 3; actors at px 1, footprints unchanged. |
| Cave depth | Upper cave flat 0 (a two-stop `fillBands` of 0/0), then a single solid step into a 1 floor band from y 112 — a dithered ladder at the horizon read as a dotted seam to every reviewer. Far rock humps in 0, stalactites and side-wall teeth in 1 (teeth below y 100 in 0): fixed geometry, no randomness, well under the ambient band. |
| Terrain | Beveled slabs (fill 2, light 2, dark 1) with a sparse 2/1 dithered rock face and a single sparse 2/5 dithered lit top lip. The light is 2, not 3, and the lip mix is 5, not 4: 3 is the spike base shadow and 4 was the spike body in an earlier form, and either made the hazard read as part of the terrain. |
| Pit | A 1→0→0 gradient falling away (depth, not a seam). |
| Player | 8×12, cream 7 body, 5 fold shading, 3 visor, authored 0 keyline; two frames (stride / passing) plus a mirrored facing set. Airborne shows frame 1, standing frame 0, walking alternates at 8 fps. |
| Coin | 6×6, gold 6 with a 7 glint and a 4 rim; spins wide → narrow at 3 fps. |
| Spikes | 8×6 fang: a peach 5 body under a gold 6 tip, 3 only as the 1-px base shadow, black (0) authored sides keep the silhouette off the rock. Earlier forms collided with other roles (3 across the lower half read as a terrain bump; a cream 7 tip matched the player). The old header recorded a 4 body / 5 tip with body 4.72:1 vs the floor and 3.17:1 vs the slab, tip 7.19:1 / 4.82:1; the sprite as drawn (and as baselined) is the 5 body / 6 tip. |
| Flag | 8×12: cream 7 pole, peach 5 pennant, 3 base; two-frame flutter at 4 fps. |
| Ambient | `embers` at `ambientCount: 28` — the default 48 read as dirt on the cave wall. |
| HUD | `drawScore` + `drawLives`; PAUSED in 6 via `hudText` with its default plate, no dim. |
| Logo | `drawLogo` "CAVE HOPPER", color 6, shade 5, shadow 1, scale 3; hook line `HOP THE SPIKES  REACH THE FLAG` in 5. |
| Title | The player as a prop at **px 2** on a lit slab, with the full-disc coin (frame 0) at px 2 beside it. Px 2, not 4: the authored keyline scales with px, and at 4 the 1-cell outline became 4-px black bands. Prompt `PRESS SPACE TO START` breathing 7↔5 (`blink(clock, 1, 0.6)`), hints in 6, `ARROWS/WASD MOVE` in 5 — scale-1 text over the floor band, so all with a shadow. |
| Juice | Coin: 5-particle gold (6) burst, `pickup` sfx. Landing: 3-particle 3 puff (speed 40, life 0.3) and a 1-px / 0.08 s shake. Death: 10 orange (4) particles at speed 140, shake 5 / 0.45 s, orange radial flash at the player (0.35 s), 0.15 s hit-stop. Goal: `pickup` sfx, uniform gold flash 0.3 s, WIN. |
| Terminal screens | The live world + `dimScene(0.6)` + a **hollow** 3 bezel (dim OR plate, never both); headline at scale 2 (GAME OVER 4, YOU WIN 6), `SCORE n` in 7, `SPACE RESTART` breathing 6↔5, both with shadow. |

## Controls (as presented)

Arrows or WASD move; **A** (Space / Z) jumps, starts and restarts (hold for a full jump,
release early to cut it); **PAUSE** (P / Esc) pauses and resumes. Declared actions:
`jump`, `pause`.

## Determinism

No dev hook: `verification/capture.mjs` drives the fixture with its own virtual clock and
a seeded `Math.random`, and its two input scripts in `verification/fixtures.mjs` are
frame-indexed (the second one wins by jumping across the ledges). Keep draw-call order and
physics constants unchanged, or every later frame shifts.
