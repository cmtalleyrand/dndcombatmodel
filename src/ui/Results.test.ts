import { describe, expect, it } from 'vitest';
import { buildResultsCsv } from './Results';
import type { AggregateStats } from '../engine/statistics';
import type { Scenario } from '../engine/types';
import { defaultScenario } from '../data/srd';

function statsFixture(): AggregateStats {
  return {
    simulations: 500,
    pcWinRate: 0.62,
    monsterWinRate: 0.33,
    drawRate: 0.05,
    avgRounds: 6.4,
    combatants: [
      { id: 'pc1', name: 'Cleric', side: 'pc', maxHp: 24, survivalRate: 0.8, avgEndHp: 12.3, avgDamageDealt: 18.1, avgDamageTaken: 22.4, avgHealingDone: 9.7, avgDamageByRound: [] },
      { id: 'm1', name: 'Ogre, "Big"', side: 'monster', maxHp: 59, survivalRate: 0.4, avgEndHp: 5.2, avgDamageDealt: 30.0, avgDamageTaken: 40.1, avgHealingDone: 0, avgDamageByRound: [] },
    ],
    // sampleRun is unused by buildResultsCsv; cast to satisfy the type.
    sampleRun: { winner: 'pc', rounds: 6, events: [], outcomes: [], damageByRound: {}, frames: [] } as AggregateStats['sampleRun'],
  };
}

describe('buildResultsCsv', () => {
  it('emits a summary block and a per-combatant table', () => {
    const scenario: Scenario = { ...defaultScenario(), name: 'My Fight' };
    const csv = buildResultsCsv(statsFixture(), scenario);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('section,key,value');
    expect(csv).toContain('summary,scenario,My Fight');
    expect(csv).toContain('summary,simulations,500');
    expect(csv).toContain('summary,partyWinRate,0.6200');
    // header row of the combatant table
    expect(csv).toContain('name,side,maxHp,survivalRate,avgEndHp,avgDamageDealt,avgDamageTaken,avgHealingDone');
    expect(csv).toContain('Cleric,pc,24,0.8000,12.30,18.10,22.40,9.70');
  });

  it('CSV-escapes names containing commas and quotes', () => {
    const scenario: Scenario = { ...defaultScenario(), name: 'A, B "C"' };
    const csv = buildResultsCsv(statsFixture(), scenario);
    expect(csv).toContain('summary,scenario,"A, B ""C"""');
    expect(csv).toContain('"Ogre, ""Big""",monster,59,');
  });
});
