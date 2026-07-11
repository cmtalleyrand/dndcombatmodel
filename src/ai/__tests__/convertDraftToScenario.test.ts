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

  it('carries a Haste-style timed effect from an approved draft into the scenario', () => {
    const draft: AIScenarioDraft = {
      ...baseDraft,
      actions: [
        ...baseDraft.actions,
        {
          id: '', name: 'Haste', kind: 'spell', targets: 1, concentration: true,
          effects: [
            {
              label: 'Haste', target: 'target',
              modifier: { ac: 2, speedOverride: 60, saveAdvantage: ['dex'] },
              duration: { type: 'concentration', sourceId: '' },
              onExpire: { applyConditions: [{ kind: 'incapacitated', duration: { type: 'rounds', rounds: 1 } }] },
            },
          ],
        },
      ],
      pcs: [{ ...baseDraft.pcs[0], actionNames: ['Longsword', 'Haste'] }],
    };

    expect(validateDraft(draft)).toEqual([]);
    const scenario = convertDraftToScenario(draft);
    const haste = scenario.actions.find((a) => a.name === 'Haste');
    expect(haste?.effects?.[0]).toMatchObject({ target: 'target', modifier: { ac: 2, speedOverride: 60 } });
    expect(haste?.effects?.[0].duration.type).toBe('concentration');
  });

  it('rejects a draft whose effect has an invalid target scope or condition', () => {
    // Deliberately malformed effect (a model could emit these); cast past the compile-time types
    // so we can prove the runtime validator catches them.
    const badAction = {
      id: '', name: 'Bad Buff', kind: 'spell', targets: 1,
      effects: [{ label: 'Bad', target: 'everyone', modifier: { grantConditions: ['blessed', 'notacondition'] }, duration: { type: 'rounds', rounds: 2 } }],
    } as unknown as AIScenarioDraft['actions'][number];
    const draft: AIScenarioDraft = {
      ...baseDraft,
      actions: [...baseDraft.actions, badAction],
      pcs: [{ ...baseDraft.pcs[0], actionNames: ['Longsword', 'Bad Buff'] }],
    };

    const errors = validateDraft(draft);
    expect(errors.some((e) => /invalid target scope/.test(e))).toBe(true);
    expect(errors.some((e) => /unknown condition: notacondition/.test(e))).toBe(true);
  });

  it('accepts a valid dynamic formula and rejects one using an unknown variable', () => {
    const scalingBolt: AIScenarioDraft['actions'][number] = { id: '', name: 'Scaling Bolt', kind: 'spell', targets: 1, damage: '1d10', damageType: 'fire', save: { ability: 'dex', onSuccess: 'half' }, dynamic: { saveDc: '8 + prof + casterMod', damageBonus: 'floor((100 - targetHpPct) / 25)' } };
    const good: AIScenarioDraft = {
      ...baseDraft,
      actions: [...baseDraft.actions, scalingBolt],
      pcs: [{ ...baseDraft.pcs[0], actionNames: ['Longsword', 'Scaling Bolt'] }],
    };
    expect(validateDraft(good)).toEqual([]);

    const bad: AIScenarioDraft = {
      ...good,
      actions: [...baseDraft.actions, { ...scalingBolt, dynamic: { saveDc: '8 + wisdom' } }],
    };
    expect(validateDraft(bad).some((e) => /dynamic\.saveDc formula is invalid/.test(e))).toBe(true);
  });

});