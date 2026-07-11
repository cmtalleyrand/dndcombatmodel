import { describe, expect, it } from 'vitest';
import type { Action, Combatant, Weapon } from '../engine/types';
import { describeAction } from './describe';

const combatant: Combatant = {
  id: 'hero',
  name: 'Hero',
  side: 'pc',
  level: 1,
  maxHp: 10,
  ac: 10,
  abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  saveProficiencies: [],
  proficiencyBonus: 2,
  actionIds: [],
  script: [],
  position: 0,
  spellSlots: {},
};

const utilityActions: Array<[Action['kind'], string]> = [
  ['dash', 'Dash — spend the action to move farther.'],
  ['disengage', 'Disengage — move without provoking opportunity attacks.'],
  ['help', 'Help — aid another creature.'],
  ['hide', 'Hide — attempt to become hidden.'],
  ['ready', 'Ready — prepare a triggered action.'],
  ['search', 'Search — look for something in combat.'],
];

describe('describeAction', () => {
  it('uses explicit utility-action summaries instead of falling back to names', () => {
    const weaponsById: Record<string, Weapon> = {};

    for (const [kind, expected] of utilityActions) {
      expect(describeAction(combatant, { id: `act-${kind}`, name: kind, kind, targets: 0 }, weaponsById)).toBe(expected);
    }
  });
});
