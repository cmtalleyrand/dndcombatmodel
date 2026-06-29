// Resolve target selectors against the current combat state.

import { isIncapacitated } from './conditions';
import {
  alliesOf,
  enemiesOf,
  getState,
  isAlive,
  type CombatantState,
  type CombatState,
} from './state';
import type { TargetSelector } from './types';

function eligible(c: CombatantState, excludeIncapacitated: boolean): boolean {
  if (!isAlive(c)) return false;
  if (excludeIncapacitated && isIncapacitated(c.conditions)) return false;
  return true;
}

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
  const enemies = enemiesOf(state, actor).filter((c) => eligible(c, excl));
  const allies = alliesOf(state, actor).filter((c) => eligible(c, excl));

  switch (selector.strategy) {
    case 'self':
      return isAlive(actor) ? [actor] : [];

    case 'allEnemies':
      return enemies;

    case 'allAllies':
      return allies;

    case 'lowestHpEnemy':
      return takeSorted(enemies, (a, b) => a.hp - b.hp, count);

    case 'highestHpEnemy':
      return takeSorted(enemies, (a, b) => b.hp - a.hp, count);

    case 'lowestHpAlly': {
      // Healing should also be able to target downed allies (0 HP) to revive them,
      // so this strategy includes all same-side combatants (alive or downed), lowest HP first.
      return takeSorted(alliesOf(state, actor), (a, b) => a.hp - b.hp, count);
    }

    case 'namedThenLowestHpEnemy': {
      const named = (selector.namedTargets ?? actor.base.defaultTargets ?? [])
        .map((id) => getState(state, id))
        .filter((c): c is CombatantState => !!c && eligible(c, excl));
      const result: CombatantState[] = [];
      for (const c of named) {
        if (result.length >= count) break;
        if (!result.includes(c)) result.push(c);
      }
      if (result.length < count) {
        // fall back to lowest-HP enemies not already chosen
        const remaining = enemies
          .filter((e) => !result.includes(e))
          .sort((a, b) => a.hp - b.hp);
        for (const c of remaining) {
          if (result.length >= count) break;
          result.push(c);
        }
      }
      return result;
    }

    default:
      return [];
  }
}

function takeSorted(
  list: CombatantState[],
  cmp: (a: CombatantState, b: CombatantState) => number,
  count: number,
): CombatantState[] {
  return [...list].sort(cmp).slice(0, Math.max(0, count));
}
