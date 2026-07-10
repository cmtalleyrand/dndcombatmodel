import { describe, expect, it } from 'vitest';
import { resolveTargets } from '../targeting';
import { fixtureCombatant, fixtureState } from '../../test/fixtures';
import type { TargetList } from '../types';

describe('target selector behaviour', () => {
  it('uses explicit targets in order, then fallback nearest eligible enemy', () => {
    const state = fixtureState([
      fixtureCombatant('pc', 'pc', { position: 30 }),
      fixtureCombatant('e1', 'monster', { position: 0 }),
      fixtureCombatant('e2', 'monster', { position: 15 }),
      fixtureCombatant('e3', 'monster', { position: 30, maxHp: 5 }),
    ]);

    expect(resolveTargets(state, state.combatants[0], { strategy: 'none', namedTargets: ['e1', 'e2'], fallback: 'nearestEnemy' }, 1)[0].base.id).toBe('e1');

    state.combatants[1].down = true;
    expect(resolveTargets(state, state.combatants[0], { strategy: 'none', namedTargets: ['e1', 'e2'], fallback: 'nearestEnemy' }, 1)[0].base.id).toBe('e2');

    state.combatants[2].down = true;
    expect(resolveTargets(state, state.combatants[0], { strategy: 'none', namedTargets: ['e1', 'e2'], fallback: 'nearestEnemy' }, 1)[0].base.id).toBe('e3');
  });

  it('resolves reusable target lists before applying selector fallback', () => {
    const list: TargetList = { id: 'tl', name: 'Focus', entries: ['e2', 'e1'], fallback: 'lowestHpEnemy' };
    const state = fixtureState([
      fixtureCombatant('pc', 'pc'),
      fixtureCombatant('e1', 'monster'),
      fixtureCombatant('e2', 'monster'),
    ], [], { targetLists: [list] });

    const targets = resolveTargets(state, state.combatants[0], { strategy: 'none', listId: 'tl' }, 1);

    expect(targets[0].base.id).toBe('e2');
  });
});
