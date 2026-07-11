import { describe, expect, it } from 'vitest';
import { applyTimedFeatures, performAction } from '../actions';
import { runSimulation } from '../simulator';
import { RNG } from '../dice';
import { fixtureAction, fixtureCombatant, fixtureScenario, fixtureState, fixtureWeapon, scriptedCombatant } from '../../test/fixtures';
import { SRD_ACTIONS, SRD_FEATURES } from '../../data/srd';
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
  it('applies a beforeAttackRoll toHit/damage trade-off to the base attack', () => {
    const feature: Feature = {
      id: 'trade-accuracy',
      name: 'Trade Accuracy For Damage',
      timing: 'beforeAttackRoll',
      attackModifier: { toHit: -5, damage: 10 },
    };
    const state = fixtureState([archer([feature]), ogre(12)], [longbowAttack], { weapons: [longbow] });

    performAction(state, new RNG(58), state.combatants[0], longbowAttack, [state.combatants[1]], []);

    // Weapon alone deals at most 1d8 (8); the feature's +10 flat damage means a hit
    // must clear that ceiling by a wide margin.
    expect(state.combatants[1].hp).toBeLessThanOrEqual(100 - 15);
  });

  it('gates a beforeAttackRoll modifier behind a spendable resource that is consumed once', () => {
    const feature: Feature = {
      id: 'reactive-accuracy',
      name: 'Reactive Accuracy Boost',
      timing: 'afterAttackRollBeforeHitResolution',
      resource: { id: 'superiorityDice', max: 1 },
      spend: { resourceId: 'superiorityDice', amount: 1, trigger: 'missWithin', missThreshold: 4 },
      attackModifier: { toHit: 4 },
    };
    const state = fixtureState([archer([feature]), ogre(20)], [longbowAttack], { weapons: [longbow] });

    performAction(state, new RNG(58), state.combatants[0], longbowAttack, [state.combatants[1]], []);

    expect(state.combatants[0].resources.superiorityDice).toBe(0);
    expect(state.combatants[1].hp).toBeLessThan(100);
  });

  it('applies two independently-resourced onHit/beforeAttackRoll features to the same attack', () => {
    const reactiveAccuracy: Feature = {
      id: 'reactive-accuracy',
      name: 'Reactive Accuracy Boost',
      timing: 'afterAttackRollBeforeHitResolution',
      resource: { id: 'superiorityDice', max: 1 },
      spend: { resourceId: 'superiorityDice', amount: 1, trigger: 'missWithin', missThreshold: 4 },
      attackModifier: { toHit: 4 },
    };
    const onHitBonus: Feature = {
      id: 'on-hit-bonus',
      name: 'Bonus Elemental Damage',
      timing: 'onHit',
      resource: { id: 'onHitBonusUses', max: 1 },
      spend: { resourceId: 'onHitBonusUses', amount: 1, trigger: 'onHit' },
      extraDamage: [{ dice: '1d6', type: 'cold', label: 'cold' }],
    };
    const state = fixtureState([archer([reactiveAccuracy, onHitBonus]), ogre(20)], [longbowAttack], { weapons: [longbow] });

    performAction(state, new RNG(58), state.combatants[0], longbowAttack, [state.combatants[1]], []);

    // Both resources being drained to 0 proves both independent features fired on this attack.
    expect(state.combatants[0].resources.superiorityDice).toBe(0);
    expect(state.combatants[0].resources.onHitBonusUses).toBe(0);
  });

  it('applies attackModifier advantage and AC adjustments to turn a miss into a hit', () => {
    const feature: Feature = {
      id: 'tactical-opening',
      name: 'Tactical Opening',
      timing: 'beforeAttackRoll',
      attackModifier: { advantage: 'advantage', ac: -3 },
    };
    const withFeature = fixtureState([archer([feature]), ogre(18)], [longbowAttack], { weapons: [longbow] });
    performAction(withFeature, new RNG(8), withFeature.combatants[0], longbowAttack, [withFeature.combatants[1]], []);

    const withoutFeature = fixtureState([archer([]), ogre(18)], [longbowAttack], { weapons: [longbow] });
    performAction(withoutFeature, new RNG(8), withoutFeature.combatants[0], longbowAttack, [withoutFeature.combatants[1]], []);

    expect(withFeature.combatants[1].hp).toBeLessThan(withoutFeature.combatants[1].hp);
  });

  it('applies attackModifier save DC adjustments to save-based effects', () => {
    const feature: Feature = {
      id: 'heightened-effect',
      name: 'Heightened Effect',
      timing: 'beforeAttackRoll',
      attackModifier: { saveDc: 1 },
    };
    const thunder = fixtureAction({
      id: 'thunder',
      name: 'Thunder',
      kind: 'spell',
      targets: 1,
      damage: '4',
      damageType: 'thunder',
      save: { ability: 'con', dc: 13, onSuccess: 'none' },
    });
    const target = fixtureCombatant('target', 'monster', { maxHp: 20, abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });

    const withFeature = fixtureState([fixtureCombatant('caster', 'pc', { features: [feature], actionIds: [thunder.id] }), target], [thunder]);
    performAction(withFeature, new RNG(1), withFeature.combatants[0], thunder, [withFeature.combatants[1]], []);

    const withoutFeature = fixtureState([fixtureCombatant('caster', 'pc', { actionIds: [thunder.id] }), target], [thunder]);
    performAction(withoutFeature, new RNG(1), withoutFeature.combatants[0], thunder, [withoutFeature.combatants[1]], []);

    // Same seed and save roll in both; the +1 DC is the only thing that can tip a
    // borderline save from success (no damage) to failure (damage applied).
    expect(withFeature.combatants[1].hp).toBeLessThan(withoutFeature.combatants[1].hp);
  });

  it('uses an actionEconomy feature to grant an extra base action', () => {
    const feature: Feature = {
      id: 'extra-action',
      name: 'Extra Action',
      timing: 'actionEconomy',
      resource: { id: 'extraActionUses', max: 1 },
      spend: { resourceId: 'extraActionUses', amount: 1, trigger: 'always' },
      extraAction: { count: 1, cost: 'action' },
    };
    const attack = fixtureAction({ id: 'longbow-attack', name: 'Longbow', attackBonus: 20, damage: '1', damageType: 'piercing' });
    const pc = scriptedCombatant('fighter', 'pc', attack.id, { features: [feature], maxHp: 100 });
    const monster = scriptedCombatant('target', 'monster', attack.id, { maxHp: 100, ac: 30 });
    const scenario = fixtureScenario({ combatants: [pc, monster], actions: [attack], fixedOrder: ['fighter', 'target'], maxRounds: 1 });

    const result = runSimulation(scenario, 1, true);

    const fighterAttacks = result.events.filter((e) => e.actorId === 'fighter' && e.actionId === 'longbow-attack' && e.type === 'attack');
    expect(fighterAttacks).toHaveLength(2);
  });

  it('applies precombat and startOfTurn feature conditions directly to combatant state', () => {
    const precombatBuff: Feature = {
      id: 'opening-buff',
      name: 'Opening Buff',
      timing: 'precombat',
      applyConditions: [{ kind: 'blessed', duration: { type: 'permanent' } }],
    };
    const startOfTurnBuff: Feature = {
      id: 'turn-buff',
      name: 'Turn Buff',
      timing: 'startOfTurn',
      applyConditions: [{ kind: 'raging', duration: { type: 'permanent' } }],
    };
    const state = fixtureState([fixtureCombatant('fighter', 'pc', { features: [precombatBuff, startOfTurnBuff] }), fixtureCombatant('foe', 'monster')]);
    const fighter = state.combatants[0];

    applyTimedFeatures(state, new RNG(1), fighter, 'precombat', []);
    expect(fighter.conditions.some((c) => c.kind === 'blessed')).toBe(true);
    expect(fighter.conditions.some((c) => c.kind === 'raging')).toBe(false);

    applyTimedFeatures(state, new RNG(1), fighter, 'startOfTurn', []);
    expect(fighter.conditions.some((c) => c.kind === 'raging')).toBe(true);
  });

  it('gates onHit feature damage behind the rider trigger vocabulary', () => {
    const feature: Feature = {
      id: 'conditional-bonus',
      name: 'Conditional Bonus Damage',
      timing: 'onHit',
      condition: { trigger: 'targetHasCondition', condition: 'marked' },
      extraDamage: [{ flat: 5, type: 'force', label: 'bonus' }],
    };
    const marked = fixtureState([archer([feature]), ogre(12)], [longbowAttack], { weapons: [longbow] });
    marked.combatants[1].conditions.push({ kind: 'marked', duration: { type: 'permanent' } });
    performAction(marked, new RNG(58), marked.combatants[0], longbowAttack, [marked.combatants[1]], []);

    const unmarked = fixtureState([archer([feature]), ogre(12)], [longbowAttack], { weapons: [longbow] });
    performAction(unmarked, new RNG(58), unmarked.combatants[0], longbowAttack, [unmarked.combatants[1]], []);

    // Same seed and base attack in both; the flat +5 force damage only applies when
    // the rider-trigger condition ('marked') is present on the target.
    expect(marked.combatants[1].hp).toBeLessThan(unmarked.combatants[1].hp);
  });

  it("wires real SRD-authored features (Sneak Attack, Rage, Hunter's Mark) through the generic feature system", () => {
    const rogueShot = SRD_ACTIONS.find((action) => action.id === 'act-rogue-shortbow')!;
    const rageAttack = SRD_ACTIONS.find((action) => action.id === 'act-greataxe-rage')!;
    const markShot = SRD_ACTIONS.find((action) => action.id === 'act-longbow-hunters-mark')!;
    const weapons = [longbow, fixtureWeapon({ id: 'wpn-shortbow', name: 'Shortbow', damage: '1d6', damageType: 'piercing', properties: ['ranged'], range: 80 }), fixtureWeapon({ id: 'wpn-greataxe', name: 'Greataxe', damage: '1d12', damageType: 'slashing', properties: ['heavy', 'twoHanded'], range: 5 })];
    const dex20 = { str: 10, dex: 20, con: 10, int: 10, wis: 10, cha: 10 };

    const run = (featureIds: string[], attackerAbilities: typeof dex20, hasAlly: boolean, hasRaging: boolean, hasMarked: boolean) => {
      const state = fixtureState(
        [
          fixtureCombatant('attacker', 'pc', { actionIds: [rogueShot.id], featureIds, position: 0, abilityScores: attackerAbilities }),
          fixtureCombatant('target', 'monster', { maxHp: 200, ac: 1, position: 0 }),
          ...(hasAlly ? [fixtureCombatant('ally', 'pc', { position: 0 })] : []),
        ],
        [rogueShot],
        { weapons, features: SRD_FEATURES },
      );
      if (hasRaging) state.combatants[0].conditions.push({ kind: 'raging', duration: { type: 'permanent' } });
      if (hasMarked) state.combatants[1].conditions.push({ kind: 'marked', duration: { type: 'permanent' } });
      performAction(state, new RNG(1), state.combatants[0], rogueShot, [state.combatants[1]], []);
      return state.combatants[1].hp;
    };

    // Sneak Attack: fires only with an adjacent ally.
    expect(run(['feat-sneak-attack'], dex20, true, false, false)).toBeLessThan(run(['feat-sneak-attack'], dex20, false, false, false));

    const rageState = fixtureState(
      [fixtureCombatant('attacker', 'pc', { actionIds: [rageAttack.id], featureIds: ['feat-rage-damage'], position: 0, abilityScores: { str: 20, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }), fixtureCombatant('target', 'monster', { maxHp: 200, ac: 1, position: 0 })],
      [rageAttack],
      { weapons, features: SRD_FEATURES },
    );
    const noRageState = fixtureState(
      [fixtureCombatant('attacker', 'pc', { actionIds: [rageAttack.id], position: 0, abilityScores: { str: 20, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }), fixtureCombatant('target', 'monster', { maxHp: 200, ac: 1, position: 0 })],
      [rageAttack],
      { weapons },
    );
    rageState.combatants[0].conditions.push({ kind: 'raging', duration: { type: 'permanent' } });
    performAction(rageState, new RNG(1), rageState.combatants[0], rageAttack, [rageState.combatants[1]], []);
    performAction(noRageState, new RNG(1), noRageState.combatants[0], rageAttack, [noRageState.combatants[1]], []);
    // Rage: adds melee damage while the raging condition is active.
    expect(rageState.combatants[1].hp).toBeLessThan(noRageState.combatants[1].hp);

    // Hunter's Mark: adds bonus dice only against a marked target.
    const runMarkShot = (targetMarked: boolean) => {
      const state = fixtureState(
        [fixtureCombatant('attacker', 'pc', { actionIds: [markShot.id], featureIds: ['feat-hunters-mark'], position: 0, abilityScores: dex20 }), fixtureCombatant('target', 'monster', { maxHp: 200, ac: 1, position: 0 })],
        [markShot],
        { weapons, features: SRD_FEATURES },
      );
      if (targetMarked) state.combatants[1].conditions.push({ kind: 'marked', duration: { type: 'permanent' } });
      performAction(state, new RNG(1), state.combatants[0], markShot, [state.combatants[1]], []);
      return state.combatants[1].hp;
    };
    expect(runMarkShot(true)).toBeLessThan(runMarkShot(false));
  });
});
