import { describe, expect, it } from 'vitest';
import { performAction } from '../actions';
import { effectiveRange } from '../movement';
import { RNG } from '../dice';
import { fixtureAction, fixtureCombatant, fixtureState } from '../../test/fixtures';
import { SRD_WEAPONS } from '../../data/weapons';
import type { Action } from '../types';
import type { LogEvent } from '../log';

describe('reach weapons', () => {
  it('a reach weapon extends effective melee range beyond the default 5ft', () => {
    const glaive = SRD_WEAPONS.find((w) => w.id === 'wpn-glaive')!;
    const act: Action = { id: 'a', name: 'Glaive', kind: 'attack', targets: 1, weaponId: 'wpn-glaive' };
    expect(effectiveRange(act, glaive)).toBe(glaive.reach);
    expect(effectiveRange(act, glaive)).toBeGreaterThan(5);
  });
});

describe('heterogeneous multiattack (sequence)', () => {
  it('performs each child action in one turn', () => {
    const bite = fixtureAction({ id: 'bite', name: 'Bite', attackBonus: 50, damage: '4', damageType: 'piercing' });
    const claw = fixtureAction({ id: 'claw', name: 'Claw', attackBonus: 50, damage: '3', damageType: 'slashing' });
    const multi: Action = { id: 'multi', name: 'Multiattack', kind: 'attack', targets: 1, sequence: ['bite', 'claw'] };
    const state = fixtureState(
      [fixtureCombatant('drake', 'monster', { position: 0 }), fixtureCombatant('hero', 'pc', { position: 0, ac: 1, maxHp: 100 })],
      [bite, claw, multi],
    );
    const events: LogEvent[] = [];
    performAction(state, new RNG(1), state.combatants[0], multi, [state.combatants[1]], events);
    // both child actions resolve in the one turn
    expect(events.some((e) => e.message.includes('Bite'))).toBe(true);
    expect(events.some((e) => e.message.includes('Claw'))).toBe(true);
    expect(state.combatants[1].hp).toBeLessThan(100); // took damage from the multiattack
  });
});
