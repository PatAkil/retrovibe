---
name: helping-the-user
description: Turns a vague game request into a buildable spec through behavior-elicitation questions. Invoked as creating-a-game's Step 1 gate whenever the core loop, lose condition, or controls are unknown; also useful whenever the user is unsure what they want.
---

# Helping the user

A conversation skill — no commands. Goal: get the request over the bar that **creating-a-game** Step 1 requires:

1. **Core loop** — what the player does, over and over (move + collect, aim + shoot, jump + climb, dodge + survive).
2. **Lose condition** — how a run ends. Every game must have a reachable way to lose.
3. **Controls** — which inputs do what. The engine gives you arrows/WASD for direction plus four action buttons (A/B/X/Y); details and labeling rules are owned by **handling-user-input**.

Stop asking as soon as all three are known. Two or three well-chosen questions usually suffice — don't interrogate. Fill obvious gaps with sensible retro defaults and say what you assumed.

## Question patterns

Pick the ones the request leaves open; offer concrete options rather than open-ended prompts.

**Core loop**
- "What is the player doing most of the time — dodging, collecting, shooting, jumping, or building?"
- "Is it about surviving as long as possible, reaching a goal, or racking up points?"
- "What's the one thing that gets harder as you play?"

**Lose condition**
- "What kills you — touching an enemy, falling off, running out of time, or letting something through?"
- "One hit and done, or a few lives?"

**Controls**
- "Just movement, or is there an action — shoot, jump, dash?"
- "If there's an action, what should it be called on the title screen?"

**Flavor (one question, optional)**
- "What's the vibe — space, dungeon, ocean, neon city?"

## Combining answers into a coherent loop

Behaviors the user lists separately must connect into one loop: the thing you *want* (score, progress) and the thing you *avoid* (the lose condition) should push against each other. If they don't, propose the link.

Example — user says: "an underwater game, you're a fish, there's treasure, and sharks."
- Loop: swim (arrows/WASD) to collect treasure for points.
- Tension: each treasure collected makes the sharks faster — chasing score raises the risk.
- Lose: touching a shark ends the run.
- Controls: arrows/WASD swim; one action button to dash away from a shark (short cooldown).

Resulting spec to hand back to **creating-a-game**:

> **deep-sea-dash** — Arcade collector. You are a fish; swim with arrows/WASD, collect treasure (+10 each). Sharks patrol and speed up with every treasure taken. Dash action for a brief burst of speed. Touch a shark → game over, show score, restart. Losing is possible from the first second of play; difficulty ramps forever.

## Scoping guidance — what fits a small arcade game

Steer toward what the engine and a single-screen Canvas game do well:
- **Good fits**: one screen or simple scrolling, a handful of entity types (player, 1–2 hazards, 1–2 pickups), score-chasing, endless difficulty ramp, short runs (30s–3min).
- **Trim or defer**: inventories, dialogue, save systems, multiplayer, many levels with distinct art, physics beyond simple collision. Offer the arcade-sized version: "level 1 of that idea" — e.g. "a zelda-like" becomes "one dungeon room, dodge enemies, grab the key, reach the door."
- Platformers are supported (**building-platformer-games**) but keep them to a few hand-placed screens, not a level editor.

When you scope something down, say so explicitly and confirm the smaller version is what they want before handing back to **creating-a-game**.
