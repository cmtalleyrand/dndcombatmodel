// Evaluate a combatant's priority script to choose an action + targets for its turn.

import { hasCondition } from './conditions';
import {
  alliesOf,
  enemiesOf,
  isAlive,
  type CombatantState,
  type CombatState,
} from './state';
import { resolveTargets } from './targeting';
import type { Action, ActionCost, Rule, RuleCondition, TacticalDecision, TargetPolicy } from './types';

export interface ChosenAction {
  rule: Rule;
  action: Action;
  targets: CombatantState[];
}

function hpPct(c: CombatantState): number {
  return (c.hp / c.base.maxHp) * 100;
}

/** Evaluate a rule predicate — the primary leaf combined with any `extra` leaves via AND/OR. */
export function evaluateCondition(
  state: CombatState,
  actor: CombatantState,
  cond: RuleCondition,
  action: Action,
): boolean {
  const primary = evaluateLeaf(state, actor, cond, action);
  if (!cond.extra || cond.extra.length === 0) return primary;
  const extras = cond.extra.map((e) => evaluateLeaf(state, actor, e, action));
  return cond.combine === 'or'
    ? primary || extras.some(Boolean)
    : primary && extras.every(Boolean);
}

/** Evaluate one leaf predicate (ignores `extra`/`combine`). */
function evaluateLeaf(
  state: CombatState,
  actor: CombatantState,
  cond: RuleCondition,
  action: Action,
): boolean {
  switch (cond.type) {
    case 'always':
      return true;

    case 'selfHpBelowPct':
      return hpPct(actor) < (cond.value ?? 0);

    case 'anyAllyHpBelowPct':
      // Downed allies (0 HP) count as below any positive threshold so healers prioritize them.
      return alliesOf(state, actor).some((a) => hpPct(a) < (cond.value ?? 0));

    case 'enemyCountAtLeast':
      return enemiesOf(state, actor).filter(isAlive).length >= (cond.value ?? 0);

    case 'enemyCountAtMost':
      return enemiesOf(state, actor).filter(isAlive).length <= (cond.value ?? 0);

    case 'selfHasCondition':
      return cond.condition ? hasCondition(actor.conditions, cond.condition) : false;

    case 'anyEnemyHasCondition':
      return cond.condition
        ? enemiesOf(state, actor)
            .filter(isAlive)
            .some((e) => hasCondition(e.conditions, cond.condition!))
        : false;

    case 'roundAtLeast':
      return state.round >= (cond.value ?? 0);

    case 'roundAtMost':
      return state.round <= (cond.value ?? 0);

    case 'notConcentrating':
      return !actor.concentratingOn;

    case 'anyEnemyConcentrating':
      return enemiesOf(state, actor)
        .filter(isAlive)
        .some((e) => !!e.concentratingOn);

    case 'slotAvailable':
      return hasSlot(actor, action);

    default:
      return false;
  }
}

function hasSlot(actor: CombatantState, action: Action): boolean {
  if (!action.spellLevel || action.spellLevel <= 0) return true;
  return (actor.spellSlots[action.spellLevel] ?? 0) > 0;
}

function hasUses(actor: CombatantState, action: Action): boolean {
  if (action.uses === undefined) return true;
  const remaining = actor.usesRemaining[action.id] ?? action.uses;
  return remaining > 0;
}

/** Whether the actor can currently perform the action (resources available). */
export function actionAvailable(actor: CombatantState, action: Action): boolean {
  return hasSlot(actor, action) && hasUses(actor, action);
}

/** Number of targets an action wants. */
function targetCount(action: Action): number {
  if (['dodge', 'move', 'dash', 'disengage', 'hide', 'ready', 'search'].includes(action.kind)) return 0;
  // `targets` is the number of distinct targets; each is attacked `attackCount` times
  // (so 2 targets with attackCount 2 = 4 attack rolls total).
  return Math.max(1, action.targets);
}

/**
 * Choose the first rule (by ascending priority) whose condition passes, whose
 * action is available for the given economy `cost` (default: a full action), and
 * which resolves to at least one legal target (unless the action needs no target).
 * Returns undefined if nothing applies.
 */
export function chooseAction(
  state: CombatState,
  actor: CombatantState,
  cost: ActionCost = 'action',
): ChosenAction | undefined {
  const rules = [...actor.base.script].sort((a, b) => a.priority - b.priority);
  for (const rule of rules) {
    const action = state.actionsById[rule.actionId];
    if (!action) continue;
    if ((action.actionCost ?? 'action') !== cost) continue;
    if (!actionAvailable(actor, action)) continue;
    if (!evaluateCondition(state, actor, rule.condition, action)) continue;

    const needed = targetCount(action);
    if (needed === 0) {
      return { rule, action, targets: [] };
    }
    const targets = resolveTargets(state, actor, rule.target, needed);
    if (targets.length === 0) continue; // no legal target — try next rule
    return { rule, action, targets };
  }
  return undefined;
}

function selectorFromTargetPolicy(policy: TargetPolicy | undefined, fallback: Rule['target']): Rule['target'] {
  if (!policy || policy.kind === 'ruleTarget') return fallback;
  if (policy.kind === 'namedPriority') return { strategy: 'namedThenLowestHpEnemy', namedTargets: policy.namedTargets, fallback: policy.fallback ?? 'lowestHpEnemy' };
  if (policy.kind === 'concentratingTarget') return { strategy: 'allEnemies' };
  if (policy.kind === 'lowHpTarget') return { strategy: 'lowestHpEnemy' };
  if (policy.kind === 'nearestMeleeThreat') return { strategy: 'nearestEnemy' };
  return fallback;
}

function refineTargetsByPolicy(targets: CombatantState[], policy: TargetPolicy | undefined): CombatantState[] {
  if (!policy) return targets;
  if (policy.kind === 'concentratingTarget') return [...targets].sort((a, b) => Number(!!b.concentratingOn) - Number(!!a.concentratingOn));
  if (policy.kind === 'lowAcTarget') return [...targets].sort((a, b) => a.base.ac - b.base.ac);
  return targets;
}

export function chooseTacticalDecision(
  state: CombatState,
  actor: CombatantState,
  cost: ActionCost = 'action',
): TacticalDecision | undefined {
  const policy = actor.base.tacticalPolicy;
  const choice = chooseAction(state, actor, cost);
  if (!choice) return undefined;
  let action = choice.action;
  if (policy?.baseActionSelector?.kind === 'actionId') {
    const selected = policy.baseActionSelector.actionId ? state.actionsById[policy.baseActionSelector.actionId] : undefined;
    if (selected && (selected.actionCost ?? 'action') === cost && actionAvailable(actor, selected)) action = selected;
  }
  const needed = targetCount(action);
  let targets = choice.targets;
  if (needed > 0) {
    const selector = selectorFromTargetPolicy(policy?.targetPolicy, choice.rule.target);
    targets = refineTargetsByPolicy(resolveTargets(state, actor, selector, Math.max(needed, state.combatants.length)), policy?.targetPolicy).slice(0, needed);
    if (targets.length === 0) return undefined;
  }
  return {
    rule: choice.rule,
    movementPolicy: policy?.movementPolicy,
    baseAction: action,
    targets: targets.map((t) => t.base.id),
    modifierPolicy: policy?.modifierPolicy,
    targetPolicy: policy?.targetPolicy,
    resourcePolicy: policy?.resourcePolicy,
    extraActionPolicy: policy?.extraActionPolicy,
  };
}
