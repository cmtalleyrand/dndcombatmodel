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

describe('validateDraft decomposed feature semantics', () => {
  it('accepts a feat that modifies an attack as a modifier, not a standalone attack', () => {
    const draft = baseDraft({
      pcs: [{ ...baseDraft().pcs[0], declaredFeatureNames: ['Power Shot'] }],
      featureDecompositions: [{ sourceName: 'Power Shot', category: 'stackableModifier', simulatorRepresentation: 'stackableModifiers[Power Shot]', triggerTiming: 'beforeAttackRoll', resourceCost: 'none', stackingBehavior: 'stacks on Swing' }],
      stackableModifiers: [{ name: 'Power Shot', sourceName: 'Power Shot', timing: 'beforeAttackRoll', appliesToActionNames: ['Swing'], toHit: -5, damage: 10, stackingBehavior: 'additive' }],
    });

    expect(validateDraft(draft)).toEqual([]);
  });

  it('accepts a reactive accuracy feature with post-roll timing and a resource pool', () => {
    const draft = baseDraft({
      pcs: [{ ...baseDraft().pcs[0], declaredFeatureNames: ['Guided Strike'] }],
      resources: [{ name: 'Guided Strike Uses', sourceName: 'Guided Strike', max: 1 }],
      featureDecompositions: [{ sourceName: 'Guided Strike', category: 'stackableModifier', simulatorRepresentation: 'stackableModifiers[Guided Strike]', triggerTiming: 'afterAttackRollBeforeHitResolution', resourceCost: '1 Guided Strike Use', consumesResourceName: 'Guided Strike Uses', stackingBehavior: 'adds after miss' }],
      stackableModifiers: [{ name: 'Guided Strike', sourceName: 'Guided Strike', timing: 'afterAttackRollBeforeHitResolution', appliesToActionNames: ['Swing'], toHit: 4, resourceName: 'Guided Strike Uses', spendTrigger: 'missWithin', missThreshold: 4, stackingBehavior: 'additive' }],
    });

    expect(validateDraft(draft)).toEqual([]);
  });

  it('accepts two compatible modifiers stacking on one base action', () => {
    const draft = baseDraft({
      pcs: [{ ...baseDraft().pcs[0], declaredFeatureNames: ['Power Shot', 'Cold Rune'] }],
      resources: [{ name: 'Cold Rune Uses', sourceName: 'Cold Rune', max: 1 }],
      featureDecompositions: [
        { sourceName: 'Power Shot', category: 'stackableModifier', simulatorRepresentation: 'stackableModifiers[Power Shot]', triggerTiming: 'beforeAttackRoll', resourceCost: 'none', stackingBehavior: 'stacks with Cold Rune on Swing' },
        { sourceName: 'Cold Rune', category: 'stackableModifier', simulatorRepresentation: 'stackableModifiers[Cold Rune]', triggerTiming: 'onHit', resourceCost: '1 Cold Rune Use', consumesResourceName: 'Cold Rune Uses', stackingBehavior: 'stacks with Power Shot on Swing' },
      ],
      stackableModifiers: [
        { name: 'Power Shot', sourceName: 'Power Shot', timing: 'beforeAttackRoll', appliesToActionNames: ['Swing'], toHit: -5, damage: 10, stackingBehavior: 'additive' },
        { name: 'Cold Rune', sourceName: 'Cold Rune', timing: 'onHit', appliesToActionNames: ['Swing'], extraDamageDice: '1d6', extraDamageType: 'cold', resourceName: 'Cold Rune Uses', spendTrigger: 'onHit', stackingBehavior: 'adds typed damage' },
      ],
    });

    expect(validateDraft(draft)).toEqual([]);
  });

  it('accepts a speed-increasing feature that changes speed', () => {
    const draft = baseDraft({
      pcs: [{ ...baseDraft().pcs[0], declaredFeatureNames: ['Fleet Feet'] }],
      featureDecompositions: [{ sourceName: 'Fleet Feet', category: 'passiveTrait', simulatorRepresentation: 'passiveTraits[Fleet Feet].speedBonus', triggerTiming: 'passive', resourceCost: 'none', stackingBehavior: 'adds to base speed' }],
      passiveTraits: [{ name: 'Fleet Feet', sourceName: 'Fleet Feet', speedBonus: 10, simulatorRepresentation: '+10 speed' }],
    });

    expect(validateDraft(draft)).toEqual([]);
  });

  it('warns when a named feature appears only in an action name and has no mechanical effect', () => {
    const draft = baseDraft({
      pcs: [{ ...baseDraft().pcs[0], actionNames: ['Swing', 'Power Shot Swing'] }],
      actions: [
        { id: '', name: 'Swing', kind: 'attack', targets: 1, damage: '1d8+2', damageType: 'slashing' },
        { id: '', name: 'Power Shot Swing', kind: 'attack', targets: 1, damage: '1d8+2', damageType: 'slashing' },
      ],
      featureDecompositions: [{ sourceName: 'Power Shot', category: 'stackableModifier', simulatorRepresentation: 'action name only', triggerTiming: 'beforeAttackRoll', resourceCost: 'none', stackingBehavior: 'unknown' }],
    });

    expect(validateDraft(draft).some((error) => error.includes('pseudo-action'))).toBe(true);
  });
});

describe('validateDraft stat-range enforcement', () => {
  it('rejects out-of-range HP, AC, and ability scores', () => {
    const draft = baseDraft({
      pcs: [{ ...baseDraft().pcs[0], maxHp: 99999, ac: 0, abilityScores: { str: 40, dex: 12, con: 14, int: 10, wis: 10, cha: 8 } }],
    });
    const errors = validateDraft(draft);
    expect(errors.some((e) => e.includes('maxHp'))).toBe(true);
    expect(errors.some((e) => e.includes('AC'))).toBe(true);
    expect(errors.some((e) => e.includes('str score'))).toBe(true);
  });

  it('rejects out-of-range proficiency bonus, speed, and level', () => {
    const draft = baseDraft({
      pcs: [{ ...baseDraft().pcs[0], proficiencyBonus: 50, speed: 500, level: 99 }],
    });
    const errors = validateDraft(draft);
    expect(errors.some((e) => e.includes('proficiencyBonus'))).toBe(true);
    expect(errors.some((e) => e.includes('speed'))).toBe(true);
    expect(errors.some((e) => e.includes('level'))).toBe(true);
  });

  it('rejects a draft with no combatants at all', () => {
    const draft = baseDraft({ pcs: [], enemies: [] });
    expect(validateDraft(draft).some((e) => e.includes('no combatants'))).toBe(true);
  });

  it('accepts a normal stat block', () => {
    expect(validateDraft(baseDraft())).toEqual([]);
  });
});
