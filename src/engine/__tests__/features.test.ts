import { describe, expect, it } from 'vitest';
import { performAction } from '../actions';
import { runSimulation } from '../simulator';
import { RNG } from '../dice';
import { fixtureAction, fixtureCombatant, fixtureScenario, fixtureState, fixtureWeapon, scriptedCombatant } from '../../test/fixtures';
import type { LogEvent } from '../log';
import type { Feature } from '../types';

const longbow = fixtureWeapon({
  id: 'longbow',
  name: 'Longbow',
  damage: '1d8',
  damageType: 'piercing',
  properties: ['ranged', 'heavy'],
  category: 'martial',
  range: 150,
  longRange: 600,
});

function archer(features: Feature[]) {
  return fixtureCombatant('archer', 'pc', {
    maxHp: 100,
    ac: 16,
    abilityScores: { str: 10, dex: 18, con: 10, int: 10, wis: 10, cha: 10 },
    proficiencyBonus: 3,
    position: 0,
    features,
  });
}

function ogre(ac = 15) {
  return fixtureCombatant('ogre', 'monster', { maxHp: 100, ac, position: 30 });
}

const longbowAttack = fixtureAction({
  id: 'longbow-attack',
  name: 'Longbow',
  weaponId: 'longbow',
  damage: undefined,
  damageType: undefined,
});

describe('composable attack features', () => {
  it('applies Sharpshooter to the same base longbow attack', () => {
    const sharpshooter: Feature = {
      id: 'sharpshooter',
      name: 'Sharpshooter',
      timing: 'beforeAttackRoll',
      attackModifier: { toHit: -5, damage: 10 },
    };
    const state = fixtureState([archer([sharpshooter]), ogre(12)], [longbowAttack], { weapons: [longbow] });
    const events: LogEvent[] = [];

    performAction(state, new RNG(58), state.combatants[0], longbowAttack, [state.combatants[1]], events);

    const hit = events.find((e) => e.message.includes('hits ogre with Longbow'));
    expect(hit?.actionId).toBe('longbow-attack');
    expect(hit?.message).toContain('rolls 12 vs AC 12');
    expect(hit?.damage).toBeGreaterThanOrEqual(15);
  });

  it('spends Precision Attack after a miss within the configured threshold', () => {
    const precision: Feature = {
      id: 'precision',
      name: 'Precision Attack',
      timing: 'afterAttackRollBeforeHitResolution',
      resource: { id: 'superiorityDice', max: 1 },
      spend: { resourceId: 'superiorityDice', amount: 1, trigger: 'missWithin', missThreshold: 4 },
      attackModifier: { toHit: 4 },
    };
    const state = fixtureState([archer([precision]), ogre(20)], [longbowAttack], { weapons: [longbow] });
    const events: LogEvent[] = [];

    performAction(state, new RNG(58), state.combatants[0], longbowAttack, [state.combatants[1]], events);

    expect(state.combatants[0].resources.superiorityDice).toBe(0);
    expect(events.some((e) => e.message.includes('Precision Attack: +4 to hit'))).toBe(true);
    expect(events.some((e) => e.message.includes('hits ogre with Longbow'))).toBe(true);
  });

  it("applies Frost's Chill and Precision Attack to the same qualifying attack", () => {
    const precision: Feature = {
      id: 'precision',
      name: 'Precision Attack',
      timing: 'afterAttackRollBeforeHitResolution',
      resource: { id: 'superiorityDice', max: 1 },
      spend: { resourceId: 'superiorityDice', amount: 1, trigger: 'missWithin', missThreshold: 4 },
      attackModifier: { toHit: 4 },
    };
    const frost: Feature = {
      id: 'frost',
      name: "Frost's Chill",
      timing: 'onHit',
      resource: { id: 'frostsChillUses', max: 1 },
      spend: { resourceId: 'frostsChillUses', amount: 1, trigger: 'onHit' },
      extraDamage: [{ dice: '1d6', type: 'cold', label: 'cold' }],
    };
    const state = fixtureState([archer([precision, frost]), ogre(20)], [longbowAttack], { weapons: [longbow] });
    const events: LogEvent[] = [];

    performAction(state, new RNG(58), state.combatants[0], longbowAttack, [state.combatants[1]], events);

    expect(state.combatants[0].resources.superiorityDice).toBe(0);
    expect(state.combatants[0].resources.frostsChillUses).toBe(0);
    expect(events.some((e) => e.message.includes('Precision Attack'))).toBe(true);
    expect(events.some((e) => e.message.includes("Frost's Chill"))).toBe(true);
  });

  it('uses Action Surge to take an extra base action without a pseudo-action attack', () => {
    const actionSurge: Feature = {
      id: 'action-surge',
      name: 'Action Surge',
      timing: 'actionEconomy',
      resource: { id: 'actionSurge', max: 1 },
      spend: { resourceId: 'actionSurge', amount: 1, trigger: 'always' },
      extraAction: { count: 1, cost: 'action' },
    };
    const attack = fixtureAction({ id: 'longbow-attack', name: 'Longbow', attackBonus: 20, damage: '1', damageType: 'piercing' });
    const pc = scriptedCombatant('fighter', 'pc', attack.id, { features: [actionSurge], maxHp: 100 });
    const monster = scriptedCombatant('target', 'monster', attack.id, { maxHp: 100, ac: 30 });
    const scenario = fixtureScenario({ combatants: [pc, monster], actions: [attack], fixedOrder: ['fighter', 'target'], maxRounds: 1 });

    const result = runSimulation(scenario, 1, true);

    const fighterAttacks = result.events.filter((e) => e.actorId === 'fighter' && e.actionId === 'longbow-attack' && e.message.includes('Longbow'));
    expect(fighterAttacks).toHaveLength(2);
    expect(fighterAttacks.every((e) => e.actionId === 'longbow-attack')).toBe(true);
  });
  it('applies precombat and start-of-turn feature effects', () => {
    const precombatBless: Feature = {
      id: 'opening-bless',
      name: 'Opening Bless',
      timing: 'precombat',
      applyConditions: [{ kind: 'blessed', duration: { type: 'permanent' } }],
    };
    const startOfTurnRage: Feature = {
      id: 'battle-focus',
      name: 'Battle Focus',
      timing: 'startOfTurn',
      applyConditions: [{ kind: 'raging', duration: { type: 'permanent' } }],
    };
    const wait = fixtureAction({ id: 'wait', name: 'Wait', kind: 'ability', targets: 0, damage: undefined });
    const pc = scriptedCombatant('fighter', 'pc', wait.id, { features: [precombatBless, startOfTurnRage], maxHp: 100 });
    const monster = scriptedCombatant('target', 'monster', wait.id, { maxHp: 100 });
    const scenario = fixtureScenario({ combatants: [pc, monster], actions: [wait], fixedOrder: ['fighter', 'target'], maxRounds: 1 });

    const result = runSimulation(scenario, 1, true);

    expect(result.frames[0].events.some((event) => event.message.includes('fighter is now Blessed'))).toBe(true);
    expect(result.events.some((event) => event.message.includes('fighter is now Raging'))).toBe(true);
  });

  it('gates feature damage with the rider trigger vocabulary', () => {
    const markedShot: Feature = {
      id: 'marked-shot',
      name: 'Marked Shot',
      timing: 'onHit',
      condition: { trigger: 'targetHasCondition', condition: 'marked' },
      extraDamage: [{ flat: 5, type: 'force', label: 'mark' }],
    };
    const state = fixtureState([archer([markedShot]), ogre(12)], [longbowAttack], { weapons: [longbow] });
    state.combatants[1].conditions.push({ kind: 'marked', duration: { type: 'permanent' } });
    const events: LogEvent[] = [];

    performAction(state, new RNG(58), state.combatants[0], longbowAttack, [state.combatants[1]], events);

    expect(events.some((event) => event.message.includes('Marked Shot: +5 force damage'))).toBe(true);
  });

});
