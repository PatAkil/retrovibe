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
│                      #   lives HUD, minor landing puff vs major death, a scripted
│                      #   WIN run to the flag
└── brick-bounce/      # fixture: fast small ball on a MID-NAVY ground (PICO8[1] — the
                       #   large mid-luminance field where scanline banding and
                       #   vignette crush show), four HUE-separated brick rows,
                       #   'bubbles' retuned into the band for a non-black ground
```

- Each fixture is a clone of the template (`game/`, `index.html`, `smoke.mjs`, configs) **without a committed `engine/`**: `capture.mjs` deletes and re-copies `workspace/game-template/engine` into every fixture before each run, so a fixture can never test a stale engine. The copies are gitignored.
- **Fixtures are frozen.** Their `game/main.ts` changes only when a new engine feature must be demonstrated to be measurable — with the user's explicit OK — and the corresponding input script in `capture.mjs` is updated in the same change. A fixture that stops producing one of its promised moments fails the run.
- The driver runs each fixture in headless Chromium under a **virtual clock** (rAF and `performance.now` replaced, one exact 1/60 s step per frame), with **seeded `Math.random`** and a **stubbed AudioContext** (so the engine's noise synth never consumes seeded draws), dispatches each scripted **run**'s key events, and grabs the canvas at these **moments**: `title`, `play` (in motion), `paused` (fixed frames); `score` (2 frames after the first `scoreChanged`), `impact` (the last frozen death-tableau frame before `GAME_OVER`: burst + shake + flash), `end` (30 frames after `GAME_OVER`, flash faded), `win` (30 frames after `WIN`, cave-hopper's second run) — the semantic ones detected from the runtime's `[retrovibe]` console messages; plus `shell`, a real page screenshot of the title with the arcade cabinet around the canvas (the only moment that sees `index.html`). A run that ends in a terminal scene other than the one its script expects fails.
- Two runs of the same tree produce identical frames (0.00 % changed on every moment). That is the instrument's self-check: a non-zero diff with no code change means something in the engine became non-deterministic (unseeded randomness, wall-clock reads) — report it, do not accept.
- **What the instrument cannot see:** anything not driven by `requestAnimationFrame` (timers and promises never fire inside a run); mid-shake frames other than the ones captured; respawn frames; reduced-motion modes; and — most importantly — **the choices a future game-writer makes from guidance**. The fixtures have hard-coded style cards, so an edit to a skill's *advice* leaves all frames byte-identical. Guidance changes are verified differently: see "Verifying a guidance change" below.
- The orchestrating session runs the loop itself (it is judgement work, not lifecycle command-following); `lifecycle-runner` never touches `verification/`.

## The loop

Run it from the repo root. Never run the template in place; the fixtures are the only things that run here. First confirm the instrument is present on your branch — `ls verification/capture.mjs verification/baseline` — if it is not, you are on a branch that predates it: stop and say so rather than improvising a check.

### 1. Trigger

Any of: a diff under `workspace/game-template/` (engine, `game/main.ts`, `index.html`); an edit to `ensuring-arcade-visuals`, to the visual items of `improving-game-quality`, or to `adding-easter-egg`'s palette-swap guidance; a change to `verification/` itself. If none applies, this skill does not run. Engine and template diffs take the fixture loop (steps 2–7); skill-text diffs take "Verifying a guidance change" (below) — a skill edit that also touches the engine takes both.

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

Exit status is nonzero only for a fixture that fails to boot, throws, misses a promised moment, ends in a terminal scene its script did not expect, or leaves a declared moment MISSING — those are hard failures. A baseline frame for a moment no fixture declares any more is reported as *stale* (not a failure) and removed by `--accept`. Pixel differences never fail the run; they are the *input* to step 4. Stdout ends with a table per fixture and moment with **two** percentages: pixels that changed *at all*, and pixels that changed *visibly* (largest channel delta ≥ 24/255).

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

`--accept` refuses to promote a capture that failed, and removes baseline frames the capture no longer produces. Accepting rewrites the approved look; it is part of the same change, committed alongside it. A baseline is a few MB (identical frames dedupe as git blobs), so accept deliberately, once per approved change — not per iteration.

### 7. Cleanup

```bash
lsof -ti:5301,5302,5303,5399 | xargs -r kill
```

`verification/out/` and the fixture `engine/` copies are gitignored; leave them.

## Verifying a guidance change

When the diff is to a *skill* (what future game-writers are told to do), the fixtures show nothing. Verify by generating, then looking:

1. Generate the fixed prompt set with **creating-a-game** exactly as a user would (clone, develop with the edited guidance in force, gates green), using these **folder names** so nothing collides with a user's game or a fixture: `vg-space`, `vg-cave`, `vg-brick`. Confirm each folder is absent first (`ls workspace/`); if creating-a-game's collision guard fires, you picked a name that exists — rename, never take the overwrite branch (it commits). The games are throwaway: do not commit them.
   - `vg-space`: "A top-down space game: move a ship, collect crystals, dodge a drifting mine; touching the mine ends the run."
   - `vg-cave`: "A one-screen platformer in a cave: jump between ledges over spikes, grab three gems, reach the exit door."
   - `vg-brick`: "A breakout game under water: paddle, ball, a wall of shells to clear; three balls then game over."
2. Capture each with a label: `node verification/capture.mjs --game workspace/vg-space --label cand` writes `verification/out/game/cand/vg-space-{shell,title,play,paused}.png` from a generic input script (start, move, pause, then a lawnmower sweep of the arena). The sweep also writes `score`, `impact` (a full-screen flash detected by a brightness jump) and `end` **when the unknown game happens to reach them** — absent files mean the sweep never got there, not that feedback is missing; judge R4 from whatever impact/score frames exist, and from the game's code when none do. Labelled game captures survive fixture captures. The `--game` server uses port 5399.
3. View every frame at full size and score R1–R7 per game, in words, with regions. The three fixtures are the bar: a generated game that reads worse than its fixture counterpart on any criterion is evidence the guidance regressed.
4. For a before/after, generate the same three prompts from the **base** branch in a separate git worktree (`git worktree add ../rv-base <base-branch>` — never `git stash`, which does not move untracked game folders), capture them there with `--label base`, then copy that worktree's `verification/out/game/base/` into this checkout's `verification/out/game/base/` and run `node verification/capture.mjs --compare-games base cand` for a side-by-side composite. Generation varies run to run, so judge the *pattern* across the three games, not one frame.
5. Report as in step 5; afterwards `rm -rf workspace/vg-space workspace/vg-cave workspace/vg-brick` (never the template, never the fixtures), remove the base worktree, and `lsof -ti:5399 | xargs -r kill`.

## Reviewing at scale — blind and adversarial passes

For non-trivial changes, do not rely on one pair of eyes:

- **Blind review.** A subagent that sees only the *candidate* frames (not the baseline, not the diff, not the intent) scores every fixture on R1–R7 in absolute terms. If a change reads as worse to someone who does not know what "better" was supposed to look like, it is worse.
- **Adversarial review.** A subagent that reads the diff and the intent and is told to find the fixture, moment and region where the change *hurts* — and to say "no finding" if it can't point at one.

Both report per criterion with frame coordinates or regions; the orchestrating session reconciles and reports to the user as in step 5.

## Adding a fixture

Only when an existing fixture cannot exercise something the generator now does (a new ambient type, a new scene kind, a scrolling level). Clone the template into `verification/<name>` (`cp -r workspace/game-template verification/<name>`, then `rm -rf verification/<name>/engine`), write a small, plain game (≈200 lines, one style card, every scene reachable by a fixed key script), add its input script and promised moments to `FIXTURES` in `capture.mjs`, run the loop, get the user's approval, accept. `capture.mjs` allocates `5301 + index` in name order, so a fourth fixture takes 5304 — add it to the reclaim/cleanup lines here.

## Checklist

- [ ] Trigger applies (template/engine, visual skill, or `verification/` changed).
- [ ] Engine copies refreshed, then functional gates green on all three fixtures.
- [ ] Capture ran with exit 0 (all promised moments produced, runs ended in the expected scene, no MISSING rows).
- [ ] For a guidance (skill) change: three prompt-set games generated, captured with `--game`, and judged.
- [ ] Diff table read mechanically: invisible-by-default → all 0.00 % | 0.00 %; targeted change → non-zero where intended; global default → high "any", judged by eye.
- [ ] `compare.png` AND the full-size changed frames were viewed in this session.
- [ ] Per-criterion (R1–R8), per-fixture verdicts written; regressions named with a region.
- [ ] Composite and verdicts sent to the user; accept/fix/revert recommended.
- [ ] Baseline accepted and committed only after user approval.
- [ ] Ports 5301–5303 (and 5399 after a `--game` run) released.
