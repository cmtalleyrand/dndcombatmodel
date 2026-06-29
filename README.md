# ⚔️ D&D 5e Combat Simulator

A browser app that simulates Dungeons & Dragons 5e combat encounters and reports
per-round actions, outcomes, and aggregate statistics across many Monte-Carlo runs.

Configure a party (up to 4 PCs) and an encounter (up to 8 monsters), give each
combatant a **priority script** of conditional actions, choose how initiative is
decided, then run hundreds of simulations to see how the fight tends to play out.

Everything runs client-side — no backend. Built with React + TypeScript + Vite and
deployed as a static site to GitHub Pages.

## Features

- **Combatants:** HP, AC, six ability scores, saving-throw proficiencies, proficiency
  bonus, and spell slots for up to 4 PCs and 8 monsters.
- **Reusable action library:** attacks (with multiattack), spells, and abilities with
  to-hit/damage, save-for-half, healing, applied conditions, spell-slot cost,
  concentration, and limited uses. Define once, reuse across combatants.
- **Priority scripts:** each combatant runs an ordered list of rules. The first rule
  whose *condition* passes and whose action is *available* (slot left, legal target)
  fires. Conditions include: always, self/ally HP below %, living-enemy count,
  has-condition, round number, not-concentrating, and slot-available.
- **Target priorities:** lowest/highest-HP enemy, a named priority list with a
  lowest-HP fallback, AoE (all enemies), self, and ally targeting (healing can revive
  downed allies). Optionally skip incapacitated targets.
- **Core 5e rules:** d20 attacks vs AC with advantage/disadvantage, crits, saving
  throws and DCs, conditions with durations (rounds / save-ends / concentration),
  concentration checks on damage, spell slots, and healing. Movement is abstract;
  each turn is one of move / attack(s) / spell / ability.
- **Initiative:** rolled per simulation (d20 + Dex) or a fixed order you arrange.
- **Reproducible Monte-Carlo:** the same seed + scenario always yields identical
  results. Reports party/monster win rate, average rounds, and per-combatant
  survival, ending HP, damage dealt/taken, healing, and damage per round — plus a
  representative round-by-round narrative.
- **Save & reuse:** scenarios persist to `localStorage` and can be exported/imported
  as JSON.

## What the simulator does *not* model yet

Reactions (opportunity attacks, Shield, Counterspell), real movement/positioning and
area geometry, combining a move with an action in the same turn, and finer rules edge
cases (legendary actions, full resistance/immunity matrices, death saves). These are
intentionally deferred — see the in-app notes and the plan.

## Getting started

```bash
npm install
npm run dev      # local dev server
npm run test     # engine unit tests (vitest)
npm run build    # production build to dist/
npm run preview  # serve the production build
```

Open the dev server URL, then walk the tabs left-to-right: **PCs → Monsters →
Action Library → Initiative → Run & Results**. A sample party-vs-encounter scenario
is loaded by default; click **Run** to simulate.

## How a script works (example)

A cleric whose script reads:

1. *IF any ally HP below 50% → Cure Wounds on the lowest-HP ally*
2. *IF not concentrating → Bless all allies*
3. *Always → Mace the lowest-HP enemy*

…will triage healing first, otherwise keep Bless up, and otherwise attack. Rules are
evaluated top to bottom every turn, adapting to the current battlefield state. If no
rule applies (or a combatant has no script), it falls back to Dodge so a simulation
never stalls.

## Deployment (GitHub Pages)

A GitHub Actions workflow (`.github/workflows/deploy.yml`) builds the site and
deploys it on every push to `main` (and the development branch). The Vite `base` is
set to `/dndcombatmodel/` so assets resolve at
`https://<your-user>.github.io/dndcombatmodel/`.

**One-time setup:** in the repository, go to **Settings → Pages → Build and
deployment → Source** and select **GitHub Actions**. After the next push the workflow
will publish the site.

## Project structure

```
src/
  engine/      # pure, deterministic simulation core (unit-tested)
    types.ts dice.ts conditions.ts state.ts targeting.ts
    actions.ts rules.ts simulator.ts statistics.ts log.ts
  data/srd.ts  # curated actions, sample PCs/monsters, default scenario
  state/store.ts  # localStorage persistence + JSON import/export
  ui/          # React components (tabs, editors, rule builder, results)
```

The engine is intentionally framework-free so it can be tested in isolation and
reused; the React layer only renders state and invokes `runMany()`.
