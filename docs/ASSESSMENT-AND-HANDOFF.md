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

**Status (PR #33):** A wired — `startOfTurn` and `precombat` are now invoked in
`simulator.ts` (`applyTimedFeatures`), `afterHit` removed. B done — `Feature.condition:
FeatureTrigger` added. C done — `validation.ts` flags missing/orphaned features and
`validateDraft.ts` checks `declaredFeatureNames`. **Still open:** the `legacyActionFeatures`
bridge (`actions.ts:389,434`) has **not** been removed, so the "third path" for on-hit
damage/conditions remains — its removal is coupled to the §2 decision below, not independent.

---

## 2. Handoff — migrate existing content onto the feature/resource system

**Goal:** move hand-authored SRD content off the legacy `riders` / `action.extraDamage`
paths onto the unified `Feature` model (post-§1 changes), so there is one mechanism and
new capabilities (resources, action economy, start-of-turn) are available to curated
content — without breaking old saved/imported scenarios.

**Preconditions:** §1 items A + B landed (Feature can express combat-state triggers and
at least `startOfTurn`). If they haven't, STOP and do them first.

**Status — PARTIAL, do not read as done.** A prior pass (PR #34) migrated the **three
`riders`** (Sneak Attack, Rage, Hunter's Mark) to features and bound them to three
archetypes. Those three were *examples of the mechanism*, not the scope. The majority of the
content is still un-migrated. An earlier version of this section listed those three cases and
so the follow-up did roughly those three cases — that was a scoping failure in this document,
corrected below.

**Scope is a coverage predicate over ALL content, not a case list.** "Done" is defined by
measurements that must reach a target across the whole of `src/data/srd.ts`. Drive each to
its target; a named-ability checklist is not the scope.

| Inventory command | Now | Target | Meaning |
|---|---|---|---|
| `grep -c 'riders:' src/data/srd.ts` | 0 | 0 | legacy rider path — cleared |
| `grep -c 'applyConditions:' src/data/srd.ts` | 8 | 0 \* | on-hit conditions still authored on actions, bridged via `legacyActionFeatures` |
| `grep -c 'extraDamage:' src/data/srd.ts` | 4 | 0 \* | extra damage packets still on actions, bridged |
| `grep -c 'attackCount:' src/data/srd.ts` | 7 | per decision | multiattack as a shortcut vs an `extraAction` feature |
| stat blocks carrying `featureIds` | **3 of 53** | every block with a mechanical feature | 25 class PCs + 28 monsters; almost none carry features |

\* Target is 0 **only if** the design decision below is to retire the `legacyActionFeatures`
bridge (still present, `actions.ts:389,434`). Until that decision, these sites are "working
but not unified," not "migrated."

**Gating design decision — make it before touching content.** The migration target is
undefined until someone decides, per legacy path, *eliminate or keep*:
- `action.applyConditions` / `action.extraDamage`: keep as first-class action properties, OR
  move every occurrence onto features and delete `legacyActionFeatures`.
- `attackCount` multiattack: keep as a shortcut, OR express via `extraAction`/`actionEconomy`.
Record the decision; the coverage targets follow from it. Do not migrate some sites and leave
the rest — a half-migrated content set is worse than either end state.

**The real bulk is feature coverage across stat blocks, and it is large.** 3 of 53 combatants
carry features. Every class PC (25) and monster (28) whose kit includes a mechanically
relevant feature — Action Surge, Second Wind, Channel Divinity, Bardic Inspiration, Divine
Smite, Wild Shape, pack tactics, multiattack routines, regeneration, and so on — must be
either modeled as a feature or explicitly recorded as out-of-model with a reason. **Produce a
per-stat-block inventory (one row per combatant × its features) first**, and treat the
migration as complete only when every row is either implemented or accounted for. The three
riders were the warm-up, not the work.

**Method / back-compat:** keep the engine reading legacy fields (do not remove `applyRiders`
or `legacyActionFeatures` until their grep counts are 0); migrate in reviewable batches with
fixed-seed before/after simulation-parity checks; extend `srd.test.ts` per batch; change the
`CLAUDE.md` invariant only when a legacy path actually reaches 0.

**Definition of done:** every target in the coverage table is met **and** the per-stat-block
feature inventory has no unaddressed rows. Not "the named abilities were handled."

---

## 3. Handoff — 2024-rules content pass

**Context:** the project is committing fully to **2024** rules and making that explicit. A
prior pass (PR #34) converted `act-inflict-wounds` to the 2024 CON-save / 2d10 form and added
edition markers. Inflict Wounds is **1 of 33 spell actions** — naming it as "the straggler"
in the earlier draft was the same scoping error as §2. It is one data point, not the scope.

**Documentation:** declare "**Rules edition: D&D 2024**" in `README.md`, `CLAUDE.md`, and
in-app.

**Scope is a full per-entry audit, not a suspect list.** Every spell and every monster must
be checked against its 2024 stat block; the deliverable is a *completed audit table*, not a
handful of fixes.

| Surface | Count | Audit obligation (every entry) |
|---|---|---|
| spell actions (`kind: 'spell'`) | 33 | 2024 attack↔save, dice, range, duration/concentration |
| monsters | 28 | 2024 Monster Manual: flat modifiers, revised HP/attacks, multiattack |
| weapons | 37 | mastery assignment spot-check (already 2024) |

Enumerate them (`grep -n "kind: 'spell'" src/data/srd.ts`; the monster factories), record a
verdict for **every** entry (conforms / changed → what), then fix in reviewable batches with a
citation comment and updated `srd.test.ts` assertions. An unaudited entry is not a passing
entry — do not stop at the ones that are obviously wrong.

**Definition of done:** all 33 spells and 28 monsters have a recorded 2024 verdict and every
delta is applied; docs + UI declare 2024. Not "the known stragglers were fixed."

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
4. **Silent capability gaps.** The converter still filters `triggeredEffects` to a subset of
   timings (`convertDraftToScenario.ts`), so a model-decomposed effect on an unsupported
   timing is dropped without warning even though the engine now supports more timings after
   PR #33. Binding is now validated (`declaredFeatureNames` — PR #33), which closes the typo
   case. From the user's chair a dropped effect still reads as "generates fine" but plays
   without the feature. Want: surface "N declared effects were not applied" in the preview.
5. **Discovery.** AI Authoring is the fastest way to build an encounter but sits at tab
   position 5, after all the manual editors, with no first-run pointer to it.
6. **No cost/latency signal.** BYO-key users get an elapsed clock + streamed char count
   (good) but no token/cost estimate before firing a large generation.

### Priority for a UX pass
Undo + merge-vs-replace on Approve (3) → editable approval preview (1) → "unapplied
features" warning (4) → real revise thread (2) → surface the tab earlier (5).

---

## 6. Implementation status

### Handoff sections — what later PRs actually did (mind the partials)
- **§1 feature-system fixes (PR #33): mostly done.** Timings wired, triggers unified, binding
  validation added. Open: `legacyActionFeatures` bridge not yet removed.
- **§2 content migration (PR #34): PARTIAL — riders only.** 3 `riders` migrated; 8
  `applyConditions`, 4 `extraDamage`, 7 `attackCount`, and 50 of 53 stat blocks are still
  un-migrated. See the corrected coverage table in §2 — this is not close to done.
- **§3 2024 pass (PR #34): PARTIAL — 1 spell.** Inflict Wounds converted + markers added; the
  other 32 spells and 28 monsters are unaudited. See §3's audit table.
- **§4 reactions:** untouched (as intended).

Both §2 and §3 were driven to roughly the *examples* the earlier draft named. The sections
above have been rewritten to define scope by coverage, not by case list; use those targets.

### App/UX work stream (merged via PR #32)

**Delivered (tests + build green):**
- Engine correctness: auto-crit rider doubling; charmed can't target charmer; frightened
  won't approach fear source; advantage/Bless-aware `hitChance` EV preview.
- Rules authoring: compound **AND/OR** conditions (engine + AI contract + validator + UI);
  rule rows collapse; drag-to-reorder.
- UX safety: scenario **undo/redo** + keyboard shortcuts; all `window.confirm`/`prompt`
  replaced with an accessible in-app modal.
- Accessibility: skip link; screen-reader data tables behind the win-rate and per-round
  damage charts; replay caption as a live region; non-color side cues.
- Templates: persistent **cross-scenario combatant library** (save/apply/delete, bundles
  referenced actions + weapons).
- Results: CSV export. Mobile layout pass.
- AI contract: stat-range validation; `declaredFeatureNames` in the prompt.
- Docs: corrected stale scope notes; this document.

**Remaining / deliberately deferred:**
- **Inline target-list authoring** in the RuleBuilder (create a list where it's used, not
  only on the Action Library tab). Small-to-medium UI follow-up.
- **Defensive/utility spell content** (Shield, Counterspell, Spirit Guardians, …). Reaction
  spells stay **blocked** on §4. Aura/start-of-turn spells are now **unblocked** (§1-A landed
  `startOfTurn`), so Spirit Guardians et al. can be modelled; scope this as part of §2's
  coverage work, not a separate handful.
- **Richer results:** pick which sample run to view / worst-case replay (needs
  `statistics.runMany` to retain more than the first run's frames) and PNG export (draw the
  bars to a `<canvas>` — no external lib needed, but non-trivial).
- The §1–§4 feature-system and 2024 handoffs above.

*End of handoff document.*
