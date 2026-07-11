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



  it('converts decomposed resources, modifiers, passive speed, and policies into engine fields', () => {
    const draft: AIScenarioDraft = {
      ...baseDraft,
      pcs: [{ ...baseDraft.pcs[0], declaredFeatureNames: ['Fleet Feet', 'Power Shot'], actionNames: ['Longsword'] }],
      featureDecompositions: [
        { sourceName: 'Fleet Feet', category: 'passiveTrait', simulatorRepresentation: 'passiveTraits[Fleet Feet].speedBonus', triggerTiming: 'passive', resourceCost: 'none', stackingBehavior: 'adds to speed' },
        { sourceName: 'Power Shot', category: 'stackableModifier', simulatorRepresentation: 'stackableModifiers[Power Shot]', triggerTiming: 'beforeAttackRoll', resourceCost: '1 Power Shot Use', consumesResourceName: 'Power Shot Uses', stackingBehavior: 'stacks on Longsword' },
      ],
      passiveTraits: [{ name: 'Fleet Feet', sourceName: 'Fleet Feet', speedBonus: 10, simulatorRepresentation: '+10 speed' }],
      resources: [{ name: 'Power Shot Uses', sourceName: 'Power Shot', max: 2 }],
      stackableModifiers: [{ name: 'Power Shot', sourceName: 'Power Shot', timing: 'beforeAttackRoll', appliesToActionNames: ['Longsword'], toHit: -5, damage: 10, resourceName: 'Power Shot Uses', stackingBehavior: 'additive' }],
      tacticalPolicies: [{ actorName: 'Ada', sourceName: 'Power Shot', policy: { modifierPolicy: { kind: 'always' }, movementPolicy: { kind: 'maintainRange', preferredRange: 30 } } }],
    };

    const scenario = convertDraftToScenario(draft);
    const ada = scenario.combatants[0];

    expect(ada.speed).toBe(40);
    expect(scenario.features?.[0]).toMatchObject({ name: 'Power Shot', resource: { id: 'power-shot-uses', max: 2 }, attackModifier: { toHit: -5, damage: 10 } });
    expect(ada.featureIds).toEqual([scenario.features?.[0].id]);
    expect(ada.tacticalPolicy?.movementPolicy).toEqual({ kind: 'maintainRange', preferredRange: 30 });
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

  it('maps AI start-of-combat and start-of-turn effects to engine features', () => {
    const draft: AIScenarioDraft = {
      ...baseDraft,
      pcs: [{ ...baseDraft.pcs[0], declaredFeatureNames: ['Opening Ward', 'Turn Aura'] }],
      featureDecompositions: [
        { sourceName: 'Opening Ward', category: 'triggeredEffect', simulatorRepresentation: 'precombat effect', triggerTiming: 'startOfCombat', resourceCost: 'none', stackingBehavior: 'applies once' },
        { sourceName: 'Turn Aura', category: 'triggeredEffect', simulatorRepresentation: 'start turn effect', triggerTiming: 'startOfTurn', resourceCost: 'none', stackingBehavior: 'applies each turn' },
      ],
      triggeredEffects: [
        { name: 'Opening Ward', sourceName: 'Opening Ward', timing: 'startOfCombat', simulatorRepresentation: 'precombat effect' },
        { name: 'Turn Aura', sourceName: 'Turn Aura', timing: 'startOfTurn', simulatorRepresentation: 'start turn effect' },
      ],
    };

    const scenario = convertDraftToScenario(draft);

    expect(scenario.features?.map((feature) => feature.timing)).toEqual(['precombat', 'startOfTurn']);
    expect(scenario.combatants[0].featureIds).toEqual(scenario.features?.map((feature) => feature.id));
  });

});