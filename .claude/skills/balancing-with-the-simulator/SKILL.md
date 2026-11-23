---
name: balancing-with-the-simulator
description: Use when a rules-heavy game's rules or numbers change (anything in game/types.ts, game/data.ts or game/sim/), when its headless rules and simulator are first set up, or when the user says it feels too easy, too hard or samey. Lays out the headless-rules modules and the sim/run.mjs Monte Carlo runner, then runs thousands of seeded runs per policy and compares them against DESIGN.md's difficulty targets before and after every change.
---

# Balancing with the simulator

Opt-in, for the rules-heavy games **designing-mechanics** routes here (RPG, roguelike, deck-builder, tactics, management sim) — never for arcade action games, whose difficulty is felt, not counted. The game's rules live headless in `game/sim/`, one concern per file, behind the barrel `game/sim.ts`; `sim/run.mjs` bundles that barrel with esbuild and plays thousands of full runs under each named policy in seconds. Never tune by feel alone.

## The headless-rules layout

| File | Holds |
|---|---|
| `game/types.ts` | shared types (`Rng`, the actors, actions) and every tuning constant by name |
| `game/data.ts` | content tables — enemies, items, cards — as `readonly` arrays or records |
| `game/sim/<concern>.ts` | one rules concern per file (`combat.ts`, `loot.ts`, `map.ts`, …) |
| `game/sim/model.ts` | the `Policy` interface — every decision a player makes, as a method |
| `game/sim/policies.ts` | `POLICIES`: named archetypes, **always including `balanced` and `random`** (`npm run verify` reports those two) |
| `game/sim/run.ts` | `simulateRun(policy, rng)` → `RunResult` (`won`, `progress`, `turns`, `deathBy`, plus any counters you add) |
| `game/sim.ts` | the barrel: the one import path for rules, for presentation and for `sim/run.mjs` |
| `sim/run.mjs` | the runner (below) — part of the game, copied from this skill, not a helper script |

The boundary is enforced, not remembered: ESLint forbids the engine, `main`/`sprites`, DOM globals and `Math.random` in those files, and dependency-cruiser's `headless-stays-headless` rule fails any import from them into presentation. Rules take an injected `rng` (the game passes `g.rng`, which the dev hook seeds with `?seed=`; the simulator passes its own seeded PRNG), so the same seed gives the same run. Presentation — `state.ts`, `play.ts`, the screens — imports rules only through `'./sim'` and only presents them; no rule is written twice. `console` is a lint error in `game/`, so telemetry goes into `RunResult`, never into logs.

## A worked toy — a five-floor dungeon

The smallest complete set, as a pattern to rename and grow (it passes `npm run check`, `npm run lint`, depcruise and `npm run verify -- --full` as written). Types and tuning in `game/types.ts`:

```ts
export type Rng = () => number;

export type Action = 'ATTACK' | 'GUARD' | 'POTION';

export interface Fighter {
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
}

export interface Hero extends Fighter {
  potions: number;
  guarding: boolean;
}

export interface EnemyDef {
  name: string;
  hp: number;
  atk: number;
  def: number;
}

export const FLOORS = 5;
export const HERO_START = { hp: 34, atk: 7, def: 1, potions: 3 };
export const POTION_HEAL = 18;
export const GUARD_FACTOR = 0.4;
export const TURN_CAP = 60;
```

Content in `game/data.ts`:

```ts
import type { EnemyDef } from './types';

export const ENEMIES: readonly EnemyDef[] = [
  { name: 'RAT', hp: 10, atk: 3, def: 0 },
  { name: 'BAT', hp: 14, atk: 4, def: 0 },
  { name: 'SKELETON', hp: 20, atk: 5, def: 1 },
  { name: 'KNIGHT', hp: 26, atk: 6, def: 2 },
  { name: 'DRAGON', hp: 32, atk: 6, def: 2 },
];
```

The rules in `game/sim/combat.ts` — hero actions are a lookup table (one line per action, exhaustive by type), an out-of-range floor throws instead of returning `undefined`:

```ts
import { ENEMIES } from '../data';
import type { Action, Fighter, Hero, Rng } from '../types';
import { FLOORS, GUARD_FACTOR, HERO_START, POTION_HEAL } from '../types';

export function createHero(): Hero {
  const { hp, atk, def, potions } = HERO_START;
  return { name: 'HERO', hp, maxHp: hp, atk, def, potions, guarding: false };
}

export function spawnEnemy(floor: number): Fighter {
  const def = ENEMIES[Math.min(floor, FLOORS - 1)];
  if (def === undefined) {
    throw new RangeError(`no enemy for floor ${floor}`);
  }
  return { name: def.name, hp: def.hp, maxHp: def.hp, atk: def.atk, def: def.def };
}

export function damage(attacker: Fighter, defender: Fighter, rng: Rng): number {
  const roll = 0.8 + rng() * 0.4;
  return Math.max(1, Math.round(attacker.atk * roll) - defender.def);
}

const HERO_ACTIONS: Readonly<Record<Action, (hero: Hero, enemy: Fighter, rng: Rng) => void>> = {
  ATTACK: (hero, enemy, rng) => { enemy.hp -= damage(hero, enemy, rng); },
  GUARD: (hero) => { hero.guarding = true; },
  POTION: (hero) => {
    hero.potions -= 1;
    hero.hp = Math.min(hero.maxHp, hero.hp + POTION_HEAL);
  },
};

export function heroAct(hero: Hero, enemy: Fighter, action: Action, rng: Rng): void {
  hero.guarding = false;
  const legal = action === 'POTION' && hero.potions <= 0 ? 'ATTACK' : action;
  HERO_ACTIONS[legal](hero, enemy, rng);
}

export function enemyAct(enemy: Fighter, hero: Hero, rng: Rng): void {
  const hit = damage(enemy, hero, rng);
  hero.hp -= hero.guarding ? Math.round(hit * GUARD_FACTOR) : hit;
}
```

The decisions a player makes, as a `Policy` in `game/sim/model.ts`, and the archetypes in `game/sim/policies.ts` — `random` must decide randomly so the button-masher floor stays honest:

```ts
import type { Action, Fighter, Hero, Rng } from '../types';

export interface Policy {
  act(hero: Hero, enemy: Fighter, rng: Rng): Action;
}
```

```ts
import type { Action } from '../types';
import type { Policy } from './model';

const ACTIONS: readonly Action[] = ['ATTACK', 'GUARD', 'POTION'];

const random: Policy = {
  act: (_hero, _enemy, rng) => ACTIONS[Math.floor(rng() * ACTIONS.length)] ?? 'ATTACK',
};

const balanced: Policy = {
  act: (hero) => (hero.hp < hero.maxHp * 0.35 && hero.potions > 0 ? 'POTION' : 'ATTACK'),
};

const reckless: Policy = {
  act: () => 'ATTACK',
};

export const POLICIES: Readonly<Record<string, Policy>> = { random, balanced, reckless };
```

One full run in `game/sim/run.ts` — a turn cap turns a stalemate into a loss instead of a hang:

```ts
import type { Fighter, Hero, Rng } from '../types';
import { FLOORS, TURN_CAP } from '../types';
import { createHero, enemyAct, heroAct, spawnEnemy } from './combat';
import type { Policy } from './model';

export interface RunResult {
  won: boolean;
  progress: number;
  turns: number;
  deathBy: string;
}

function fight(hero: Hero, enemy: Fighter, policy: Policy, rng: Rng): number {
  for (let turn = 1; turn <= TURN_CAP; turn++) {
    heroAct(hero, enemy, policy.act(hero, enemy, rng), rng);
    if (enemy.hp <= 0) {
      return turn;
    }
    enemyAct(enemy, hero, rng);
    if (hero.hp <= 0) {
      return turn;
    }
  }
  hero.hp = 0;
  return TURN_CAP;
}

export function simulateRun(policy: Policy, rng: Rng): RunResult {
  const hero = createHero();
  let turns = 0;
  for (let floor = 0; floor < FLOORS; floor++) {
    const enemy = spawnEnemy(floor);
    turns += fight(hero, enemy, policy, rng);
    if (hero.hp <= 0) {
      return { won: false, progress: floor + 1, turns, deathBy: enemy.name };
    }
  }
  return { won: true, progress: FLOORS, turns, deathBy: '' };
}
```

The barrel, `game/sim.ts`:

```ts
export { createHero, damage, enemyAct, heroAct, spawnEnemy } from './sim/combat';
export type { Policy } from './sim/model';
export { POLICIES } from './sim/policies';
export { simulateRun, type RunResult } from './sim/run';
export type { Action, Fighter, Hero, Rng } from './types';
```

## The runner — `sim/run.mjs`

Bundles `game/sim.ts` into a temp dir with esbuild (a root devDependency), runs `--runs` seeded runs per policy (`--policy a,b` or all, `--seed N`, default 2000 runs, seed 1), and prints one line per policy that starts `<policy> win NN%` — the shape `npm run verify` parses for its INFO line — or the whole report as JSON with `--json`. Same seed + same code = same numbers, so a diff is the change and nothing else. It reads only `POLICIES` and `simulateRun` from the bundle and the `RunResult` fields `won`, `progress`, `turns`, `deathBy`; extend `tally` and `printText` when you add a counter:

```js
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values: opts } = parseArgs({
  options: {
    runs: { type: 'string', default: '2000' },
    seed: { type: 'string', default: '1' },
    policy: { type: 'string', default: 'all' },
    json: { type: 'boolean', default: false },
  },
});
const RUNS = Math.max(1, Math.floor(Number(opts.runs)) || 2000);
const SEED = Math.floor(Number(opts.seed)) || 1;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pct = (n, d) => `${((100 * n) / d).toFixed(0).padStart(3)}%`;
const bump = (counts, key) => { counts[key] = (counts[key] ?? 0) + 1; };

function tally(results) {
  const deaths = {};
  let won = 0;
  let turns = 0;
  for (const r of results) {
    won += r.won ? 1 : 0;
    turns += r.turns;
    bump(deaths, r.won ? 'WIN' : r.deathBy);
  }
  const reach = results.reduce((m, r) => Math.max(m, r.progress), 0);
  const reachRate = Array.from({ length: reach }, (_, i) => results.filter((r) => r.progress > i).length / results.length);
  return { runs: results.length, winRate: won / results.length, meanTurns: turns / results.length, reachRate, deaths };
}

function printText(name, s) {
  const reach = s.reachRate.map((x) => pct(x, 1).trim()).join('/');
  const deaths = Object.entries(s.deaths).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, s.runs).trim()}`).join(', ');
  console.log(`${name.padEnd(12)} win ${pct(s.winRate, 1)}  reach ${reach}  turns ${s.meanTurns.toFixed(1)}  deaths ${deaths}`);
}

async function loadRules(dir) {
  const outfile = join(dir, 'sim.bundle.mjs');
  await build({
    entryPoints: [fileURLToPath(new URL('../game/sim.ts', import.meta.url))],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
}

function runPolicy(sim, name) {
  const policy = sim.POLICIES[name];
  if (!policy) {
    throw new Error(`unknown policy "${name}" (known: ${Object.keys(sim.POLICIES).join(', ')})`);
  }
  const rng = mulberry32(SEED);
  return tally(Array.from({ length: RUNS }, () => sim.simulateRun(policy, rng)));
}

const dir = await mkdtemp(join(tmpdir(), 'retrovibe-sim-'));
try {
  const sim = await loadRules(dir);
  const names = opts.policy === 'all' ? Object.keys(sim.POLICIES) : opts.policy.split(',');
  const report = {};
  for (const name of names) {
    report[name] = runPolicy(sim, name);
    if (!opts.json) {
      printText(name, report[name]);
    }
  }
  if (opts.json) {
    console.log(JSON.stringify({ seed: SEED, runs: RUNS, policies: report }, null, 2));
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
```

Add the two scripts to the game's `package.json` (the only edit a game makes to it):

```bash
cd workspace/<game-name> && npm pkg set scripts.sim="node sim/run.mjs" scripts.sim:quick="node sim/run.mjs --runs 500 --policy balanced,random"
```

From then on `npm run verify` adds an `INFO  sim:quick  … balanced NN%, random NN%` line (informational, never a failure) whenever `sim/run.mjs` exists, and `--full`'s jscpd also scans `sim/`. The toy above prints:

```
random       win   0%  reach 100%/100%/100%/99%/4%  turns 20.9  deaths KNIGHT 95%, DRAGON 4%, SKELETON 1%
balanced     win  73%  reach 100%/100%/100%/100%/100%  turns 23.3  deaths WIN 73%, DRAGON 27%
reckless     win   0%  reach 100%/100%/100%/100%/3%  turns 11.9  deaths KNIGHT 97%, DRAGON 3%
```

— a balanced player winning 73 % is far too easy against a 15–25 % target, and `reckless` dying to the KNIGHT 97 % of the time says that one enemy is the wall: the next knob is `POTION_HEAL` or the KNIGHT's line, one at a time.

## The loop

All commands from the game folder.

1. **Baseline before the change**:
   ```
   node sim/run.mjs --json > /tmp/sim-before-<game-name>.json
   npm run sim
   ```
   The text form is for reading; the JSON is for diffing — `node sim/run.mjs --json | cmp - /tmp/sim-before-<game-name>.json` is silent when nothing moved, the proof a refactor left the rules alone.
2. **Make the change** (via iterating-on-a-game; `npm run check && npm run lint` after every edit).
3. **Run again and compare**: `npm run sim` (`--runs 5000` for a final number, `--policy balanced,random` to focus, `--seed N` to vary).
4. **Judge against the contract** — `DESIGN.md` → *Difficulty targets*. Typical targets: balanced wins 15–25 %; random wins < 5 % and dies early; every archetype above 0 % and none far above balanced. Read the *deaths* and *reach* columns too: one enemy killing most runs is a wall, a cliff in reach between two stages is a spike, a policy that never uses a mechanic says the mechanic is not worth it.
5. **Retune the smallest knob.** Prefer a constant in `types.ts` or one row in `data.ts` over a rules change in `game/sim/`. One knob per run so the diff stays attributable.
6. **Record the new state.** When the numbers land, update *Balance state* (the numbers and the date) in `DESIGN.md` in the same milestone — it is how the next context knows what "balanced" meant when the code was last touched.

## When a new mechanic is not in the policies

The policies only exercise what they know. A new decision (a class pick, an event choice, a shop) needs a method on `Policy` (`game/sim/model.ts`) and a line in every archetype in `policies.ts` saying how that archetype decides — `random` decides randomly. A mechanic no policy can act on is invisible to balance and will be tuned wrong. If presentation plays a different topology than the simulator (a hand-drawn map vs a generated one), record that gap in `DESIGN.md`.

## Telemetry lives in `RunResult`

Add a counter there (`elitesFought`, `goldSpent`, `cardsSkipped`) rather than logging inside rules; `sim/run.mjs` aggregates whatever `RunResult` carries, and a new field is a line in `tally` plus a column in `printText`.
