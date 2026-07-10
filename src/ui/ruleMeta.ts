// Shared metadata for editing a Rule/RuleTemplate's condition and target fields.
// Used by both RuleBuilder.tsx (per-combatant scripts) and the Rules Library
// editor in ActionLibraryTab.tsx, so the two stay in sync.

import type { RuleCondition, RuleConditionType, TargetStrategy } from '../engine/types';

export const CONDITION_TYPES: { value: RuleConditionType; label: string; needs: 'none' | 'value' | 'condition' }[] = [
  { value: 'always', label: 'Always', needs: 'none' },
  { value: 'selfHpBelowPct', label: 'Self HP below %', needs: 'value' },
  { value: 'anyAllyHpBelowPct', label: 'Any ally HP below % (incl. self)', needs: 'value' },
  { value: 'enemyCountAtLeast', label: 'Living enemies ≥', needs: 'value' },
  { value: 'enemyCountAtMost', label: 'Living enemies ≤', needs: 'value' },
  { value: 'selfHasCondition', label: 'Self has condition', needs: 'condition' },
  { value: 'anyEnemyHasCondition', label: 'Any enemy has condition', needs: 'condition' },
  { value: 'roundAtLeast', label: 'Round ≥', needs: 'value' },
  { value: 'roundAtMost', label: 'Round ≤', needs: 'value' },
  { value: 'notConcentrating', label: 'Not concentrating', needs: 'none' },
  { value: 'anyEnemyConcentrating', label: 'An enemy is concentrating', needs: 'none' },
  { value: 'slotAvailable', label: "Spell slot available (for this action's level)", needs: 'none' },
];

export const TARGET_STRATEGIES: { value: TargetStrategy; label: string }[] = [
  { value: 'nearestEnemy', label: 'Nearest enemy' },
  { value: 'lowestHpEnemy', label: 'Lowest-HP enemy' },
  { value: 'highestHpEnemy', label: 'Highest-HP enemy' },
  { value: 'none', label: 'Explicit list / target list (below)' },
  { value: 'allEnemies', label: 'All enemies (AoE)' },
  { value: 'nearestAlly', label: 'Nearest ally (incl. self)' },
  { value: 'lowestHpAlly', label: 'Lowest-HP ally (incl. self)' },
  { value: 'allAllies', label: 'All allies (incl. self)' },
  { value: 'self', label: 'Self' },
];

/** Fallback strategies offered for explicit lists. */
export const FALLBACK_STRATEGIES: { value: TargetStrategy; label: string }[] = [
  { value: 'nearestEnemy', label: 'then nearest enemy' },
  { value: 'lowestHpEnemy', label: 'then lowest-HP enemy' },
  { value: 'nearestAlly', label: 'then nearest ally' },
  { value: 'lowestHpAlly', label: 'then lowest-HP ally' },
  { value: 'none', label: 'no fallback' },
];

export function defaultCondition(type: RuleConditionType): RuleCondition {
  switch (type) {
    case 'selfHpBelowPct':
    case 'anyAllyHpBelowPct':
      return { type, value: 50 };
    case 'enemyCountAtLeast':
    case 'enemyCountAtMost':
      return { type, value: 2 };
    case 'roundAtLeast':
    case 'roundAtMost':
      return { type, value: 1 };
    case 'selfHasCondition':
    case 'anyEnemyHasCondition':
      return { type, condition: 'asleep' };
    default:
      return { type };
  }
}

/** Short human-readable summary of a rule's condition, e.g. "if self HP < 25%". */
export function describeCondition(condition: RuleCondition): string {
  const meta = CONDITION_TYPES.find((c) => c.value === condition.type);
  if (!meta) return condition.type;
  if (meta.needs === 'value') return `${meta.label} ${condition.value ?? 0}`;
  if (meta.needs === 'condition') return `${meta.label}: ${condition.condition ?? '—'}`;
  return meta.label;
}

/** Short human-readable summary of a target selector, e.g. "lowest-HP enemy". */
export function describeTarget(target: { strategy: TargetStrategy; listId?: string; namedTargets?: string[] }): string {
  const meta = TARGET_STRATEGIES.find((t) => t.value === target.strategy);
  const base = meta?.label ?? target.strategy;
  if (target.strategy === 'none' && target.namedTargets?.length) return `explicit list (${target.namedTargets.length})`;
  return base;
}
