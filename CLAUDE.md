# CLAUDE.md

Guidance for Claude Code sessions working in this repo. This file is written for an
agent picking up the codebase cold — architecture, invariants, and scope boundaries
that aren't obvious from reading any single file.

## What this is

A client-side D&D 5e combat Monte-Carlo simulator: React + TypeScript + Vite, no
backend. Users configure a party and an encounter, give each combatant a priority
script of conditional actions, then run many simulations and see aggregate outcomes.
Deployed as a static site to GitHub Pages on every push to `main`.

## Commands

```bash
npm install
npm run dev      # local dev server
npm run test     # vitest run — engine + ai + state unit tests
npm run test:watch
npm run build    # tsc -b && vite build — type-checks then builds
npm run preview  # serve the production build
```

Run `npm run test` (and ideally `npm run build` for the type-check) before
considering a change done — CI (`.github/workflows/deploy.yml`) runs both on every
push to `main` and blocks deployment if either fails.

## Architecture

```
src/
  engine/   pure, deterministic simulation core (framework-free, unit-tested)
  data/     SRD.ts (curated actions, sample PCs/monsters, default scenario), weapons.ts
  ai/       "AI authoring" — natural-language -> scenario draft, via a user-supplied
            Claude/OpenAI API key called directly from the browser
  state/    localStorage persistence + JSON import/export (store.ts)
  ui/       React components (tabs, editors, rule builder, results, replay)
```

Dependency direction is one-way: `ui` calls into `state`/`ai`/`engine`; `engine` has
no React dependency and doesn't know `ui` or `state` exist. Keep it that way — the
engine is designed to be tested and reused in isolation (`runMany()` /
`runSimulation()` is the entire surface the UI needs).

Engine internals, if you need to trace a turn: `simulator.ts` drives the round loop
-> `rules.ts` (`chooseAction`) picks a rule/action/target -> `actions.ts`
(`performAction`) resolves attack/save/heal/rider/condition effects -> `state.ts` /
`conditions.ts` hold combatant state -> `dice.ts` is the only source of randomness
(seeded `RNG`) -> `log.ts` / `statistics.ts` summarize a run.

## Invariants — don't break these

- **Determinism.** The same seed + scenario must always produce the identical
  `RunResult`. All randomness goes through the seeded `RNG` in `dice.ts`; never call
  `Math.random()` inside the engine (UI-only id generation in `state/store.ts`'s
  `genId` is the one sanctioned exception, since it doesn't affect simulation
  results).
- **Linear (1D) battlefield** Positioning is a single feet-based
  axis (`Combatant.position`, `Action.range`, `Action.aoeRadius`). This is a
  deliberate simplification — 2D/grid positioning is deferred to a later stage. If asked to
  improve range/AoE/movement, do it within the linear model.
- **Scenario is plain, serializable JSON** (`Scenario` in `engine/types.ts`),
  persisted to `localStorage` and exportable/importable as-is. When you add a new
  field to `Scenario`/`Combatant`/etc., add a back-compat default for it in
  `loadScenario()` and `normalizeScenario()` in `state/store.ts` — old saved
  scenarios and imported JSON must keep loading without it.
- **API keys never leak.** `ai/providers.ts` stores provider settings (including API
  keys) in their own `localStorage` bucket, separate from scenario/draft state.
  `sanitizeForExport()` in `state/store.ts` strips any key matching
  `isApiKeyField()` before JSON export. If you add a new field anywhere that could
  plausibly hold a secret, make sure it can't ride along in a scenario/bundle
  export.
- **Script/rule resolution is "first match wins."** Each combatant's `script` is
  evaluated top-to-bottom every turn; the first `Rule` whose condition passes *and*
  whose action is available (slot left, legal target) fires. No rule firing falls
  back to Dodge — a simulation must never stall.

## Scope boundaries (settled; don't relitigate without asking)

- **Reactions (opportunity attacks, Shield, Counterspell), legendary actions, a full
  resistance/immunity matrix, and death-save detail are not modeled yet, but they
  are roadmap items**, not rejected features. When touching turn resolution or the
  action economy, prefer designs that leave room for these later rather than ones
  that assume they'll never exist.
- **AI authoring is a core feature**, not experimental — it's a first-class way to
  build a scenario, on par with the manual editors. The prompt contract in
  `ai/schemaPrompt.ts` (`AI_GENERATION_SYSTEM_PROMPT`, the `AIScenarioDraft` shape)
  is load-bearing: if you change `Action`, `Combatant`, `Rule`, `RuleCondition`, or
  `TargetSelector` in `engine/types.ts`, update the mirrored draft types in
  `ai/types.ts`, the system prompt in `ai/schemaPrompt.ts`, and the
  validation/conversion logic in `ai/validateDraft.ts` / `ai/convertDraftToScenario.ts`
  together — they must stay in sync or AI-authored scenarios will silently drift
  from what the engine actually supports. A draft is always reviewed/approved by
  the user before it's applied; don't remove that human-in-the-loop step.

## Conventions

- Scenario mutations go through the immutable `upsert*`/`remove*` helpers in
  `state/store.ts` (e.g. `upsertCombatant`, `upsertAction`) rather than mutating a
  `Scenario` in place.
- IDs are generated with `genId(prefix)` (e.g. `genId('act')`), not hand-rolled.
- Tests live next to what they cover, either as `*.test.ts` or in a sibling
  `__tests__/` folder; `src/test/fixtures.ts` holds shared test scenario builders.
