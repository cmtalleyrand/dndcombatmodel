import { describe, it, expect } from 'vitest';
import { runSimulation, type RunResult } from '../simulator';
import { aggregate } from '../statistics';
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
    weapons: [],
    targetLists: [],
    ruleLibrary: [],
    conditionLibrary: [],
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

  it('a side with a guaranteed lethal action wins exactly', () => {
    const lethalStrike: Action = {
      id: 'a-lethal-strike',
      name: 'Lethal Strike',
      kind: 'ability',
      targets: 1,
      damage: '10',
      damageType: 'force',
    };
    const strongPc = fighter('hero', 'pc', {
      actionIds: [lethalStrike.id],
      script: [
        {
          priority: 1,
          condition: { type: 'always' },
          actionId: lethalStrike.id,
          target: { strategy: 'lowestHpEnemy' },
        },
      ],
    });
    const weakMon = fighter('goblin', 'monster', { maxHp: 5 });
    const s = baseScenario({
      combatants: [strongPc, weakMon],
      actions: [lethalStrike],
      initiativeMode: 'fixed',
      fixedOrder: ['hero', 'goblin'],
    });

    const r = runSimulation(s, 999);

    expect(r.winner).toBe('pc');
    expect(r.rounds).toBe(1);
    expect(r.outcomes.find((o) => o.id === 'goblin')?.survived).toBe(false);
  });
});

describe('replay frames', () => {
  it('records no frames by default but captures per-turn snapshots when asked', () => {
    const s = baseScenario();
    expect(runSimulation(s, 11).frames).toHaveLength(0);

    const r = runSimulation(s, 11, true);
    // initial setup frame + at least one turn
    expect(r.frames.length).toBeGreaterThan(1);

    const [setup, ...turns] = r.frames;
    expect(setup.index).toBe(0);
    expect(setup.round).toBe(0);
    expect(setup.actorId).toBeNull();
    expect(setup.events).toHaveLength(0);

    // every frame snapshots all combatants with sane values
    for (const f of r.frames) {
      expect(f.snapshot.map((sn) => sn.id).sort()).toEqual(['m1', 'pc1']);
      for (const sn of f.snapshot) {
        expect(Number.isFinite(sn.position)).toBe(true);
        expect(sn.hp).toBeGreaterThanOrEqual(0);
        expect(sn.hp).toBeLessThanOrEqual(sn.maxHp);
        expect(typeof sn.alive).toBe('boolean');
      }
    }

    // turn frames are indexed sequentially and reference a real actor
    turns.forEach((f, i) => {
      expect(f.index).toBe(i + 1);
      expect(['pc1', 'm1']).toContain(f.actorId);
    });

    // the winning side has a survivor in the final frame
    if (r.winner !== 'draw') {
      const last = r.frames[r.frames.length - 1].snapshot;
      expect(last.some((sn) => sn.alive)).toBe(true);
    }
  });
});

describe('aggregate', () => {
  it('computes exact rates from known run outcomes', () => {
    const s = baseScenario({ maxRounds: 2 });
    const runs: RunResult[] = [
      {
        winner: 'pc',
        rounds: 1,
        events: [],
        outcomes: [
          {
            id: 'pc1',
            name: 'pc1',
            side: 'pc',
            endHp: 10,
            maxHp: 20,
            survived: true,
            damageDealt: 5,
            damageTaken: 0,
            healingDone: 0,
          },
          {
            id: 'm1',
            name: 'm1',
            side: 'monster',
            endHp: 0,
            maxHp: 20,
            survived: false,
            damageDealt: 0,
            damageTaken: 5,
            healingDone: 0,
          },
        ],
        damageByRound: { pc1: [5], m1: [0] },
        frames: [],
      },
      {
        winner: 'monster',
        rounds: 2,
        events: [],
        outcomes: [
          {
            id: 'pc1',
            name: 'pc1',
            side: 'pc',
            endHp: 0,
            maxHp: 20,
            survived: false,
            damageDealt: 2,
            damageTaken: 7,
            healingDone: 0,
          },
          {
            id: 'm1',
            name: 'm1',
            side: 'monster',
            endHp: 3,
            maxHp: 20,
            survived: true,
            damageDealt: 7,
            damageTaken: 2,
            healingDone: 0,
          },
        ],
        damageByRound: { pc1: [1, 1], m1: [3, 4] },
        frames: [],
      },
    ];

    const stats = aggregate(s, runs);

    expect(stats.simulations).toBe(2);
    expect(stats.pcWinRate).toBe(0.5);
    expect(stats.monsterWinRate).toBe(0.5);
    expect(stats.drawRate).toBe(0);
    expect(stats.avgRounds).toBe(1.5);
    expect(stats.combatants.find((c) => c.id === 'pc1')?.avgDamageDealt).toBe(3.5);
    expect(stats.combatants.find((c) => c.id === 'pc1')?.avgDamageByRound).toEqual([3, 0.5]);
  });
});

describe('fixed initiative', () => {
  it('respects the provided order (first acts first)', () => {
    const pc = fighter('pc1', 'pc', { maxHp: 6, actionIds: [swordId] });
    const mon = fighter('m1', 'monster', { maxHp: 6 });
    const s = baseScenario({
      combatants: [pc, mon],
      initiativeMode: 'fixed',
      fixedOrder: ['pc1', 'm1'],
    });
    const r = runSimulation(s, 55);
    const firstAction = r.events.find((e) => e.type !== 'condition');

    expect(firstAction?.actorId).toBe('pc1');
  });
});
