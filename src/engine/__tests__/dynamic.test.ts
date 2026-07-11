import { describe, expect, it } from 'vitest';
import { performAction } from '../actions';
import { RNG } from '../dice';
import { fixtureState, fixtureCombatant, fixtureAction } from '../../test/fixtures';
import type { Action } from '../types';

describe('dynamic formula values in resolution', () => {
  it('adds a formula-computed heal bonus that scales with the caster', () => {
    const heal: Action = fixtureAction({
      id: 'cure', name: 'Cure', kind: 'spell', targets: 1, damage: undefined, damageType: undefined,
      heal: '1d1', // deterministic base of 1
      dynamic: { healBonus: 'casterMod + prof' },
    });
    const caster = fixtureCombatant('cleric', 'pc', {
      actionIds: ['cure'], proficiencyBonus: 3, spellcastingAbility: 'wis',
      abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 18, cha: 10 }, // wis mod +4
    });
    const ally = fixtureCombatant('ally', 'pc', { maxHp: 40 });
    const state = fixtureState([caster, ally], [heal]);
    state.combatants[1].hp = 10;

    performAction(state, new RNG(1), state.combatants[0], heal, [state.combatants[1]], []);

    // 1 (base die) + casterMod(4) + prof(3) = 8 healed -> 18
    expect(state.combatants[1].hp).toBe(18);
  });

  it('adds a formula-computed bonus on top of the derived save DC', () => {
    // Derived DC = 8 + casterMod(5) + prof(4) = 17; dynamic adds floor(casterMod/2)=2 -> DC 19.
    const spell: Action = fixtureAction({
      id: 'blast', name: 'Blast', kind: 'spell', targets: 1, damage: '1d1', damageType: 'fire',
      save: { ability: 'dex', onSuccess: 'half' },
      dynamic: { saveDc: 'floor(casterMod / 2)' },
    });
    const caster = fixtureCombatant('mage', 'pc', {
      actionIds: ['blast'], proficiencyBonus: 4, spellcastingAbility: 'int',
      abilityScores: { str: 10, dex: 10, con: 10, int: 20, wis: 10, cha: 10 }, // int mod +5
    });
    const target = fixtureCombatant('goblin', 'monster', { maxHp: 30 });
    const state = fixtureState([caster, target], [spell]);
    const events: import('../log').LogEvent[] = [];

    performAction(state, new RNG(1), state.combatants[0], spell, [state.combatants[1]], events);

    expect(events.some((e) => /vs DC 19/.test(e.message))).toBe(true);
  });
});
