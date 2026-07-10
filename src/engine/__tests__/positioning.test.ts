import { describe, expect, it } from 'vitest';
import { DEFAULT_ENCOUNTER_DISTANCE, buildCombatState, defaultPosition, distance, nearest } from '../state';
import { fixtureCombatant, fixtureScenario } from '../../test/fixtures';

describe('defaultPosition', () => {
  it('places each side relative to the encounter-distance gap between front combatants', () => {
    expect(defaultPosition('monster', 0)).toBe(30);
    expect(defaultPosition('monster', 1)).toBe(15);
    expect(defaultPosition('monster', 2)).toBe(0);
    expect(defaultPosition('pc', 0)).toBe(30 + DEFAULT_ENCOUNTER_DISTANCE);
    expect(defaultPosition('pc', 1)).toBe(45 + DEFAULT_ENCOUNTER_DISTANCE);
    expect(defaultPosition('pc', 0, 15)).toBe(45);
  });
});

describe('combat-state positioning', () => {
  it('honors explicit positions, defaults missing position and speed, and computes nearest by linear distance', () => {
    const state = buildCombatState(fixtureScenario({
      combatants: [
        fixtureCombatant('p1', 'pc', { position: 45 }),
        fixtureCombatant('p2', 'pc'),
        fixtureCombatant('m1', 'monster', { position: 0 }),
        fixtureCombatant('m2', 'monster', { position: 30 }),
      ],
      actions: [],
      fixedOrder: ['p1', 'p2', 'm1', 'm2'],
    }));

    expect(state.combatants[0].position).toBe(45);
    expect(state.combatants[1].position).toBe(75);
    expect(state.combatants[2].position).toBe(0);
    expect(state.combatants[1].speed).toBe(30);
    expect(distance(state.combatants[0], state.combatants[3])).toBe(15);
    expect(nearest(state.combatants[0], [state.combatants[2], state.combatants[3]])?.base.id).toBe('m2');
  });
});
