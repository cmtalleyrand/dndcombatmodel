import { describe, expect, it, vi } from 'vitest';
import { mergeDraftPatch, repairDraftLoop, type DraftPatch } from '../repairDraft';
import type { AIScenarioDraft } from '../types';

function draft(over: Partial<AIScenarioDraft> = {}): AIScenarioDraft {
  return {
    scenarioSummary: 'base',
    pcs: [{ name: 'Hero', side: 'pc', maxHp: 20, ac: 15, abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, proficiencyBonus: 2, actionNames: ['Swing'] }],
    enemies: [{ name: 'Goblin', side: 'monster', maxHp: 7, ac: 13, abilityScores: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }, proficiencyBonus: 2, actionNames: ['Swing'] }],
    actions: [{ id: '', name: 'Swing', kind: 'attack', targets: 1, damage: '1d8+2', damageType: 'slashing' }],
    priorityScripts: [{ actorName: 'Hero', actionName: 'Swing', priority: 1, condition: { type: 'always' }, target: { strategy: 'lowestHpEnemy' } }],
    targetPriorities: [],
    assumptionsRequiringApproval: [],
    ...over,
  };
}

describe('mergeDraftPatch', () => {
  it('replaces a matching action by name and leaves the rest untouched', () => {
    const base = draft({ actions: [
      { id: '', name: 'Swing', kind: 'attack', targets: 1, damage: '1d8+2', damageType: 'slashing' },
      { id: '', name: 'Bite', kind: 'attack', targets: 1, damage: '1d6', damageType: 'piercing' },
    ] });
    const patch: DraftPatch = { actions: [{ id: '', name: 'Bite', kind: 'attack', targets: 1, damage: '2d6', damageType: 'piercing' }] };

    const merged = mergeDraftPatch(base, patch);
    expect(merged.actions).toHaveLength(2);
    expect(merged.actions.find((a) => a.name === 'Swing')?.damage).toBe('1d8+2'); // untouched
    expect(merged.actions.find((a) => a.name === 'Bite')?.damage).toBe('2d6'); // replaced
  });

  it('appends brand-new items and merges optional sections', () => {
    const patch: DraftPatch = {
      actions: [{ id: '', name: 'Fireball', kind: 'spell', targets: 1, damage: '8d6', damageType: 'fire' }],
      tacticalPolicies: [{ actorName: 'Goblin', sourceName: 'Kite', policy: { movementPolicy: { kind: 'retreatKite', preferredRange: 80 } } }],
    };
    const merged = mergeDraftPatch(draft(), patch);
    expect(merged.actions.map((a) => a.name)).toEqual(['Swing', 'Fireball']);
    expect(merged.tacticalPolicies).toHaveLength(1);
  });

  it('replaces a priority-script rule by actor + priority', () => {
    const patch: DraftPatch = { priorityScripts: [{ actorName: 'Hero', actionName: 'Swing', priority: 1, condition: { type: 'nearestEnemyWithin', value: 5 }, target: { strategy: 'nearestEnemy' } }] };
    const merged = mergeDraftPatch(draft(), patch);
    expect(merged.priorityScripts).toHaveLength(1);
    expect(merged.priorityScripts[0].condition.type).toBe('nearestEnemyWithin');
  });

  it('only overrides scalar fields the patch actually sets', () => {
    expect(mergeDraftPatch(draft(), {}).scenarioSummary).toBe('base');
    expect(mergeDraftPatch(draft(), { scenarioSummary: 'new' }).scenarioSummary).toBe('new');
  });
});

describe('repairDraftLoop', () => {
  it('does not call the model when the draft already validates', async () => {
    const requestPatch = vi.fn();
    const result = await repairDraftLoop(draft(), () => [], requestPatch);
    expect(requestPatch).not.toHaveBeenCalled();
    expect(result.attempts).toBe(0);
    expect(result.issues).toEqual([]);
  });

  it('applies patches until the draft is clean', async () => {
    // First validation fails; after one patch that renames the action, it passes.
    const validate = (d: AIScenarioDraft) => (d.actions.some((a) => a.name === 'Fixed') ? [] : ['bad action']);
    const requestPatch = vi.fn(async () => ({ actions: [{ id: '', name: 'Fixed', kind: 'attack', targets: 1 }] }) as DraftPatch);

    const result = await repairDraftLoop(draft(), validate, requestPatch);
    expect(requestPatch).toHaveBeenCalledTimes(1);
    expect(result.issues).toEqual([]);
    expect(result.draft.actions.some((a) => a.name === 'Fixed')).toBe(true);
  });

  it('stops after one round when the same errors persist (no endless loop)', async () => {
    const validate = () => ['still broken'];
    const requestPatch = vi.fn(async () => ({}) as DraftPatch); // patch changes nothing
    const result = await repairDraftLoop(draft(), validate, requestPatch, 5);
    // one attempt, then no-progress detected -> stop (not 5)
    expect(requestPatch).toHaveBeenCalledTimes(1);
    expect(result.issues).toEqual(['still broken']);
  });

  it('respects the attempt cap when errors keep changing but never clear', async () => {
    let n = 0;
    const validate = () => [`error ${n}`]; // a different single error each validate call
    const requestPatch = vi.fn(async () => { n += 1; return {} as DraftPatch; });
    const result = await repairDraftLoop(draft(), validate, requestPatch, 3);
    expect(requestPatch).toHaveBeenCalledTimes(3);
    expect(result.attempts).toBe(3);
  });

  it('discards a patch that makes validation strictly worse', async () => {
    const validate = (d: AIScenarioDraft) => (d.actions.some((a) => a.name === 'Bad') ? ['e1', 'e2'] : ['e1']);
    const requestPatch = vi.fn(async () => ({ actions: [{ id: '', name: 'Bad', kind: 'attack', targets: 1 }] }) as DraftPatch);
    const result = await repairDraftLoop(draft(), validate, requestPatch, 3);
    expect(requestPatch).toHaveBeenCalledTimes(1);
    expect(result.issues).toEqual(['e1']); // kept the better prior draft
    expect(result.draft.actions.some((a) => a.name === 'Bad')).toBe(false);
  });
});
