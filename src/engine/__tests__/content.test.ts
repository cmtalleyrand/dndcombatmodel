import { describe, expect, it } from 'vitest';
import { performAction } from '../actions';
import { effectiveRange } from '../movement';
import { RNG } from '../dice';
import { fixtureAction, fixtureCombatant, fixtureState } from '../../test/fixtures';
import { SRD_ACTIONS, SRD_FEATURES } from '../../data/srd';
import { SRD_WEAPONS } from '../../data/weapons';
import type { Action } from '../types';
import type { LogEvent } from '../log';

describe('reach weapons', () => {
  it('a reach weapon extends melee range beyond 5ft without being ranged', () => {
    const glaive = SRD_WEAPONS.find((w) => w.id === 'wpn-glaive')!;
    expect(glaive.reach).toBe(10);
    expect(glaive.properties).not.toContain('ranged');
    const act: Action = { id: 'a', name: 'Glaive', kind: 'attack', targets: 1, weaponId: 'wpn-glaive' };
    expect(effectiveRange(act, glaive)).toBe(10);
  });
});

describe('content fixes', () => {
  it('Fireball deals 8d6', () => {
    const fb = SRD_ACTIONS.find((a) => a.id === 'act-fireball')!;
    expect(fb.damage).toBe('8d6');
  });

  it('Ice Storm splits bludgeoning and cold and parses cleanly', () => {
    const ice = SRD_ACTIONS.find((a) => a.id === 'act-ice-storm')!;
    expect(ice.damage).toBe('2d8');
    expect(SRD_FEATURES.find((feature) => feature.id === 'feat-ice-storm-cold')?.extraDamage?.[0]).toMatchObject({ type: 'cold' });
  });

  it('the Ogre greatclub hits for 2d8+4', () => {
    const club = SRD_ACTIONS.find((a) => a.id === 'act-ogre-greatclub')!;
    expect(club.damage).toBe('2d8+4');
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
