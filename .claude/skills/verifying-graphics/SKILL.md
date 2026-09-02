---
name: verifying-graphics
description: Use when changing anything that shapes how EVERY game looks — the engine (`workspace/game-template/engine/`), the reference game or shell in the template, or a skill that directs visual choices (ensuring-arcade-visuals, improving-game-quality's visual items) — and before any such change is called done, committed, or merged. Runs the graphics verification loop — frozen fixture games, deterministic frame capture, a before/after composite, and a visual judgement against a rubric — so a graphics change is verified by LOOKING, not only by building. Not for creating or iterating individual games.
---

# Verifying graphics

**Why this skill exists.** A previous engine uplift passed every mechanical gate — type-check, build, smoke, contrast ratios ≥ 3:1, byte-identity for untouched paths, frame budgets — and games generated afterwards looked *worse*: one hue family everywhere, pickups indistinguishable from hazards, dim muddy stars, scanlines banding over a navy background. Every ratio was legal. Nobody had looked. The lesson this skill enforces: **measurable legality is not visual quality; quality is judged by viewing frames, side by side, before and after.**

**What it verifies.** The *generator* — engine + template + visual skills — via three frozen fixture games. It does not run for user games: creating and iterating a game already has its own gates (creating-a-game, playing-the-game) and a new game changes nothing the fixtures measure.

## The instrument

```
verification/
├── capture.mjs        # harness code (like harness/verify.mjs): drives the fixtures
├── baseline/          # the APPROVED look — <fixture>-<moment>.png, committed
├── out/               # last capture (gitignored): candidate frames + compare.png
├── space-dodge/       # fixture: PICO8 on black, 'stars', 3 hue-separated actors,
│                      #   red death flash — the reference-game archetype
├── cave-hopper/       # fixture: platformer on STATIC SURFACES, SUNSET, 'embers',
│                      #   lives HUD, minor landing puff vs major death, WIN flag
└── brick-bounce/      # fixture: fast small ball on a NAVY ground (where scanlines/
                       #   vignette show most), OCEAN, 'bubbles', color-only targets
```

- Each fixture is a clone of the template (`game/`, `index.html`, `smoke.mjs`, configs) **without a committed `engine/`**: `capture.mjs` deletes and re-copies `workspace/game-template/engine` into every fixture before each run, so a fixture can never test a stale engine. The copies are gitignored.
- **Fixtures are frozen.** Their `game/main.ts` changes only when a new engine feature must be demonstrated to be measurable — with the user's explicit OK — and the corresponding input script in `capture.mjs` is updated in the same change. A fixture that stops producing one of its promised moments fails the run.
- The driver runs each fixture in headless Chromium under a **virtual clock** (rAF and `performance.now` replaced, one exact 1/60 s step per frame) with **seeded `Math.random`**, dispatches the fixture's scripted key events, and grabs the canvas at these **moments**: `title`, `play` (in motion), `paused` (fixed frames); `score` (first `scoreChanged`), `impact` (last frozen death-tableau frame: burst + shake + flash), `end` (terminal scene) — detected from the runtime's `[retrovibe]` console messages, so they survive timing drift.
- Two runs of the same tree produce identical frames (0.00 % changed on every moment). That is the instrument's self-check: a non-zero diff with no code change means something in the engine became non-deterministic (unseeded randomness, wall-clock reads) — report it, do not accept.

## The loop

Run it from the repo root. Never run the template in place; the fixtures are the only things that run here. First confirm the instrument is present on your branch — `ls verification/capture.mjs verification/baseline` — if it is not, you are on a branch that predates it: stop and say so rather than improvising a check.

### 1. Trigger

Any of: a diff under `workspace/game-template/` (engine, `game/main.ts`, `index.html`); an edit to `ensuring-arcade-visuals`, or to the visual items of `improving-game-quality`; a change to `verification/` itself. If none applies, this skill does not run.

### 2. Refresh the engine copies, then run the functional gates

The fixtures carry no engine in git. Copy the template's engine into each one **first** — `capture.mjs` does this on its own, but `check`/`build` do not, so running them before a refresh checks a stale or missing copy:

```bash
rm -rf verification/space-dodge/engine && cp -r workspace/game-template/engine verification/space-dodge/engine
rm -rf verification/cave-hopper/engine && cp -r workspace/game-template/engine verification/cave-hopper/engine
rm -rf verification/brick-bounce/engine && cp -r workspace/game-template/engine verification/brick-bounce/engine
```

Then, one plain command per fixture (some sandboxes reject shell loops and subshells):

```bash
cd verification/space-dodge && npm run check && npm run build; cd ../..
cd verification/cave-hopper && npm run check && npm run build; cd ../..
cd verification/brick-bounce && npm run check && npm run build; cd ../..
```

A fixture that no longer type-checks against the changed engine is an API break — fix the engine (or, with the user's OK, the fixture) before capturing. `dist/` folders left by `build` are gitignored; `rm -rf verification/*/dist` if you want them gone.

### 3. Capture

```bash
lsof -ti:5301,5302,5303 | xargs -r kill
node verification/capture.mjs
```

Exit status is nonzero only for a fixture that fails to boot, throws, or misses a promised moment — those are hard failures. Pixel differences never fail the run; they are the *input* to step 4. Stdout ends with a table per fixture and moment with **two** percentages: pixels that changed *at all*, and pixels that changed *visibly* (largest channel delta ≥ 24/255).

Read the table first, mechanically:
- A change meant to be **invisible by default** (an opt-in feature, a refactor) must show **0.00 % | 0.00 % on every moment**. Anything else means the default path moved — a hard failure until explained. One known benign cause: an engine change that consumes a different number of `Math.random()` calls at start-up shifts every seeded ambient particle — the "any" column lights up on all moments while nothing looks different. Confirm that is the cause by reading the diff (only particles moved) and say so in the report; do not wave it through unexamined.
- A change meant to be **visible** must show non-zero on the moments it targets. 0.00 % | 0.00 % everywhere means the change is not wired into anything a game actually renders.
- A change to a **global default** (vignette, scanline alpha, flash curve, font) legitimately touches most pixels on most moments: expect a high "any" column with a low "visible" column for a subtle tonal tweak (a vignette softening measured ~63 % | 0.00 %). The percentages say *where* and *how much*; only step 4 says *whether it is better*.

### 4. Look — this step is not optional

View `verification/out/compare.png` (baseline | candidate | changed-pixels per moment). Then view the **individual candidate PNGs** in `verification/out/` at full size for every moment that changed, next to their baseline in `verification/baseline/`. The composite is for orientation; judgements are made on full-size frames, because the CRT pass works at logical-pixel scale and a downscaled composite hides banding, moiré and fringe.

Judge every changed moment of every fixture against the rubric. Write the verdict per criterion, per fixture — "looks fine" is not a verdict.

**Rubric** (a regression on any line, on any fixture, means the change is not mergeable as-is):

| # | Criterion | What to look for |
|---|---|---|
| R1 | Role legibility | Player, pickup, hazard/target are told apart **at a glance by hue AND silhouette** — not by luminance alone. Grayscale test in your head. |
| R2 | Vibrancy | Actors are saturated and punchy on a dark, clean ground. The frame reads as the fixture's style card, not as a single-hue wash or fog. Ambient particles read as atmosphere, not as dirt. |
| R3 | Readability in motion | In `play`, every actor is identifiable while moving; no smear, ghosting or lost silhouette. |
| R4 | Feedback reads | In `impact` (and `score`), the burst, shake and flash are visible from arm's length and use the game's own palette. The death moment feels dramatic, not muddy. |
| R5 | HUD | Score/lives/pause text legible, inside `SAFE_MARGIN`, not fighting the brightest surface it sits on. |
| R6 | CRT | Scanlines and vignette are present and calibrated: they add "glass", they do not band the ground into stripes or crush dark actors — especially on the non-black grounds (`cave-hopper`, `brick-bounce`). |
| R7 | Artifacts | No stale pixels at the edges during shake, no seams, moiré, clipped sprites, wrong draw order, or effect drawn over the CRT. |
| R8 | Unchanged is unchanged | Moments the change should not touch are 0.00 %. Opt-in features leave every baseline untouched until a fixture opts in. |

A change whose *purpose* is visual improvement must be judged **better** on the criteria it targets, in words, per fixture — "equal" is a failure for such a change, not a pass. Style preference is not a criterion: the rubric is about legibility, vibrancy, feedback and cleanliness, and a reviewer who can't point at a frame region is not reporting a finding.

### 5. Report — the user has the final say

Share `verification/out/compare.png` with the user by whatever this environment offers (file attachment, artifact, or inline view), with the diff table and the per-criterion verdicts, fixture by fixture. Recommend accept / fix / revert. Claude judges; the user decides. Never describe a change as "verified" or "an upgrade" without having viewed the frames in this session — the verdict must cite what was seen.

### 6. Accept — only after the user approves

```bash
node verification/capture.mjs --accept
git add verification/baseline && git commit -m "verification: accept new baseline — <what changed and why>" -- verification/baseline
```

Accepting rewrites the approved look; it is part of the same change, committed alongside it. A baseline is ~2.6 MB, so accept deliberately, once per approved change — not per iteration.

### 7. Cleanup

```bash
lsof -ti:5301,5302,5303 | xargs -r kill
```

`verification/out/` and the fixture `engine/` copies are gitignored; leave them.

## Reviewing at scale — blind and adversarial passes

For non-trivial changes, do not rely on one pair of eyes:

- **Blind review.** A subagent that sees only the *candidate* frames (not the baseline, not the diff, not the intent) scores every fixture on R1–R7 in absolute terms. If a change reads as worse to someone who does not know what "better" was supposed to look like, it is worse.
- **Adversarial review.** A subagent that reads the diff and the intent and is told to find the fixture, moment and region where the change *hurts* — and to say "no finding" if it can't point at one.

Both report per criterion with frame coordinates or regions; the orchestrating session reconciles and reports to the user as in step 5.

## Adding a fixture

Only when an existing fixture cannot exercise something the generator now does (a new ambient type, a new scene kind, a scrolling level). Clone the template into `verification/<name>` (`cp -r workspace/game-template verification/<name>`, then `rm -rf verification/<name>/engine`), write a small, plain game (≈200 lines, one style card, every scene reachable by a fixed key script), add its input script and promised moments to `FIXTURES` in `capture.mjs`, run the loop, get the user's approval, accept. Use ports beyond 5303 if you add more than three — `capture.mjs` allocates `5301 + index` in name order.

## Checklist

- [ ] Trigger applies (template/engine, visual skill, or `verification/` changed).
- [ ] Engine copies refreshed, then functional gates green on all three fixtures.
- [ ] Capture ran with exit 0 (all promised moments produced).
- [ ] Diff table read mechanically: invisible-by-default → all 0.00 % | 0.00 %; targeted change → non-zero where intended; global default → high "any", judged by eye.
- [ ] `compare.png` AND the full-size changed frames were viewed in this session.
- [ ] Per-criterion (R1–R8), per-fixture verdicts written; regressions named with a region.
- [ ] Composite and verdicts sent to the user; accept/fix/revert recommended.
- [ ] Baseline accepted and committed only after user approval.
- [ ] Ports 5301–5303 released.
