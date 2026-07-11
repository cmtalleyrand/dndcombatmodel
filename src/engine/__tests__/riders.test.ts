import { describe, expect, it } from 'vitest';
import { performAction } from '../actions';
import { RNG } from '../dice';
import { fixtureAction, fixtureCombatant, fixtureState, fixtureWeapon } from '../../test/fixtures';

const sword = fixtureWeapon({ id: 'w', name: 'Sword', range: 0 });
const riderCombatant = (id: string, side: 'pc' | 'monster', overrides = {}) => fixtureCombatant(id, side, {
  maxHp: 100,
  ac: 1,
  abilityScores: { str: 16, dex: 16, con: 10, int: 10, wis: 10, cha: 10 },
  speed: 30,
  ...overrides,
});

describe('advantageOrAllyAdjacent rider trigger', () => {
  const action = fixtureAction({
    id: 'rider-atk',
    name: 'Rider Strike',
    weaponId: 'w',
    attackCount: 3,
    riders: [{ label: 'Bonus Rider', bonusDice: '2d6', trigger: 'advantageOrAllyAdjacent', oncePerTurn: true }],
    damage: undefined,
    damageType: undefined,
  });

  const runWithoutAlly = () => {
    const state = fixtureState([riderCombatant('atk', 'pc', { position: 0 }), riderCombatant('foe', 'monster', { position: 0 })], [action], { weapons: [sword] });
    performAction(state, new RNG(3), state.combatants[0], action, [state.combatants[1]], []);
    return state.combatants[1].hp;
  };

  const runWithAdjacentAlly = () => {
    const state = fixtureState([
      riderCombatant('atk', 'pc', { position: 0 }),
      riderCombatant('ally', 'pc', { position: 0 }),
      riderCombatant('foe', 'monster', { position: 0 }),
    ], [action], { weapons: [sword] });
    performAction(state, new RNG(3), state.combatants[0], action, [state.combatants[2]], []);
    return state.combatants[2].hp;
  };

  it('adds rider damage only when an ally is adjacent to the target', () => {
    // Same seed in both runs, so base sword damage is identical; the only possible
    // difference is the rider's 2d6 (2-12), which must apply once with an ally present
    // and never apply without one.
    expect(runWithAdjacentAlly()).toBeLessThan(runWithoutAlly());
  });
});

describe('selfHasCondition rider trigger (melee-only flat bonus)', () => {
  const action = fixtureAction({
    id: 'flat-rider-atk',
    name: 'Buffed Strike',
    weaponId: 'w',
    riders: [{ label: 'Bonus Rider', bonusFlat: 2, trigger: 'selfHasCondition', condition: 'raging', meleeOnly: true }],
    damage: undefined,
    damageType: undefined,
  });

  it('adds the flat bonus only while the triggering condition is active', () => {
    const withCondition = fixtureState([riderCombatant('atk', 'pc', { position: 0 }), riderCombatant('foe', 'monster', { position: 0 })], [action], { weapons: [sword] });
    withCondition.combatants[0].conditions.push({ kind: 'raging', duration: { type: 'rounds', rounds: 10 } });
    performAction(withCondition, new RNG(4), withCondition.combatants[0], action, [withCondition.combatants[1]], []);

    const withoutCondition = fixtureState([riderCombatant('atk', 'pc', { position: 0 }), riderCombatant('foe', 'monster', { position: 0 })], [action], { weapons: [sword] });
    performAction(withoutCondition, new RNG(4), withoutCondition.combatants[0], action, [withoutCondition.combatants[1]], []);

    // Same seed for both runs isolates the rider's flat +2 as the only difference.
    expect(withCondition.combatants[1].hp).toBe(withoutCondition.combatants[1].hp - 2);
  });

  it('halves physical damage taken while the same condition grants resistance', () => {
    const flat = fixtureAction({ id: 'big', name: 'Big Hit', attackBonus: 20, damage: '20', damageType: 'slashing' });
    const state = fixtureState([riderCombatant('atk', 'monster', { position: 0 }), riderCombatant('defender', 'pc', { position: 0 })], [flat]);
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
    riders: [{ label: 'Bonus Rider', bonusDice: '4d6', trigger: 'always' }],
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

describe('targetHasCondition rider trigger', () => {
  it('adds bonus dice only against a target carrying the triggering condition', () => {
    const action = fixtureAction({
      id: 'mark-atk',
      name: 'Conditional Strike',
      weaponId: 'w',
      riders: [{ label: 'Bonus Rider', bonusDice: '1d6', trigger: 'targetHasCondition', condition: 'marked' }],
      damage: undefined,
      damageType: undefined,
    });

    const withCondition = fixtureState([riderCombatant('atk', 'pc', { position: 0 }), riderCombatant('foe', 'monster', { position: 0 })], [action], { weapons: [sword] });
    withCondition.combatants[1].conditions.push({ kind: 'marked', duration: { type: 'concentration', sourceId: 'atk' } });
    performAction(withCondition, new RNG(6), withCondition.combatants[0], action, [withCondition.combatants[1]], []);

    const withoutCondition = fixtureState([riderCombatant('atk', 'pc', { position: 0 }), riderCombatant('foe', 'monster', { position: 0 })], [action], { weapons: [sword] });
    performAction(withoutCondition, new RNG(6), withoutCondition.combatants[0], action, [withoutCondition.combatants[1]], []);

    // Same seed for both runs isolates the rider's 1d6 (1-6) as the only difference.
    expect(withCondition.combatants[1].hp).toBeLessThan(withoutCondition.combatants[1].hp);
  });
});
