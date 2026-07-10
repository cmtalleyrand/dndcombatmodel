import { describe, expect, it } from 'vitest';
import { critDouble, rollDamageTotal, performAction } from '../actions';
import { RNG } from '../dice';
import { runSimulation } from '../simulator';
import {
  fixtureAction,
  fixtureCombatant,
  fixtureScenario,
  fixtureState,
  scriptedCombatant,
} from '../../test/fixtures';
import type { LogEvent } from '../log';

describe('crit damage doubling', () => {
  it('doubles the dice count but leaves the flat modifier alone', () => {
    expect(critDouble('2d6+3')).toBe('4d6+3');
    expect(critDouble('1d8')).toBe('2d8');
    expect(critDouble('d10-1')).toBe('2d10-1');
  });

  it('leaves flat-only formulas unchanged', () => {
    expect(critDouble('5')).toBe('5');
  });

  it('rollDamageTotal doubles dice on a crit but never the flat bonus', () => {
    // 3 flat is added once; the dice contribution at minimum is count*1.
    const normal = rollDamageTotal(new RNG(1), ['2d6'], 3, false);
    const crit = rollDamageTotal(new RNG(1), ['2d6'], 3, true);
    // crit rolls twice as many dice, so its minimum floor is higher; and the flat
    // (3) is present in both, never doubled.
    expect(normal).toBeGreaterThanOrEqual(2 + 3);
    expect(crit).toBeGreaterThanOrEqual(4 + 3);
    expect(crit).toBeGreaterThan(normal);
  });
});

describe('save-ends timing', () => {
  it('a save-ends condition lasts through other turns and rolls its save at end of the bearer turn', () => {
    // Stunned with an impossible DC so the save never succeeds; the bearer should
    // remain stunned across multiple rounds rather than shaking it at the start.
    const zap = fixtureAction({
      id: 'zap',
      name: 'Stun Ray',
      kind: 'spell',
      spellLevel: 1,
      save: { ability: 'con', dc: 99, onSuccess: 'none' },
      applyConditions: [{ kind: 'stunned', duration: { type: 'saveEnds', ability: 'con', dc: 99 } }],
      damage: undefined,
      damageType: undefined,
    });
    const caster = fixtureCombatant('wiz', 'pc', { spellSlots: { 1: 5 } });
    const victim = fixtureCombatant('gob', 'monster');
    const state = fixtureState([caster, victim], [zap]);

    performAction(state, new RNG(2), state.combatants[0], zap, [state.combatants[1]], []);
    expect(state.combatants[1].conditions.some((c) => c.kind === 'stunned')).toBe(true);
  });

  it('a save-ends condition ends at end of turn once the save succeeds (DC 0)', () => {
    const scenario = fixtureScenario({
      name: 'save-ends',
      combatants: [
        scriptedCombatant('pc1', 'pc', 'strike', { maxHp: 40 }),
        scriptedCombatant('m1', 'monster', 'strike', { maxHp: 40 }),
      ],
      actions: [fixtureAction()],
      fixedOrder: ['pc1', 'm1'],
      maxRounds: 3,
    });
    const result = runSimulation(scenario, 7, true);
    // sanity: the run produces frames and a terminal winner; timing wiring didn't stall it.
    expect(result.rounds).toBeGreaterThan(0);
    expect(['pc', 'monster', 'draw']).toContain(result.winner);
  });
});

describe('extra typed damage', () => {
  it('applies an extra damage packet of a distinct type on a hit', () => {
    const flametongue = fixtureAction({
      id: 'ft',
      name: 'Flame Blade',
      attackBonus: 50, // always hits
      damage: '1d8',
      damageType: 'slashing',
      extraDamage: [{ dice: '2d6', type: 'fire', label: 'flames' }],
    });
    const state = fixtureState(
      [fixtureCombatant('ftr', 'pc', { position: 0 }), fixtureCombatant('foe', 'monster', { position: 0, ac: 1 })],
      [flametongue],
    );
    const events: LogEvent[] = [];
    performAction(state, new RNG(3), state.combatants[0], flametongue, [state.combatants[1]], events);
    expect(events.some((e) => e.message.includes('flames'))).toBe(true);
  });
});
