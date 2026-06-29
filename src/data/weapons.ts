// Curated SRD weapon catalog. Attack actions reference these by id; the wielder's
// ability modifier and proficiency are applied at resolution time (see engine/derive.ts).

import type { Weapon } from '../engine/types';

export const SRD_WEAPONS: Weapon[] = [
  // --- simple melee ---
  { id: 'wpn-club', name: 'Club', damage: '1d4', damageType: 'bludgeoning', properties: ['light'], category: 'simple' },
  { id: 'wpn-dagger', name: 'Dagger', damage: '1d4', damageType: 'piercing', properties: ['finesse', 'light', 'thrown'], category: 'simple' },
  { id: 'wpn-handaxe', name: 'Handaxe', damage: '1d6', damageType: 'slashing', properties: ['light', 'thrown'], category: 'simple' },
  { id: 'wpn-mace', name: 'Mace', damage: '1d6', damageType: 'bludgeoning', properties: [], category: 'simple' },
  { id: 'wpn-quarterstaff', name: 'Quarterstaff', damage: '1d6', versatileDamage: '1d8', damageType: 'bludgeoning', properties: ['versatile'], category: 'simple' },
  { id: 'wpn-spear', name: 'Spear', damage: '1d6', versatileDamage: '1d8', damageType: 'piercing', properties: ['versatile', 'thrown'], category: 'simple' },

  // --- simple ranged ---
  { id: 'wpn-shortbow', name: 'Shortbow', damage: '1d6', damageType: 'piercing', properties: ['ranged'], category: 'simple' },
  { id: 'wpn-lightcrossbow', name: 'Light Crossbow', damage: '1d8', damageType: 'piercing', properties: ['ranged'], category: 'simple' },

  // --- martial melee ---
  { id: 'wpn-shortsword', name: 'Shortsword', damage: '1d6', damageType: 'piercing', properties: ['finesse', 'light'], category: 'martial' },
  { id: 'wpn-scimitar', name: 'Scimitar', damage: '1d6', damageType: 'slashing', properties: ['finesse', 'light'], category: 'martial' },
  { id: 'wpn-rapier', name: 'Rapier', damage: '1d8', damageType: 'piercing', properties: ['finesse'], category: 'martial' },
  { id: 'wpn-longsword', name: 'Longsword', damage: '1d8', versatileDamage: '1d10', damageType: 'slashing', properties: ['versatile'], category: 'martial' },
  { id: 'wpn-battleaxe', name: 'Battleaxe', damage: '1d8', versatileDamage: '1d10', damageType: 'slashing', properties: ['versatile'], category: 'martial' },
  { id: 'wpn-warhammer', name: 'Warhammer', damage: '1d8', versatileDamage: '1d10', damageType: 'bludgeoning', properties: ['versatile'], category: 'martial' },
  { id: 'wpn-greataxe', name: 'Greataxe', damage: '1d12', damageType: 'slashing', properties: ['twoHanded', 'heavy'], category: 'martial' },
  { id: 'wpn-greatsword', name: 'Greatsword', damage: '2d6', damageType: 'slashing', properties: ['twoHanded', 'heavy'], category: 'martial' },
  { id: 'wpn-glaive', name: 'Glaive', damage: '1d10', damageType: 'slashing', properties: ['twoHanded', 'heavy'], category: 'martial' },

  // --- martial ranged ---
  { id: 'wpn-longbow', name: 'Longbow', damage: '1d8', damageType: 'piercing', properties: ['ranged', 'heavy'], category: 'martial' },

  // --- natural / monster ---
  { id: 'wpn-bite', name: 'Bite', damage: '1d6', damageType: 'piercing', properties: [], category: 'simple' },
  { id: 'wpn-claw', name: 'Claw', damage: '1d4', damageType: 'slashing', properties: ['light'], category: 'simple' },
];

export function weaponById(id: string): Weapon | undefined {
  return SRD_WEAPONS.find((w) => w.id === id);
}
