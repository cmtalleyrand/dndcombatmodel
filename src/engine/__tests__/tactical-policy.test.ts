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

const sharpshooter: Feature = {
  id: 'sharpshooter',
  name: 'Sharpshooter',
  timing: 'beforeAttackRoll',
  attackModifier: { toHit: -5, damage: 10 },
};

const precision: Feature = {
  id: 'precision',
  name: 'Precision Attack',
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

  it('selects a Sharpshooter-like modifier only when the hit threshold allows it', () => {
    const archer = fixtureCombatant('archer', 'pc', {
      abilityScores: { str: 10, dex: 18, con: 10, int: 10, wis: 10, cha: 10 },
      proficiencyBonus: 3,
      features: [sharpshooter],
    });
    const lowAc = fixtureCombatant('low', 'monster', { ac: 10, position: 30 });
    const highAc = fixtureCombatant('high', 'monster', { ac: 20, position: 30 });

    const lowState = fixtureState([archer, lowAc], [bowShot], { weapons: [bow] });
    const highState = fixtureState([archer, highAc], [bowShot], { weapons: [bow] });

    performAction(lowState, new RNG(58), lowState.combatants[0], bowShot, [lowState.combatants[1]], [], { baseAction: bowShot, targets: ['low'], modifierPolicy: { kind: 'minimumHitChance', minimumHitChance: 0.35 } });
    const highEvents: LogEvent[] = [];
    performAction(highState, new RNG(58), highState.combatants[0], bowShot, [highState.combatants[1]], highEvents, { baseAction: bowShot, targets: ['high'], modifierPolicy: { kind: 'minimumHitChance', minimumHitChance: 0.35 } });

    expect(highEvents.some((e) => e.message.includes('rolls 17 vs AC 20'))).toBe(true);
  });

  it('spends reactive accuracy only when it can convert a miss into a hit', () => {
    const archer = fixtureCombatant('archer', 'pc', { features: [precision] });
    const state = fixtureState([archer, fixtureCombatant('near', 'monster', { ac: 20 }), fixtureCombatant('far', 'monster', { ac: 30 })], [fixtureAction({ attackBonus: 6 })]);
    const events: LogEvent[] = [];

    performAction(state, new RNG(58), state.combatants[0], state.actionsById.strike, [state.combatants[1]], events);
    expect(state.combatants[0].resources.superiorityDice).toBe(0);

    const second = fixtureState([archer, fixtureCombatant('far', 'monster', { ac: 30 })], [fixtureAction({ attackBonus: 6 })]);
    performAction(second, new RNG(58), second.combatants[0], second.actionsById.strike, [second.combatants[1]], []);
    expect(second.combatants[0].resources.superiorityDice).toBe(1);
  });

  it('Action Surge produces a second base action whose attacks receive independent modifiers', () => {
    const actionSurge: Feature = { id: 'action-surge', name: 'Action Surge', timing: 'actionEconomy', resource: { id: 'actionSurge', max: 1 }, spend: { resourceId: 'actionSurge', amount: 1, trigger: 'always' }, extraAction: { count: 1 } };
    const attack = fixtureAction({ id: 'volley', name: 'Volley', attackBonus: 20, attackCount: 2, damage: '1', damageType: 'piercing' });
    const fighter = scriptedCombatant('fighter', 'pc', attack.id, { features: [actionSurge, sharpshooter], tacticalPolicy: { modifierPolicy: { kind: 'minimumHitChance', minimumHitChance: 0.5 } } });
    const target = scriptedCombatant('target', 'monster', attack.id, { ac: 10, maxHp: 1000 });
    const result = runSimulation(fixtureScenario({ combatants: [fighter, target], actions: [attack], fixedOrder: ['fighter', 'target'], maxRounds: 1 }), 1, true);

    const resolutions = result.events.filter((e) => e.actorId === 'fighter' && e.actionId === 'volley' && (e.message.includes('hits target') || e.message.includes('miss')));
    expect(resolutions).toHaveLength(4);
    const hits = resolutions.filter((e) => e.message.includes('hits target'));
    expect(hits.every((e) => (e.damage ?? 0) >= 11)).toBe(true);
  });
});
