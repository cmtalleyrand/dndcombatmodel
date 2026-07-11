import { describe, expect, it } from 'vitest';
import { performAction, performTacticalDecision } from '../actions';
import { RNG } from '../dice';
import { chooseTacticalDecision } from '../rules';
import { runSimulation } from '../simulator';
import { fixtureAction, fixtureCombatant, fixtureScenario, fixtureState, fixtureWeapon, scriptedCombatant } from '../../test/fixtures';
import type { Feature } from '../types';
import type { LogEvent } from '../log';

const bow = fixtureWeapon({ id: 'bow', name: 'Bow', damage: '1d8', damageType: 'piercing', properties: ['ranged'], category: 'martial', range: 60, longRange: 240 });
const bowShot = fixtureAction({ id: 'bow-shot', name: 'Bow Shot', weaponId: 'bow', damage: undefined, damageType: undefined });

const accuracyForDamage: Feature = {
  id: 'accuracy-for-damage',
  name: 'Accuracy For Damage',
  timing: 'beforeAttackRoll',
  attackModifier: { toHit: -5, damage: 10 },
};

const reactiveAccuracy: Feature = {
  id: 'reactive-accuracy',
  name: 'Reactive Accuracy Boost',
  timing: 'afterAttackRollBeforeHitResolution',
  resource: { id: 'superiorityDice', max: 1 },
  spend: { resourceId: 'superiorityDice', amount: 1, trigger: 'missWithin', missThreshold: 4 },
  attackModifier: { toHit: 4 },
};

describe('tactical policy decisions', () => {
  it('retreats to maintain preferred range when a nearby enemy closes', () => {
    const archer = scriptedCombatant('archer', 'pc', bowShot.id, {
      position: 30,
      speed: 45,
      tacticalPolicy: { movementPolicy: { kind: 'maintainRange', preferredRange: 60 } },
    });
    const brute = scriptedCombatant('brute', 'monster', bowShot.id, { position: 10 });
    const state = fixtureState([archer, brute], [bowShot], { weapons: [bow] });
    const decision = chooseTacticalDecision(state, state.combatants[0]);
    const events: LogEvent[] = [];

    performTacticalDecision(state, new RNG(1), state.combatants[0], decision!, events);

    expect(state.combatants[0].position).toBe(70);
    expect(events.some((e) => e.type === 'move' && e.message.includes('retreats 40ft'))).toBe(true);
  });

  it('applies the accuracy-for-damage modifier only when the hit-chance policy allows it', () => {
    const archer = fixtureCombatant('archer', 'pc', {
      abilityScores: { str: 10, dex: 18, con: 10, int: 10, wis: 10, cha: 10 },
      proficiencyBonus: 3,
      features: [accuracyForDamage],
    });
    const lowAc = fixtureCombatant('low', 'monster', { ac: 10, position: 30 });
    const highAc = fixtureCombatant('high', 'monster', { ac: 20, position: 30 });

    const lowState = fixtureState([archer, lowAc], [bowShot], { weapons: [bow] });
    const highState = fixtureState([archer, highAc], [bowShot], { weapons: [bow] });

    const lowEvents: LogEvent[] = [];
    const highEvents: LogEvent[] = [];
    performAction(lowState, new RNG(58), lowState.combatants[0], bowShot, [lowState.combatants[1]], lowEvents, { baseAction: bowShot, targets: ['low'], modifierPolicy: { kind: 'minimumHitChance', minimumHitChance: 0.35 } });
    performAction(highState, new RNG(58), highState.combatants[0], bowShot, [highState.combatants[1]], highEvents, { baseAction: bowShot, targets: ['high'], modifierPolicy: { kind: 'minimumHitChance', minimumHitChance: 0.35 } });

    const lowHit = lowEvents.find((e) => e.type === 'attack' && e.actionId === bowShot.id && e.damage !== undefined);
    const highHit = highEvents.find((e) => e.type === 'attack' && e.actionId === bowShot.id && e.damage !== undefined);

    // Against the low-AC target the -5/+10 trade still clears the hit-chance floor, so a
    // resolved hit includes the +10 flat bonus (beyond the 1d8 weapon's own max of 8).
    expect(lowHit?.damage).toBeGreaterThan(8);
    // Against the high-AC target the trade would drop hit chance below the policy floor,
    // so it's skipped — any resolved hit stays within plain weapon damage.
    expect(highHit === undefined || highHit.damage! <= 8).toBe(true);
  });

  it('spends reactive accuracy only when it can convert a miss into a hit', () => {
    const archer = fixtureCombatant('archer', 'pc', { features: [reactiveAccuracy] });
    const state = fixtureState([archer, fixtureCombatant('near', 'monster', { ac: 20 }), fixtureCombatant('far', 'monster', { ac: 30 })], [fixtureAction({ attackBonus: 6 })]);

    performAction(state, new RNG(58), state.combatants[0], state.actionsById.strike, [state.combatants[1]], []);
    expect(state.combatants[0].resources.superiorityDice).toBe(0);

    const second = fixtureState([archer, fixtureCombatant('far', 'monster', { ac: 30 })], [fixtureAction({ attackBonus: 6 })]);
    performAction(second, new RNG(58), second.combatants[0], second.actionsById.strike, [second.combatants[1]], []);
    expect(second.combatants[0].resources.superiorityDice).toBe(1);
  });

  it('an actionEconomy feature produces a second base action whose attacks receive independent modifiers', () => {
    const extraAction: Feature = { id: 'extra-action', name: 'Extra Action', timing: 'actionEconomy', resource: { id: 'extraActionUses', max: 1 }, spend: { resourceId: 'extraActionUses', amount: 1, trigger: 'always' }, extraAction: { count: 1 } };
    const attack = fixtureAction({ id: 'volley', name: 'Volley', attackBonus: 20, attackCount: 2, damage: '1', damageType: 'piercing' });
    const fighter = scriptedCombatant('fighter', 'pc', attack.id, { features: [extraAction, accuracyForDamage], tacticalPolicy: { modifierPolicy: { kind: 'minimumHitChance', minimumHitChance: 0.5 } } });
    const target = scriptedCombatant('target', 'monster', attack.id, { ac: 10, maxHp: 1000 });
    const result = runSimulation(fixtureScenario({ combatants: [fighter, target], actions: [attack], fixedOrder: ['fighter', 'target'], maxRounds: 1 }), 1, true);

    const resolutions = result.events.filter((e) => e.actorId === 'fighter' && e.actionId === 'volley' && e.type === 'attack');
    expect(resolutions).toHaveLength(4); // 2 base attacks + 2 from the extra action
    const hits = resolutions.filter((e) => e.damage !== undefined);
    expect(hits.every((e) => e.damage! >= 11)).toBe(true); // each hit carries the +10 damage modifier
  });
});
