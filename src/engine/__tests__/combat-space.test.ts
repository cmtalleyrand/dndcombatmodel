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
    id, name: id, side, maxHp: 30, ac: 1, // AC 1 so attacks essentially always hit
    abilityScores: abilities({ str: 16, dex: 16 }), saveProficiencies: [], proficiencyBonus: 2,
    actionIds: [], script: [], spellSlots: {}, speed: 30, ...over,
  };
}
function build(combatants: Combatant[], actions: Action[], weapons: Weapon[] = []) {
  const s: Scenario = { name: 't', combatants, actions, weapons, targetLists: [], ruleLibrary: [], conditionLibrary: [], initiativeMode: 'fixed', fixedOrder: combatants.map((c) => c.id), maxRounds: 10 };
  return buildCombatState(s);
}

const melee: Weapon = { id: 'w-sword', name: 'Sword', damage: '1d8', damageType: 'slashing', properties: [], category: 'martial', range: 0 };
const bow: Weapon = { id: 'w-bow', name: 'Bow', damage: '1d6', damageType: 'piercing', properties: ['ranged'], category: 'simple', range: 80, longRange: 320 };
const swordAct: Action = { id: 'a-sword', name: 'Sword', kind: 'attack', targets: 1, weaponId: 'w-sword', attackCount: 1 };
const bowAct: Action = { id: 'a-bow', name: 'Bow', kind: 'attack', targets: 1, weaponId: 'w-bow', attackCount: 1 };

describe('movement / auto-approach', () => {
  it('a melee attacker advances toward an out-of-reach target before striking', () => {
    const a = mk('a', 'pc', { position: 45, speed: 30 });
    const b = mk('b', 'monster', { position: 30 });
    const state = build([a, b], [swordAct], [melee]);
    const events: LogEvent[] = [];
    performAction(state, new RNG(1), state.combatants[0], swordAct, [state.combatants[1]], events);
    // moved from 45 to 30 (15ft) to reach melee
    expect(state.combatants[0].position).toBe(30);
    expect(events.some((e) => e.type === 'move')).toBe(true);
    expect(events.some((e) => e.message.includes('hits') || e.message.includes('miss'))).toBe(true);
  });

  it('cannot reach a target beyond movement + reach and logs out of range', () => {
    const a = mk('a', 'pc', { position: 100, speed: 30 });
    const b = mk('b', 'monster', { position: 0 });
    const state = build([a, b], [swordAct], [melee]);
    const events: LogEvent[] = [];
    performAction(state, new RNG(1), state.combatants[0], swordAct, [state.combatants[1]], events);
    // moved 30ft (to 70), still 70ft away, range 5 -> out of range
    expect(state.combatants[0].position).toBe(70);
    expect(events.some((e) => e.message.includes("can't reach"))).toBe(true);
  });
});

describe('ranged long-range disadvantage', () => {
  it('does not move when already in normal range', () => {
    const a = mk('a', 'pc', { position: 60 });
    const b = mk('b', 'monster', { position: 0 }); // 60ft, within 80 normal range
    const state = build([a, b], [bowAct], [bow]);
    const events: LogEvent[] = [];
    performAction(state, new RNG(5), state.combatants[0], bowAct, [state.combatants[1]], events);
    expect(state.combatants[0].position).toBe(60);
    expect(events.some((e) => e.type === 'move')).toBe(false);
  });
});

describe('AoE in linear space', () => {
  it('hits all enemies within the radius of the primary target', () => {
    const caster = mk('wiz', 'pc', { position: 45, spellSlots: { 1: 5 } });
    const e1 = mk('e1', 'monster', { position: 30 });
    const e2 = mk('e2', 'monster', { position: 15 });
    const e3 = mk('e3', 'monster', { position: 0 });
    const fireball: Action = {
      id: 'a-fb', name: 'Fireball', kind: 'spell', targets: 1, spellLevel: 1,
      range: 150, aoeRadius: 20, damage: '6d6', damageType: 'fire',
      save: { ability: 'dex', dc: 50, onSuccess: 'half' }, // impossible DC -> all fail -> full dmg
    };
    const state = build([caster, e1, e2, e3], [fireball]);
    const events: LogEvent[] = [];
    // primary target e1 at 30; radius 20 -> e1(30) and e2(15) in, e3(0) out
    performAction(state, new RNG(2), state.combatants[0], fireball, [state.combatants[1]], events);
    expect(state.combatants[1].hp).toBeLessThan(30); // e1 hit
    expect(state.combatants[2].hp).toBeLessThan(30); // e2 hit
    expect(state.combatants[3].hp).toBe(30); // e3 out of radius
  });
});
