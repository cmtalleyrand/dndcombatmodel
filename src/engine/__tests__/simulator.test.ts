import { describe, it, expect } from 'vitest';
import { runSimulation } from '../simulator';
import { runMany } from '../statistics';
import type { Action, Combatant, Scenario } from '../types';

function mkAbilities(over: Partial<Record<string, number>> = {}) {
  return {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
    ...over,
  } as Combatant['abilityScores'];
}

const swordId = 'a-sword';
const sword: Action = {
  id: swordId,
  name: 'Longsword',
  kind: 'attack',
  targets: 1,
  attackBonus: 5,
  attackCount: 1,
  damage: '1d8+3',
  damageType: 'slashing',
};

function fighter(id: string, side: 'pc' | 'monster', over: Partial<Combatant> = {}): Combatant {
  return {
    id,
    name: id,
    side,
    maxHp: 20,
    ac: 14,
    abilityScores: mkAbilities({ dex: 12 }),
    saveProficiencies: ['str', 'con'],
    proficiencyBonus: 2,
    actionIds: [swordId],
    script: [
      { priority: 1, condition: { type: 'always' }, actionId: swordId, target: { strategy: 'lowestHpEnemy' } },
    ],
    spellSlots: {},
    ...over,
  };
}

function baseScenario(over: Partial<Scenario> = {}): Scenario {
  return {
    name: 'test',
    combatants: [fighter('pc1', 'pc'), fighter('m1', 'monster')],
    actions: [sword],
    initiativeMode: 'rolled',
    maxRounds: 50,
    ...over,
  };
}

describe('runSimulation', () => {
  it('is deterministic for the same seed', () => {
    const s = baseScenario();
    const a = runSimulation(s, 123);
    const b = runSimulation(s, 123);
    expect(a.winner).toBe(b.winner);
    expect(a.rounds).toBe(b.rounds);
    expect(a.events.length).toBe(b.events.length);
  });

  it('produces a winner (no infinite loop) in a 1v1', () => {
    const s = baseScenario();
    const r = runSimulation(s, 7);
    expect(['pc', 'monster', 'draw']).toContain(r.winner);
    expect(r.rounds).toBeGreaterThan(0);
  });

  it('a vastly stronger side wins ~always', () => {
    const strongPc = fighter('hero', 'pc', { maxHp: 200, ac: 20 });
    const weakMon = fighter('goblin', 'monster', { maxHp: 5, ac: 8 });
    const s = baseScenario({ combatants: [strongPc, weakMon] });
    const { stats } = runMany(s, 200, 999);
    expect(stats.pcWinRate).toBeGreaterThan(0.95);
  });

  it('a mirror match is roughly 50/50', () => {
    const s = baseScenario();
    const { stats } = runMany(s, 600, 2024);
    expect(stats.pcWinRate).toBeGreaterThan(0.3);
    expect(stats.pcWinRate).toBeLessThan(0.7);
  });
});

describe('fixed initiative', () => {
  it('respects the provided order (first acts first)', () => {
    // Glass cannons: whoever swings first usually wins. Put pc first.
    const pc = fighter('pc1', 'pc', { maxHp: 6, actionIds: [swordId] });
    const mon = fighter('m1', 'monster', { maxHp: 6 });
    const s = baseScenario({
      combatants: [pc, mon],
      initiativeMode: 'fixed',
      fixedOrder: ['pc1', 'm1'],
    });
    const { stats } = runMany(s, 300, 55);
    // pc acting first should win more often than not
    expect(stats.pcWinRate).toBeGreaterThan(0.5);
  });
});
