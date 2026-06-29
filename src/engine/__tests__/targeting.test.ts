import { describe, it, expect } from 'vitest';
import { buildCombatState } from '../state';
import { resolveTargets } from '../targeting';
import type { Combatant, Scenario, TargetList } from '../types';

function mk(id: string, side: 'pc' | 'monster', over: Partial<Combatant> = {}): Combatant {
  return {
    id, name: id, side, maxHp: 20, ac: 12,
    abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProficiencies: [], proficiencyBonus: 2, actionIds: [], script: [], spellSlots: {}, ...over,
  };
}
function build(combatants: Combatant[], targetLists: TargetList[] = []) {
  const s: Scenario = { name: 't', combatants, actions: [], weapons: [], targetLists, initiativeMode: 'fixed', fixedOrder: combatants.map((c) => c.id), maxRounds: 10 };
  return buildCombatState(s);
}

describe('explicit list then fallback', () => {
  it('uses named entries in order, then falls back when exhausted/dead', () => {
    const pc = mk('pc', 'pc', { position: 30 });
    const e1 = mk('e1', 'monster', { position: 0, maxHp: 20 });
    const e2 = mk('e2', 'monster', { position: 15, maxHp: 20 });
    const e3 = mk('e3', 'monster', { position: 30, maxHp: 5 });
    const state = build([pc, e1, e2, e3]);
    // explicit: e1 then e2, fallback nearest
    const t = resolveTargets(state, state.combatants[0], { strategy: 'none', namedTargets: ['e1', 'e2'], fallback: 'nearestEnemy' }, 1);
    expect(t[0].base.id).toBe('e1');

    // kill e1 → should pick e2
    state.combatants[1].down = true;
    const t2 = resolveTargets(state, state.combatants[0], { strategy: 'none', namedTargets: ['e1', 'e2'], fallback: 'nearestEnemy' }, 1);
    expect(t2[0].base.id).toBe('e2');

    // kill e2 too → fallback nearestEnemy → e3 (at 30, same as pc → distance 0)
    state.combatants[2].down = true;
    const t3 = resolveTargets(state, state.combatants[0], { strategy: 'none', namedTargets: ['e1', 'e2'], fallback: 'nearestEnemy' }, 1);
    expect(t3[0].base.id).toBe('e3');
  });
});

describe('reusable target list', () => {
  it('resolves via listId', () => {
    const pc = mk('pc', 'pc');
    const e1 = mk('e1', 'monster');
    const e2 = mk('e2', 'monster');
    const list: TargetList = { id: 'tl', name: 'Focus', entries: ['e2', 'e1'], fallback: 'lowestHpEnemy' };
    const state = build([pc, e1, e2], [list]);
    const t = resolveTargets(state, state.combatants[0], { strategy: 'none', listId: 'tl' }, 1);
    expect(t[0].base.id).toBe('e2');
  });
});

describe('nearest strategies use position', () => {
  it('picks the nearest enemy', () => {
    const pc = mk('pc', 'pc', { position: 45 });
    const far = mk('far', 'monster', { position: 0 });
    const near = mk('near', 'monster', { position: 30 });
    const state = build([pc, far, near]);
    const t = resolveTargets(state, state.combatants[0], { strategy: 'nearestEnemy' }, 1);
    expect(t[0].base.id).toBe('near');
  });
});
