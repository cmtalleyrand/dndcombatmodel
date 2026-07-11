import { describe, expect, it } from 'vitest';
import { validateScenarioReadiness } from '../validation';
import { fixtureAction, fixtureScenario, scriptedCombatant } from '../../test/fixtures';
import type { Scenario } from '../types';

const action = fixtureAction();

function combatant(id: string, side: 'pc' | 'monster') {
  return scriptedCombatant(id, side, action.id, { maxHp: 10, ac: 12 });
}

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return fixtureScenario({
    name: 'validation test',
    combatants: [combatant('hero', 'pc'), combatant('goblin', 'monster')],
    actions: [action],
    fixedOrder: ['hero', 'goblin'],
    ...overrides,
  });
}

describe('validateScenarioReadiness', () => {
  it('accepts a valid scenario', () => {
    expect(validateScenarioReadiness(scenario())).toMatchObject({ isReady: true, errors: [] });
  });

  it('reports missing action and target-list references', () => {
    const badHero = combatant('hero', 'pc');
    badHero.script = [
      { priority: 1, condition: { type: 'always' }, actionId: 'missing', target: { strategy: 'lowestHpEnemy', listId: 'missing-list' } },
    ];

    const result = validateScenarioReadiness(scenario({ combatants: [badHero, combatant('goblin', 'monster')] }));

    expect(result.isReady).toBe(false);
    expect(result.errors.map((e) => e.code)).toEqual(expect.arrayContaining(['missing-rule-action', 'missing-rule-target-list']));
  });

  it('reports missing and orphaned feature bindings', () => {
    const hero = combatant('hero', 'pc');
    hero.featureIds = ['missing-feature'];
    const result = validateScenarioReadiness(scenario({
      combatants: [hero, combatant('goblin', 'monster')],
      features: [{ id: 'unused-feature', name: 'Unused Feature', timing: 'precombat' }],
    }));

    expect(result.isReady).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('missing-combatant-feature');
    expect(result.warnings.map((e) => e.code)).toContain('orphaned-feature');
  });

});
