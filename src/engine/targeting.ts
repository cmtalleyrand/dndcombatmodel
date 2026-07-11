// Resolve target selectors against the current combat state.
//
// Preferred model: an explicit ordered list of combatants (a reusable TargetList or
// an inline `namedTargets`) with a computed `fallback` for any remaining slots — so
// behaviour doesn't assume omniscient knowledge of the battlefield.

import { isIncapacitated } from './conditions';
import {
  alliesOf,
  distance,
  enemiesOf,
  getState,
  isAlive,
  type CombatantState,
  type CombatState,
} from './state';
import type { TargetSelector, TargetStrategy } from './types';

function eligible(c: CombatantState, excludeIncapacitated: boolean): boolean {
  if (!isAlive(c)) return false;
  if (excludeIncapacitated && isIncapacitated(c.conditions)) return false;
  return true;
}

/**
 * Ids the actor may not target with a harmful/attack action. A charmed creature "can't attack
 * the charmer or target it with harmful abilities" (5e) — the charmer is the sourceId of the
 * charmed condition. Excluding these from the enemy pool + explicit lists enforces that.
 */
function forbiddenTargetIds(actor: CombatantState): Set<string> {
  const ids = new Set<string>();
  for (const cond of actor.conditions) {
    if (cond.kind === 'charmed' && cond.sourceId) ids.add(cond.sourceId);
  }
  return ids;
}

/** Strategies that select a whole set regardless of count/explicit list. */
const SET_STRATEGIES: TargetStrategy[] = ['allEnemies', 'allAllies', 'self'];

/**
 * Resolve up to `count` targets for an actor given a selector. Returns an empty
 * array when no legal target exists (the caller falls back to Dodge/Pass).
 */
export function resolveTargets(
  state: CombatState,
  actor: CombatantState,
  selector: TargetSelector,
  count: number,
): CombatantState[] {
  const excl = selector.excludeIncapacitated ?? false;
  const forbidden = forbiddenTargetIds(actor);

  // Whole-set strategies (and no explicit list) return their set directly.
  if (
    SET_STRATEGIES.includes(selector.strategy) &&
    !selector.listId &&
    !(selector.namedTargets && selector.namedTargets.length)
  ) {
    return computeStrategy(state, actor, selector.strategy, count, excl, [], forbidden);
  }

  // Resolve explicit entries + fallback (from a reusable list or inline).
  let entries: string[] = [];
  let fallback: TargetStrategy;
  if (selector.listId && state.targetListsById[selector.listId]) {
    const list = state.targetListsById[selector.listId];
    entries = list.entries;
    fallback = list.fallback;
  } else {
    entries = selector.namedTargets ?? actor.base.defaultTargets ?? [];
    // back-compat: the legacy 'namedThenLowestHpEnemy' strategy implies a lowest-HP fallback.
    fallback =
      selector.fallback ??
      (selector.strategy === 'namedThenLowestHpEnemy' ? 'lowestHpEnemy' : selector.strategy);
  }

  const result: CombatantState[] = [];
  for (const id of entries) {
    if (result.length >= count) break;
    if (forbidden.has(id)) continue;
    const c = getState(state, id);
    if (c && eligible(c, excl) && !result.includes(c)) result.push(c);
  }

  if (result.length < count && fallback && fallback !== 'none') {
    const more = computeStrategy(state, actor, fallback, count, excl, result, forbidden);
    for (const c of more) {
      if (result.length >= count) break;
      if (!result.includes(c)) result.push(c);
    }
  }

  return result;
}

/** Compute a strategy's targets, excluding any already-chosen combatants. */
function computeStrategy(
  state: CombatState,
  actor: CombatantState,
  strategy: TargetStrategy,
  count: number,
  excl: boolean,
  exclude: CombatantState[],
  forbidden: Set<string> = new Set(),
): CombatantState[] {
  const enemies = enemiesOf(state, actor).filter(
    (c) => eligible(c, excl) && !exclude.includes(c) && !forbidden.has(c.base.id),
  );
  // Healing should be able to target downed allies, so ally pools include the whole side.
  const allies = alliesOf(state, actor).filter((c) => !exclude.includes(c));

  switch (strategy) {
    case 'self':
      return isAlive(actor) ? [actor] : [];
    case 'allEnemies':
      return enemies;
    case 'allAllies':
      return allies.filter((c) => isAlive(c));
    case 'lowestHpEnemy':
      return take(enemies, (a, b) => a.hp - b.hp, count);
    case 'highestHpEnemy':
      return take(enemies, (a, b) => b.hp - a.hp, count);
    case 'nearestEnemy':
      return take(enemies, (a, b) => distance(actor, a) - distance(actor, b), count);
    case 'lowestHpAlly':
      return take(allies, (a, b) => a.hp - b.hp, count);
    case 'nearestAlly':
      return take(allies.filter((c) => isAlive(c)), (a, b) => distance(actor, a) - distance(actor, b), count);
    default:
      return [];
  }
}

function take(
  list: CombatantState[],
  cmp: (a: CombatantState, b: CombatantState) => number,
  count: number,
): CombatantState[] {
  return [...list].sort(cmp).slice(0, Math.max(0, count));
}
