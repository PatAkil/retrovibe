# Retrovibe — Improvement Spec (post-playtest)

Owner decisions from the first real playtest round, 2026-07-16. Items 2–5
deliberately **revise decisions from the original plan** (retrovibe-plan.html)
— the plan optimized for guarded autonomy; playtesting showed the guards cost
more flow than they protect. Where a revision removes a safety mechanism, this
spec names the replacement mechanism.

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

## ☐ 2. Reset without questions

**Feedback:** resetting-the-workspace should not ask the user any questions —
it should remove the games and reach a neutral starting state.

**Change:** drop the named-list confirmation and the per-game keep/commit
interview from `resetting-the-workspace`. When the user asks for a reset, do
it: stop the dev server, wipe every game folder, verify only `game-template`
remains and is git-clean.

**Replacement safety** (confirmation was the guard against losing work):
- Before deleting, make ONE automatic scoped safety commit of all game folders
  (`git add workspace/<name> … && git commit -m "checkpoint before reset"`),
  so every wiped game stays recoverable from history without asking anything.
- All non-interactive guards stay: port-based server stop first; allowlist
  delete by exact path (never a glob); CWD + template-exists pre/post checks;
  pre- and post-delete `git status --porcelain workspace/game-template` gates;
  `game-template` untouchable.
- The keep-a-game option is removed from the default flow; a user who wants to
  keep one says so in the request ("reset everything except cave-hopper"), and
  the skill honors it — it just never *asks*.

**Acceptance:** "reset the workspace" completes with zero questions; workspace
contains only `game-template`; template git-clean; every deleted game
retrievable via `git show <safety-commit>:workspace/<name>/game/main.ts`.

## ☐ 3. No commits during the create/iterate interaction

**Feedback:** there should be no commits in between while creating the user's
game as part of the interaction.

**Change:** remove the automatic checkpoint commit from creating-a-game
(step 6) and iterating-on-a-game (step 5). The create→play→iterate loop
touches git zero times; the working tree simply holds the current game.

**Replacement recoverability** (checkpoints were the reset-recovery story):
- The reset skill's automatic safety commit (item 2) captures games at the
  moment of deletion — the only moment recovery is actually needed.
- Explicit "commit/save my game" requests still commit, scoped as before.

**Acceptance:** a full create run makes no commits (git log unchanged);
reset still leaves every wiped game recoverable from its safety commit.

## ☐ 4. Sensible keyboard controls

**Feedback:** controls should make sense — WASD + arrows for movement, two
primary action keys, a pause button, space potentially for action.

**Change:** rework the engine's button map (`engine/input.ts`, `BUTTON_KEY`)
from the current A/B/X/Y = Z/X/Space/Enter to:

| Button | Keys (aliases) | Conventional role |
|---|---|---|
| `A` (primary) | **Space** and **Z** | jump / fire / confirm / start |
| `B` (secondary) | **X** and **Shift** | alt-fire / dash / cancel |
| `PAUSE` | **P** and **Escape** | pause toggle — dedicated, never remappable to gameplay |
| Movement | arrows + WASD | unchanged |

- Labels-in-code stays the single source of truth: `ActionDecl` gains
  `'PAUSE'` as a declarable button; `controlHints` renders the alias pair
  ("SPACE/Z JUMP · P PAUSE").
- Engine change ⇒ template fix commit; reference game, handling-user-input,
  adding-easter-egg, improving-game-quality, and CLAUDE.md's API table update
  together (mechanical verification re-run); WASD's `KeyW` etc. must not
  conflict with the new aliases (Shift needs stuck-key care on blur).

**Acceptance:** reference game plays with Space as the primary action and P
pausing; title hints show the real keys; `npm run check`/`build`/`smoke`
green; all skills' examples compile against the new API.

## ☐ 5. Game must actually be running at handoff

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

## ☐ 6. Characters are too small

**Feedback:** character sizes are sometimes quite small.

**Change:** set a minimum readable size for gameplay-critical entities. At the
reference resolution (240×160, scale 3) the player character must be at least
**~10–14 logical px** in its larger dimension (the reference ship is 5×4 —
too small); hazards/pickups at least ~6–8 px. Two levers, both legitimate:
bigger ASCII sprite maps, or `drawSprite`'s `px` cell-size parameter (a 6-row
sprite at `px: 2` reads as 12 px). Update:
- the reference game's ship/pickup/hazard sprites,
- ensuring-arcade-visuals (replace the "3–8 rows" guidance with the size
  floor and the `px` technique),
- improving-game-quality (readability item gains the size floor as a check).

**Acceptance:** in the reference game the ship reads clearly at a glance from
normal viewing distance; no gameplay-critical entity under ~6 logical px.

## ☐ 7. Difficulty scaling is too slow

**Feedback:** the ramp is barely felt.

**Change:** difficulty must be *felt within the first 30 seconds* and put a
competent player under real pressure by ~2 minutes. The reference game's
hazard speed-up (×1.06 per pickup) roughly doubles only after ~12 pickups —
retune (e.g. ×1.10–1.15 per pickup plus a slow time-based ramp so idling
doesn't stall difficulty). improving-game-quality's ramp item gets the
concrete bar: "noticeable change ≤30s of active play; lose-pressure real by
~2min; idling must not freeze the ramp."

**Acceptance:** playing the reference game, the hazard is visibly faster
within 30s and genuinely threatening by 2min without collecting unusually
many pickups.

## ☐ 8. Animations are too subtle

**Feedback:** shake/flash/burst effects are hard to see.

**Change:** raise the juice floor so feedback is unmissable:
- **Shake:** major events (death/explosion) ≥ 4–6 logical px amplitude,
  ≥ 0.4s (reference uses 3px/0.35s — below the floor).
- **Flash:** full-screen flash on death holds ≥ 0.3s; add a brief hit-stop
  (~0.15s) so the moment registers.
- **Bursts:** impact particles sized 2–3 logical px (engine default is
  1–2 px — barely visible under CRT darkening), counts per the existing
  significance guidance, speeds high enough to clear the sprite silhouette.
- Engine-side: bump `createParticles`/`burst` default particle size and the
  juice docstring's recommended magnitudes; retune the reference game's
  calls; improving-game-quality gains an "arm's-length test" — every
  significant event must be visible without looking for it.

**Acceptance:** in the reference game, a pickup is noticeable and a death is
unmissable from arm's length; CRT filter does not wash out the feedback.

## ☐ 9. Contrast floor + red-green color-blind safety

**Feedback:** the background color sometimes blends in with the character
color — that can't happen. Also make it red-green color-blind friendly.

**Change — contrast floor (hard rule):** gameplay-critical entities (player,
hazards, pickups, projectiles) must always be clearly separable from the
background:
- Partition each palette into **background roles** (dark indices — e.g.
  PICO8 0/1/2/5) and **actor roles** (bright indices — e.g. 7/8/9/10/11/12/14),
  documented in `engine/palette.ts`; actors never drawn in a background-role
  color and vice versa.
- Add a small `contrast(a, b)` helper to `palette.ts` (relative-luminance
  ratio) so game code and reviews can check pairs; floor: **≥ 3:1** between
  any critical entity color and the clear/ambient background it moves over.
- Ambient particles must stay *below* actor brightness (they're atmosphere,
  not actors).

**Change — red-green safety:** a red-vs-green hue difference may never be the
*only* thing distinguishing good from bad:
- Critical distinctions (pickup vs hazard, friend vs foe) must differ in at
  least two of: hue-family (prefer blue/orange/yellow pairs over red/green),
  brightness, and silhouette/shape.
- ensuring-arcade-visuals gains a "deuteranopia check": desaturate the palette
  mentally (or via the documented luminance values) — if two critical
  entities become ambiguous, change shape or brightness, not just hue.
- improving-game-quality's readability item gains both checks (contrast floor
  + no red/green-only distinctions).

**Acceptance:** in the reference game every critical entity passes the 3:1
floor against the starfield background; pickup and hazard remain
unambiguous when rendered in grayscale; no skill example recommends a
red-vs-green-only distinction.

---

### Sequencing note

Items 2+3 land together (recoverability moves from create-time to
reset-time). Item 5 is a small playing-the-game + creating-a-game edit and
can land first. Items 4 and 6–9 all touch the template (engine + reference
game) and skills — land them as one "controls & feel" template-fix pass with
a single re-verification (mechanical skill check, clone build/smoke, hint
rendering, contrast/grayscale checks).
