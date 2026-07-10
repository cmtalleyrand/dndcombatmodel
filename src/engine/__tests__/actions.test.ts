import { describe, expect, it } from 'vitest';
import { performAction } from '../actions';
import { RNG } from '../dice';
import { chooseAction } from '../rules';
import { runSimulation } from '../simulator';
import { fixtureAction, fixtureCombatant, fixtureScenario, fixtureState, scriptedCombatant } from '../../test/fixtures';
import type { LogEvent } from '../log';

describe('healing and resource consumption', () => {
  it('revives a downed ally and consumes one spell slot', () => {
    const heal = fixtureAction({ id: 'cure', name: 'Cure Wounds', kind: 'spell', heal: '1d8+3', spellLevel: 1, damage: undefined, damageType: undefined });
    const cleric = fixtureCombatant('cleric', 'pc', { spellSlots: { 1: 2 } });
    const ally = fixtureCombatant('ally', 'pc');
    const state = fixtureState([cleric, ally], [heal]);
    const allyState = state.combatants[1];
    allyState.hp = 0;
    allyState.down = true;

    performAction(state, new RNG(1), state.combatants[0], heal, [allyState], []);

    expect(allyState.hp).toBeGreaterThan(0);
    expect(allyState.down).toBe(false);
    expect(state.combatants[0].spellSlots[1]).toBe(1);
  });

  it('selects a heal rule for a downed ally before a fallback attack', () => {
    const heal = fixtureAction({ id: 'cure', name: 'Cure Wounds', kind: 'spell', heal: '1d8+3', spellLevel: 1, damage: undefined, damageType: undefined });
    const sword = fixtureAction({ id: 'sw', name: 'Sword' });
    const cleric = fixtureCombatant('cleric', 'pc', {
      spellSlots: { 1: 1 },
      actionIds: ['cure', 'sw'],
      script: [
        { priority: 1, condition: { type: 'anyAllyHpBelowPct', value: 50 }, actionId: 'cure', target: { strategy: 'lowestHpAlly' } },
        { priority: 2, condition: { type: 'always' }, actionId: 'sw', target: { strategy: 'lowestHpEnemy' } },
      ],
    });
    const state = fixtureState([cleric, fixtureCombatant('ally', 'pc'), fixtureCombatant('enemy', 'monster')], [heal, sword]);
    state.combatants[1].hp = 0;
    state.combatants[1].down = true;

    const choice = chooseAction(state, state.combatants[0]);

    expect(choice?.action.id).toBe('cure');
    expect(choice?.targets[0]?.base.id).toBe('ally');
  });
});

describe('incapacitation and concentration effects', () => {
  it('applies an incapacitating condition on a failed save', () => {
    const sleep = fixtureAction({
      id: 'sleep',
      name: 'Sleep',
      kind: 'spell',
      spellLevel: 1,
      save: { ability: 'wis', dc: 50, onSuccess: 'none' },
      applyConditions: [{ kind: 'asleep', duration: { type: 'rounds', rounds: 3 } }],
      damage: undefined,
      damageType: undefined,
    });
    const state = fixtureState([
      fixtureCombatant('wiz', 'pc', { spellSlots: { 1: 1 } }),
      fixtureCombatant('gob', 'monster'),
    ], [sleep]);

    performAction(state, new RNG(2), state.combatants[0], sleep, [state.combatants[1]], []);

    expect(state.combatants[1].conditions.some((c) => c.kind === 'asleep')).toBe(true);
  });

  it('starting a new concentration action drops the previous concentration condition', () => {
    const bless = fixtureAction({
      id: 'bless',
      name: 'Bless',
      kind: 'spell',
      spellLevel: 1,
      concentration: true,
      applyConditions: [{ kind: 'blessed', duration: { type: 'concentration', sourceId: '' } }],
      damage: undefined,
      damageType: undefined,
    });
    const mark = fixtureAction({
      id: 'mark',
      name: "Hunter's Mark",
      kind: 'spell',
      spellLevel: 1,
      concentration: true,
      applyConditions: [{ kind: 'marked', duration: { type: 'concentration', sourceId: '' } }],
      damage: undefined,
      damageType: undefined,
    });
    const state = fixtureState([
      fixtureCombatant('cleric', 'pc', { spellSlots: { 1: 5 } }),
      fixtureCombatant('ally', 'pc'),
      fixtureCombatant('foe', 'monster'),
    ], [bless, mark]);
    const caster = state.combatants[0];

    performAction(state, new RNG(3), caster, bless, [state.combatants[1]], []);
    performAction(state, new RNG(4), caster, mark, [state.combatants[2]], []);

    expect(caster.concentratingOn).toBe('mark');
    expect(state.combatants[1].conditions.some((c) => c.kind === 'blessed')).toBe(false);
    expect(state.combatants[2].conditions.some((c) => c.kind === 'marked')).toBe(true);
  });
});

describe('rider trigger behaviour', () => {
  it('fires a once-per-turn adjacent-ally rider exactly once', () => {
    const action = fixtureAction({
      id: 'sneak',
      name: 'Sneak Strike',
      attackBonus: 50,
      attackCount: 3,
      riders: [{ label: 'Sneak Attack', bonusDice: '2d6', trigger: 'advantageOrAllyAdjacent', oncePerTurn: true }],
    });
    const state = fixtureState([
      fixtureCombatant('rogue', 'pc', { position: 0 }),
      fixtureCombatant('ally', 'pc', { position: 0 }),
      fixtureCombatant('foe', 'monster', { position: 0, ac: 1 }),
    ], [action]);
    const events: LogEvent[] = [];

    performAction(state, new RNG(3), state.combatants[0], action, [state.combatants[2]], events);

    expect(events.filter((e) => e.message.includes('Sneak Attack'))).toHaveLength(1);
  });
});

describe('simulation with incapacitation and attacks', () => {
  it('finishes a mixed sleep and sword encounter without stalling on incapacitated targets', () => {
    const sword = fixtureAction({ id: 'sw', name: 'Sword', attackBonus: 5, damage: '1d8+3' });
    const sleep = fixtureAction({
      id: 'sleep',
      name: 'Sleep',
      kind: 'spell',
      targets: 2,
      spellLevel: 1,
      save: { ability: 'wis', dc: 13, onSuccess: 'none' },
      applyConditions: [{ kind: 'asleep', duration: { type: 'rounds', rounds: 5 } }],
      damage: undefined,
      damageType: undefined,
    });
    const wiz = fixtureCombatant('wiz', 'pc', {
      maxHp: 18,
      spellSlots: { 1: 2 },
      actionIds: ['sleep', 'sw'],
      script: [
        { priority: 1, condition: { type: 'slotAvailable' }, actionId: 'sleep', target: { strategy: 'allEnemies', excludeIncapacitated: true } },
        { priority: 2, condition: { type: 'always' }, actionId: 'sw', target: { strategy: 'lowestHpEnemy' } },
      ],
    });
    const scenario = fixtureScenario({
      name: 'combo',
      combatants: [wiz, scriptedCombatant('ftr', 'pc', 'sw', { maxHp: 30 }), scriptedCombatant('g1', 'monster', 'sw', { maxHp: 12 }), scriptedCombatant('g2', 'monster', 'sw', { maxHp: 12 })],
      actions: [sword, sleep],
      fixedOrder: ['wiz', 'ftr', 'g1', 'g2'],
      maxRounds: 50,
    });

    const result = runSimulation(scenario, 42);

    expect(['pc', 'monster', 'draw']).toContain(result.winner);
    expect(result.rounds).toBeGreaterThan(0);
  });
});
