// Incremental, bounded repair of a validation-failing draft.
//
// The old flow re-sent the ENTIRE draft on every validation error and asked the model to return
// the whole thing again — slow, and prone to regressing parts that were already correct. Instead we
// ask the model for a small PATCH (only the items that need to change), merge it into the existing
// draft by identity, and re-validate. A bounded loop with no-progress/regression detection stops the
// endless churn: it never runs more than `maxAttempts`, and it bails the moment a round stops helping.

import type { AIScenarioDraft } from './types';

/** A partial draft: only the sections/items that changed. Merged into the base draft by identity. */
export type DraftPatch = Partial<AIScenarioDraft>;

/** Replace base entries whose key matches a patch entry; append patch entries that are new. */
function mergeByKey<T>(base: T[] | undefined, patch: T[] | undefined, key: (item: T) => string): T[] | undefined {
  if (!patch) return base;
  const result = [...(base ?? [])];
  for (const item of patch) {
    const k = key(item);
    const idx = result.findIndex((existing) => key(existing) === k);
    if (idx >= 0) result[idx] = item;
    else result.push(item);
  }
  return result;
}

/**
 * Merge a patch into a draft by item identity, so unchanged content is preserved verbatim.
 * Identity keys mirror how each section is referenced elsewhere (action/combatant name, a rule's
 * actor+priority, a policy's actor+source). Scalar fields are replaced only when the patch sets them.
 */
export function mergeDraftPatch(draft: AIScenarioDraft, patch: DraftPatch): AIScenarioDraft {
  return {
    ...draft,
    scenarioSummary: patch.scenarioSummary ?? draft.scenarioSummary,
    maxRounds: patch.maxRounds ?? draft.maxRounds,
    pcs: mergeByKey(draft.pcs, patch.pcs, (c) => c.name) ?? draft.pcs,
    enemies: mergeByKey(draft.enemies, patch.enemies, (c) => c.name) ?? draft.enemies,
    actions: mergeByKey(draft.actions, patch.actions, (a) => a.name) ?? draft.actions,
    priorityScripts:
      mergeByKey(draft.priorityScripts, patch.priorityScripts, (r) => `${r.actorName}#${r.priority}`) ?? draft.priorityScripts,
    targetPriorities: mergeByKey(draft.targetPriorities, patch.targetPriorities, (t) => t.name) ?? draft.targetPriorities,
    featureDecompositions: mergeByKey(draft.featureDecompositions, patch.featureDecompositions, (f) => f.sourceName),
    passiveTraits: mergeByKey(draft.passiveTraits, patch.passiveTraits, (p) => p.name),
    resources: mergeByKey(draft.resources, patch.resources, (r) => r.name),
    stackableModifiers: mergeByKey(draft.stackableModifiers, patch.stackableModifiers, (m) => m.name),
    triggeredEffects: mergeByKey(draft.triggeredEffects, patch.triggeredEffects, (e) => e.name),
    tacticalPolicies: mergeByKey(draft.tacticalPolicies, patch.tacticalPolicies, (p) => `${p.actorName}#${p.sourceName ?? ''}`),
    assumptionsRequiringApproval: patch.assumptionsRequiringApproval ?? draft.assumptionsRequiringApproval,
  };
}

/** Two error sets are equivalent if they contain exactly the same messages (order-independent). */
function sameErrors(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((msg, i) => msg === sb[i]);
}

export interface RepairResult {
  draft: AIScenarioDraft;
  issues: string[];
  /** how many repair round-trips were actually made. */
  attempts: number;
}

/**
 * Iteratively repair `draft` until it validates clean or we stop making progress. `requestPatch` is
 * the (injected) model call that returns a partial draft addressing the given issues.
 *
 * Stops when: the draft is clean; `maxAttempts` is reached; a round returns the same errors (no
 * progress); or a round makes things strictly worse (the bad patch is discarded). This is what
 * prevents the endless full-redraft loop.
 */
export async function repairDraftLoop(
  draft: AIScenarioDraft,
  validate: (d: AIScenarioDraft) => string[],
  requestPatch: (current: AIScenarioDraft, issues: string[], attempt: number) => Promise<DraftPatch>,
  maxAttempts = 3,
): Promise<RepairResult> {
  let current = draft;
  let issues = validate(current);
  let attempts = 0;

  while (issues.length > 0 && attempts < maxAttempts) {
    const patch = await requestPatch(current, issues, attempts);
    attempts += 1;
    const merged = mergeDraftPatch(current, patch);
    const nextIssues = validate(merged);

    if (nextIssues.length > issues.length) break; // regression: keep the better prior draft
    const stalled = sameErrors(issues, nextIssues);
    current = merged;
    issues = nextIssues;
    if (stalled) break; // no progress: further identical rounds won't help
  }

  return { draft: current, issues, attempts };
}
