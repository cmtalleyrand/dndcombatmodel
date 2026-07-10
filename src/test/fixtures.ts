import { buildCombatState } from '../engine/state';
import type { Action, AbilityScores, Combatant, Scenario, Side, Weapon } from '../engine/types';

export function fixtureAbilities(overrides: Partial<AbilityScores> = {}): AbilityScores {
  return {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
    ...overrides,
  };
}

export function fixtureAction(overrides: Partial<Action> = {}): Action {
  return {
    id: 'strike',
    name: 'Strike',
    kind: 'attack',
    targets: 1,
    attackBonus: 4,
    attackCount: 1,
    damage: '1d6+2',
    damageType: 'slashing',
    ...overrides,
  };
}

export function fixtureCombatant(id: string, side: Side, overrides: Partial<Combatant> = {}): Combatant {
  return {
    id,
    name: id,
    side,
    maxHp: 20,
    ac: 12,
    abilityScores: fixtureAbilities(),
    saveProficiencies: [],
    proficiencyBonus: 2,
    actionIds: [],
    script: [],
    spellSlots: {},
    ...overrides,
  };
}

export function scriptedCombatant(
  id: string,
  side: Side,
  actionId = 'strike',
  overrides: Partial<Combatant> = {},
): Combatant {
  return fixtureCombatant(id, side, {
    actionIds: [actionId],
    script: [
      { priority: 1, condition: { type: 'always' }, actionId, target: { strategy: 'lowestHpEnemy' } },
    ],
    ...overrides,
  });
}

export function fixtureScenario(overrides: Partial<Scenario> = {}): Scenario {
  const action = fixtureAction();
  const combatants = [scriptedCombatant('pc1', 'pc', action.id), scriptedCombatant('m1', 'monster', action.id)];
  return {
    name: 'test scenario',
    combatants,
    actions: [action],
    weapons: [],
    targetLists: [],
    ruleLibrary: [],
    conditionLibrary: [],
    initiativeMode: 'fixed',
    fixedOrder: combatants.map((c) => c.id),
    maxRounds: 10,
    ...overrides,
  };
}

export function fixtureCombatState(overrides: Partial<Scenario> = {}) {
  return buildCombatState(fixtureScenario(overrides));
}

export function fixtureState(combatants: Combatant[], actions: Action[] = [], overrides: Partial<Scenario> = {}) {
  return buildCombatState(
    fixtureScenario({
      combatants,
      actions,
      weapons: [],
      fixedOrder: combatants.map((c) => c.id),
      ...overrides,
    }),
  );
}

export function fixtureWeapon(overrides: Partial<Weapon> = {}): Weapon {
  return {
    id: 'weapon',
    name: 'Weapon',
    damage: '1d8',
    damageType: 'slashing',
    properties: [],
    category: 'martial',
    range: 5,
    ...overrides,
  };
}
