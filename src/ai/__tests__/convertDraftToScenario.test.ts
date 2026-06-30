import { describe, expect, it } from 'vitest';
import { convertDraftToScenario } from '../convertDraftToScenario';
import { validateDraft } from '../validateDraft';
import type { AIScenarioDraft } from '../types';

const baseDraft: AIScenarioDraft = {
  scenarioSummary: 'Hero vs goblin',
  pcs: [
    {
      name: 'Ada',
      side: 'pc',
      maxHp: 20,
      ac: 16,
      abilityScores: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
      saveProficiencies: ['str'],
      proficiencyBonus: 2,
      actionNames: ['Longsword'],
      spellSlots: {},
      position: 30,
      speed: 30,
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
      actionNames: ['Scimitar'],
      spellSlots: {},
      position: 0,
      speed: 30,
    },
  ],
  actions: [
    { id: '', name: 'Longsword', kind: 'attack', targets: 1, damage: '1d8+2', damageType: 'slashing', attackBonus: 4 },
    { id: '', name: 'Scimitar', kind: 'attack', targets: 1, damage: '1d6+2', damageType: 'slashing', attackBonus: 4 },
  ],
  priorityScripts: [
    { actorName: 'Ada', actionName: 'Longsword', priority: 1, condition: { type: 'always' }, target: { strategy: 'nearestEnemy', targetNames: ['Goblin'] } },
    { actorName: 'Goblin', actionName: 'Scimitar', priority: 1, condition: { type: 'always' }, target: { strategy: 'nearestEnemy', targetNames: ['Ada'] } },
  ],
  targetPriorities: [{ name: 'Focus goblin', actorName: 'Ada', targetNames: ['Goblin'], fallback: 'nearestEnemy' }],
  assumptionsRequiringApproval: ['Use simple attacks.'],
};

describe('convertDraftToScenario', () => {
  it('creates a scenario with combatants, actions, and scripts from a valid approved draft', () => {
    const scenario = convertDraftToScenario(baseDraft);

    expect(scenario.combatants).toHaveLength(2);
    expect(scenario.actions).toHaveLength(2);
    expect(scenario.combatants[0].actionIds).toEqual([scenario.actions[0].id]);
    expect(scenario.combatants[0].script[0]).toMatchObject({ actionId: scenario.actions[0].id });
    expect(scenario.combatants[0].script[0].target.namedTargets).toEqual([scenario.combatants[1].id]);
    expect(scenario.targetLists[0].entries).toEqual([scenario.combatants[1].id]);
  });

  it('rejects unresolved action or combatant references', () => {
    const invalid: AIScenarioDraft = {
      ...baseDraft,
      priorityScripts: [
        ...baseDraft.priorityScripts,
        { actorName: 'Missing actor', actionName: 'Missing action', priority: 2, condition: { type: 'always' }, target: { strategy: 'nearestEnemy', targetNames: ['Missing target'] } },
      ],
    };

    expect(validateDraft(invalid)).toEqual(expect.arrayContaining([
      'Script references unknown combatant: Missing actor',
      'Script references unknown action: Missing action',
      'Script references unknown target: Missing target',
    ]));
    expect(() => convertDraftToScenario(invalid)).toThrow(/Missing action/);
  });
});
