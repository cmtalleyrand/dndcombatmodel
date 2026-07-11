# Assessment & Handoff

Working document produced during the app evaluation. It contains:

1. **Feature / resource system — honest assessment** (informs any redesign that should
   happen *before* the content migration below).
2. **Handoff: migrate existing content onto the feature/resource system** — instructions
   for another agent.
3. **Handoff: 2024-rules content pass** — instructions for another agent.
4. **Handoff: reaction economy** — pointer (deferred, out of current scope).
5. **AI authoring workflow — critical UX assessment** (user perspective).

File/line references are accurate as of this writing; re-grep before acting.

---

## 1. Feature / resource system — honest assessment

The composable feature/resource layer (`Feature`, `ResourcePoolDefinition`,
`FeatureResourceSpend`, `AttackModifierEffect`, `ExtraActionEffect` in
`src/engine/types.ts:201-250`) is a well-shaped idea with a genuinely good core, but it
is **half-wired, and it does not subsume the older `riders` mechanism** — so the codebase
now carries two-and-a-half overlapping ways to attach on-hit effects. Fix these before
migrating content onto it, or the migration will bake the inconsistencies in.

### What's good
- **Resource-gated features work and are tested.** `canSpendFeature`/`spendFeature`
  (`actions.ts:389-398`) check a per-combat resource pool + `oncePerTurn`, and
  `features.test.ts` covers Battlemaster-style `missWithin` (Precision), `onHit` resource
  spend, and Action Surge (`actionEconomy` extra action). Resource pools initialise per
  combat in `buildCombatState` (`state.ts:118-126`).
- **Clean consumption sites.** `applicableFeatures(state, actor, action, timing)`
  (`actions.ts:383-387`) filters by timing + optional `actionIds`, and the four live
  hooks in `resolveAttack`/`consumeExtraActionFeature` read cleanly.
- **Non-destructive to legacy content.** Everything is optional and null-guarded
  (`?? []`), so scenarios without features load and run unchanged.

### What's broken or incomplete
1. **3 of 7 declared timings are dead.** `FeatureTiming` declares
   `precombat | startOfTurn | beforeAttackRoll | afterAttackRollBeforeHitResolution |
   onHit | afterHit | actionEconomy` (`types.ts:201-208`), but only `beforeAttackRoll`,
   `afterAttackRollBeforeHitResolution`, `onHit`, and `actionEconomy` are ever passed to
   `applicableFeatures`. A feature with `timing: 'startOfTurn'`, `'precombat'`, or
   `'afterHit'` **silently never fires**. This blocks start-of-turn auras (Spirit
   Guardians), pre-combat buffs, and after-hit riders — exactly the content people will
   want next.
2. **Features can't express combat-state triggers, so they can't replace `riders`.**
   `riders` (`DamageRider`, consumed by `applyRiders`, `actions.ts:411+`) gate on
   `hasAdvantage`, `advantageOrAllyAdjacent`, `targetHasCondition`, `selfHasCondition`,
   plus `meleeOnly` — that's how Sneak Attack / Rage / Hunter's Mark are modelled.
   `Feature` has **none** of these triggers; it gates only on resources + timing +
   `oncePerTurn`. Conversely, `riders` can't spend resources or grant extra actions.
   **Neither system subsumes the other**, so hand-authored SRD content uses `riders`
   while AI-authored content uses `features`, and an author must know which lever to pull.
3. **A third path exists.** `legacyActionFeatures` (`actions.ts`) bridges
   `action.extraDamage` and `action.applyConditions` into synthetic `onHit` features. So
   on-hit extra damage can be authored **three** ways: `action.riders`,
   `action.extraDamage` (bridged), or a real `Feature.extraDamage`. Redundant surface.
4. **No binding validation.** Features attach via `combatant.featureIds` →
   `scenario.features`. A typo'd id (or, in AI drafts, a `declaredFeatureName` that
   doesn't resolve — see `convertDraftToScenario.ts:100`) silently orphans the feature:
   it's defined but attached to no one and never fires. (Change C in the earlier PR made
   the AI model *emit* `declaredFeatureNames`; it did **not** add this validation.)
5. **The AI converter silently drops unsupported timings.** It filters `triggeredEffects`
   to `onHit | actionEconomy` only (`convertDraftToScenario.ts:55`). A model-decomposed
   `startOfCombat` / `startOfTurn` / `afterMiss` effect is discarded with no warning.
6. **`attackModifier` is offense-only** (`toHit`, `damage`; `types.ts:225-229`) — no
   advantage-granting, save-DC, or AC/defensive modifiers, so Shield/defensive features
   can't be expressed even ignoring the reaction gap.
7. **No resource-refresh model** (short/long rest). Fine for a single encounter; a limit
   for multi-encounter days.

### Recommended changes *before* the content migration
- **A. Decide the timing surface.** Either wire `startOfTurn` (minimum — auras/regen),
  `precombat` (opening buffs), and `afterHit`, or delete them from `FeatureTiming` so the
  type stops advertising capability that doesn't exist. Recommendation: wire
  `startOfTurn` + `precombat`, drop `afterHit` (folds into `onHit`).
- **B. Unify triggers → one mechanism.** Add the rider trigger vocabulary
  (`hasAdvantage`, `advantageOrAllyAdjacent`, `targetHasCondition`, `selfHasCondition`,
  `meleeOnly`, `oncePerTurn`) to `Feature` (e.g. a `condition?: FeatureTrigger` field
  parallel to `spend`). Once a Feature can do everything a `DamageRider` can, **`riders`
  and `legacyActionFeatures` become deprecatable**, leaving a single system.
- **C. Add binding validation** in `engine/validation.ts` (and mirror in
  `ai/validateDraft.ts`): every `featureId`/`declaredFeatureName` must resolve to a real
  feature; warn on orphaned scenario-level features.
- **D. Reconcile AI timings** — map the model's `startOfCombat`→`precombat`,
  `startOfTurn`→`startOfTurn` once wired, and stop silently dropping them.

Do A–D first; the migration in §2 assumes a Feature that can express what `riders` do.

---

## 2. Handoff — migrate existing content onto the feature/resource system

**Goal:** move hand-authored SRD content off the legacy `riders` / `action.extraDamage`
paths onto the unified `Feature` model (post-§1 changes), so there is one mechanism and
new capabilities (resources, action economy, start-of-turn) are available to curated
content — without breaking old saved/imported scenarios.

**Preconditions:** §1 items A + B landed (Feature can express combat-state triggers and
at least `startOfTurn`). If they haven't, STOP and do them first.

**Scope of existing content to convert** (`src/data/srd.ts`, ~3 `riders:` sites):
- **Sneak Attack** (`act-rogue-shortbow`, rider `2d6` / `advantageOrAllyAdjacent`,
  `oncePerTurn`) → a `Feature` with the equivalent trigger, bound to the Rogue via
  `featureIds`.
- **Rage** (`act-greataxe-rage`, `selfHasCondition: raging`, `meleeOnly`, plus the
  physical-resistance side handled by the `raging` condition) → a `Feature`; keep the
  condition-driven resistance as-is.
- **Hunter's Mark / Hex** (`act-longbow-hunters-mark`, `targetHasCondition: marked`) →
  a `Feature`.
- **Extra Attack / Action Surge demos** — already representable via `extraAction`
  (`actionEconomy`); ensure the Fighter carries them as features rather than the
  `act-*-2x` `attackCount` shortcut where a feature is more faithful.
- **Monster on-hit effects** authored via `action.applyConditions` (e.g. Ghoul paralysis)
  → leave as-is unless §1-B unifies them; they already bridge through `legacyActionFeatures`.

**Steps**
1. Add a `features:` library to `defaultScenario()` and give each affected SRD combatant
   `featureIds` (use `genId`/stable ids; keep names matching what the AI prompt expects so
   AI and curated content share a vocabulary).
2. Re-express the three riders as features; **delete the `riders` from those actions only
   after** the feature equivalents are verified in simulation (compare aggregate
   damage-dealt before/after on a fixed seed — should be within RNG noise, ideally
   identical if triggers map 1:1).
3. Back-compat: keep the engine reading `riders` (don't remove `applyRiders`) so old
   exports still work; add nothing to `normalizeScenario` unless you remove a field.
4. Update `src/data/__tests__/srd.test.ts` + `engine/__tests__/riders.test.ts` (or a new
   `features.test.ts` case) to assert the migrated Rogue/Barbarian/Ranger still deal their
   expected riders via the feature path.
5. Update `CLAUDE.md` (the "riders" invariant note) once `riders` is deprecated.

**Definition of done:** SRD content uses features; `npm run test` + `npm run build` pass;
a fixed-seed run of `defaultScenario()` produces the same winner/damage distribution as
before the migration.

---

## 3. Handoff — 2024-rules content pass

**Context:** the project is *mostly* on 2024 rules (weapons carry 2024 masteries;
commit "Wave 3: standardized on 2024") but stragglers remain in 2014 form. The decision
is to **commit fully to 2024** and make that explicit everywhere.

**Documentation (do first, cheap):**
- State "**Rules edition: D&D 2024 (rules glossary / 2024 PHB & MM)**" prominently in
  `README.md`, `CLAUDE.md` (a new invariant line), and somewhere in-app (e.g. the
  Initiative tab header or an `InfoHint`).

**Content audit & fixes (`src/data/srd.ts`):**
- **Known straggler:** `act-inflict-wounds` is a `spellAttack` for `3d10`
  (`srd.ts:233-242`) — that's 2014. 2024 Inflict Wounds is **CON save, 2d10** (no attack).
  Convert to `save: { ability: 'con' }`, `damage: '2d10'`, drop `spellAttack`.
- **Sweep every spell** for 2014-vs-2024 deltas: attack-vs-save, dice, ranges,
  concentration. Likely suspects to check: any healing/cantrip scaling, Hold Person,
  Sleep (2024 changed), the save-vs-attack cantrips.
- **Monsters:** verify stat blocks against the **2024 Monster Manual** where values
  changed; note MM 2024 uses flat modifiers and revised HP for some CR≤3 creatures.
- **Weapons:** already 2024 — spot-check mastery assignments only.

**Method:** one spell/monster per commit-group with a citation comment
(`// 2024 PHB p.xxx`), update `srd.test.ts` spot-checks to the 2024 values, keep the
save/attack change reflected in any script that referenced the old action shape.

**Definition of done:** no 2014-only mechanics remain in `srd.ts`; docs + UI declare 2024;
tests assert 2024 values.

---

## 4. Handoff — reaction economy (deferred)

Left as a documented roadmap item for a dedicated agent, per owner decision. The turn
loop (`simulator.ts`) currently has **no reaction phase**. A future implementation should
add a reaction hook (opportunity attacks first; then Shield / Counterspell / Silvery
Barbs as reaction-timed features) and a per-round reaction budget on `CombatantState`.
Design note: prefer extending the Feature timing surface (a `reaction` timing +
triggering event) over a bespoke system, so reactions ride the unified mechanism from §1.
This unblocks the defensive/utility spells that otherwise can't be modelled.

---

## 5. AI authoring workflow — critical UX assessment (user perspective)

Reference: `src/ui/AIAuthoringTab.tsx`, `src/ai/{providers,schemaPrompt,validateDraft,
convertDraftToScenario}.ts`. The flow is **provider/key → describe → generate (stream) →
validate/repair → review (easy-read + JSON) → approve (replaces scenario)**.

### What works well for a user
- **Trust model is front-and-center and correct.** "Scenario changes only on approval" is
  surfaced in the header and re-confirmed at approve time; the model never writes combat
  state directly. This is the single most important UX property and it's right.
- **Key safety is real and communicated** (own localStorage bucket, stripped from exports;
  an `InfoHint` says so).
- **Graceful no-key path** produces a local deterministic draft mirroring the current
  scenario, so a user can see the shape of the format before committing a key.
- **Self-repair** (one JSON-repair retry; a semantic-repair pass on validator issues) is
  shown transparently rather than hidden.
- **Live validity tag** on the JSON gives immediate feedback.

### Where it fails the target user (D&D players, not JSON authors)
1. **The review surface bottoms out in a raw JSON `<textarea>`.** The "source of truth"
   is JSON; the easy-read panel is a *derived summary*, not editable. A player who wants
   to nudge one monster's HP must either re-prompt or hand-edit JSON. **Biggest single
   friction.** Want: form-level edits on the approval preview that write back to the draft.
2. **"Revise" is not a conversation.** It's a single prompt box + a Revise button with no
   visible turn history; you can't see what you asked or iterate against prior drafts.
   A real chat thread (prompt → draft → "make the ogre tougher" → diff) would match
   expectations set by every other LLM tool.
3. **Approve is all-or-nothing and destructive.** It **replaces the entire scenario** with
   no merge and **no undo** — one mis-click on a populated scenario is unrecoverable
   behind a single `window.confirm`. (This is why "undo + non-native confirmation" is a
   Tier-1 fix.) Want: "merge into current" vs "replace", and undo.
4. **Silent capability gaps.** Per §1/§2, the model can decompose features whose timings
   the engine drops (`startOfCombat`/`startOfTurn`) or that don't bind
   (`declaredFeatureNames` typo). From the user's chair the encounter "generates fine" but
   plays without the feature — the worst kind of failure (silent + wrong). Want: surface
   "N declared features were not applied" in the approval preview.
5. **Discovery.** AI Authoring is the fastest way to build an encounter but sits at tab
   position 5, after all the manual editors, with no first-run pointer to it.
6. **No cost/latency signal.** BYO-key users get an elapsed clock + streamed char count
   (good) but no token/cost estimate before firing a large generation.

### Priority for a UX pass
Undo + merge-vs-replace on Approve (3) → editable approval preview (1) → "unapplied
features" warning (4) → real revise thread (2) → surface the tab earlier (5).

---

*End of handoff document.*
