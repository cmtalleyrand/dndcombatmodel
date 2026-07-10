import { describe, expect, it } from 'vitest';
import { runSimulation, type RunResult } from '../simulator';
import { aggregate } from '../statistics';
import { fixtureAction, fixtureScenario, scriptedCombatant } from '../../test/fixtures';

describe('runSimulation', () => {
  it('is deterministic for the same seed', () => {
    const scenario = fixtureScenario({ initiativeMode: 'rolled', maxRounds: 50 });

    const first = runSimulation(scenario, 123);
    const second = runSimulation(scenario, 123);

    expect(first.winner).toBe(second.winner);
    expect(first.rounds).toBe(second.rounds);
    expect(first.events).toEqual(second.events);
    expect(first.outcomes).toEqual(second.outcomes);
  });

  it('ends combat when a side uses a guaranteed lethal action', () => {
    const lethalStrike = fixtureAction({ id: 'a-lethal-strike', name: 'Lethal Strike', kind: 'ability', damage: '10', damageType: 'force' });
    const scenario = fixtureScenario({
      combatants: [
        scriptedCombatant('hero', 'pc', lethalStrike.id),
        scriptedCombatant('goblin', 'monster', lethalStrike.id, { maxHp: 5 }),
      ],
      actions: [lethalStrike],
      fixedOrder: ['hero', 'goblin'],
    });

    const result = runSimulation(scenario, 999);

    expect(result.winner).toBe('pc');
    expect(result.rounds).toBe(1);
    expect(result.outcomes.find((o) => o.id === 'goblin')?.survived).toBe(false);
  });
});

describe('replay frame recording', () => {
  it('records no frames by default but captures initial and turn snapshots when asked', () => {
    const scenario = fixtureScenario();

    expect(runSimulation(scenario, 11).frames).toHaveLength(0);

    const result = runSimulation(scenario, 11, true);
    const [setup, ...turns] = result.frames;

    expect(result.frames.length).toBeGreaterThan(1);
    expect(setup).toMatchObject({ index: 0, round: 0, actorId: null, events: [] });
    for (const frame of result.frames) {
      expect(frame.snapshot.map((snapshot) => snapshot.id).sort()).toEqual(['m1', 'pc1']);
      expect(frame.snapshot.every((snapshot) => snapshot.hp >= 0 && snapshot.hp <= snapshot.maxHp)).toBe(true);
    }
    turns.forEach((frame, index) => {
      expect(frame.index).toBe(index + 1);
      expect(['pc1', 'm1']).toContain(frame.actorId);
    });
  });
});

describe('aggregate', () => {
  it('computes exact rates from known run outcomes', () => {
    const scenario = fixtureScenario({ maxRounds: 2 });
    const runs: RunResult[] = [
      {
        winner: 'pc',
        rounds: 1,
        events: [],
        outcomes: [
          { id: 'pc1', name: 'pc1', side: 'pc', endHp: 10, maxHp: 20, survived: true, damageDealt: 5, damageTaken: 0, healingDone: 0 },
          { id: 'm1', name: 'm1', side: 'monster', endHp: 0, maxHp: 20, survived: false, damageDealt: 0, damageTaken: 5, healingDone: 0 },
        ],
        damageByRound: { pc1: [5], m1: [0] },
        frames: [],
      },
      {
        winner: 'monster',
        rounds: 2,
        events: [],
        outcomes: [
          { id: 'pc1', name: 'pc1', side: 'pc', endHp: 0, maxHp: 20, survived: false, damageDealt: 2, damageTaken: 7, healingDone: 0 },
          { id: 'm1', name: 'm1', side: 'monster', endHp: 3, maxHp: 20, survived: true, damageDealt: 7, damageTaken: 2, healingDone: 0 },
        ],
        damageByRound: { pc1: [1, 1], m1: [3, 4] },
        frames: [],
      },
    ];

    const stats = aggregate(scenario, runs);

    expect(stats.simulations).toBe(2);
    expect(stats.pcWinRate).toBe(0.5);
    expect(stats.monsterWinRate).toBe(0.5);
    expect(stats.drawRate).toBe(0);
    expect(stats.avgRounds).toBe(1.5);
    expect(stats.combatants.find((c) => c.id === 'pc1')?.avgDamageDealt).toBe(3.5);
    expect(stats.combatants.find((c) => c.id === 'pc1')?.avgDamageByRound).toEqual([3, 0.5]);
  });
});
