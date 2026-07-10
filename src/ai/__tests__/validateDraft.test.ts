import { describe, expect, it } from 'vitest';
import { validateDraft } from '../validateDraft';
import type { AIScenarioDraft } from '../types';

function baseDraft(over: Partial<AIScenarioDraft> = {}): AIScenarioDraft {
  return {
    scenarioSummary: 'test',
    pcs: [
      {
        name: 'Hero',
        side: 'pc',
        maxHp: 20,
        ac: 15,
        abilityScores: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
        proficiencyBonus: 2,
        actionNames: ['Swing'],
      },
    ],
    enemies: [
      {
        name: 'Goblin',
        side: 'monster',
        maxHp: 7,
        ac: 15,
        abilityScores: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
        proficiencyBonus: 2,
        actionNames: ['Swing'],
      },
    ],
    actions: [{ id: '', name: 'Swing', kind: 'attack', targets: 1, damage: '1d8+2', damageType: 'slashing' }],
    priorityScripts: [
      {
        actorName: 'Hero',
        actionName: 'Swing',
        priority: 1,
        condition: { type: 'always' },
        target: { strategy: 'lowestHpEnemy' },
      },
    ],
    targetPriorities: [],
    assumptionsRequiringApproval: [],
    ...over,
  };
}

describe('validateDraft enum + formula validation', () => {
  it('accepts a well-formed draft', () => {
    expect(validateDraft(baseDraft())).toEqual([]);
  });

  it('rejects a hallucinated rule condition type', () => {
    const draft = baseDraft();
    // @ts-expect-error deliberately invalid enum
    draft.priorityScripts[0].condition = { type: 'whenVibesAreGood' };
    const errors = validateDraft(draft);
    expect(errors.some((e) => e.includes('invalid condition type'))).toBe(true);
  });

  it('rejects a hallucinated target strategy', () => {
    const draft = baseDraft();
    // @ts-expect-error deliberately invalid enum
    draft.priorityScripts[0].target.strategy = 'nearestSpellcaster';
    const errors = validateDraft(draft);
    expect(errors.some((e) => e.includes('invalid target strategy'))).toBe(true);
  });

  it('rejects an invalid dice formula', () => {
    const draft = baseDraft();
    draft.actions[0].damage = '1d8 fire';
    const errors = validateDraft(draft);
    expect(errors.some((e) => e.includes('invalid dice formula'))).toBe(true);
  });

  it('rejects an invalid damage type', () => {
    const draft = baseDraft();
    // @ts-expect-error deliberately invalid enum
    draft.actions[0].damageType = 'holy';
    const errors = validateDraft(draft);
    expect(errors.some((e) => e.includes('invalid damageType'))).toBe(true);
  });
});
