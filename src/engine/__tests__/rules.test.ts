import { describe, expect, it } from 'vitest';
import { evaluateCondition } from '../rules';
import { buildCombatState } from '../state';
import type { Action, Combatant, RuleCondition, Scenario } from '../types';

function pc(id: string, side: 'pc' | 'monster'): Combatant {
  return {
    id, name: id, side, maxHp: 20, ac: 10,
    abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProficiencies: [], proficiencyBonus: 2, actionIds: [], script: [], spellSlots: {},
  };
}

const scenario: Scenario = {
  name: 't', combatants: [pc('hero', 'pc'), pc('foe', 'monster')], actions: [],
  weapons: [], targetLists: [], ruleLibrary: [], conditionLibrary: [],
  initiativeMode: 'fixed', maxRounds: 1,
};
const dummy: Action = { id: 'a', name: 'a', kind: 'attack', targets: 1 };

function evalWith(cond: RuleCondition, heroHp = 20) {
  const state = buildCombatState(scenario);
  state.combatants[0].hp = heroHp;
  return evaluateCondition(state, state.combatants[0], cond, dummy);
}

describe('compound rule conditions', () => {
  it('a leaf condition still evaluates normally', () => {
    expect(evalWith({ type: 'selfHpBelowPct', value: 50 }, 20)).toBe(false);
    expect(evalWith({ type: 'selfHpBelowPct', value: 50 }, 5)).toBe(true);
  });

  it('AND requires the primary and every extra to hold', () => {
    // primary true (hp 5 < 50), extra enemyCountAtLeast 2 with only 1 enemy -> false
    const cond: RuleCondition = { type: 'selfHpBelowPct', value: 50, combine: 'and', extra: [{ type: 'enemyCountAtLeast', value: 2 }] };
    expect(evalWith(cond, 5)).toBe(false);
    // extra enemyCountAtLeast 1 (one enemy exists) -> true
    const cond2: RuleCondition = { type: 'selfHpBelowPct', value: 50, combine: 'and', extra: [{ type: 'enemyCountAtLeast', value: 1 }] };
    expect(evalWith(cond2, 5)).toBe(true);
  });

  it('OR passes when either the primary or any extra holds', () => {
    // primary false (hp 20 not < 50), extra always -> true
    const cond: RuleCondition = { type: 'selfHpBelowPct', value: 50, combine: 'or', extra: [{ type: 'always' }] };
    expect(evalWith(cond, 20)).toBe(true);
    // primary false, extra enemyCountAtLeast 5 (only 1) -> false
    const cond2: RuleCondition = { type: 'selfHpBelowPct', value: 50, combine: 'or', extra: [{ type: 'enemyCountAtLeast', value: 5 }] };
    expect(evalWith(cond2, 20)).toBe(false);
  });

  it('defaults to AND when combine is omitted', () => {
    const cond: RuleCondition = { type: 'always', extra: [{ type: 'selfHpBelowPct', value: 50 }] };
    expect(evalWith(cond, 20)).toBe(false);
    expect(evalWith(cond, 5)).toBe(true);
  });
});

describe('distance-based rule conditions', () => {
  /** Evaluate a condition with the hero and foe placed at explicit positions (feet). */
  function evalAtDistance(cond: RuleCondition, heroPos: number, foePos: number) {
    const state = buildCombatState(scenario);
    state.combatants[0].position = heroPos;
    state.combatants[1].position = foePos;
    return evaluateCondition(state, state.combatants[0], cond, dummy);
  }

  it('nearestEnemyWithin fires only when the nearest enemy is at or inside the range', () => {
    expect(evalAtDistance({ type: 'nearestEnemyWithin', value: 5 }, 0, 5)).toBe(true);
    expect(evalAtDistance({ type: 'nearestEnemyWithin', value: 5 }, 0, 30)).toBe(false);
  });

  it('nearestEnemyBeyond fires only when the nearest enemy is farther than the range', () => {
    expect(evalAtDistance({ type: 'nearestEnemyBeyond', value: 10 }, 0, 30)).toBe(true);
    expect(evalAtDistance({ type: 'nearestEnemyBeyond', value: 10 }, 0, 5)).toBe(false);
  });

  it('distance conditions never fire when no living enemy remains', () => {
    const state = buildCombatState(scenario);
    state.combatants[1].down = true;
    state.combatants[1].hp = 0;
    expect(evaluateCondition(state, state.combatants[0], { type: 'nearestEnemyWithin', value: 100 }, dummy)).toBe(false);
    expect(evaluateCondition(state, state.combatants[0], { type: 'nearestEnemyBeyond', value: 0 }, dummy)).toBe(false);
  });
});
