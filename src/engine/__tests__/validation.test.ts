import { describe, expect, it } from 'vitest';
import { validateScenarioReadiness } from '../validation';
import type { Action, Combatant, Scenario } from '../types';

const action: Action = {
  id: 'strike',
  name: 'Strike',
  kind: 'attack',
  targets: 1,
  attackBonus: 4,
  damage: '1d6+2',
  damageType: 'slashing',
};

function combatant(id: string, side: 'pc' | 'monster'): Combatant {
  return {
    id,
    name: id,
    side,
    maxHp: 10,
    ac: 12,
    abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProficiencies: [],
    proficiencyBonus: 2,
    actionIds: [action.id],
    script: [{ priority: 1, condition: { type: 'always' }, actionId: action.id, target: { strategy: 'lowestHpEnemy' } }],
    spellSlots: {},
  };
}

function scenario(over: Partial<Scenario> = {}): Scenario {
  return {
    name: 'validation test',
    combatants: [combatant('hero', 'pc'), combatant('goblin', 'monster')],
    actions: [action],
    weapons: [],
    targetLists: [],
    ruleLibrary: [],
    conditionLibrary: [],
    initiativeMode: 'fixed',
    fixedOrder: ['hero', 'goblin'],
    maxRounds: 10,
    ...over,
  };
}

describe('validateScenarioReadiness', () => {
  it('accepts a valid scenario', () => {
    expect(validateScenarioReadiness(scenario())).toMatchObject({ isReady: true, errors: [] });
  });

  it('rejects a script rule that references a missing action', () => {
    const badHero = combatant('hero', 'pc');
    badHero.script = [{ priority: 1, condition: { type: 'always' }, actionId: 'missing', target: { strategy: 'lowestHpEnemy' } }];

    const result = validateScenarioReadiness(scenario({ combatants: [badHero, combatant('goblin', 'monster')] }));

    expect(result.isReady).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('missing-rule-action');
  });

  it('rejects a rule selector that references a missing target list', () => {
    const badHero = combatant('hero', 'pc');
    badHero.script = [{ priority: 1, condition: { type: 'always' }, actionId: action.id, target: { strategy: 'lowestHpEnemy', listId: 'missing-list' } }];

    const result = validateScenarioReadiness(scenario({ combatants: [badHero, combatant('goblin', 'monster')] }));

    expect(result.isReady).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('missing-rule-target-list');
  });
});
