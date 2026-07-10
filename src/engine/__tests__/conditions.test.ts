import { describe, expect, it } from 'vitest';
import { performAction } from '../actions';
import { RNG } from '../dice';
import { CONDITION_CATALOG, CONDITION_KINDS, effectiveSpeed, isIncapacitated } from '../conditions';
import { buildCombatState, targetAdvantage } from '../state';
import type { Action, Combatant, ConditionKind, Scenario } from '../types';

const SRD_CONDITIONS: ConditionKind[] = [
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
];

describe('condition catalog', () => {
  it('includes all SRD condition names', () => {
    expect(CONDITION_KINDS).toEqual(expect.arrayContaining(SRD_CONDITIONS));
  });

  it('models invisible attack advantage and defense disadvantage', () => {
    expect(CONDITION_CATALOG.invisible.attackByAdvantage).toBe('advantage');
    expect(CONDITION_CATALOG.invisible.attackAgainstAdvantage).toBe('disadvantage');
  });

  it('models incapacitating SRD conditions as unable to act without making every condition incapacitating', () => {
    for (const kind of ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'] as ConditionKind[]) {
      expect(isIncapacitated([{ kind, duration: { type: 'rounds', rounds: 1 } }])).toBe(true);
    }
    for (const kind of ['charmed', 'deafened', 'frightened', 'grappled', 'invisible', 'poisoned', 'prone', 'restrained'] as ConditionKind[]) {
      expect(isIncapacitated([{ kind, duration: { type: 'rounds', rounds: 1 } }])).toBe(false);
    }
  });

  it('models speed-zero conditions separately from duration', () => {
    expect(effectiveSpeed(30, [{ kind: 'grappled', duration: { type: 'permanent' }, sourceId: 'ogre' }])).toBe(0);
    expect(effectiveSpeed(30, [{ kind: 'grappled', duration: { type: 'rounds', rounds: 1 }, sourceId: 'ogre' }])).toBe(0);
    expect(effectiveSpeed(30, [{ kind: 'poisoned', duration: { type: 'rounds', rounds: 1 } }])).toBe(30);
  });
});


function testCombatant(id: string, side: 'pc' | 'monster', position: number): Combatant {
  return {
    id,
    name: id,
    side,
    maxHp: 20,
    ac: 10,
    abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProficiencies: [],
    proficiencyBonus: 2,
    actionIds: [],
    script: [],
    spellSlots: {},
    position,
  };
}

function testState(combatants: Combatant[], actions: Action[] = []): Scenario {
  return {
    name: 'condition mechanics',
    combatants,
    actions,
    weapons: [],
    targetLists: [],
    ruleLibrary: [],
    conditionLibrary: [],
    initiativeMode: 'fixed',
    fixedOrder: combatants.map((c) => c.id),
    maxRounds: 1,
  };
}

describe('SRD condition mechanics', () => {
  it('models prone attacks by attacker distance', () => {
    const state = buildCombatState(testState([
      testCombatant('melee', 'pc', 0),
      testCombatant('ranged', 'pc', 30),
      testCombatant('target', 'monster', 0),
    ]));
    const [melee, ranged, target] = state.combatants;
    target.conditions.push({ kind: 'prone', duration: { type: 'permanent' } });

    expect(targetAdvantage(target, melee)).toBe('advantage');
    expect(targetAdvantage(target, ranged)).toBe('disadvantage');
  });

  it('doubles attack damage dice against unconscious-like targets within 5ft', () => {
    const attack: Action = { id: 'poke', name: 'Poke', kind: 'attack', targets: 1, attackBonus: 50, damage: '1d1' };
    const state = buildCombatState(testState([
      testCombatant('attacker', 'pc', 0),
      testCombatant('target', 'monster', 0),
    ], [attack]));
    const target = state.combatants[1];
    target.conditions.push({ kind: 'unconscious', duration: { type: 'permanent' } });

    performAction(state, new RNG(1), state.combatants[0], attack, [target], []);

    expect(target.hp).toBe(18);
  });

  it('applies petrified resistance to non-physical damage', () => {
    const spell: Action = { id: 'bolt', name: 'Bolt', kind: 'spell', targets: 1, damage: '4', damageType: 'fire' };
    const state = buildCombatState(testState([
      testCombatant('caster', 'pc', 0),
      testCombatant('target', 'monster', 0),
    ], [spell]));
    const target = state.combatants[1];
    target.conditions.push({ kind: 'petrified', duration: { type: 'permanent' } });

    performAction(state, new RNG(1), state.combatants[0], spell, [target], []);

    expect(target.hp).toBe(18);
  });
});
