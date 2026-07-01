import { describe, it, expect } from 'vitest';
import { buildCombatState } from '../state';
import { performAction } from '../actions';
import { RNG } from '../dice';
import type { Action, Combatant, Scenario, Weapon } from '../types';
import type { LogEvent } from '../log';

function abilities(over: Partial<Record<string, number>> = {}) {
  return { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...over } as Combatant['abilityScores'];
}
function mk(id: string, side: 'pc' | 'monster', over: Partial<Combatant> = {}): Combatant {
  return {
    id, name: id, side, maxHp: 100, ac: 1,
    abilityScores: abilities({ str: 16, dex: 16 }), saveProficiencies: [], proficiencyBonus: 2,
    actionIds: [], script: [], spellSlots: {}, speed: 30, ...over,
  };
}
function build(combatants: Combatant[], actions: Action[], weapons: Weapon[]) {
  const s: Scenario = { name: 't', combatants, actions, weapons, targetLists: [], ruleLibrary: [], conditionLibrary: [], initiativeMode: 'fixed', fixedOrder: combatants.map((c) => c.id), maxRounds: 10 };
  return buildCombatState(s);
}

const sword: Weapon = { id: 'w', name: 'Sword', damage: '1d8', damageType: 'slashing', properties: [], category: 'martial', range: 0 };

describe('Sneak Attack rider', () => {
  it('fires once per turn only when advantage or ally adjacent', () => {
    // no advantage, no ally adjacent → should NOT fire
    const rogue = mk('rogue', 'pc', { position: 0 });
    const foe = mk('foe', 'monster', { position: 0 });
    const action: Action = {
      id: 'sneak', name: 'Sneak Shortsword', kind: 'attack', targets: 1, weaponId: 'w', attackCount: 2,
      riders: [{ label: 'Sneak Attack', bonusDice: '2d6', trigger: 'advantageOrAllyAdjacent', oncePerTurn: true }],
    };
    const state = build([rogue, foe], [action], [sword]);
    const events: LogEvent[] = [];
    performAction(state, new RNG(3), state.combatants[0], action, [state.combatants[1]], events);
    expect(events.filter((e) => e.message.includes('Sneak Attack')).length).toBe(0);
  });

  it('fires exactly once when an ally is adjacent to the target', () => {
    const rogue = mk('rogue', 'pc', { position: 0 });
    const ally = mk('ally', 'pc', { position: 0 }); // adjacent to foe (same block)
    const foe = mk('foe', 'monster', { position: 0 });
    const action: Action = {
      id: 'sneak', name: 'Sneak Shortsword', kind: 'attack', targets: 1, weaponId: 'w', attackCount: 3,
      riders: [{ label: 'Sneak Attack', bonusDice: '2d6', trigger: 'advantageOrAllyAdjacent', oncePerTurn: true }],
    };
    const state = build([rogue, ally, foe], [action], [sword]);
    const events: LogEvent[] = [];
    performAction(state, new RNG(3), state.combatants[0], action, [state.combatants[2]], events);
    // 3 swings but sneak attack fires only once
    expect(events.filter((e) => e.message.includes('Sneak Attack')).length).toBe(1);
  });
});

describe('Rage rider + physical resistance', () => {
  it('adds melee damage while raging', () => {
    const barb = mk('barb', 'pc', { position: 0 });
    const foe = mk('foe', 'monster', { position: 0 });
    const action: Action = {
      id: 'rageatk', name: 'Raging Sword', kind: 'attack', targets: 1, weaponId: 'w', attackCount: 1,
      riders: [{ label: 'Rage', bonusFlat: 2, trigger: 'selfHasCondition', condition: 'raging', meleeOnly: true }],
    };
    const state = build([barb, foe], [action], [sword]);
    state.combatants[0].conditions.push({ kind: 'raging', duration: { type: 'rounds', rounds: 10 } });
    const events: LogEvent[] = [];
    performAction(state, new RNG(4), state.combatants[0], action, [state.combatants[1]], events);
    expect(events.some((e) => e.message.includes('Rage'))).toBe(true);
  });

  it('halves physical damage taken while raging', () => {
    const attacker = mk('atk', 'monster', { position: 0 });
    const barb = mk('barb', 'pc', { position: 0, maxHp: 100 });
    const flat: Action = { id: 'big', name: 'Big Hit', kind: 'attack', targets: 1, attackBonus: 20, damage: '20', damageType: 'slashing' };
    const state = build([attacker, barb], [flat], []);
    state.combatants[1].conditions.push({ kind: 'raging', duration: { type: 'rounds', rounds: 10 } });
    performAction(state, new RNG(1), state.combatants[0], flat, [state.combatants[1]], []);
    // 20 slashing halved to 10 → 90 HP
    expect(state.combatants[1].hp).toBe(90);
  });
});

describe("Hunter's Mark rider", () => {
  it('adds bonus dice only against a marked target', () => {
    const ranger = mk('ranger', 'pc', { position: 0 });
    const marked = mk('marked', 'monster', { position: 0 });
    const action: Action = {
      id: 'mark-atk', name: 'Marked Strike', kind: 'attack', targets: 1, weaponId: 'w', attackCount: 1,
      riders: [{ label: "Hunter's Mark", bonusDice: '1d6', trigger: 'targetHasCondition', condition: 'marked' }],
    };
    const state = build([ranger, marked], [action], [sword]);
    state.combatants[1].conditions.push({ kind: 'marked', duration: { type: 'concentration', sourceId: 'ranger' } });
    const events: LogEvent[] = [];
    performAction(state, new RNG(6), state.combatants[0], action, [state.combatants[1]], events);
    expect(events.some((e) => e.message.includes("Hunter's Mark"))).toBe(true);
  });
});
