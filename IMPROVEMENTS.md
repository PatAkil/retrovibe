# Retrovibe — Improvement Spec (post-playtest)

Owner decisions from the first real playtest round, 2026-07-16. Items 2–5
deliberately **revise decisions from the original plan** (retrovibe-plan.html)
— the plan optimized for guarded autonomy; playtesting showed the guards cost
more flow than they protect. Where a revision removes a safety mechanism, this
spec names the replacement mechanism.

Hardened by two adversarial spec reviews (technical-soundness + product-
fidelity lenses); their findings are folded in below.

Status: ☐ open · ☑ done

---

## ☑ 0. Orchestration codified (speed work, this branch)

Model tiering (`.claude/agents/game-writer` = Sonnet-class,
`lifecycle-runner` = Haiku-class), the two-failures escalation rule,
warm-server ordering (dev server up at the start of development, hot-reload
per milestone save), milestone-save discipline with per-save `npm run check`,
and the writer read-budget. Landed in CLAUDE.md → *Models & orchestration*,
`.claude/agents/`, creating-a-game, iterating-on-a-game.

## ☑ 1. `.idea/` gitignored

JetBrains project folders must never dirty `git status` (the template-integrity
check reads porcelain output; IDE cruft inside `workspace/game-template/.idea`
would trip it). Added to the root `.gitignore`.

## ☑ 2. Reset without questions

**Feedback:** resetting-the-workspace should not ask the user any questions —
it should remove the games and reach a neutral starting state.

**Change:** drop the named-list confirmation and the per-game keep/commit
interview from `resetting-the-workspace`. When the user asks for a workspace
reset, do it — zero questions.

**Ambiguity resolves by routing, never by asking:** the zero-question wipe
applies to requests that target the workspace as a whole ("reset", "wipe
everything", "start over from scratch"). A request that plausibly targets one
game ("this one's boring, let's start over", or any phrasing naming a
specific game) routes to iterating-on-a-game / creating-a-game instead — the
skill's trigger description and the orchestrator routing row are narrowed to
say exactly this. **"Clean up" is dropped from the trigger set entirely**: it
is workspace-scoped but ambiguous about the *operation* (tidy vs delete);
"clean up" alone must never trigger a wipe.

**Exact git flow** (non-interactive-safe; the naive
commit-then-`rm` leaves permanent ` D` porcelain noise and can fail outright):

1. Stop the dev server (port-based, as today).
2. **Safety commit — only if needed, pathspec-limited, triggered per game
   folder:** the commit trigger is `git status --porcelain workspace/<name>`
   non-empty for **at least one enumerated game folder** — not bare
   `workspace/` (a stray non-game file like `workspace/notes.txt` would trip
   a workspace-wide trigger, stage nothing, and fail the commit with
   "nothing to commit"). When triggered: `git add workspace/<name> …` for
   the dirty game folders, then
   `git commit -m "checkpoint before reset" -- workspace/<name> …`
   (pathspecs = exactly those folders) — unrelated staged changes never ride
   along; skip the commit entirely when no game folder is dirty.
3. Allowlist delete, exactly as today (`rm -rf workspace/<name>` per literal
   path; never a glob; CWD + template-exists + template-porcelain guards
   before and after). **Game-folder classifier (replaces the confirmation
   interview as the thing that keeps strays out of the delete list):** a
   directory under `workspace/` is enumerated as a game ONLY if it looks
   like a template clone — contains `game/main.ts` AND `package.json`.
   Anything else (`workspace/screenshots/`, `workspace/old-backup/`, stray
   files) is a stray: **never enumerated, never committed, never deleted** —
   named in the completion report for the user to deal with. (Without the
   classifier, "every directory except game-template" + zero questions
   silently wipes non-game directories the old named-list confirmation used
   to catch.)
4. **Commit the deletions:** `git add workspace/<name> …` (stages the
   removals), `git commit -m "reset workspace" -- workspace/<name> …` — the
   reset leaves no uncommitted deletions behind.

**End state ("neutral") — scoped to what reset owns:** only `game-template`
among the game folders in `workspace/`, no dev server on 5173, template
porcelain clean, and **zero reset-induced porcelain** (`git status
--porcelain workspace/` shows nothing except stray non-game files that
pre-dated the reset, which are reported). Pre-existing changes *outside*
`workspace/` are untouched — an unconditional "repo-root clean" would force
the skill to commit or destroy unrelated work, contradicting step 2's own
guarantee.

**Report:** the completion message names the safety commit hash and the exact
**whole-game** restore command — `git checkout <hash> -- workspace/<name>`
(restores the folder in place; `main.ts` alone is not the game — `index.html`
is an explicit writer surface, and `git show` only prints one file to the
terminal). The product's audience is git-naive; recovery they aren't told
about doesn't exist.

**Kept-game escape hatch:** "reset everything except cave-hopper" is honored
(skip that folder in steps 3–4) — the skill just never *asks*.

**Acceptance:** an unambiguous "reset the workspace" completes with zero
questions and reaches the scoped end state above, twice in a row — no
reset-induced porcelain compounding; a run with a pre-existing unrelated
change outside `workspace/` completes without committing or touching it;
a run whose only `workspace/` dirt is a stray non-game file completes
without a failed commit and reports the stray; a stray non-game *directory*
(`workspace/screenshots/`) survives a full reset untouched; "start over"
while discussing a specific game routes to an edit/recreate of that game,
not a wipe; "clean up" alone never wipes; a wiped game is fully restored —
including a customized `index.html` — by the reported command.

## ☑ 3. No commits during the create/iterate interaction

**Feedback:** there should be no commits in between while creating the user's
game as part of the interaction.

**Change:** remove the automatic checkpoint commit from creating-a-game
(step 6) and iterating-on-a-game (step 5). The create→play→iterate loop
touches git zero times; the working tree simply holds the current game.

**Replacement recoverability — covers ALL deletion moments, not just reset:**
- resetting-the-workspace: the safety commit in item 2.
- **creating-a-game's explicit-overwrite branch** (step 2: "delete the old
  folder, then clone") — the same safety-commit-then-delete mechanic applies
  there: pathspec-limited checkpoint of `workspace/<name>` before the
  delete, deletion staged and committed with the clone. Without this, item 3
  makes "overwrite space-miner" the only unrecoverable data loss in the
  product. **Recovery must be discoverable, same as reset's — and durable
  beyond the session that destroyed the game** (item 2's own principle:
  recovery the user isn't told about doesn't exist): the overwrite handoff
  message names the safety commit hash and the whole-game restore command
  (`git checkout <hash> -- workspace/<name>`); the commit message follows a
  fixed convention (`checkpoint <name> before overwrite`); and
  creating-a-game/iterating-on-a-game gain one durable routing line —
  restore-flavored requests ("the old one was better", "bring back …")
  check `git log --oneline -- workspace/<name>` for checkpoint commits, so
  a fresh session can find the recovery without the original chat message.
- Explicit "commit/save my game" requests still commit, scoped as before.

**Surface sweep — case-insensitive, two patterns** (the naive lowercase
`grep "checkpoint"` misses four of the five known hits — capitalized step
headers and CLAUDE.md's "Checkpoint commits", and matches nothing in
lifecycle-runner, whose stale text says "scoped commits" without the word):
`grep -rni "checkpoint" .claude/ CLAUDE.md` **and**
`grep -rniE "scoped.*commit|git commit" .claude/ CLAUDE.md`; update every
hit — known: creating-a-game step 6 header + routing table row,
iterating-on-a-game step 5 header + frontmatter description,
resetting-the-workspace step 2 (keep/commit interview text),
lifecycle-runner agent lines 3 and 15–16 ("scoped commits" / "Commits:
scoped `git add …`"), CLAUDE.md conventions ("Checkpoint commits are
scoped").

**Acceptance:** a full create run makes no commits (git log unchanged); the
overwrite branch and reset both leave the destroyed game recoverable **via a
reported whole-game restore command**; a *fresh session* asked "bring back
the old space-miner" finds and restores the checkpoint without the user
supplying git knowledge; both sweep greps return no stale commit
instructions.

## ☑ 4. Sensible keyboard controls

**Feedback:** controls should make sense — WASD + arrows for movement, two
primary action keys, a pause button, space potentially for action.

**Change:** rework the engine's button model (`engine/input.ts`) to:

| Button | Keys (aliases) | Conventional role |
|---|---|---|
| `A` (primary) | **Space** and **Z** | jump / fire / confirm / start |
| `B` (secondary) | **X** and **C** | alt-fire / dash / cancel |
| `PAUSE` | **P** and **Escape** | pause toggle — dedicated, never remappable to gameplay |
| Movement | arrows + WASD | unchanged |

**Shift is explicitly rejected** as an action key: five consecutive presses
opens the OS Sticky Keys dialog on Windows (unpreventable from the browser),
which steals focus → blur → auto-pause, on exactly the rapid-tap pattern a
dash key invites. `C` is a single `KeyboardEvent.code`, adjacent to X, with
no OS behavior. (Escape as the PAUSE alias is acceptable — pausing is when
you'd tolerate its exits-fullscreen side effect; P is primary.)

**Multi-key data model + edge semantics (normative):** `BUTTON_KEY` becomes
`Record<ButtonName, { codes: string[]; hint: string }>`. A logical button is
**down while ≥1 of its alias keys is down**; `pressed()` fires on the 0→≥1
transition; `released()` fires only on the ≥1→0 transition (last alias key
up). This is load-bearing: building-platformer-games wires variable jump
height to `released('A')` — with naive per-key edges, tapping Z while
holding Space would spuriously cut a jump. `held()` must check all alias
codes (today it reads a single `code`).

**Surfaces (update together, one template-fix pass):** engine/input.ts +
reference game + `harness/verify.mjs` (drives the game with hardcoded
`Z`-starts / `Space`-pauses — after the remap its pause path silently tests
nothing), handling-user-input (owns the model; quotes the old `BUTTON_KEY`
type verbatim), adding-easter-egg, improving-game-quality,
building-platformer-games examples, creating-a-game routing row
("A/B/X/Y…"), helping-the-user ("four action buttons"), CLAUDE.md's API
table. **Sweep rule:** `grep -rn "A/B/X/Y\|BUTTON_KEY\|KeyZ\|'Space'\|'Enter'" .claude/ CLAUDE.md harness/ workspace/game-template/` and
update every stale hit.

**Acceptance:** reference game plays with Space (or Z) as the primary action
and P (or Esc) pausing; holding Space and tapping Z neither cuts a jump nor
re-triggers `pressed`; title hints show the real keys; harness run exercises
the new pause binding and still observes the PAUSED `stateChanged`;
`check`/`build`/`smoke` green; mechanical skill verification green.

## ☑ 5. Game must actually be running at handoff

**Feedback:** "make sure the game is running when you tell the user" — there
were handoffs where the server was already down (the gate-only flow tears
down after smoke).

**Change:** invert playing-the-game's default. The handoff state is **server
up**: after the smoke gate passes, LEAVE the dev server running, and
immediately before telling the user, re-verify liveness (the readiness
process still holds port 5173 — `lsof -ti:5173` non-empty — and an HTTP
probe of `http://localhost:5173/` returns 200). Teardown happens only on:
reset, creating/switching to a different game (port handover), or an explicit
"stop the server".

**Acceptance:** at the moment the "ready to play at <URL>" message is sent,
`lsof -ti:5173` returns a PID and the URL serves the game; the
"builds, boots clean" wording stays (the user is still the playtester).

## ☑ 6. Characters are too small

**Feedback:** character sizes are sometimes quite small.

**Change:** set a minimum readable size for gameplay-critical entities,
**expressed relative to logical resolution** so it transfers across the
160–320-wide range the visuals skill allows:
- player character ≥ **1/16 of logical height** in its larger rendered
  dimension (≈10 px at 160-high; the reference ship is 5×4 — too small);
- other gameplay-critical entities (hazards, pickups, projectiles) ≥
  **1/26 of logical height** (≈6 px at 160).

Two levers, both legitimate: bigger ASCII sprite maps, or `drawSprite`'s
`px` cell-size parameter (a 6-row sprite at `px: 2` renders 12 px).

**Hitboxes must follow the visuals** — the reference game's collision,
clamps, bounce margins, spawn offsets, and burst anchors all read hardcoded
`Entity {w, h}` values, not sprite dimensions. Scaling only the sprite gives
a 12-px-looking ship with a 5×4 hitbox: visibly-touching hazards don't kill,
visibly-touched pickups don't collect. Rule: every entity's `w/h` within
~1 logical px of its rendered size.

**Surfaces:** reference game sprites AND its `Entity` structs + derived
constants (overlaps, clamps, `placePickup` offsets, burst anchor points);
ensuring-arcade-visuals (replace "3–8 rows" guidance with the relative floor
+ the `px` technique + the hitbox rule); improving-game-quality (readability
check gains the floor).

**Acceptance (objective + human):** measured rendered bounding boxes meet
the fractions above in the reference game and in generated games' quality
pass; hitbox-vs-rendered mismatch ≤1 px; the human check ("reads clearly at
a glance") remains as confirmation, not as the only bar.

## ☑ 7. Difficulty scaling is too slow

**Feedback:** the ramp is barely felt.

**Scope: endless/score games** — finite-goal games (a climb, a flag) keep
their existing exemption in improving-game-quality (their difficulty is
spatial by design; bolting timers onto them is an overcorrection nobody
asked for). This item sharpens the *endless-game* bar only; the two
instructions must not conflict — the skill text states the scope in the same
sentence as the bar.

**Change:** in endless/score games, difficulty must be *felt within the
first 30 seconds* of active play and put a competent player under real
pressure by ~2 minutes. The reference game's ×1.06-per-pickup speed-up
doubles only after ~12 pickups — retune (e.g. ×1.10–1.15 per pickup plus a
slow time-based component so idling doesn't stall the ramp).
improving-game-quality's ramp item gets the concrete bar.

**Acceptance:** playing the reference game, the hazard is visibly faster
within 30s and genuinely threatening by 2min without collecting unusually
many pickups; a goal-platformer generated after this change gets no ramp
demanded of it by the quality pass.

## ☑ 8. Animations are too subtle

**Feedback:** shake/flash/burst effects are hard to see.

**Change:** raise the juice floor so feedback is unmissable:
- **Shake:** major events (death/explosion) ≥ 4–6 logical px amplitude,
  ≥ 0.4s (reference uses 3px/0.35s — below the floor).
- **Flash:** full-screen flash on death holds ≥ 0.3s.
- **Hit-stop must be visible — defer the death transition.** The reference
  already calls `hitStop(0.12)` but transitions to GAME_OVER in the same
  tick, and `frozen` only gates the PLAYING branch — the frozen tableau is
  never drawn, at any duration. The death flow becomes: freeze in PLAYING
  (~0.15s, burst/shake/flash visible over the frozen world), and transition
  to GAME_OVER only when the hit-stop expires. This is a reference-game
  restructure, not a parameter retune, and it is the pattern the skills
  teach.
- **Bursts:** *transient* impact particles sized 2–3 logical px (engine
  default `rand(1,2)` is barely visible under CRT darkening), counts per the
  existing significance guidance, speeds high enough to clear the sprite
  silhouette. **Ambient particle sizes are explicitly unchanged** — bumping
  them would make stars/snow read as pickups and collide with item 9's
  ambient-below-actor rule.

**Surfaces:** engine `particles.ts` (transient default size), `juice.ts`
docstring magnitudes, reference game (death-flow restructure + retuned
calls), improving-game-quality — including its **canonical "biggest events"
example** (`flash(…, 0.25)` / `hitStop(0.12)`), which is below the new
floors and sits in the repo's only quality checklist; it must be updated to
meet them. New quality check: the "arm's-length test" — every significant
event visible without looking for it.

**Acceptance:** in the reference game, a pickup is noticeable and a death is
unmissable from arm's length; the death freeze-frame is actually rendered
(≥1 frame of frozen PLAYING world visible before the GAME_OVER screen); no
skill example specifies juice below the floors.

## ☑ 9. Contrast floor + red-green color-blind safety

**Feedback:** the background color sometimes blends in with the character
color — that can't happen. Also make it red-green color-blind friendly.

**Change — the floor is the gate; the role partition is only guidance.**
Computed check: `contrast(a, b)` relative-luminance helper added to
`engine/palette.ts`; floor **≥ 3:1** between every gameplay-critical entity
color and every **static** surface it can overlap — the clear color and
drawn scenery/terrain. (A partition alone provably fails: PICO8
red-vs-dark-grey is 1.81:1, red-vs-dark-purple 2.35:1 — both
"partition-legal" and both invisible.)

**Ambient particles get a prominence band, not the actor floor** — a 3:1
actor-vs-ambient requirement is degenerately satisfiable only by an
invisible starfield: red's luminance caps a 3:1-compliant ambient below
perception for 1–2px dots under CRT darkening (computed: every visible
PICO8 dim color fails at least one of the reference's actor colors).
Instead: ambient particle colors sit in a band **just above the
background** — contrast vs the clear color between **~1.8:1 and ~2.5:1,
retuned toward the top of the band** — at 1–2 px sizes. The floor is 1.8
(not lower) because the CRT pass darkens everything (scanlines alpha 0.18,
vignette at edges): a 1.2:1 dot renders sub-perceptual after CRT. This
keeps atmosphere visible while structurally incapable of competing with
actors (which clear ≥3:1 over the same background).
- **All 16 indices get roles** in `palette.ts` docs: background (0/1/2/5),
  scenery (3/4/6/13/15 — usable for terrain, still subject to the floor
  vs actors), actor (7/8/9/10/11/12/14). Roles guide selection; the floor
  decides legality.
- **Ambient presets are an engine surface:** `particles.ts` hardcodes
  `#FFF1E8` (white — the brightest actor color) for stars/snow and the
  reference ship's exact blue for rain, and exposes no color option — game
  code cannot comply today. Retune the preset colors into the prominence
  band above (or add a color option with band-compliant defaults).
- **Red-green safety:** a red-vs-green hue difference may never be the only
  distinction between critical entity classes; require two of hue-family
  (prefer blue/orange/yellow pairs), brightness, silhouette. Grayscale
  ambiguity check added to ensuring-arcade-visuals + improving-game-quality.

**Surfaces:** engine `palette.ts` (roles + `contrast()`), `particles.ts`
(preset colors), reference game (verify post-dim), ensuring-arcade-visuals,
improving-game-quality.

**Acceptance:** in the reference game, every critical entity passes the
3:1 floor against the clear color (and any scenery), verified with
`contrast()`; the retuned ambient colors sit inside the 1.8–2.5:1 band vs
the clear color AND the ambient layer passes item 8's arm's-length test
with the CRT filter on (visible atmosphere — "the background is empty" is
a failure); pickup and hazard remain unambiguous in grayscale; no skill
example recommends a red-vs-green-only distinction.

## ☑ 10. Visual variety across generated games

**Feedback:** particle effects and character designs are too similar across
different generated games.

**Root causes (address all three):**
1. **The reference game is an attractor** — writers adapt `main.ts`, so its
   starfield + blue ship + yellow `+` pickup + red `x` hazard leak into
   every game.
2. **Hardcoded engine defaults** — `burst()` defaults to the same yellow
   1–2px particles everywhere; `'stars'` is the path-of-least-resistance
   ambient.
3. **Model house-style** — without forced divergence, a writer model settles
   into one fixed aesthetic across runs.

**Change:**
- **Style card before code** (creating-a-game step 4): before the first
  milestone save, the writer derives 2–3 distinct visual directions from the
  game's fiction — each a one-liner: palette + background/actor color
  indices, ambient preset, sprite silhouette language, juice personality —
  picks one, and records it as a comment block atop `main.ts`.
- **Divergence rule with a concrete comparison set** (ensuring-arcade-
  visuals): the style card must differ from (a) the reference game's
  combination — always reserved — and (b) the style cards of **every game
  currently in `workspace/`** (read the comment blocks atop their
  `main.ts` files before choosing). Bursts use the game's own palette
  colors — never the engine default yellow.
- **Widen the raw material AND make it reachable** (template fix): add 2–3
  curated palettes to `palette.ts` (neon/synthwave, warm sunset, cold
  ocean) — and update every surface that enumerates the palette universe,
  or the new palettes don't exist for writers: **CLAUDE.md's API-table
  palette row**, **ensuring-arcade-visuals' palette table** (list all
  palettes; drop "PICO8 … the default choice"), **ensuring-arcade-visuals'
  visual-pass checklist** (independently hard-enumerates
  "PICO8/GAMEBOY/DUSK" — a synthwave game would flag its own palette as a
  violation at the gate writers actually run), **adding-easter-egg's
  palette enumeration**, and — the surface that actually gates
  reachability — **the engine barrel `engine/index.ts`** (it hard-enumerates
  the palette exports; skills mandate barrel-only imports, so a palette
  missing there fails `npm run check` for every writer regardless of what
  the docs say). **Sweep rule:**
  `grep -rni "gameboy" .claude/ CLAUDE.md workspace/game-template/` — every
  hit that enumerates palettes must list the full set.
- **Quality check** (improving-game-quality): "would a screenshot of this
  game be mistaken for the reference game or another game currently in the
  workspace? If yes, the visual pass failed."

**Honest scope:** cross-*session* variety after a reset (no coexisting games
to diverge from, no persistent style history) is NOT solved by this item —
a durable style-history store belongs to the deploy epic. Within one
workspace lifetime, the mechanisms above are enforceable.

**Acceptance:** any two games coexisting in `workspace/` differ on
**sprite silhouettes AND at least one other axis** (palette-index scheme,
ambient preset, or burst colors *beyond the palette mapping* — burst color
is a function of the palette per this item's own mandate, so a pure
palette swap must not count twice; without the silhouette requirement, a
recolor of the same game passes, which is literally what adding-easter-egg
ships as a toggle). **Ambient is exempt from the count when the fiction
locks it** (two space games may both use `'stars'` per
improving-game-quality's fiction-fit check — they must still differ on
silhouette plus another axis; an all-four-axes demand would put this item
at war with that check and hard-cap coexisting games at the preset count).
Every generated game carries a style-card comment atop `main.ts`; every new
game differs from the reference on at least palette-or-ambient AND
silhouette.

---

### Sequencing note

Items 2+3 land together (recoverability moves from create-time to
reset/overwrite-time). Item 5 is a small playing-the-game + creating-a-game
edit and can land first. Items 4 and 6–10 all touch the template (engine +
reference game), the harness, and skills — land them as one "controls &
feel" template-fix pass with a single re-verification (mechanical skill
check, clone build/smoke, harness run incl. the new pause binding, hint
rendering, contrast/grayscale checks, size-floor measurements).

---

## Execution prompt (paste into a fresh session to implement this spec)

> Read `IMPROVEMENTS.md` in full — it is the sole spec for this work and has
> survived three adversarial review rounds; treat every mandate, floor,
> exemption, and acceptance bar in it as settled. `CLAUDE.md` holds the repo
> conventions — follow them exactly. Do not relitigate decisions recorded in
> either file; if you find a genuine contradiction, stop and surface it.
>
> Implement all open items in this order:
> 1. **Item 5** (server-up handoff) — small, lands first.
> 2. **Items 2+3 together** (questionless reset + commit-free interaction) —
>    recoverability moves to reset/overwrite-time; run every sweep grep the
>    items specify and update every hit.
> 3. **Items 4+6+7+8+9+10 as ONE "controls & feel" template pass** — engine,
>    reference game, harness, skills, and CLAUDE.md updated together.
>
> Rules:
> - Work on branch `claude/funny-tesla-lclnmj`; one commit per group above,
>   each pushed; a failed commit is a hard error. No PR unless asked.
> - The template is never run in place — verify every template change against
>   a clone (`cd workspace/<clone> && npm run check/build/smoke`, dev-server
>   lifecycle per playing-the-game).
> - After skill edits, mechanically verify every command, path, engine
>   export, and constant named in all 11 SKILL.md files exists in the
>   template as written — a dangling reference is a hard failure; frontmatter
>   descriptions must start "Use when ...".
> - After the template pass, run `node harness/verify.mjs` against a running
>   clone — it must exercise the NEW pause binding — and re-run the full gate
>   set.
> - Execute each item's Acceptance bar explicitly: machine-checkable bars run
>   for real (`contrast()` computations, size measurements, item 2's git-flow
>   cases including twice-in-a-row reset and the stray-directory case);
>   human-only bars (arm's-length test, "reads at a glance") go to the user
>   as a short playtest list — never claimed as passed.
> - Finish with two adversarial reviewers (engine/runtime lens;
>   workflow/docs lens) reviewing the implementation against this spec; fix
>   and loop until both return NO FINDINGS.
> - End state: all items marked ☑ here, `workspace/` holds only a pristine
>   `game-template`, no server on 5173, `git status` clean, branch pushed.
>   Report per item: what changed, gate results, and the user playtest list.
