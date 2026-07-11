import { describe, expect, it } from 'vitest';
import { performAction } from '../actions';
import { RNG } from '../dice';
import { fixtureAction, fixtureCombatant, fixtureState, fixtureWeapon } from '../../test/fixtures';
import type { LogEvent } from '../log';

const sword = fixtureWeapon({ id: 'w', name: 'Sword', range: 0 });
const riderCombatant = (id: string, side: 'pc' | 'monster', overrides = {}) => fixtureCombatant(id, side, {
  maxHp: 100,
  ac: 1,
  abilityScores: { str: 16, dex: 16, con: 10, int: 10, wis: 10, cha: 10 },
  speed: 30,
  ...overrides,
});

describe('Sneak Attack rider', () => {
  it('does not fire without advantage or an adjacent ally', () => {
    const action = fixtureAction({
      id: 'sneak',
      name: 'Sneak Shortsword',
      weaponId: 'w',
      attackCount: 2,
      riders: [{ label: 'Sneak Attack', bonusDice: '2d6', trigger: 'advantageOrAllyAdjacent', oncePerTurn: true }],
      damage: undefined,
      damageType: undefined,
    });
    const state = fixtureState([riderCombatant('rogue', 'pc', { position: 0 }), riderCombatant('foe', 'monster', { position: 0 })], [action], { weapons: [sword] });
    const events: LogEvent[] = [];

    performAction(state, new RNG(3), state.combatants[0], action, [state.combatants[1]], events);

    expect(events.filter((e) => e.message.includes('Sneak Attack'))).toHaveLength(0);
  });

  it('fires exactly once when an ally is adjacent to the target', () => {
    const action = fixtureAction({
      id: 'sneak',
      name: 'Sneak Shortsword',
      weaponId: 'w',
      attackCount: 3,
      riders: [{ label: 'Sneak Attack', bonusDice: '2d6', trigger: 'advantageOrAllyAdjacent', oncePerTurn: true }],
      damage: undefined,
      damageType: undefined,
    });
    const state = fixtureState([
      riderCombatant('rogue', 'pc', { position: 0 }),
      riderCombatant('ally', 'pc', { position: 0 }),
      riderCombatant('foe', 'monster', { position: 0 }),
    ], [action], { weapons: [sword] });
    const events: LogEvent[] = [];

    performAction(state, new RNG(3), state.combatants[0], action, [state.combatants[2]], events);

    expect(events.filter((e) => e.message.includes('Sneak Attack'))).toHaveLength(1);
  });
});

describe('Rage rider + physical resistance', () => {
  it('adds melee damage while raging', () => {
    const action = fixtureAction({
      id: 'rageatk',
      name: 'Raging Sword',
      weaponId: 'w',
      riders: [{ label: 'Rage', bonusFlat: 2, trigger: 'selfHasCondition', condition: 'raging', meleeOnly: true }],
      damage: undefined,
      damageType: undefined,
    });
    const state = fixtureState([riderCombatant('barb', 'pc', { position: 0 }), riderCombatant('foe', 'monster', { position: 0 })], [action], { weapons: [sword] });
    state.combatants[0].conditions.push({ kind: 'raging', duration: { type: 'rounds', rounds: 10 } });
    const events: LogEvent[] = [];

    performAction(state, new RNG(4), state.combatants[0], action, [state.combatants[1]], events);

    expect(events.some((e) => e.message.includes('Rage'))).toBe(true);
  });

  it('halves physical damage taken while raging', () => {
    const flat = fixtureAction({ id: 'big', name: 'Big Hit', attackBonus: 20, damage: '20', damageType: 'slashing' });
    const state = fixtureState([riderCombatant('atk', 'monster', { position: 0 }), riderCombatant('barb', 'pc', { position: 0 })], [flat]);
    state.combatants[1].conditions.push({ kind: 'raging', duration: { type: 'rounds', rounds: 10 } });

    performAction(state, new RNG(1), state.combatants[0], flat, [state.combatants[1]], []);

    expect(state.combatants[1].hp).toBe(90);
  });
});

describe('rider dice on a melee auto-crit', () => {
  // A melee hit against a paralyzed target is an auto-crit; rider dice should double just
  // like the weapon dice do. We compare against a restrained target (advantage-against but
  // no auto-crit) so both runs draw the same two d20s and start the rider from the same RNG
  // position — the only difference is the auto-crit doubling.
  const flatAtkWithRider = () => fixtureAction({
    id: 'crit-rider',
    name: 'Rider Strike',
    attackBonus: 20,
    damage: '5',
    damageType: 'slashing',
    riders: [{ label: 'Big Rider', bonusDice: '4d6', trigger: 'always' }],
  });

  const run = (targetCondition: 'restrained' | 'paralyzed') => {
    const action = flatAtkWithRider();
    const state = fixtureState(
      [riderCombatant('atk', 'pc', { position: 0 }), riderCombatant('foe', 'monster', { position: 0, maxHp: 500 })],
      [action],
    );
    state.combatants[1].conditions.push({ kind: targetCondition, duration: { type: 'rounds', rounds: 10 } });
    performAction(state, new RNG(9), state.combatants[0], action, [state.combatants[1]], []);
    return state.combatants[1].hp;
  };

  it('doubles rider bonus dice against a paralyzed (auto-crit) target', () => {
    const restrainedHp = run('restrained'); // single rider dice
    const paralyzedHp = run('paralyzed'); // auto-crit → doubled rider dice
    // Auto-crit doubles the rider's 4d6, so the paralyzed target takes strictly more damage
    // (weapon flat 5 is identical in both; only the rider differs).
    expect(paralyzedHp).toBeLessThan(restrainedHp);
  });
});

describe("Hunter's Mark rider", () => {
  it('adds bonus dice only against a marked target', () => {
    const action = fixtureAction({
      id: 'mark-atk',
      name: 'Marked Strike',
      weaponId: 'w',
      riders: [{ label: "Hunter's Mark", bonusDice: '1d6', trigger: 'targetHasCondition', condition: 'marked' }],
      damage: undefined,
      damageType: undefined,
    });
    const state = fixtureState([riderCombatant('ranger', 'pc', { position: 0 }), riderCombatant('marked', 'monster', { position: 0 })], [action], { weapons: [sword] });
    state.combatants[1].conditions.push({ kind: 'marked', duration: { type: 'concentration', sourceId: 'ranger' } });
    const events: LogEvent[] = [];

    performAction(state, new RNG(6), state.combatants[0], action, [state.combatants[1]], events);

    expect(events.some((e) => e.message.includes("Hunter's Mark"))).toBe(true);
  });
});
