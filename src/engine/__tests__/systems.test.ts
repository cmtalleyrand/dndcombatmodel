import { describe, expect, it } from 'vitest';
import { performAction } from '../actions';
import { chooseAction } from '../rules';
import { resolveAttackProfile, cantripTier } from '../derive';
import { runSimulation } from '../simulator';
import { RNG } from '../dice';
import { fixtureAction, fixtureCombatant, fixtureState } from '../../test/fixtures';
import type { Combatant, Action } from '../types';
import type { LogEvent } from '../log';

const alwaysHit = (over: Partial<Action> = {}): Action =>
  fixtureAction({ id: 'hit', name: 'Hit', attackBonus: 50, damage: '10', damageType: 'fire', ...over });

function twoOnAxis(target: Partial<Combatant> = {}) {
  return [
    fixtureCombatant('att', 'pc', { position: 0 }),
    fixtureCombatant('def', 'monster', { position: 0, ac: 1, maxHp: 100, ...target }),
  ];
}

describe('resistance / immunity / vulnerability', () => {
  it('resistance halves typed damage', () => {
    const state = fixtureState(twoOnAxis({ resistances: ['fire'] }), [alwaysHit()]);
    performAction(state, new RNG(1), state.combatants[0], alwaysHit(), [state.combatants[1]], []);
    expect(state.combatants[1].hp).toBe(95); // 10 -> 5
  });

  it('immunity negates typed damage', () => {
    const state = fixtureState(twoOnAxis({ immunities: ['fire'] }), [alwaysHit()]);
    performAction(state, new RNG(1), state.combatants[0], alwaysHit(), [state.combatants[1]], []);
    expect(state.combatants[1].hp).toBe(100);
  });

  it('vulnerability doubles typed damage', () => {
    const state = fixtureState(twoOnAxis({ vulnerabilities: ['fire'] }), [alwaysHit()]);
    performAction(state, new RNG(1), state.combatants[0], alwaysHit(), [state.combatants[1]], []);
    expect(state.combatants[1].hp).toBe(80); // 10 -> 20
  });

  it('resistance and vulnerability cancel', () => {
    const state = fixtureState(twoOnAxis({ resistances: ['fire'], vulnerabilities: ['fire'] }), [alwaysHit()]);
    performAction(state, new RNG(1), state.combatants[0], alwaysHit(), [state.combatants[1]], []);
    expect(state.combatants[1].hp).toBe(90); // unchanged
  });

  it('condition immunity blocks an applied condition', () => {
    const poisonStrike = alwaysHit({
      applyConditions: [{ kind: 'poisoned', duration: { type: 'rounds', rounds: 3 } }],
    });
    const state = fixtureState(twoOnAxis({ conditionImmunities: ['poisoned'] }), [poisonStrike]);
    const events: LogEvent[] = [];
    performAction(state, new RNG(1), state.combatants[0], poisonStrike, [state.combatants[1]], events);
    expect(state.combatants[1].conditions.some((c) => c.kind === 'poisoned')).toBe(false);
    expect(events.some((e) => e.message.includes('immune to'))).toBe(true);
  });
});

describe('temporary HP', () => {
  it('absorbs damage before real HP and does not stack', () => {
    const grant = fixtureAction({ id: 'thp', name: 'Aid', kind: 'spell', tempHp: '8', damage: undefined, damageType: undefined });
    const state = fixtureState(
      [fixtureCombatant('cle', 'pc', { position: 0 }), fixtureCombatant('foe', 'monster', { position: 0, ac: 1, maxHp: 100 })],
      [grant, alwaysHit()],
    );
    const ally = state.combatants[0];
    performAction(state, new RNG(1), ally, grant, [ally], []);
    expect(ally.tempHp).toBe(8);
    // 10 damage: 8 soaked, 2 to HP
    performAction(state, new RNG(1), state.combatants[1], alwaysHit(), [ally], []);
    expect(ally.tempHp).toBe(0);
    expect(ally.hp).toBe(ally.base.maxHp - 2);
  });
});

describe('cantrip scaling', () => {
  it('scales dice count by tier at levels 5/11/17', () => {
    expect(cantripTier(1)).toBe(1);
    expect(cantripTier(5)).toBe(2);
    expect(cantripTier(11)).toBe(3);
    expect(cantripTier(17)).toBe(4);
  });

  it('a scaling cantrip rolls more dice at higher level', () => {
    const firebolt: Action = { id: 'fb', name: 'Fire Bolt', kind: 'spell', targets: 1, damage: '1d10', damageType: 'fire', cantripScaling: true };
    const l1 = resolveAttackProfile(fixtureCombatant('a', 'pc', { level: 1 }), firebolt, undefined);
    const l11 = resolveAttackProfile(fixtureCombatant('a', 'pc', { level: 11 }), firebolt, undefined);
    expect(l1.damageDice).toEqual(['1d10']);
    expect(l11.damageDice).toEqual(['3d10']);
  });
});

describe('bonus-action economy', () => {
  it('the action pass ignores bonus-cost actions and the bonus pass finds them', () => {
    const swing = fixtureAction({ id: 'sw', name: 'Swing' });
    const word = fixtureAction({ id: 'hw', name: 'Healing Word', kind: 'spell', actionCost: 'bonus', heal: '1d4', damage: undefined, damageType: undefined });
    const actor = fixtureCombatant('cle', 'pc', {
      actionIds: ['sw', 'hw'],
      script: [
        { priority: 1, condition: { type: 'always' }, actionId: 'hw', target: { strategy: 'self' } },
        { priority: 2, condition: { type: 'always' }, actionId: 'sw', target: { strategy: 'lowestHpEnemy' } },
      ],
    });
    const state = fixtureState([actor, fixtureCombatant('foe', 'monster')], [swing, word]);
    const mainChoice = chooseAction(state, state.combatants[0]);
    const bonusChoice = chooseAction(state, state.combatants[0], 'bonus');
    expect(mainChoice?.action.id).toBe('sw'); // bonus healing word skipped in the action pass
    expect(bonusChoice?.action.id).toBe('hw');
  });
});

describe('death and dying', () => {
  it('a monster at 0 HP dies outright', () => {
    const hit = alwaysHit({ damage: '200' });
    const state = fixtureState(twoOnAxis({ maxHp: 20 }), [hit]);
    performAction(state, new RNG(1), state.combatants[0], hit, [state.combatants[1]], []);
    expect(state.combatants[1].dead).toBe(true);
  });

  it('a PC dropped to 0 falls unconscious but is not dead', () => {
    const hit = alwaysHit({ damage: '30' });
    const state = fixtureState(
      [fixtureCombatant('foe', 'monster', { position: 0 }), fixtureCombatant('hero', 'pc', { position: 0, ac: 1, maxHp: 20 })],
      [hit],
    );
    performAction(state, new RNG(1), state.combatants[0], hit, [state.combatants[1]], []);
    expect(state.combatants[1].down).toBe(true);
    expect(state.combatants[1].dead).toBe(false);
  });

  it('massive damage to a PC is instant death', () => {
    const hit = alwaysHit({ damage: '60' });
    const state = fixtureState(
      [fixtureCombatant('foe', 'monster', { position: 0 }), fixtureCombatant('hero', 'pc', { position: 0, ac: 1, maxHp: 20 })],
      [hit],
    );
    performAction(state, new RNG(1), state.combatants[0], hit, [state.combatants[1]], []);
    expect(state.combatants[1].dead).toBe(true); // overkill (40) >= maxHp (20)
  });

  it('a downed PC rolls death saves each turn and reaches a terminal state', () => {
    // A lone downed PC vs a monster: the PC keeps rolling death saves until it
    // dies or the monster is the only side standing.
    const swing = fixtureAction({ id: 'sw', name: 'Swing', attackBonus: 50, damage: '4', damageType: 'slashing' });
    const monster = fixtureCombatant('mon', 'monster', {
      position: 0, actionIds: ['sw'],
      script: [{ priority: 1, condition: { type: 'always' }, actionId: 'sw', target: { strategy: 'lowestHpEnemy' } }],
    });
    const hero = fixtureCombatant('hero', 'pc', { position: 0, maxHp: 8 });
    const scenario = {
      name: 'dying', combatants: [monster, hero], actions: [swing], weapons: [],
      targetLists: [], ruleLibrary: [], conditionLibrary: [],
      initiativeMode: 'fixed' as const, fixedOrder: ['mon', 'hero'], maxRounds: 30,
    };
    const result = runSimulation(scenario, 5);
    const heroOut = result.outcomes.find((o) => o.id === 'hero')!;
    expect(heroOut.survived).toBe(false);
    expect(result.winner).toBe('monster');
  });
});
