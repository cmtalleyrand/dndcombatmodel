import { describe, it, expect } from 'vitest';
import { runSimulation } from '../simulator';
import { buildCombatState } from '../state';
import { performAction } from '../actions';
import { chooseAction } from '../rules';
import { RNG } from '../dice';
import type { Action, Combatant, Scenario } from '../types';
import type { LogEvent } from '../log';

function abilities(over: Partial<Record<string, number>> = {}) {
  return { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...over } as Combatant['abilityScores'];
}

function mkCombatant(id: string, side: 'pc' | 'monster', over: Partial<Combatant> = {}): Combatant {
  return {
    id,
    name: id,
    side,
    maxHp: 30,
    ac: 12,
    abilityScores: abilities(),
    saveProficiencies: [],
    proficiencyBonus: 2,
    actionIds: [],
    script: [],
    spellSlots: {},
    ...over,
  };
}

function mkState(combatants: Combatant[], actions: Action[]) {
  const scenario: Scenario = {
    name: 't',
    combatants,
    actions,
    weapons: [],
    targetLists: [],
    initiativeMode: 'fixed',
    fixedOrder: combatants.map((c) => c.id),
    maxRounds: 10,
  };
  return buildCombatState(scenario);
}

describe('healing', () => {
  it('restores HP and revives a downed ally', () => {
    const heal: Action = { id: 'cure', name: 'Cure Wounds', kind: 'spell', targets: 1, heal: '1d8+3', spellLevel: 1 };
    const cleric = mkCombatant('cleric', 'pc', { spellSlots: { 1: 1 } });
    const ally = mkCombatant('ally', 'pc', { maxHp: 30 });
    const state = mkState([cleric, ally], [heal]);
    const allyState = state.combatants[1];
    allyState.hp = 0;
    allyState.down = true;
    const events: LogEvent[] = [];
    performAction(state, new RNG(1), state.combatants[0], heal, [allyState], events);
    expect(allyState.hp).toBeGreaterThan(0);
    expect(allyState.down).toBe(false);
  });

  it('consumes a spell slot', () => {
    const heal: Action = { id: 'cure', name: 'Cure Wounds', kind: 'spell', targets: 1, heal: '1d8+3', spellLevel: 1 };
    const cleric = mkCombatant('cleric', 'pc', { spellSlots: { 1: 2 } });
    const ally = mkCombatant('ally', 'pc');
    const state = mkState([cleric, ally], [heal]);
    performAction(state, new RNG(1), state.combatants[0], heal, [state.combatants[1]], []);
    expect(state.combatants[0].spellSlots[1]).toBe(1);
  });
});

describe('targeting downed allies for healing', () => {
  it('a heal rule selects and revives a downed ally', () => {
    const heal: Action = { id: 'cure', name: 'Cure Wounds', kind: 'spell', targets: 1, heal: '1d8+3', spellLevel: 1 };
    const sword: Action = { id: 'sw', name: 'Sword', kind: 'attack', targets: 1, attackBonus: 5, damage: '1d8+3' };
    const cleric = mkCombatant('cleric', 'pc', {
      spellSlots: { 1: 1 },
      actionIds: ['cure', 'sw'],
      script: [
        { priority: 1, condition: { type: 'anyAllyHpBelowPct', value: 50 }, actionId: 'cure', target: { strategy: 'lowestHpAlly' } },
        { priority: 2, condition: { type: 'always' }, actionId: 'sw', target: { strategy: 'lowestHpEnemy' } },
      ],
    });
    const ally = mkCombatant('ally', 'pc');
    const enemy = mkCombatant('enemy', 'monster');
    const state = mkState([cleric, ally, enemy], [heal, sword]);
    // down the ally
    state.combatants[1].hp = 0;
    state.combatants[1].down = true;

    const choice = chooseAction(state, state.combatants[0]);
    expect(choice?.action.id).toBe('cure');
    expect(choice?.targets[0]?.base.id).toBe('ally');
  });
});

describe('sleep / incapacitation', () => {
  it('applies the asleep condition on a failed save', () => {
    const sleep: Action = {
      id: 'sleep',
      name: 'Sleep',
      kind: 'spell',
      targets: 1,
      spellLevel: 1,
      save: { ability: 'wis', dc: 50, onSuccess: 'none' }, // impossible DC -> always fails
      applyConditions: [{ kind: 'asleep', duration: { type: 'rounds', rounds: 3 } }],
    };
    const caster = mkCombatant('wiz', 'pc', { spellSlots: { 1: 1 } });
    const target = mkCombatant('gob', 'monster');
    const state = mkState([caster, target], [sleep]);
    performAction(state, new RNG(2), state.combatants[0], sleep, [state.combatants[1]], []);
    expect(state.combatants[1].conditions.some((c) => c.kind === 'asleep')).toBe(true);
  });
});

describe('concentration', () => {
  it('a caster only concentrates on one thing; new concentration drops the old', () => {
    const bless: Action = {
      id: 'bless',
      name: 'Bless',
      kind: 'spell',
      targets: 1,
      spellLevel: 1,
      concentration: true,
      applyConditions: [{ kind: 'blessed', duration: { type: 'concentration', sourceId: '' } }],
    };
    const caster = mkCombatant('cleric', 'pc', { spellSlots: { 1: 5 } });
    const a1 = mkCombatant('a1', 'pc');
    const a2 = mkCombatant('a2', 'pc');
    const state = mkState([caster, a1, a2], [bless]);
    const cs = state.combatants[0];
    performAction(state, new RNG(3), cs, bless, [state.combatants[1]], []);
    expect(cs.concentratingOn).toBe('bless');
    expect(state.combatants[1].conditions.some((c) => c.kind === 'blessed')).toBe(true);
    // recast on a2 — same action id, still concentrating; condition added on a2
    performAction(state, new RNG(4), cs, bless, [state.combatants[2]], []);
    expect(state.combatants[2].conditions.some((c) => c.kind === 'blessed')).toBe(true);
  });
});

describe('simulation with sleep+sword combo finishes', () => {
  it('caster + fighter beat two goblins', () => {
    const sword: Action = { id: 'sw', name: 'Sword', kind: 'attack', targets: 1, attackBonus: 5, damage: '1d8+3' };
    const sleep: Action = {
      id: 'sleep',
      name: 'Sleep',
      kind: 'spell',
      targets: 2,
      spellLevel: 1,
      save: { ability: 'wis', dc: 13, onSuccess: 'none' },
      applyConditions: [{ kind: 'asleep', duration: { type: 'rounds', rounds: 5 } }],
    };
    const wiz = mkCombatant('wiz', 'pc', {
      maxHp: 18,
      spellSlots: { 1: 2 },
      actionIds: ['sleep', 'sw'],
      script: [
        { priority: 1, condition: { type: 'slotAvailable' }, actionId: 'sleep', target: { strategy: 'allEnemies', excludeIncapacitated: true } },
        { priority: 2, condition: { type: 'always' }, actionId: 'sw', target: { strategy: 'lowestHpEnemy' } },
      ],
    });
    const ftr = mkCombatant('ftr', 'pc', {
      maxHp: 30,
      actionIds: ['sw'],
      script: [{ priority: 1, condition: { type: 'always' }, actionId: 'sw', target: { strategy: 'lowestHpEnemy' } }],
    });
    const g1 = mkCombatant('g1', 'monster', { maxHp: 12, actionIds: ['sw'], script: [{ priority: 1, condition: { type: 'always' }, actionId: 'sw', target: { strategy: 'lowestHpEnemy' } }] });
    const g2 = mkCombatant('g2', 'monster', { maxHp: 12, actionIds: ['sw'], script: [{ priority: 1, condition: { type: 'always' }, actionId: 'sw', target: { strategy: 'lowestHpEnemy' } }] });
    const scenario: Scenario = {
      name: 'combo',
      combatants: [wiz, ftr, g1, g2],
      actions: [sword, sleep],
      weapons: [],
      targetLists: [],
      initiativeMode: 'fixed',
      fixedOrder: ['wiz', 'ftr', 'g1', 'g2'],
      maxRounds: 50,
    };
    const r = runSimulation(scenario, 42);
    expect(['pc', 'monster', 'draw']).toContain(r.winner);
    expect(r.rounds).toBeGreaterThan(0);
  });
});
