---
name: designing-mechanics
description: Use when a rules-heavy game (RPG, roguelike, deck-builder, tactics, management or idle sim) is being created, or a system is added, removed or reshaped in one ("add classes", "a second act", "meta-progression"), or "more replayable / longer runs / more depth" is asked without a concrete mechanic — never for arcade action games. Puts two or three options with their trade-offs on the table, gets the user's decision, and writes it as the game's DESIGN.md contract before any code moves.
---

# Designing mechanics

A rules-heavy game is a set of systems the player makes decisions inside; the fun is in the decisions and the numbers, so the rules are designed before they are drawn. `workspace/<game-name>/DESIGN.md` is the contract every module follows and the simulator measures against. Mechanics work starts there, not in the screens. **The user decides; Claude lays out the options and recommends one.**

Arcade action games (dodgers, shooters, platformers, breakout) never take this path — their feel is tuned by playing, through **improving-game-quality** and **building-platformer-games**.

## 1. Frame the request against the run

For a run-based game the unit of fun is one **run**, and replayability is "the next run is a different decision problem". For a sim or management game read "run" as "session" or "season". Before proposing anything, place the request on these axes and say which it moves:

- **Run length** — turns, fights, floors or days per run, and how many minutes that is. Longer is not better by itself; longer with the same decisions is padding.
- **Decision density** — how often the player chooses something that matters (route, card, target, upgrade, spend). Every new system should add a decision, not a stat.
- **Build variety** — the number of distinct winning shapes. If every simulator policy converges on the same choices, the option pool is the problem, not the numbers.
- **Between-run progression** — unlocks, classes, a starting draft. The only way a *lost* run pays forward; keep it small so losing keeps its teeth.
- **Variance** — events, curses, mutators, elite modifiers: "what will it throw at me this time".

## 2. Put two or three options on the table (skip if already specified)

If the user's prompt already specifies the core systems, stat/content tables, screens, and scope cut, **skip the Q&A stop** and write `DESIGN.md` directly from their spec. Otherwise, for each option write one line each: what it adds, what it costs (complexity, new screens at 240×160 and their label lengths, simulator work), which axis it moves, and a rough size (one milestone, a few). Recommend one and say why. Then **stop and ask** — when the design is open, blocking for the user prevents building the wrong mechanic. For a brand-new game, also confirm the scope cut (**helping-the-user**: one act, one deck, one dungeon first).

## 3. Write the contract before the code

When the direction is agreed, write or edit the game's `DESIGN.md` **first** (in the clone, next to `STYLE.md`; a new game creates it right after creating-a-game's Step 3). Keep these sections, short:

- **The run in one paragraph** — the loop, the lose condition, the win condition.
- **Systems** — each with its rules in plain sentences, its types and its tuning constants by name (the names `game/types.ts` will carry, e.g. `HERO_START`, `POTION_HEAL`).
- **Content** — the tables `game/data.ts` will hold (enemies, items, cards) and what varies between rows.
- **Screens** — one line per screen: what it shows, which decision it asks, which scene it lives in (the engine's scenes are `TITLE → PLAYING ⇄ PAUSED → GAME_OVER | WIN`; sub-screens such as map / battle / reward live inside `PLAYING` as a field of the `Game` state, dispatched by a lookup table like the template's `frame.ts`).
- **Difficulty targets** — the numbers the simulator must hit, per policy, e.g. "balanced wins 15–25 %, random < 5 %, every archetype above 0 %". Restate them whenever a change is meant to move them.
- **Balance state** — the latest simulator numbers and the date (filled in by **balancing-with-the-simulator**).
- **Module layout** — which file owns which concern (below), kept true as the code grows.

The layout is fixed by the lint and dependency-cruiser boundary: rules are **headless** — `game/types.ts` (shared types and tuning), `game/data.ts` (content tables), `game/sim.ts` (the barrel, the one import path for rules) and `game/sim/<concern>.ts` (one rules concern per file, plus the simulator's policies and run loop). They never import the engine, presentation modules or the DOM, and never call `Math.random` — rules take an injected `rng`. Presentation (`state.ts`, `play.ts`, `view.ts`, `screens.ts`, `frame.ts`, …) imports rules only through `'./sim'` and only presents them. A mechanic the simulator cannot run cannot be balanced: if it needs player skill (timing, aiming) it belongs in presentation only, and the contract says so.

## 4. Then build in milestones

Hand to **creating-a-game** (Step 4) or **iterating-on-a-game**:

1. **Rules first, headless**: write `types.ts`, `data.ts`, and `game/sim/*` per **balancing-with-the-simulator**'s layout in parallel `Write` calls, with `sim/run.mjs` and its policies. Run `npm run check && npm run lint` once at the end of the batch (not after every single file save); then run `npm run sim` to see the new system move the numbers against the targets.
2. **Presentation second**: write screens, sprites, and juice per **ensuring-arcade-visuals** and `STYLE.md` in parallel `Write` calls; inspect all screens in **one batched** `npm run look -- --scenes title,playing,gameover` (plus any extra query params like `playing?screen=shop`). A sub-screen inside `PLAYING` gets reached by the dev hook — extend `game/devhook.ts`'s fixture builders so `--scenes` lands on the screen that matters, and report the sub-screen in `state()`.
3. **Quality pass last** (**improving-game-quality**), then `npm run verify -- --scenes title,playing,gameover` (reserve `--full` for structural/template changes or explicit full audits).

`DESIGN.md` moves with the code: a rules change edits the contract in the same milestone. A mechanic is done when its policy line in the simulator report is where the contract says it should be **and** the user has played it.
