import { describe, it, expect } from 'vitest';
import {
  attackAbility,
  resolveAttackProfile,
  spellAttackBonus,
  spellSaveDC,
  healFlat,
} from '../derive';
import type { Action, Combatant, Weapon } from '../types';

function mkCombatant(over: Partial<Combatant> = {}): Combatant {
  return {
    id: 'c',
    name: 'c',
    side: 'pc',
    maxHp: 20,
    ac: 14,
    abilityScores: { str: 18, dex: 14, con: 12, int: 10, wis: 16, cha: 8 },
    saveProficiencies: [],
    proficiencyBonus: 3,
    actionIds: [],
    script: [],
    spellSlots: {},
    ...over,
  };
}

const longsword: Weapon = { id: 'w', name: 'Longsword', damage: '1d8', versatileDamage: '1d10', damageType: 'slashing', properties: ['versatile'], category: 'martial' };
const rapier: Weapon = { id: 'r', name: 'Rapier', damage: '1d8', damageType: 'piercing', properties: ['finesse'], category: 'martial' };
const shortbow: Weapon = { id: 'b', name: 'Shortbow', damage: '1d6', damageType: 'piercing', properties: ['ranged'], category: 'simple' };

describe('attackAbility', () => {
  it('uses STR for a plain weapon', () => {
    expect(attackAbility(mkCombatant(), { id: 'a', name: 'a', kind: 'attack', targets: 1 }, longsword)).toBe('str');
  });
  it('uses DEX for ranged', () => {
    expect(attackAbility(mkCombatant(), { id: 'a', name: 'a', kind: 'attack', targets: 1 }, shortbow)).toBe('dex');
  });
  it('finesse picks the better of STR/DEX', () => {
    // STR 18 (+4) beats DEX 14 (+2) → str
    expect(attackAbility(mkCombatant(), { id: 'a', name: 'a', kind: 'attack', targets: 1 }, rapier)).toBe('str');
    // now DEX higher
    const dexy = mkCombatant({ abilityScores: { str: 10, dex: 18, con: 12, int: 10, wis: 10, cha: 8 } });
    expect(attackAbility(dexy, { id: 'a', name: 'a', kind: 'attack', targets: 1 }, rapier)).toBe('dex');
  });
  it('respects an explicit override', () => {
    expect(attackAbility(mkCombatant(), { id: 'a', name: 'a', kind: 'attack', targets: 1, abilityOverride: 'cha' }, longsword)).toBe('cha');
  });
});

describe('resolveAttackProfile (weapon)', () => {
  const action: Action = { id: 'a', name: 'Longsword', kind: 'attack', targets: 1, weaponId: 'w' };

  it('derives to-hit = mod + proficiency', () => {
    // STR +4, prof +3 = +7
    const p = resolveAttackProfile(mkCombatant(), action, longsword);
    expect(p.toHit).toBe(7);
    expect(p.damageDice).toEqual(['1d8']);
    expect(p.damageFlat).toBe(4); // STR mod
    expect(p.damageType).toBe('slashing');
  });

  it('omits proficiency when not proficient', () => {
    const p = resolveAttackProfile(mkCombatant(), { ...action, notProficient: true }, longsword);
    expect(p.toHit).toBe(4);
  });

  it('uses the versatile die when two-handing', () => {
    const p = resolveAttackProfile(mkCombatant(), { ...action, useVersatile: true }, longsword);
    expect(p.damageDice).toEqual(['1d10']);
  });

  it('adds magic bonus to both hit and damage, and bonus dice', () => {
    const p = resolveAttackProfile(mkCombatant(), { ...action, magicBonus: 1, damageBonus: 2, bonusDamageDice: '1d6' }, longsword);
    expect(p.toHit).toBe(7 + 1); // +magic
    expect(p.damageFlat).toBe(4 + 2 + 1); // mod + damageBonus + magic
    expect(p.damageDice).toEqual(['1d8', '1d6']);
  });
});

describe('resolveAttackProfile (legacy/manual)', () => {
  it('falls back to explicit attackBonus/damage with additive adjustments', () => {
    const action: Action = { id: 'a', name: 'Bite', kind: 'attack', targets: 1, attackBonus: 4, damage: '1d6+2', damageType: 'piercing', magicBonus: 1 };
    const p = resolveAttackProfile(mkCombatant(), action, undefined);
    expect(p.toHit).toBe(5); // 4 + magic 1
    expect(p.damageDice).toEqual(['1d6+2']);
    expect(p.damageFlat).toBe(1); // magic only (mod already baked into formula)
    expect(p.damageType).toBe('piercing');
  });
});

describe('spell derivation', () => {
  const wizard = mkCombatant({ spellcastingAbility: 'int', abilityScores: { str: 8, dex: 14, con: 12, int: 18, wis: 10, cha: 10 }, proficiencyBonus: 3 });

  it('derives spell attack = mod + proficiency', () => {
    expect(spellAttackBonus(wizard, { id: 's', name: 's', kind: 'spell', targets: 1 })).toBe(4 + 3);
  });

  it('derives save DC = 8 + mod + proficiency', () => {
    expect(spellSaveDC(wizard, { id: 's', name: 's', kind: 'spell', targets: 1, save: { ability: 'wis', onSuccess: 'none' } })).toBe(8 + 4 + 3);
  });

  it('honors an explicit DC and adjustment', () => {
    expect(spellSaveDC(wizard, { id: 's', name: 's', kind: 'spell', targets: 1, save: { ability: 'wis', dc: 15, onSuccess: 'none' }, saveDcBonus: 1 })).toBe(16);
  });

  it('heal adds spell mod when opted in', () => {
    const cleric = mkCombatant({ spellcastingAbility: 'wis' }); // WIS 16 → +3
    expect(healFlat(cleric, { id: 'h', name: 'h', kind: 'spell', targets: 1, heal: '1d8', addSpellModToHeal: true })).toBe(3);
    expect(healFlat(cleric, { id: 'h', name: 'h', kind: 'spell', targets: 1, heal: '1d8' })).toBe(0);
  });
});
