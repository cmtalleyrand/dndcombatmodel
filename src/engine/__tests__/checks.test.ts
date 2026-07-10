import { describe, expect, it } from 'vitest';
import { RNG } from '../dice';
import { abilityCheckBonus, rollSavingThrow, skillCheckBonus } from '../checks';
import type { Combatant } from '../types';

const base: Combatant = {
  id: 'c1',
  name: 'Tester',
  side: 'pc',
  maxHp: 10,
  ac: 10,
  abilityScores: { str: 10, dex: 14, con: 16, int: 8, wis: 12, cha: 10 },
  saveProficiencies: ['con'],
  skillProficiencies: ['stealth'],
  proficiencyBonus: 2,
  actionIds: [],
  script: [],
  spellSlots: {},
};

describe('ability, skill, and save tests', () => {
  it('computes ability checks without proficiency', () => {
    expect(abilityCheckBonus(base, 'dex')).toBe(2);
  });

  it('computes skill checks from their governing ability plus proficiency', () => {
    expect(skillCheckBonus(base, 'stealth')).toBe(4);
    expect(skillCheckBonus(base, 'perception')).toBe(1);
  });

  it('uses saving throw proficiency for concentration-style Constitution saves', () => {
    const roll = rollSavingThrow(new RNG(1), base, 'con');
    expect(roll.total).toBeGreaterThanOrEqual(6);
    expect(roll.total).toBeLessThanOrEqual(25);
  });
});
