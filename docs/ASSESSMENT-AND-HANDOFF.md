# Assessment & Handoff

Working document produced during the app evaluation. It contains:

1. **Feature / resource system — honest assessment** (informs any redesign that should
   happen *before* the content migration below).
2. **Convert ALL content to the unified feature/resource model** — instructions.
3. **Fix ALL content to 2024 rules** — instructions.
4. **Handoff: reaction economy** — pointer (deferred, out of current scope).
5. **AI authoring workflow — critical UX assessment** (user perspective).

File/line references are accurate as of this writing; re-grep before acting.

---

## 1. Feature / resource system — honest assessment

The composable feature/resource layer (`Feature`, `ResourcePoolDefinition`,
`FeatureResourceSpend`, `AttackModifierEffect`, `ExtraActionEffect` in
`src/engine/types.ts`) is the model all content should use. It can express what curated
content needs — resource-gated abilities, combat-state triggers, timed effects, extra
actions. The remaining problem is that the codebase still carries redundant legacy paths for
on-hit effects that duplicate it; those must go (§2).

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

The model can now express what curated content needs: all `FeatureTiming` values are live,
`Feature.condition` gates on combat state, binding is validated, features carry a
`category` classification, and the converter maps every AI timing (unmappable ones are
flagged by `validateDraft` rather than dropped). The remaining feature-system work is the
content conversion in §2.

---

## 2. Convert ALL content to the unified feature/resource model

Every mechanical special ability in `src/data/srd.ts` must be expressed through the `Feature`
model on the combatant that has it. Nothing may rely on the legacy action-level paths. This is
the whole content set, not a selection.

**Retire every legacy path. When you are done, all of these must be zero:**
- `grep -c 'riders:' src/data/srd.ts` → **0**
- `grep -c 'applyConditions:' src/data/srd.ts` → **0** — move each onto a `Feature.applyConditions`
- `grep -c 'extraDamage:' src/data/srd.ts` → **0** — move each onto a `Feature.extraDamage`
- `grep -c 'attackCount:' src/data/srd.ts` → **0** — express multiattack as an `extraAction`/`actionEconomy` feature

Then delete the `legacyActionFeatures` bridge and `applyRiders` from `engine/actions.ts` once
nothing references them. Keep `normalizeScenario`/`loadScenario` able to load older saved
scenarios that still contain these fields — the removal is of authored content and dead code,
not of load back-compat.

**Give every stat block its features.** There are **53 combatants** (25 class PCs, 28
monsters). Go through all of them. Every ability the creature or class has in 5e — Action
Surge, Second Wind, Channel Divinity, Bardic Inspiration, Divine Smite, Wild Shape, pack
tactics, every multiattack routine, regeneration, paralyzing/poisoning attacks, aura effects,
and so on — must be implemented as `Feature`s bound via `featureIds`. Do not skip creatures
because their feature "isn't interesting"; convert all of them.

**How to work:** batch by class/monster group; after each batch run `npm run test` +
`npm run build`, and where a conversion should be behavior-preserving confirm fixed-seed
simulation parity. Extend `src/data/__tests__/srd.test.ts` to assert the converted features. once complete, **remove redundant legacy paths.** `legacyActionFeatures` (`engine/actions.ts`) bridges `action.extraDamage` / `action.applyConditions` into synthetic features, and `applyRiders` should be deleted once §2 has moved all content onto `Feature`s.

**Done means:** the four greps are all 0, the bridge and `applyRiders` are deleted, and every
one of the 53 stat blocks has its 5e features implemented as `Feature`s.

---

## 3. Fix ALL content to 2024 rules

Every spell and every monster in `src/data/srd.ts` must match its 2024 stat block. Go through
all of them and correct every value that differs from 2024.

- **All 33 spell actions** (`kind: 'spell'`): fix attack-vs-save, damage dice, range, and
  duration/concentration to the 2024 form.
- **All 28 monsters**: fix HP, AC, attack bonuses/damage, multiattack, and ability modifiers
  to the 2024 Monster Manual stat block.

---

## 4. Handoff — reaction economy (deferred)

Out of scope for now; a dedicated task will implement it. The turn loop (`simulator.ts`) has
**no reaction phase**. An implementation should add a reaction hook (opportunity attacks
first; then Shield / Counterspell / Silvery Barbs as reaction-timed features) and a per-round
reaction budget on `CombatantState`.
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
4. **Silent capability gaps.** The converter filters `triggeredEffects` to a subset of timings
   (`convertDraftToScenario.ts`), so a model-decomposed effect on a timing it doesn't pass
   through is dropped without warning. From the user's chair the encounter "generates fine"
   but plays without the effect. Want: pass through every supported timing and surface "N
   declared effects were not applied" in the preview.
5. **Discovery.** AI Authoring is the fastest way to build an encounter but sits at tab
   position 5, after all the manual editors, with no first-run pointer to it.
6. **No cost/latency signal.** BYO-key users get an elapsed clock + streamed char count
   (good) but no token/cost estimate before firing a large generation.

### Priority for a UX pass
Undo + merge-vs-replace on Approve (3) → editable approval preview (1) → "unapplied
features" warning (4) → real revise thread (2) → surface the tab earlier (5).

*End of handoff document.*
