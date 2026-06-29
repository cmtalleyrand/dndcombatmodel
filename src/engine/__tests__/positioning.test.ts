import { describe, it, expect } from 'vitest';
import { buildCombatState, defaultPosition, distance, nearest } from '../state';
import type { Combatant, Scenario } from '../types';

function mk(id: string, side: 'pc' | 'monster', over: Partial<Combatant> = {}): Combatant {
  return {
    id,
    name: id,
    side,
    maxHp: 10,
    ac: 12,
    abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProficiencies: [],
    proficiencyBonus: 2,
    actionIds: [],
    script: [],
    spellSlots: {},
    ...over,
  };
}

function scenario(combatants: Combatant[]): Scenario {
  return {
    name: 't',
    combatants,
    actions: [],
    weapons: [],
    targetLists: [],
    initiativeMode: 'fixed',
    fixedOrder: combatants.map((c) => c.id),
    maxRounds: 10,
  };
}

describe('defaultPosition', () => {
  it('places monster fronts and PC fronts meeting at 30', () => {
    expect(defaultPosition('monster', 0)).toBe(30);
    expect(defaultPosition('monster', 1)).toBe(15);
    expect(defaultPosition('monster', 2)).toBe(0);
    expect(defaultPosition('pc', 0)).toBe(30);
    expect(defaultPosition('pc', 1)).toBe(45);
  });
});

describe('buildCombatState positions', () => {
  it('honors explicit positions and defaults the rest by side/index', () => {
    const s = scenario([mk('p1', 'pc', { position: 45 }), mk('p2', 'pc'), mk('m1', 'monster')]);
    const cs = buildCombatState(s);
    expect(cs.combatants[0].position).toBe(45); // explicit
    expect(cs.combatants[1].position).toBe(45); // pc index 1 default
    expect(cs.combatants[2].position).toBe(30); // monster index 0 default
  });

  it('defaults speed to 30', () => {
    const cs = buildCombatState(scenario([mk('p1', 'pc')]));
    expect(cs.combatants[0].speed).toBe(30);
  });
});

describe('distance & nearest', () => {
  it('computes linear distance', () => {
    const cs = buildCombatState(scenario([mk('p1', 'pc', { position: 45 }), mk('m1', 'monster', { position: 30 })]));
    expect(distance(cs.combatants[0], cs.combatants[1])).toBe(15);
  });

  it('finds the nearest candidate', () => {
    const cs = buildCombatState(
      scenario([
        mk('p1', 'pc', { position: 45 }),
        mk('m1', 'monster', { position: 0 }),
        mk('m2', 'monster', { position: 30 }),
      ]),
    );
    const n = nearest(cs.combatants[0], [cs.combatants[1], cs.combatants[2]]);
    expect(n?.base.id).toBe('m2');
  });
});
