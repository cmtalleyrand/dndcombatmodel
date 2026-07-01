import { describe, it, expect } from 'vitest';
import { defaultScenario, DEFAULT_CONDITION_LIBRARY, DEFAULT_RULE_LIBRARY, SRD_ACTIONS, SAMPLE_PCS } from '../srd';
import { CONDITION_KINDS } from '../../engine/conditions';
import { runMany } from '../../engine/statistics';

describe('default scenario', () => {
  it('every combatant references only actions that exist', () => {
    const s = defaultScenario();
    const ids = new Set(s.actions.map((a) => a.id));
    for (const c of s.combatants) {
      for (const aid of c.actionIds) expect(ids.has(aid)).toBe(true);
      for (const r of c.script) expect(ids.has(r.actionId)).toBe(true);
    }
  });

  it('runs many simulations and produces sensible aggregate stats', () => {
    const s = defaultScenario();
    const { stats } = runMany(s, 300, 2025);
    expect(stats.simulations).toBe(300);
    // probabilities sum to 1
    expect(stats.pcWinRate + stats.monsterWinRate + stats.drawRate).toBeCloseTo(1, 5);
    // combat resolves within the round cap on average
    expect(stats.avgRounds).toBeGreaterThan(0);
    expect(stats.avgRounds).toBeLessThan(s.maxRounds);
    // the party should win the majority of the time against this encounter
    expect(stats.pcWinRate).toBeGreaterThan(0.5);
    // cleric should be doing some healing
    const cleric = stats.combatants.find((c) => c.id === 'pc-cleric')!;
    expect(cleric.avgHealingDone).toBeGreaterThan(0);
  });

  it('action library has the spells called out in the spec', () => {
    const names = SRD_ACTIONS.map((a) => a.id);
    for (const id of ['act-cure-wounds', 'act-bless', 'act-sleep', 'act-magic-missile']) {
      expect(names).toContain(id);
    }
    expect(SAMPLE_PCS.length).toBe(4);
  });

  it('is prestocked with a rules library and a conditions library', () => {
    const s = defaultScenario();
    expect(s.ruleLibrary.length).toBeGreaterThan(0);
    expect(s.conditionLibrary.length).toBeGreaterThan(0);
    expect(s.ruleLibrary).toBe(DEFAULT_RULE_LIBRARY);
    expect(s.conditionLibrary).toBe(DEFAULT_CONDITION_LIBRARY);
  });

  it('every rule template references a real action and has a unique id/name', () => {
    const actionIds = new Set(SRD_ACTIONS.map((a) => a.id));
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const t of DEFAULT_RULE_LIBRARY) {
      expect(actionIds.has(t.actionId)).toBe(true);
      expect(ids.has(t.id)).toBe(false);
      expect(names.has(t.name)).toBe(false);
      ids.add(t.id);
      names.add(t.name);
    }
  });

  it('every condition preset uses a real condition kind and has a unique id/name', () => {
    const kinds = new Set(CONDITION_KINDS);
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const p of DEFAULT_CONDITION_LIBRARY) {
      expect(kinds.has(p.kind)).toBe(true);
      expect(ids.has(p.id)).toBe(false);
      expect(names.has(p.name)).toBe(false);
      ids.add(p.id);
      names.add(p.name);
    }
  });
});
