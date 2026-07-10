// Curated SRD weapon catalog. Attack actions reference these by id; the wielder's
// ability modifier and proficiency are applied at resolution time (see engine/derive.ts).

import type { Weapon } from '../engine/types';

export const SRD_WEAPONS: Weapon[] = [
  // --- simple melee ---
  { id: 'wpn-club', name: 'Club', damage: '1d4', damageType: 'bludgeoning', properties: ['light'], category: 'simple', mastery: 'slow' },
  { id: 'wpn-dagger', name: 'Dagger', damage: '1d4', damageType: 'piercing', properties: ['finesse', 'light', 'thrown'], category: 'simple', range: 20, longRange: 60, mastery: 'nick' },
  { id: 'wpn-greatclub', name: 'Greatclub', damage: '1d8', damageType: 'bludgeoning', properties: ['twoHanded'], category: 'simple', mastery: 'push' },
  { id: 'wpn-handaxe', name: 'Handaxe', damage: '1d6', damageType: 'slashing', properties: ['light', 'thrown'], category: 'simple', range: 20, longRange: 60, mastery: 'vex' },
  { id: 'wpn-javelin', name: 'Javelin', damage: '1d6', damageType: 'piercing', properties: ['thrown'], category: 'simple', range: 30, longRange: 120, mastery: 'slow' },
  { id: 'wpn-light-hammer', name: 'Light Hammer', damage: '1d4', damageType: 'bludgeoning', properties: ['light', 'thrown'], category: 'simple', range: 20, longRange: 60, mastery: 'nick' },
  { id: 'wpn-mace', name: 'Mace', damage: '1d6', damageType: 'bludgeoning', properties: [], category: 'simple', mastery: 'sap' },
  { id: 'wpn-quarterstaff', name: 'Quarterstaff', damage: '1d6', versatileDamage: '1d8', damageType: 'bludgeoning', properties: ['versatile'], category: 'simple', mastery: 'topple' },
  { id: 'wpn-sickle', name: 'Sickle', damage: '1d4', damageType: 'slashing', properties: ['light'], category: 'simple', mastery: 'nick' },
  { id: 'wpn-spear', name: 'Spear', damage: '1d6', versatileDamage: '1d8', damageType: 'piercing', properties: ['versatile', 'thrown'], category: 'simple', range: 20, longRange: 60, mastery: 'sap' },

  // --- simple ranged --- (range / longRange in feet; beyond normal = disadvantage)
  { id: 'wpn-lightcrossbow', name: 'Light Crossbow', damage: '1d8', damageType: 'piercing', properties: ['ranged', 'twoHanded'], category: 'simple', range: 80, longRange: 320, mastery: 'slow' },
  { id: 'wpn-dart', name: 'Dart', damage: '1d4', damageType: 'piercing', properties: ['finesse', 'thrown'], category: 'simple', range: 20, longRange: 60, mastery: 'vex' },
  { id: 'wpn-shortbow', name: 'Shortbow', damage: '1d6', damageType: 'piercing', properties: ['ranged', 'twoHanded'], category: 'simple', range: 80, longRange: 320, mastery: 'vex' },
  { id: 'wpn-sling', name: 'Sling', damage: '1d4', damageType: 'bludgeoning', properties: ['ranged'], category: 'simple', range: 30, longRange: 120, mastery: 'slow' },

  // --- martial melee ---
  { id: 'wpn-battleaxe', name: 'Battleaxe', damage: '1d8', versatileDamage: '1d10', damageType: 'slashing', properties: ['versatile'], category: 'martial', mastery: 'topple' },
  { id: 'wpn-flail', name: 'Flail', damage: '1d8', damageType: 'bludgeoning', properties: [], category: 'martial', mastery: 'sap' },
  { id: 'wpn-glaive', name: 'Glaive', damage: '1d10', damageType: 'slashing', properties: ['twoHanded', 'heavy'], category: 'martial', range: 15, mastery: 'graze' },
  { id: 'wpn-greataxe', name: 'Greataxe', damage: '1d12', damageType: 'slashing', properties: ['twoHanded', 'heavy'], category: 'martial', mastery: 'cleave' },
  { id: 'wpn-greatsword', name: 'Greatsword', damage: '2d6', damageType: 'slashing', properties: ['twoHanded', 'heavy'], category: 'martial', mastery: 'graze' },
  { id: 'wpn-halberd', name: 'Halberd', damage: '1d10', damageType: 'slashing', properties: ['twoHanded', 'heavy'], category: 'martial', range: 15, mastery: 'cleave' },
  { id: 'wpn-lance', name: 'Lance', damage: '1d10', damageType: 'piercing', properties: [], category: 'martial', range: 15, mastery: 'topple' },
  { id: 'wpn-longsword', name: 'Longsword', damage: '1d8', versatileDamage: '1d10', damageType: 'slashing', properties: ['versatile'], category: 'martial', mastery: 'sap' },
  { id: 'wpn-maul', name: 'Maul', damage: '2d6', damageType: 'bludgeoning', properties: ['twoHanded', 'heavy'], category: 'martial', mastery: 'topple' },
  { id: 'wpn-morningstar', name: 'Morningstar', damage: '1d8', damageType: 'piercing', properties: [], category: 'martial', mastery: 'sap' },
  { id: 'wpn-pike', name: 'Pike', damage: '1d10', damageType: 'piercing', properties: ['twoHanded', 'heavy'], category: 'martial', range: 15, mastery: 'push' },
  { id: 'wpn-rapier', name: 'Rapier', damage: '1d8', damageType: 'piercing', properties: ['finesse'], category: 'martial', mastery: 'vex' },
  { id: 'wpn-scimitar', name: 'Scimitar', damage: '1d6', damageType: 'slashing', properties: ['finesse', 'light'], category: 'martial', mastery: 'nick' },
  { id: 'wpn-shortsword', name: 'Shortsword', damage: '1d6', damageType: 'piercing', properties: ['finesse', 'light'], category: 'martial', mastery: 'vex' },
  { id: 'wpn-trident', name: 'Trident', damage: '1d6', versatileDamage: '1d8', damageType: 'piercing', properties: ['versatile', 'thrown'], category: 'martial', range: 20, longRange: 60, mastery: 'topple' },
  { id: 'wpn-war-pick', name: 'War Pick', damage: '1d8', damageType: 'piercing', properties: [], category: 'martial', mastery: 'sap' },
  { id: 'wpn-warhammer', name: 'Warhammer', damage: '1d8', versatileDamage: '1d10', damageType: 'bludgeoning', properties: ['versatile'], category: 'martial', mastery: 'push' },
  { id: 'wpn-whip', name: 'Whip', damage: '1d4', damageType: 'slashing', properties: ['finesse'], category: 'martial', range: 15, mastery: 'slow' },

  // --- martial ranged ---
  { id: 'wpn-blowgun', name: 'Blowgun', damage: '1', damageType: 'piercing', properties: ['ranged'], category: 'martial', range: 25, longRange: 100, mastery: 'vex' },
  { id: 'wpn-hand-crossbow', name: 'Hand Crossbow', damage: '1d6', damageType: 'piercing', properties: ['ranged', 'light'], category: 'martial', range: 30, longRange: 120, mastery: 'vex' },
  { id: 'wpn-heavy-crossbow', name: 'Heavy Crossbow', damage: '1d10', damageType: 'piercing', properties: ['ranged', 'heavy', 'twoHanded'], category: 'martial', range: 100, longRange: 400, mastery: 'push' },
  { id: 'wpn-longbow', name: 'Longbow', damage: '1d8', damageType: 'piercing', properties: ['ranged', 'heavy', 'twoHanded'], category: 'martial', range: 150, longRange: 600, mastery: 'slow' },
  { id: 'wpn-net', name: 'Net', damage: '0', damageType: 'bludgeoning', properties: ['thrown'], category: 'martial', range: 15, mastery: 'slow' },

  // --- natural / monster ---
  { id: 'wpn-bite', name: 'Bite', damage: '1d6', damageType: 'piercing', properties: [], category: 'simple', mastery: 'vex' },
  { id: 'wpn-claw', name: 'Claw', damage: '1d4', damageType: 'slashing', properties: ['light'], category: 'simple', mastery: 'nick' },
];

export function weaponById(id: string): Weapon | undefined {
  return SRD_WEAPONS.find((w) => w.id === id);
}
