// Curated SRD-flavored content: a reusable action library, sample PCs and monsters,
// and a default scenario that demonstrates scripting (priorities, conditions, targets).

import { DEFAULT_ENCOUNTER_DISTANCE, defaultPosition } from '../engine/state';
import type { Action, Combatant, ConditionPreset, Feature, RuleTemplate, Scenario } from '../engine/types';
import { SRD_WEAPONS } from './weapons';

const defaultPcPosition = (rankFromFront: number) => defaultPosition('pc', rankFromFront, DEFAULT_ENCOUNTER_DISTANCE);
const defaultMonsterPosition = (rankFromFront: number) => defaultPosition('monster', rankFromFront, DEFAULT_ENCOUNTER_DISTANCE);

// ---------------------------------------------------------------------------
// Action library
// ---------------------------------------------------------------------------

export const ACTION_DODGE: Action = {
  id: 'act-dodge',
  name: 'Dodge',
  kind: 'dodge',
  targets: 0,
  note: 'Attacks against you have disadvantage until your next turn.',
};

export const ACTION_MOVE: Action = {
  id: 'act-move',
  name: 'Move / Reposition',
  kind: 'move',
  targets: 0,
  note: 'Linear 1D movement; uses the whole turn for now.',
};

function weaponAttack(id: string, name: string, weaponId: string, overrides: Partial<Action> = {}): Action {
  return {
    id,
    name,
    kind: 'attack',
    targets: 1,
    weaponId,
    ...overrides,
  };
}

const WEAPON_ATTACK_ACTIONS: Action[] = [
  weaponAttack('act-club', 'Club', 'wpn-club'),
  weaponAttack('act-dagger', 'Dagger', 'wpn-dagger'),
  weaponAttack('act-dagger-thrown', 'Dagger (Thrown)', 'wpn-dagger', { range: 20 }),
  weaponAttack('act-greatclub', 'Greatclub', 'wpn-greatclub'),
  weaponAttack('act-handaxe', 'Handaxe', 'wpn-handaxe'),
  weaponAttack('act-handaxe-thrown', 'Handaxe (Thrown)', 'wpn-handaxe', { range: 20 }),
  weaponAttack('act-javelin', 'Javelin', 'wpn-javelin', { range: 30 }),
  weaponAttack('act-light-hammer', 'Light Hammer', 'wpn-light-hammer'),
  weaponAttack('act-light-hammer-thrown', 'Light Hammer (Thrown)', 'wpn-light-hammer', { range: 20 }),
  weaponAttack('act-mace', 'Mace', 'wpn-mace'),
  weaponAttack('act-quarterstaff', 'Quarterstaff', 'wpn-quarterstaff'),
  weaponAttack('act-quarterstaff-versatile', 'Quarterstaff (Two-Handed)', 'wpn-quarterstaff', { useVersatile: true }),
  weaponAttack('act-sickle', 'Sickle', 'wpn-sickle'),
  weaponAttack('act-spear', 'Spear', 'wpn-spear'),
  weaponAttack('act-spear-thrown', 'Spear (Thrown)', 'wpn-spear', { range: 20 }),
  weaponAttack('act-spear-versatile', 'Spear (Two-Handed)', 'wpn-spear', { useVersatile: true }),
  weaponAttack('act-light-crossbow', 'Light Crossbow', 'wpn-lightcrossbow'),
  weaponAttack('act-dart', 'Dart', 'wpn-dart', { range: 20 }),
  weaponAttack('act-shortbow', 'Shortbow', 'wpn-shortbow'),
  weaponAttack('act-sling', 'Sling', 'wpn-sling'),
  weaponAttack('act-battleaxe', 'Battleaxe', 'wpn-battleaxe'),
  weaponAttack('act-battleaxe-versatile', 'Battleaxe (Two-Handed)', 'wpn-battleaxe', { useVersatile: true }),
  weaponAttack('act-flail', 'Flail', 'wpn-flail'),
  weaponAttack('act-glaive', 'Glaive', 'wpn-glaive'),
  weaponAttack('act-greataxe', 'Greataxe', 'wpn-greataxe'),
  weaponAttack('act-greatsword', 'Greatsword', 'wpn-greatsword'),
  weaponAttack('act-halberd', 'Halberd', 'wpn-halberd'),
  weaponAttack('act-lance', 'Lance', 'wpn-lance'),
  weaponAttack('act-longsword', 'Longsword', 'wpn-longsword'),
  weaponAttack('act-longsword-versatile', 'Longsword (Two-Handed)', 'wpn-longsword', { useVersatile: true }),
  weaponAttack('act-longsword-2x', 'Longsword (Extra Attack)', 'wpn-longsword', {
    sequence: ['act-longsword', 'act-longsword'],
    note: 'Two longsword attacks against one target (Extra Attack, a level-5 martial feature).',
  }),
  weaponAttack('act-maul', 'Maul', 'wpn-maul'),
  weaponAttack('act-morningstar', 'Morningstar', 'wpn-morningstar'),
  weaponAttack('act-pike', 'Pike', 'wpn-pike'),
  weaponAttack('act-rapier', 'Rapier', 'wpn-rapier'),
  weaponAttack('act-scimitar', 'Scimitar', 'wpn-scimitar'),
  weaponAttack('act-shortsword', 'Shortsword', 'wpn-shortsword'),
  weaponAttack('act-trident', 'Trident', 'wpn-trident'),
  weaponAttack('act-trident-thrown', 'Trident (Thrown)', 'wpn-trident', { range: 20 }),
  weaponAttack('act-trident-versatile', 'Trident (Two-Handed)', 'wpn-trident', { useVersatile: true }),
  weaponAttack('act-war-pick', 'War Pick', 'wpn-war-pick'),
  weaponAttack('act-warhammer', 'Warhammer', 'wpn-warhammer'),
  weaponAttack('act-warhammer-versatile', 'Warhammer (Two-Handed)', 'wpn-warhammer', { useVersatile: true }),
  weaponAttack('act-whip', 'Whip', 'wpn-whip'),
  weaponAttack('act-blowgun', 'Blowgun', 'wpn-blowgun'),
  weaponAttack('act-hand-crossbow', 'Hand Crossbow', 'wpn-hand-crossbow'),
  weaponAttack('act-heavy-crossbow', 'Heavy Crossbow', 'wpn-heavy-crossbow'),
  weaponAttack('act-longbow', 'Longbow', 'wpn-longbow'),
  weaponAttack('act-net', 'Net', 'wpn-net'),
  weaponAttack('act-bite', 'Bite', 'wpn-bite'),
  weaponAttack('act-claw', 'Claw', 'wpn-claw'),
  weaponAttack('act-claw-2x', 'Claw (Multiattack)', 'wpn-claw', {
    sequence: ['act-claw', 'act-claw'],
    note: 'Two claw attacks against one target.',
  }),
];

const SPELL_AND_ABILITY_ACTIONS: Action[] = [
  {
    id: 'act-acid-splash',
    name: 'Acid Splash (cantrip)',
    kind: 'spell',
    targets: 2,
    range: 60,
    damage: '1d6',
    damageType: 'acid',
    save: { ability: 'dex', onSuccess: 'none' },
    cantripScaling: true,
    note: 'Cantrip splash; Dex save negates. Damage scales at levels 5/11/17.',
  },
  {
    id: 'act-ray-of-frost',
    name: 'Ray of Frost (cantrip)',
    kind: 'spell',
    targets: 1,
    spellAttack: true,
    range: 60,
    damage: '1d8',
    damageType: 'cold',
    cantripScaling: true,
    note: 'Cold spell attack; movement slow is not modelled separately. Damage scales at levels 5/11/17.',
  },
  {
    id: 'act-shocking-grasp',
    name: 'Shocking Grasp (cantrip)',
    kind: 'spell',
    targets: 1,
    spellAttack: true,
    range: 5,
    damage: '1d8',
    damageType: 'lightning',
    cantripScaling: true,
  },
  {
    id: 'act-sacred-flame',
    name: 'Sacred Flame (cantrip)',
    kind: 'spell',
    targets: 1,
    range: 60,
    damage: '1d8',
    damageType: 'radiant',
    save: { ability: 'dex', onSuccess: 'none' },
    cantripScaling: true,
  },
  {
    id: 'act-poison-spray',
    name: 'Poison Spray (cantrip)',
    kind: 'spell',
    targets: 1,
    range: 10,
    damage: '1d12',
    damageType: 'poison',
    save: { ability: 'con', onSuccess: 'none' },
    cantripScaling: true,
  },
  {
    id: 'act-burning-hands',
    name: 'Burning Hands (L1)',
    kind: 'spell',
    targets: 3,
    spellLevel: 1,
    range: 15,
    damage: '3d6',
    damageType: 'fire',
    save: { ability: 'dex', onSuccess: 'half' },
    note: 'Abstracted cone as up to 3 nearby targets; Dex save for half.',
  },
  {
    id: 'act-chromatic-orb-acid',
    name: 'Chromatic Orb — Acid (L1)',
    kind: 'spell',
    targets: 1,
    spellLevel: 1,
    spellAttack: true,
    range: 90,
    damage: '3d8',
    damageType: 'acid',
    note: 'One representative Chromatic Orb damage choice; duplicate to change the damage type.',
  },
  {
    id: 'act-chromatic-orb-cold',
    name: 'Chromatic Orb — Cold (L1)',
    kind: 'spell',
    targets: 1,
    spellLevel: 1,
    spellAttack: true,
    range: 90,
    damage: '3d8',
    damageType: 'cold',
    note: 'One representative Chromatic Orb damage choice; duplicate to change the damage type.',
  },
  {
    id: 'act-guiding-bolt',
    name: 'Guiding Bolt (L1)',
    kind: 'spell',
    targets: 1,
    spellLevel: 1,
    spellAttack: true,
    range: 120,
    damage: '4d6',
    damageType: 'radiant',
    note: 'Radiant spell attack; next-attack advantage is not modelled separately.',
  },
  {
    id: 'act-hellish-rebuke',
    name: 'Hellish Rebuke (L1 abstract)',
    kind: 'spell',
    targets: 1,
    spellLevel: 1,
    range: 60,
    damage: '2d10',
    damageType: 'fire',
    save: { ability: 'dex', onSuccess: 'half' },
    note: 'Reaction timing is not modelled; include it in scripts as an abstract damaging option.',
  },
  {
    id: 'act-healing-word',
    name: 'Healing Word (L1)',
    kind: 'spell',
    targets: 1,
    spellLevel: 1,
    range: 60,
    heal: '1d4',
    addSpellModToHeal: true,
  },
  {
    id: 'act-inflict-wounds',
    name: 'Inflict Wounds (L1)',
    kind: 'spell',
    targets: 1,
    spellLevel: 1,
    range: 5,
    damage: '2d10',
    save: { ability: 'con', onSuccess: 'none' },
    damageType: 'necrotic',
  },
  {
    id: 'act-thunderwave',
    name: 'Thunderwave (L1)',
    kind: 'spell',
    targets: 3,
    spellLevel: 1,
    range: 15,
    damage: '2d8',
    damageType: 'thunder',
    save: { ability: 'con', onSuccess: 'half' },
    note: 'Abstracted cube as up to 3 nearby targets; forced movement is not modelled separately.',
  },
  {
    id: 'act-melfs-acid-arrow',
    name: "Melf's Acid Arrow (L2)",
    kind: 'spell',
    targets: 1,
    spellLevel: 2,
    spellAttack: true,
    range: 90,
    damage: '4d4',
    damageType: 'acid',
    note: 'Ongoing acid damage is folded into the initial damage roll for this abstraction.',
  },
  {
    id: 'act-moonbeam',
    name: 'Moonbeam (L2)',
    kind: 'spell',
    targets: 1,
    spellLevel: 2,
    range: 120,
    aoeRadius: 5,
    concentration: true,
    damage: '2d10',
    damageType: 'radiant',
    save: { ability: 'con', onSuccess: 'half' },
    note: 'Abstracted cylinder as a small radius around the primary target.',
  },
  {
    id: 'act-blindness-deafness',
    name: 'Blindness/Deafness (L2)',
    kind: 'spell',
    targets: 1,
    spellLevel: 2,
    range: 30,
    save: { ability: 'con', onSuccess: 'none' },
    note: 'Applies blinded on a failed Con save (abstracted as a 10-round duration).',
  },
  {
    id: 'act-hold-person',
    name: 'Hold Person (L2)',
    kind: 'spell',
    targets: 1,
    spellLevel: 2,
    range: 60,
    concentration: true,
    save: { ability: 'wis', onSuccess: 'none' },
  },
  {
    id: 'act-shatter',
    name: 'Shatter (L2)',
    kind: 'spell',
    targets: 1,
    spellLevel: 2,
    range: 60,
    aoeRadius: 10,
    damage: '3d8',
    damageType: 'thunder',
    save: { ability: 'con', onSuccess: 'half' },
  },
  {
    id: 'act-scorching-ray',
    name: 'Scorching Ray (L2)',
    kind: 'spell',
    targets: 1,
    spellLevel: 2,
    spellAttack: true,
    range: 120,
    damage: '6d6',
    damageType: 'fire',
    note: 'Three rays are combined against one target as 6d6 damage after a single abstract attack roll.',
  },
  {
    id: 'act-call-lightning',
    name: 'Call Lightning (L3)',
    kind: 'spell',
    targets: 1,
    spellLevel: 3,
    range: 120,
    aoeRadius: 5,
    concentration: true,
    damage: '3d10',
    damageType: 'lightning',
    save: { ability: 'dex', onSuccess: 'half' },
    note: 'Models one bolt per action while concentrating; storm-cloud placement is abstracted.',
  },
  {
    id: 'act-web',
    name: 'Web (L2)',
    kind: 'spell',
    targets: 1,
    spellLevel: 2,
    range: 60,
    aoeRadius: 10,
    concentration: true,
    save: { ability: 'dex', onSuccess: 'none' },
  },
  {
    id: 'act-lightning-bolt',
    name: 'Lightning Bolt (L3)',
    kind: 'spell',
    targets: 3,
    spellLevel: 3,
    range: 100,
    damage: '8d6',
    damageType: 'lightning',
    save: { ability: 'dex', onSuccess: 'half' },
    note: 'Abstracted line as up to 3 targets; Dex save for half.',
  },
  {
    id: 'act-vampiric-touch',
    name: 'Vampiric Touch (L3 abstract)',
    kind: 'spell',
    targets: 1,
    spellLevel: 3,
    spellAttack: true,
    range: 5,
    concentration: true,
    damage: '3d6',
    damageType: 'necrotic',
    note: 'Self-healing from damage dealt is not modelled; this represents the attack component.',
  },
  {
    id: 'act-ice-storm',
    name: 'Ice Storm (L4)',
    kind: 'spell',
    targets: 1,
    spellLevel: 4,
    range: 300,
    aoeRadius: 20,
    damage: '2d8',
    damageType: 'bludgeoning',
    save: { ability: 'dex', onSuccess: 'half' },
    note: 'Bludgeoning (2d8) + cold (4d6); Dex save halves both.',
  },
  {
    id: 'act-revivify',
    name: 'Revivify (L3 abstract)',
    kind: 'spell',
    targets: 1,
    spellLevel: 3,
    range: 5,
    heal: '1',
    note: 'Abstracted as restoring 1 HP to a downed ally within reach.',
  },
  {
    id: 'act-cone-of-cold',
    name: 'Cone of Cold (L5)',
    kind: 'spell',
    targets: 6,
    spellLevel: 5,
    range: 60,
    damage: '8d8',
    damageType: 'cold',
    save: { ability: 'con', onSuccess: 'half' },
    note: 'Abstracted cone as up to 6 targets; Con save for half.',
  },
];

export const SRD_ACTIONS: Action[] = [
  ACTION_DODGE,
  ACTION_MOVE,
  ...WEAPON_ATTACK_ACTIONS,
  ...SPELL_AND_ABILITY_ACTIONS,
  // --- existing sample spells (attack/DC derive from the caster's spellcasting ability) ---
  {
    id: 'act-cure-wounds',
    name: 'Cure Wounds (L1)',
    kind: 'spell',
    targets: 1,
    spellLevel: 1,
    range: 30,
    heal: '1d8',
    addSpellModToHeal: true,
    note: 'Heal a single ally for 1d8 + spellcasting modifier (moves to reach them).',
  },
  {
    id: 'act-bless',
    name: 'Bless',
    kind: 'spell',
    targets: 3,
    spellLevel: 1,
    concentration: true,
    note: 'Up to 3 allies gain +1d4 to attacks and saves while you concentrate.',
  },
  {
    id: 'act-sleep',
    name: 'Sleep (L1)',
    kind: 'spell',
    targets: 3,
    spellLevel: 1,
    range: 90,
    save: { ability: 'wis', onSuccess: 'none' }, // DC derived from the caster
    note: 'Targets fall asleep on a failed save (abstracted; wakes when damaged).',
  },
  {
    id: 'act-magic-missile',
    name: 'Magic Missile (L1)',
    kind: 'spell',
    targets: 1,
    spellLevel: 1,
    range: 120,
    damage: '3d4+3',
    damageType: 'force',
    note: 'Auto-hits for 3 darts (3d4+3 to one target).',
  },
  {
    id: 'act-fire-bolt',
    name: 'Fire Bolt (cantrip)',
    kind: 'spell',
    targets: 1,
    spellAttack: true,
    range: 120,
    damage: '1d10',
    damageType: 'fire',
    cantripScaling: true,
    note: 'Cantrip spell attack (attack bonus derived) — no slot cost. Damage scales at levels 5/11/17.',
  },
  // --- demo content for Phase 3 features ---
  {
    id: 'act-rogue-shortbow',
    name: 'Shortbow + Sneak Attack',
    kind: 'attack',
    targets: 1,
    weaponId: 'wpn-shortbow',
    note: '+2d6 once per turn when you have advantage or an ally is adjacent to the target.',
  },
  {
    id: 'act-greataxe-rage',
    name: 'Greataxe + Rage Damage',
    kind: 'attack',
    targets: 1,
    weaponId: 'wpn-greataxe',
    note: '+2 damage while raging.',
  },
  {
    id: 'act-longbow-hunters-mark',
    name: "Longbow + Hunter's Mark",
    kind: 'attack',
    targets: 1,
    weaponId: 'wpn-longbow',
    note: '+1d6 when the target is marked.',
  },
  {
    id: 'act-rage',
    name: 'Rage',
    kind: 'ability',
    targets: 1, // self
    uses: 3,
    note: 'Self-buff: physical resistance + bonus melee damage while raging (pair with a Rage rider on a melee attack).',
  },
  {
    id: 'act-hunters-mark',
    name: "Hunter's Mark",
    kind: 'spell',
    targets: 1,
    spellLevel: 1,
    range: 90,
    concentration: true,
    note: 'Marks a target; attacks against it deal bonus dice (pair with a marked-target rider).',
  },
  {
    id: 'act-fireball',
    name: 'Fireball (AoE demo)',
    kind: 'spell',
    targets: 1,
    spellLevel: 3,
    range: 150,
    aoeRadius: 20,
    damage: '8d6',
    damageType: 'fire',
    save: { ability: 'dex', onSuccess: 'half' },
    note: 'Hits everyone within 20ft of the primary target (friendly fire); Dex save for half.',
  },
  // --- monster-specific attacks ---
  {
    id: 'act-ogre-greatclub',
    name: 'Ogre Greatclub',
    kind: 'attack',
    targets: 1,
    attackBonus: 6,
    damage: '2d8+4',
    damageType: 'bludgeoning',
    note: 'SRD Ogre greatclub: +6 to hit, 2d8+4 bludgeoning.',
  },
  {
    id: 'act-ghoul-claw-single',
    name: 'Ghoul Claw',
    kind: 'attack',
    targets: 1,
    attackBonus: 4,
    damage: '2d4+2',
    damageType: 'slashing',
    note: 'Single ghoul claw attack; paralysis is supplied by feat-ghoul-claws-paralysis.',
  },
  {
    id: 'act-ghoul-claws',
    name: 'Ghoul Claws',
    kind: 'attack',
    targets: 1,
    attackBonus: 4,
    sequence: ['act-ghoul-claw-single', 'act-ghoul-claw-single'],
    damage: '2d4+2',
    damageType: 'slashing',
    note: 'On a hit the target is paralyzed (DC 10 Con save ends at end of each of its turns).',
  },
];


const weaponActionIds = WEAPON_ATTACK_ACTIONS.map((action) => action.id);
const magicWeaponFeature = (bonus: 1 | 2 | 3): Feature => ({
  id: `feat-magic-weapon-${bonus}`,
  name: `Magic Weapon +${bonus}`,
  category: 'itemEffect',
  timing: 'beforeAttackRoll',
  attackModifier: { toHit: bonus, damage: bonus, label: `+${bonus} magic weapon` },
  actionIds: weaponActionIds,
});
const magicArmorFeature = (bonus: 1 | 2 | 3): Feature => ({
  id: `feat-magic-armor-${bonus}`,
  name: `Magic Armor +${bonus}`,
  category: 'itemEffect',
  timing: 'beforeAttackRoll',
  attackModifier: { ac: bonus, label: `+${bonus} magic armor` },
});

const MAGIC_ITEM_FEATURES: Feature[] = [
  magicWeaponFeature(1),
  magicWeaponFeature(2),
  magicWeaponFeature(3),
  magicArmorFeature(1),
  magicArmorFeature(2),
  magicArmorFeature(3),
  { id: 'feat-flame-tongue', name: 'Flame Tongue', category: 'itemEffect', timing: 'onHit', extraDamage: [{ dice: '2d6', type: 'fire', label: 'Flame Tongue' }], actionIds: weaponActionIds },
  { id: 'feat-frost-brand', name: 'Frost Brand', category: 'itemEffect', timing: 'onHit', extraDamage: [{ dice: '1d6', type: 'cold', label: 'Frost Brand' }], actionIds: weaponActionIds },
  { id: 'feat-vicious-weapon', name: 'Vicious Weapon', category: 'itemEffect', timing: 'onHit', extraDamage: [{ dice: '2d6', type: 'force', label: 'Vicious Weapon' }], actionIds: weaponActionIds, oncePerTurn: true },
  { id: 'feat-javelin-of-lightning', name: 'Javelin of Lightning', category: 'itemEffect', timing: 'onHit', resource: { id: 'javelin-lightning-use', max: 1 }, spend: { resourceId: 'javelin-lightning-use', amount: 1, trigger: 'onHit' }, extraDamage: [{ dice: '4d6', type: 'lightning', label: 'Lightning bolt' }], actionIds: ['act-javelin'] },
  { id: 'feat-dagger-of-venom', name: 'Dagger of Venom', category: 'itemEffect', timing: 'onHit', resource: { id: 'dagger-venom-use', max: 1 }, spend: { resourceId: 'dagger-venom-use', amount: 1, trigger: 'onHit' }, extraDamage: [{ dice: '2d10', type: 'poison', label: 'Venom' }], applyConditions: [{ kind: 'poisoned', duration: { type: 'rounds', rounds: 10 } }], actionIds: ['act-dagger', 'act-dagger-thrown'] },
  { id: 'feat-holy-avenger', name: 'Holy Avenger', category: 'itemEffect', timing: 'onHit', extraDamage: [{ dice: '2d10', type: 'radiant', label: 'Holy Avenger' }], actionIds: weaponActionIds },
  { id: 'feat-sun-blade', name: 'Sun Blade', category: 'itemEffect', timing: 'onHit', extraDamage: [{ dice: '1d8', type: 'radiant', label: 'Sun Blade' }], actionIds: ['act-longsword', 'act-longsword-versatile', 'act-longsword-2x'] },
  { id: 'feat-mace-of-disruption', name: 'Mace of Disruption', category: 'itemEffect', timing: 'onHit', extraDamage: [{ dice: '2d6', type: 'radiant', label: 'Disruption' }], actionIds: ['act-mace'] },
  { id: 'feat-mace-of-smiting', name: 'Mace of Smiting', category: 'itemEffect', timing: 'onHit', extraDamage: [{ dice: '2d6', type: 'force', label: 'Smiting' }], actionIds: ['act-mace'] },
  { id: 'feat-weapon-of-warning', name: 'Weapon of Warning', category: 'itemEffect', timing: 'beforeAttackRoll', attackModifier: { advantage: 'advantage', label: 'Warning' }, actionIds: weaponActionIds, oncePerTurn: true },
  { id: 'feat-bracers-of-archery', name: 'Bracers of Archery', category: 'itemEffect', timing: 'onHit', extraDamage: [{ flat: 2, type: 'piercing', label: 'Bracers of Archery' }], actionIds: ['act-shortbow', 'act-longbow', 'act-rogue-shortbow', 'act-longbow-hunters-mark'] },
  { id: 'feat-wand-of-war-mage-1', name: 'Wand of the War Mage +1', category: 'itemEffect', timing: 'beforeAttackRoll', attackModifier: { toHit: 1, label: '+1 spell focus' } },
  { id: 'feat-wand-of-war-mage-2', name: 'Wand of the War Mage +2', category: 'itemEffect', timing: 'beforeAttackRoll', attackModifier: { toHit: 2, label: '+2 spell focus' } },
  { id: 'feat-wand-of-war-mage-3', name: 'Wand of the War Mage +3', category: 'itemEffect', timing: 'beforeAttackRoll', attackModifier: { toHit: 3, label: '+3 spell focus' } },
  { id: 'feat-rod-of-pact-keeper-1', name: 'Rod of the Pact Keeper +1', category: 'itemEffect', timing: 'beforeAttackRoll', attackModifier: { toHit: 1, saveDc: 1, label: '+1 pact focus' } },
  { id: 'feat-rod-of-pact-keeper-2', name: 'Rod of the Pact Keeper +2', category: 'itemEffect', timing: 'beforeAttackRoll', attackModifier: { toHit: 2, saveDc: 2, label: '+2 pact focus' } },
  { id: 'feat-rod-of-pact-keeper-3', name: 'Rod of the Pact Keeper +3', category: 'itemEffect', timing: 'beforeAttackRoll', attackModifier: { toHit: 3, saveDc: 3, label: '+3 pact focus' } },
  { id: 'feat-staff-of-power', name: 'Staff of Power', category: 'itemEffect', timing: 'beforeAttackRoll', attackModifier: { toHit: 2, damage: 2, saveDc: 2, label: 'Staff of Power' }, actionIds: ['act-quarterstaff', 'act-quarterstaff-versatile'] },
  { id: 'feat-ring-of-protection', name: 'Ring of Protection', category: 'itemEffect', timing: 'beforeAttackRoll', attackModifier: { ac: 1, label: 'Ring of Protection' } },
  { id: 'feat-cloak-of-protection', name: 'Cloak of Protection', category: 'itemEffect', timing: 'beforeAttackRoll', attackModifier: { ac: 1, label: 'Cloak of Protection' } },
  { id: 'feat-stone-of-good-luck', name: 'Stone of Good Luck', category: 'itemEffect', timing: 'beforeAttackRoll', attackModifier: { toHit: 1, label: 'Good luck' }, oncePerTurn: true },
];

export const SRD_FEATURES: Feature[] = [
  ...MAGIC_ITEM_FEATURES,

  {
    id: 'feat-blindness-deafness-blinded',
    name: 'Blindness/Deafness: Blinded',
    category: 'spellEffect',
    timing: 'onHit',
    applyConditions : [{ kind: 'blinded', duration: { type: 'rounds', rounds: 10 } }],
    actionIds: ['act-blindness-deafness'],
  },
  {
    id: 'feat-hold-person-paralysis',
    name: 'Hold Person: Paralyzed',
    category: 'spellEffect',
    timing: 'onHit',
    applyConditions : [{ kind: 'paralyzed', duration: { type: 'concentration', sourceId: '' } }],
    actionIds: ['act-hold-person'],
  },
  {
    id: 'feat-web-restrained',
    name: 'Web: Restrained',
    category: 'spellEffect',
    timing: 'onHit',
    applyConditions : [{ kind: 'restrained', duration: { type: 'concentration', sourceId: '' } }],
    actionIds: ['act-web'],
  },
  {
    id: 'feat-ice-storm-cold',
    name: 'Ice Storm: Cold Damage',
    category: 'spellEffect',
    timing: 'onHit',
    extraDamage : [{ dice: '4d6', type: 'cold', label: 'cold' }],
    actionIds: ['act-ice-storm'],
  },
  {
    id: 'feat-bless-condition',
    name: 'Bless: Blessed',
    category: 'spellEffect',
    timing: 'onHit',
    applyConditions : [{ kind: 'blessed', duration: { type: 'concentration', sourceId: '' } }],
    actionIds: ['act-bless'],
  },
  {
    id: 'feat-sleep-asleep',
    name: 'Sleep: Asleep',
    category: 'spellEffect',
    timing: 'onHit',
    applyConditions : [{ kind: 'asleep', duration: { type: 'rounds', rounds: 10 } }],
    actionIds: ['act-sleep'],
  },
  {
    id: 'feat-rage-condition',
    name: 'Rage: Raging',
    category: 'classFeature',
    timing: 'onHit',
    applyConditions : [{ kind: 'raging', duration: { type: 'rounds', rounds: 10 } }],
    actionIds: ['act-rage'],
  },
  {
    id: 'feat-hunters-mark-condition',
    name: "Hunter's Mark: Marked",
    category: 'spellEffect',
    timing: 'onHit',
    applyConditions : [{ kind: 'marked', duration: { type: 'concentration', sourceId: '' } }],
    actionIds: ['act-hunters-mark'],
  },
  {
    id: 'feat-ghoul-claws-paralysis',
    name: 'Ghoul Claws: Paralysis',
    category: 'monsterTrait',
    timing: 'onHit',
    applyConditions : [{ kind: 'paralyzed', duration: { type: 'saveEnds', ability: 'con', dc: 10 } }],
    actionIds: ['act-ghoul-claw-single'],
  },
  {
    id: 'feat-sneak-attack',
    name: 'Sneak Attack',
    category: 'classFeature',
    timing: 'onHit',
    condition: { trigger: 'advantageOrAllyAdjacent' },
    extraDamage : [{ dice: '2d6', type: 'piercing', label: 'Sneak Attack' }],
    actionIds: ['act-rogue-shortbow'],
    oncePerTurn: true,
  },
  {
    id: 'feat-rage-damage',
    name: 'Rage Damage',
    category: 'classFeature',
    timing: 'onHit',
    condition: { trigger: 'selfHasCondition', condition: 'raging', meleeOnly: true },
    extraDamage : [{ flat: 2, type: 'slashing', label: 'Rage Damage' }],
    actionIds: ['act-greataxe-rage'],
  },
  {
    id: 'feat-hunters-mark',
    name: "Hunter's Mark",
    category: 'spellEffect',
    timing: 'onHit',
    condition: { trigger: 'targetHasCondition', condition: 'marked' },
    extraDamage : [{ dice: '1d6', type: 'piercing', label: "Hunter's Mark" }],
    actionIds: ['act-longbow-hunters-mark'],
  },
];

// ---------------------------------------------------------------------------
// Rules library — reusable tactical "recipes" (condition + action + target)
// insertable into any combatant's priority script.
// ---------------------------------------------------------------------------

export const DEFAULT_RULE_LIBRARY: RuleTemplate[] = [
  {
    id: 'ruletpl-focus-lowest-hp',
    name: 'Focus lowest-HP enemy',
    condition: { type: 'always' },
    actionId: 'act-mace',
    target: { strategy: 'lowestHpEnemy', excludeIncapacitated: true },
  },
  {
    id: 'ruletpl-nearest-enemy',
    name: 'Attack nearest enemy',
    condition: { type: 'always' },
    actionId: 'act-scimitar',
    target: { strategy: 'nearestEnemy' },
  },
  {
    id: 'ruletpl-heal-hurt-ally',
    name: 'Heal a hurt ally (< 50% HP)',
    condition: { type: 'anyAllyHpBelowPct', value: 50 },
    actionId: 'act-cure-wounds',
    target: { strategy: 'lowestHpAlly' },
  },
  {
    id: 'ruletpl-bless-once',
    name: 'Bless the party (once)',
    condition: { type: 'notConcentrating' },
    actionId: 'act-bless',
    target: { strategy: 'allAllies' },
  },
  {
    id: 'ruletpl-retreat-when-hurt',
    name: 'Retreat when badly hurt (< 25% HP)',
    condition: { type: 'selfHpBelowPct', value: 25 },
    actionId: 'act-move',
    target: { strategy: 'self' },
  },
  {
    id: 'ruletpl-nova-round1',
    name: 'Open with AoE control (round 1)',
    condition: { type: 'roundAtMost', value: 1 },
    actionId: 'act-sleep',
    target: { strategy: 'allEnemies', excludeIncapacitated: true },
  },
  {
    id: 'ruletpl-spend-slots',
    name: 'Cast while a spell slot remains',
    condition: { type: 'slotAvailable' },
    actionId: 'act-magic-missile',
    target: { strategy: 'lowestHpEnemy', excludeIncapacitated: true },
  },
  {
    id: 'ruletpl-gang-up',
    name: 'Pile on when outnumbering (3+ enemies)',
    condition: { type: 'enemyCountAtLeast', value: 3 },
    actionId: 'act-longsword-2x',
    target: { strategy: 'lowestHpEnemy', excludeIncapacitated: true },
  },
  {
    id: 'ruletpl-punish-concentration',
    name: "Break an enemy's concentration",
    condition: { type: 'anyEnemyConcentrating' },
    actionId: 'act-fire-bolt',
    target: { strategy: 'nearestEnemy', excludeIncapacitated: true },
  },
  {
    id: 'ruletpl-fallback-dodge',
    name: 'Fallback: Dodge',
    condition: { type: 'always' },
    actionId: 'act-dodge',
    target: { strategy: 'self' },
  },
];

// ---------------------------------------------------------------------------
// Conditions library — reusable "apply this condition" recipes (kind + duration)
// insertable into any action's on-hit / failed-save condition list.
// ---------------------------------------------------------------------------

export const DEFAULT_CONDITION_LIBRARY: ConditionPreset[] = [
  {
    id: 'condpre-prone-round',
    name: 'Knocked Prone (until start of next turn)',
    kind: 'prone',
    duration: { type: 'rounds', rounds: 1 },
  },
  {
    id: 'condpre-poisoned-1min',
    name: 'Poisoned (1 minute)',
    kind: 'poisoned',
    duration: { type: 'rounds', rounds: 10 },
  },
  {
    id: 'condpre-restrained-save',
    name: 'Restrained (save ends, DC 13 STR)',
    kind: 'restrained',
    duration: { type: 'saveEnds', ability: 'str', dc: 13 },
  },
  {
    id: 'condpre-frightened-save',
    name: 'Frightened (save ends, DC 13 WIS)',
    kind: 'frightened',
    duration: { type: 'saveEnds', ability: 'wis', dc: 13 },
  },
  {
    id: 'condpre-stunned-round',
    name: 'Stunned (1 round)',
    kind: 'stunned',
    duration: { type: 'rounds', rounds: 1 },
  },
  {
    id: 'condpre-paralyzed-save',
    name: 'Paralyzed (save ends, DC 15 CON)',
    kind: 'paralyzed',
    duration: { type: 'saveEnds', ability: 'con', dc: 15 },
  },
  {
    id: 'condpre-blessed-concentration',
    name: 'Blessed (while caster concentrates)',
    kind: 'blessed',
    duration: { type: 'concentration', sourceId: '' },
  },
  {
    id: 'condpre-marked-concentration',
    name: 'Marked (while caster concentrates)',
    kind: 'marked',
    duration: { type: 'concentration', sourceId: '' },
  },
  {
    id: 'condpre-raging-10',
    name: 'Raging (10 rounds)',
    kind: 'raging',
    duration: { type: 'rounds', rounds: 10 },
  },
  {
    id: 'condpre-asleep-10',
    name: 'Asleep (10 rounds, wakes on damage)',
    kind: 'asleep',
    duration: { type: 'rounds', rounds: 10 },
  },
];

// ---------------------------------------------------------------------------
// Sample PCs (level ~3 party)
// ---------------------------------------------------------------------------

export const SAMPLE_PCS: Combatant[] = [
  {
    id: 'pc-cleric',
    name: 'Cleric',
    side: 'pc',
    maxHp: 24,
    ac: 18,
    abilityScores: { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 12 },
    saveProficiencies: ['wis', 'cha'],
    proficiencyBonus: 2,
    spellcastingAbility: 'wis',
    position: defaultPcPosition(0),
    speed: 30,
    level: 3,
    actionIds: ['act-cure-wounds', 'act-bless', 'act-mace'],
    spellSlots: { 1: 4, 2: 2 },
    script: [
      {
        priority: 1,
        label: 'Heal a hurt ally',
        condition: { type: 'anyAllyHpBelowPct', value: 50 },
        actionId: 'act-cure-wounds',
        target: { strategy: 'lowestHpAlly' },
      },
      {
        priority: 2,
        label: 'Bless the party (once)',
        condition: { type: 'notConcentrating' },
        actionId: 'act-bless',
        target: { strategy: 'allAllies' },
      },
      {
        priority: 3,
        label: 'Attack lowest-HP enemy',
        condition: { type: 'always' },
        actionId: 'act-mace',
        target: { strategy: 'lowestHpEnemy' },
      },
    ],
  },
  {
    id: 'pc-fighter',
    name: 'Fighter',
    side: 'pc',
    maxHp: 34,
    ac: 18,
    abilityScores: { str: 16, dex: 12, con: 15, int: 10, wis: 12, cha: 10 },
    saveProficiencies: ['str', 'con'],
    proficiencyBonus: 2,
    position: defaultPcPosition(0),
    speed: 30,
    actionIds: ['act-longsword-2x'],
    spellSlots: {},
    script: [
      {
        priority: 1,
        label: 'Extra Attack — focus orcs, else nearest',
        condition: { type: 'always' },
        actionId: 'act-longsword-2x',
        target: { strategy: 'none', listId: 'tl-orcs-first' },
      },
    ],
  },
  {
    id: 'pc-wizard',
    name: 'Wizard',
    side: 'pc',
    maxHp: 18,
    ac: 12,
    abilityScores: { str: 8, dex: 14, con: 13, int: 16, wis: 11, cha: 10 },
    saveProficiencies: ['int', 'wis'],
    proficiencyBonus: 2,
    spellcastingAbility: 'int',
    position: defaultPcPosition(1),
    speed: 30,
    level: 3,
    actionIds: ['act-sleep', 'act-magic-missile', 'act-fire-bolt'],
    spellSlots: { 1: 4, 2: 2 },
    script: [
      {
        priority: 1,
        label: 'Sleep a clump of enemies (round 1)',
        condition: { type: 'roundAtMost', value: 1 },
        actionId: 'act-sleep',
        target: { strategy: 'allEnemies', excludeIncapacitated: true },
      },
      {
        priority: 2,
        label: 'Magic Missile while slots last',
        condition: { type: 'slotAvailable' },
        actionId: 'act-magic-missile',
        target: { strategy: 'lowestHpEnemy', excludeIncapacitated: true },
      },
      {
        priority: 3,
        label: 'Fire Bolt fallback',
        condition: { type: 'always' },
        actionId: 'act-fire-bolt',
        target: { strategy: 'lowestHpEnemy', excludeIncapacitated: true },
      },
    ],
  },

  {
    id: 'pc-ranger',
    name: 'Ranger',
    side: 'pc',
    maxHp: 28,
    ac: 15,
    abilityScores: { str: 11, dex: 16, con: 14, int: 10, wis: 14, cha: 10 },
    saveProficiencies: ['str', 'dex'],
    proficiencyBonus: 2,
    spellcastingAbility: 'wis',
    position: defaultPcPosition(1),
    speed: 30,
    actionIds: ['act-hunters-mark', 'act-longbow-hunters-mark'],
    featureIds: ['feat-hunters-mark'],
    spellSlots: { 1: 3 },
    script: [
      {
        priority: 1,
        label: 'Mark the healthiest enemy',
        condition: { type: 'notConcentrating' },
        actionId: 'act-hunters-mark',
        target: { strategy: 'highestHpEnemy', excludeIncapacitated: true },
      },
      {
        priority: 2,
        label: 'Shoot the marked target or lowest-HP enemy',
        condition: { type: 'always' },
        actionId: 'act-longbow-hunters-mark',
        target: { strategy: 'lowestHpEnemy', excludeIncapacitated: true },
      },
    ],
  },
  {
    id: 'pc-barbarian',
    name: 'Barbarian',
    side: 'pc',
    maxHp: 35,
    ac: 14,
    abilityScores: { str: 16, dex: 14, con: 15, int: 8, wis: 12, cha: 10 },
    saveProficiencies: ['str', 'con'],
    proficiencyBonus: 2,
    position: defaultPcPosition(0),
    speed: 40,
    actionIds: ['act-rage', 'act-greataxe-rage'],
    featureIds: ['feat-rage-damage'],
    spellSlots: {},
    script: [
      {
        priority: 1,
        label: 'Rage before closing',
        condition: { type: 'roundAtMost', value: 1 },
        actionId: 'act-rage',
        target: { strategy: 'self' },
      },
      {
        priority: 2,
        label: 'Chop the nearest enemy',
        condition: { type: 'always' },
        actionId: 'act-greataxe-rage',
        target: { strategy: 'nearestEnemy', excludeIncapacitated: true },
      },
    ],
  },
  {
    id: 'pc-rogue',
    name: 'Rogue',
    side: 'pc',
    maxHp: 22,
    ac: 15,
    abilityScores: { str: 10, dex: 16, con: 12, int: 12, wis: 13, cha: 14 },
    saveProficiencies: ['dex', 'int'],
    proficiencyBonus: 2,
    position: defaultPcPosition(1),
    speed: 30,
    actionIds: ['act-rogue-shortbow'],
    featureIds: ['feat-sneak-attack'],
    spellSlots: {},
    script: [
      {
        priority: 1,
        label: 'Sneak-attack the nearest enemy',
        condition: { type: 'always' },
        actionId: 'act-rogue-shortbow',
        target: { strategy: 'nearestEnemy', excludeIncapacitated: true },
      },
    ],
  },
];



type LibraryPcSpec = {
  className: string;
  level: number;
  subclass?: string;
  additionalInfo?: string;
  actionIds: string[];
  primaryActionId: string;
  maxHp: number;
  ac: number;
  abilityScores: Combatant['abilityScores'];
  saveProficiencies: Combatant['saveProficiencies'];
  spellcastingAbility?: Combatant['spellcastingAbility'];
  spellSlots?: Combatant['spellSlots'];
  featureIds?: string[];
};

function makeLibraryPc(spec: LibraryPcSpec): Combatant {
  return {
    id: `pc-l${spec.level}-${[spec.subclass, spec.className, spec.additionalInfo].filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: `${spec.subclass ? `${spec.subclass} ` : ''}${spec.className}${spec.additionalInfo ? ` (${spec.additionalInfo})` : ''} Lvl ${spec.level}`,
    side: 'pc',
    maxHp: spec.maxHp,
    ac: spec.ac,
    abilityScores: spec.abilityScores,
    saveProficiencies: spec.saveProficiencies,
    proficiencyBonus: 2,
    spellcastingAbility: spec.spellcastingAbility,
    position: defaultPcPosition(1),
    speed: spec.className === 'Monk' || spec.className === 'Barbarian' ? 40 : 30,
    actionIds: spec.actionIds,
    spellSlots: spec.spellSlots ?? {},
    featureIds: [...(spec.featureIds ?? []), ...['feat-blindness-deafness-blinded', 'feat-hold-person-paralysis', 'feat-web-restrained', 'feat-ice-storm-cold', 'feat-bless-condition', 'feat-sleep-asleep', 'feat-rage-condition', 'feat-hunters-mark-condition', 'feat-ghoul-claws-paralysis']],
    script: [
      {
        priority: 1,
        label: `Use ${spec.primaryActionId} against the nearest enemy`,
        condition: { type: 'always' },
        actionId: spec.primaryActionId,
        target: { strategy: 'nearestEnemy', excludeIncapacitated: true },
      },
    ],
  };
}

export const LEVEL_1_CLASS_PCS: Combatant[] = [
  makeLibraryPc({ className: 'Barbarian', level: 1, maxHp: 14, ac: 14, abilityScores: { str: 16, dex: 14, con: 15, int: 8, wis: 12, cha: 10 }, saveProficiencies: ['str', 'con'], actionIds: ['act-greataxe'], primaryActionId: 'act-greataxe' }),
  makeLibraryPc({ className: 'Bard', level: 1, maxHp: 10, ac: 14, abilityScores: { str: 8, dex: 14, con: 14, int: 12, wis: 10, cha: 16 }, saveProficiencies: ['dex', 'cha'], spellcastingAbility: 'cha', spellSlots: { 1: 2 }, actionIds: ['act-dagger', 'act-thunderwave'], primaryActionId: 'act-thunderwave' }),
  makeLibraryPc({ className: 'Cleric', level: 1, maxHp: 10, ac: 18, abilityScores: { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 12 }, saveProficiencies: ['wis', 'cha'], spellcastingAbility: 'wis', spellSlots: { 1: 2 }, actionIds: ['act-mace', 'act-sacred-flame', 'act-cure-wounds'], primaryActionId: 'act-sacred-flame' }),
  makeLibraryPc({ className: 'Druid', level: 1, maxHp: 10, ac: 14, abilityScores: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 8 }, saveProficiencies: ['int', 'wis'], spellcastingAbility: 'wis', spellSlots: { 1: 2 }, actionIds: ['act-quarterstaff', 'act-poison-spray', 'act-cure-wounds'], primaryActionId: 'act-poison-spray' }),
  makeLibraryPc({ className: 'Fighter', level: 1, maxHp: 12, ac: 18, abilityScores: { str: 16, dex: 12, con: 15, int: 10, wis: 12, cha: 10 }, saveProficiencies: ['str', 'con'], actionIds: ['act-longsword'], primaryActionId: 'act-longsword' }),
  makeLibraryPc({ className: 'Monk', level: 1, maxHp: 10, ac: 15, abilityScores: { str: 12, dex: 16, con: 14, int: 10, wis: 14, cha: 8 }, saveProficiencies: ['str', 'dex'], actionIds: ['act-quarterstaff'], primaryActionId: 'act-quarterstaff' }),
  makeLibraryPc({ className: 'Paladin', level: 1, maxHp: 12, ac: 18, abilityScores: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 }, saveProficiencies: ['wis', 'cha'], actionIds: ['act-longsword'], primaryActionId: 'act-longsword' }),
  makeLibraryPc({ className: 'Ranger', level: 1, maxHp: 12, ac: 15, abilityScores: { str: 11, dex: 16, con: 14, int: 10, wis: 14, cha: 10 }, saveProficiencies: ['str', 'dex'], actionIds: ['act-longbow'], primaryActionId: 'act-longbow' }),
  makeLibraryPc({ className: 'Rogue', level: 1, maxHp: 10, ac: 15, abilityScores: { str: 10, dex: 16, con: 12, int: 12, wis: 13, cha: 14 }, saveProficiencies: ['dex', 'int'], actionIds: ['act-shortbow'], primaryActionId: 'act-shortbow' }),
  makeLibraryPc({ className: 'Sorcerer', level: 1, maxHp: 8, ac: 12, abilityScores: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 16 }, saveProficiencies: ['con', 'cha'], spellcastingAbility: 'cha', spellSlots: { 1: 2 }, actionIds: ['act-fire-bolt', 'act-burning-hands'], primaryActionId: 'act-fire-bolt' }),
  makeLibraryPc({ className: 'Warlock', level: 1, maxHp: 10, ac: 13, abilityScores: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 16 }, saveProficiencies: ['wis', 'cha'], spellcastingAbility: 'cha', spellSlots: { 1: 1 }, actionIds: ['act-fire-bolt', 'act-hellish-rebuke'], primaryActionId: 'act-fire-bolt' }),
  makeLibraryPc({ className: 'Wizard', level: 1, maxHp: 8, ac: 12, abilityScores: { str: 8, dex: 14, con: 13, int: 16, wis: 11, cha: 10 }, saveProficiencies: ['int', 'wis'], spellcastingAbility: 'int', spellSlots: { 1: 2 }, actionIds: ['act-fire-bolt', 'act-magic-missile'], primaryActionId: 'act-fire-bolt' }),
];

export const LEVEL_3_CLASS_PCS: Combatant[] = [
  makeLibraryPc({ className: 'Barbarian', subclass: 'Berserker', level: 3, featureIds: ['feat-rage-damage'], maxHp: 35, ac: 14, abilityScores: { str: 16, dex: 14, con: 15, int: 8, wis: 12, cha: 10 }, saveProficiencies: ['str', 'con'], actionIds: ['act-rage', 'act-greataxe-rage'], primaryActionId: 'act-greataxe-rage' }),
  makeLibraryPc({ className: 'Bard', subclass: 'College of Lore', level: 3, maxHp: 24, ac: 14, abilityScores: { str: 8, dex: 14, con: 14, int: 12, wis: 10, cha: 16 }, saveProficiencies: ['dex', 'cha'], spellcastingAbility: 'cha', spellSlots: { 1: 4, 2: 2 }, actionIds: ['act-dagger', 'act-thunderwave', 'act-shatter'], primaryActionId: 'act-shatter' }),
  makeLibraryPc({ className: 'Cleric', subclass: 'Life Domain', level: 3, maxHp: 24, ac: 18, abilityScores: { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 12 }, saveProficiencies: ['wis', 'cha'], spellcastingAbility: 'wis', spellSlots: { 1: 4, 2: 2 }, actionIds: ['act-mace', 'act-sacred-flame', 'act-cure-wounds', 'act-guiding-bolt'], primaryActionId: 'act-guiding-bolt' }),
  makeLibraryPc({ className: 'Druid', subclass: 'Circle of the Moon', level: 3, maxHp: 24, ac: 14, abilityScores: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 8 }, saveProficiencies: ['int', 'wis'], spellcastingAbility: 'wis', spellSlots: { 1: 4, 2: 2 }, actionIds: ['act-quarterstaff', 'act-moonbeam', 'act-cure-wounds'], primaryActionId: 'act-moonbeam' }),
  makeLibraryPc({ className: 'Fighter', subclass: 'Battlemaster', additionalInfo: 'Sword and Board', level: 3, maxHp: 31, ac: 18, abilityScores: { str: 16, dex: 12, con: 15, int: 10, wis: 12, cha: 10 }, saveProficiencies: ['str', 'con'], actionIds: ['act-longsword', 'act-heavy-crossbow'], primaryActionId: 'act-longsword' }),
  makeLibraryPc({ className: 'Monk', subclass: 'Way of the Open Hand', level: 3, maxHp: 24, ac: 15, abilityScores: { str: 12, dex: 16, con: 14, int: 10, wis: 14, cha: 8 }, saveProficiencies: ['str', 'dex'], actionIds: ['act-quarterstaff', 'act-dart'], primaryActionId: 'act-quarterstaff' }),
  makeLibraryPc({ className: 'Paladin', subclass: 'Oath of Devotion', level: 3, maxHp: 28, ac: 18, abilityScores: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 }, saveProficiencies: ['wis', 'cha'], spellcastingAbility: 'cha', spellSlots: { 1: 3 }, actionIds: ['act-longsword', 'act-javelin'], primaryActionId: 'act-longsword' }),
  makeLibraryPc({ className: 'Ranger', subclass: 'Hunter', additionalInfo: 'Archer', level: 3, featureIds: ['feat-hunters-mark'], maxHp: 28, ac: 15, abilityScores: { str: 11, dex: 16, con: 14, int: 10, wis: 14, cha: 10 }, saveProficiencies: ['str', 'dex'], spellcastingAbility: 'wis', spellSlots: { 1: 3 }, actionIds: ['act-hunters-mark', 'act-longbow-hunters-mark'], primaryActionId: 'act-longbow-hunters-mark' }),
  makeLibraryPc({ className: 'Rogue', subclass: 'Thief', additionalInfo: 'Archer', level: 3, featureIds: ['feat-sneak-attack'], maxHp: 22, ac: 15, abilityScores: { str: 10, dex: 16, con: 12, int: 12, wis: 13, cha: 14 }, saveProficiencies: ['dex', 'int'], actionIds: ['act-rogue-shortbow'], primaryActionId: 'act-rogue-shortbow' }),
  makeLibraryPc({ className: 'Sorcerer', subclass: 'Draconic Bloodline', level: 3, maxHp: 20, ac: 12, abilityScores: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 16 }, saveProficiencies: ['con', 'cha'], spellcastingAbility: 'cha', spellSlots: { 1: 4, 2: 2 }, actionIds: ['act-fire-bolt', 'act-scorching-ray', 'act-shatter'], primaryActionId: 'act-scorching-ray' }),
  makeLibraryPc({ className: 'Warlock', subclass: 'Fiend Patron', level: 3, maxHp: 24, ac: 13, abilityScores: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 16 }, saveProficiencies: ['wis', 'cha'], spellcastingAbility: 'cha', spellSlots: { 2: 2 }, actionIds: ['act-fire-bolt', 'act-hellish-rebuke', 'act-shatter'], primaryActionId: 'act-shatter' }),
  makeLibraryPc({ className: 'Wizard', subclass: 'Evocation', level: 3, maxHp: 18, ac: 12, abilityScores: { str: 8, dex: 14, con: 13, int: 16, wis: 11, cha: 10 }, saveProficiencies: ['int', 'wis'], spellcastingAbility: 'int', spellSlots: { 1: 4, 2: 2 }, actionIds: ['act-fire-bolt', 'act-magic-missile', 'act-scorching-ray'], primaryActionId: 'act-scorching-ray' }),
];

// ---------------------------------------------------------------------------
// Sample monsters
// ---------------------------------------------------------------------------

export function makeGoblin(id: string, name: string, position = defaultMonsterPosition(0)): Combatant {
  return {
    id,
    name,
    side: 'monster',
    maxHp: 7,
    ac: 15,
    abilityScores: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    saveProficiencies: [],
    proficiencyBonus: 2,
    position,
    speed: 30,
    actionIds: ['act-scimitar'],
    featureIds: ['feat-blindness-deafness-blinded', 'feat-hold-person-paralysis', 'feat-web-restrained', 'feat-ice-storm-cold', 'feat-bless-condition', 'feat-sleep-asleep', 'feat-rage-condition', 'feat-hunters-mark-condition', 'feat-ghoul-claws-paralysis'],
    spellSlots: {},
    script: [
      {
        priority: 1,
        label: 'Attack the nearest PC',
        condition: { type: 'always' },
        actionId: 'act-scimitar',
        target: { strategy: 'nearestEnemy' },
      },
    ],
  };
}

export function makeOrc(id: string, name: string, position = defaultMonsterPosition(1)): Combatant {
  return {
    id,
    name,
    side: 'monster',
    maxHp: 15,
    ac: 13,
    abilityScores: { str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10 },
    saveProficiencies: ['str'],
    proficiencyBonus: 2,
    position,
    speed: 30,
    actionIds: ['act-longsword'],
    featureIds: ['feat-blindness-deafness-blinded', 'feat-hold-person-paralysis', 'feat-web-restrained', 'feat-ice-storm-cold', 'feat-bless-condition', 'feat-sleep-asleep', 'feat-rage-condition', 'feat-hunters-mark-condition', 'feat-ghoul-claws-paralysis'],
    spellSlots: {},
    script: [
      {
        priority: 1,
        label: 'Attack the nearest PC',
        condition: { type: 'always' },
        actionId: 'act-longsword',
        target: { strategy: 'nearestEnemy' },
      },
    ],
  };
}


export function makeSkeleton(id: string, name: string, position = defaultMonsterPosition(2)): Combatant {
  return {
    id,
    name,
    side: 'monster',
    maxHp: 13,
    ac: 13,
    abilityScores: { str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5 },
    saveProficiencies: [],
    proficiencyBonus: 2,
    position,
    speed: 30,
    vulnerabilities: ['bludgeoning'],
    immunities: ['poison'],
    conditionImmunities: ['poisoned'],
    actionIds: ['act-shortbow', 'act-shortsword'],
    featureIds: ['feat-blindness-deafness-blinded', 'feat-hold-person-paralysis', 'feat-web-restrained', 'feat-ice-storm-cold', 'feat-bless-condition', 'feat-sleep-asleep', 'feat-rage-condition', 'feat-hunters-mark-condition', 'feat-ghoul-claws-paralysis'],
    spellSlots: {},
    script: [
      {
        priority: 1,
        label: 'Shoot the lowest-HP PC',
        condition: { type: 'always' },
        actionId: 'act-shortbow',
        target: { strategy: 'lowestHpEnemy', excludeIncapacitated: true },
      },
    ],
  };
}

export function makeWolf(id: string, name: string, position = defaultMonsterPosition(1)): Combatant {
  return {
    id,
    name,
    side: 'monster',
    maxHp: 11,
    ac: 13,
    abilityScores: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
    saveProficiencies: [],
    proficiencyBonus: 2,
    position,
    speed: 40,
    actionIds: ['act-bite'],
    featureIds: ['feat-blindness-deafness-blinded', 'feat-hold-person-paralysis', 'feat-web-restrained', 'feat-ice-storm-cold', 'feat-bless-condition', 'feat-sleep-asleep', 'feat-rage-condition', 'feat-hunters-mark-condition', 'feat-ghoul-claws-paralysis'],
    spellSlots: {},
    script: [
      {
        priority: 1,
        label: 'Bite the nearest PC',
        condition: { type: 'always' },
        actionId: 'act-bite',
        target: { strategy: 'nearestEnemy', excludeIncapacitated: true },
      },
    ],
  };
}

export function makeOgre(id: string, name: string, position = defaultMonsterPosition(2)): Combatant {
  return {
    id,
    name,
    side: 'monster',
    maxHp: 59,
    ac: 11,
    abilityScores: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 },
    saveProficiencies: [],
    proficiencyBonus: 2,
    position,
    speed: 40,
    actionIds: ['act-ogre-greatclub', 'act-javelin'],
    featureIds: ['feat-blindness-deafness-blinded', 'feat-hold-person-paralysis', 'feat-web-restrained', 'feat-ice-storm-cold', 'feat-bless-condition', 'feat-sleep-asleep', 'feat-rage-condition', 'feat-hunters-mark-condition', 'feat-ghoul-claws-paralysis'],
    spellSlots: {},
    script: [
      {
        priority: 1,
        label: 'Club the nearest PC',
        condition: { type: 'always' },
        actionId: 'act-ogre-greatclub',
        target: { strategy: 'nearestEnemy', excludeIncapacitated: true },
      },
    ],
  };
}



type LibraryMonsterSpec = {
  id: string;
  name: string;
  maxHp: number;
  ac: number;
  abilityScores: Combatant['abilityScores'];
  actionIds: string[];
  primaryActionId: string;
  spellcastingAbility?: Combatant['spellcastingAbility'];
  spellSlots?: Combatant['spellSlots'];
  saveProficiencies?: Combatant['saveProficiencies'];
  position?: number;
  speed?: number;
  resistances?: Combatant['resistances'];
  immunities?: Combatant['immunities'];
  vulnerabilities?: Combatant['vulnerabilities'];
  conditionImmunities?: Combatant['conditionImmunities'];
  featureIds?: string[];
};

function makeLibraryMonster(spec: LibraryMonsterSpec): Combatant {
  return {
    id: spec.id,
    name: spec.name,
    side: 'monster',
    maxHp: spec.maxHp,
    ac: spec.ac,
    abilityScores: spec.abilityScores,
    saveProficiencies: spec.saveProficiencies ?? [],
    proficiencyBonus: 2,
    position: spec.position ?? defaultMonsterPosition(0),
    spellcastingAbility: spec.spellcastingAbility,
    speed: spec.speed ?? 30,
    actionIds: spec.actionIds,
    spellSlots: spec.spellSlots ?? {},
    resistances: spec.resistances,
    immunities: spec.immunities,
    vulnerabilities: spec.vulnerabilities,
    conditionImmunities: spec.conditionImmunities,
    featureIds: [...(spec.featureIds ?? []), ...['feat-blindness-deafness-blinded', 'feat-hold-person-paralysis', 'feat-web-restrained', 'feat-ice-storm-cold', 'feat-bless-condition', 'feat-sleep-asleep', 'feat-rage-condition', 'feat-hunters-mark-condition', 'feat-ghoul-claws-paralysis']],
    script: [
      {
        priority: 1,
        label: `Use ${spec.primaryActionId} against the nearest PC`,
        condition: { type: 'always' },
        actionId: spec.primaryActionId,
        target: { strategy: 'nearestEnemy', excludeIncapacitated: true },
      },
    ],
  };
}

export const SAMPLE_MONSTERS: Combatant[] = [
  makeGoblin('lib-goblin', 'Goblin'),
  makeOrc('lib-orc', 'Orc'),
  makeSkeleton('lib-skeleton', 'Skeleton'),
  makeWolf('lib-wolf', 'Wolf'),
  makeOgre('lib-ogre', 'Ogre'),
  makeLibraryMonster({ id: 'lib-bandit', name: 'Bandit', maxHp: 11, ac: 12, abilityScores: { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 }, actionIds: ['act-scimitar', 'act-light-crossbow'], primaryActionId: 'act-scimitar' }),
  makeLibraryMonster({ id: 'lib-cultist', name: 'Cultist', maxHp: 9, ac: 12, abilityScores: { str: 11, dex: 12, con: 10, int: 10, wis: 11, cha: 10 }, actionIds: ['act-scimitar'], primaryActionId: 'act-scimitar' }),
  makeLibraryMonster({ id: 'lib-kobold', name: 'Kobold', maxHp: 5, ac: 12, abilityScores: { str: 7, dex: 15, con: 9, int: 8, wis: 7, cha: 8 }, actionIds: ['act-dagger', 'act-sling'], primaryActionId: 'act-sling' }),
  makeLibraryMonster({ id: 'lib-zombie', name: 'Zombie', maxHp: 22, ac: 8, abilityScores: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 }, actionIds: ['act-club'], primaryActionId: 'act-club', immunities: ['poison'], conditionImmunities: ['poisoned'] }),
  makeLibraryMonster({ id: 'lib-giant-rat', name: 'Giant Rat', maxHp: 7, ac: 12, abilityScores: { str: 7, dex: 15, con: 11, int: 2, wis: 10, cha: 4 }, actionIds: ['act-bite'], primaryActionId: 'act-bite' }),
  makeLibraryMonster({ id: 'lib-giant-bat', name: 'Giant Bat', maxHp: 22, ac: 13, abilityScores: { str: 15, dex: 16, con: 11, int: 2, wis: 12, cha: 6 }, actionIds: ['act-bite'], primaryActionId: 'act-bite', speed: 60 }),
  makeLibraryMonster({ id: 'lib-boar', name: 'Boar', maxHp: 11, ac: 11, abilityScores: { str: 13, dex: 11, con: 12, int: 2, wis: 9, cha: 5 }, actionIds: ['act-bite'], primaryActionId: 'act-bite', speed: 40 }),
  makeLibraryMonster({ id: 'lib-black-bear', name: 'Black Bear', maxHp: 19, ac: 11, abilityScores: { str: 15, dex: 10, con: 14, int: 2, wis: 12, cha: 7 }, actionIds: ['act-claw-2x', 'act-bite'], primaryActionId: 'act-claw-2x', speed: 40 }),
  makeLibraryMonster({ id: 'lib-panther', name: 'Panther', maxHp: 13, ac: 12, abilityScores: { str: 14, dex: 15, con: 10, int: 3, wis: 14, cha: 7 }, actionIds: ['act-claw', 'act-bite'], primaryActionId: 'act-claw', speed: 50 }),
  makeLibraryMonster({ id: 'lib-giant-spider', name: 'Giant Spider', maxHp: 26, ac: 14, abilityScores: { str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4 }, actionIds: ['act-bite'], primaryActionId: 'act-bite' }),
  makeLibraryMonster({ id: 'lib-gnoll', name: 'Gnoll', maxHp: 22, ac: 15, abilityScores: { str: 14, dex: 12, con: 11, int: 6, wis: 10, cha: 7 }, actionIds: ['act-spear', 'act-longbow'], primaryActionId: 'act-spear' }),
  makeLibraryMonster({ id: 'lib-hobgoblin', name: 'Hobgoblin', maxHp: 11, ac: 18, abilityScores: { str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 9 }, actionIds: ['act-longsword', 'act-longbow'], primaryActionId: 'act-longsword' }),
  makeLibraryMonster({ id: 'lib-bugbear', name: 'Bugbear', maxHp: 27, ac: 16, abilityScores: { str: 15, dex: 14, con: 13, int: 8, wis: 11, cha: 9 }, actionIds: ['act-morningstar', 'act-javelin'], primaryActionId: 'act-morningstar' }),
  makeLibraryMonster({ id: 'lib-lizardfolk', name: 'Lizardfolk', maxHp: 22, ac: 15, abilityScores: { str: 15, dex: 10, con: 13, int: 7, wis: 12, cha: 7 }, actionIds: ['act-bite', 'act-club', 'act-javelin'], primaryActionId: 'act-bite' }),
  makeLibraryMonster({ id: 'lib-scout', name: 'Scout', maxHp: 16, ac: 13, abilityScores: { str: 11, dex: 14, con: 12, int: 11, wis: 13, cha: 11 }, actionIds: ['act-shortsword', 'act-longbow'], primaryActionId: 'act-longbow' }),
  makeLibraryMonster({ id: 'lib-thug', name: 'Thug', maxHp: 32, ac: 11, abilityScores: { str: 15, dex: 11, con: 14, int: 10, wis: 10, cha: 11 }, actionIds: ['act-mace', 'act-heavy-crossbow'], primaryActionId: 'act-mace' }),
  makeLibraryMonster({ id: 'lib-ape', name: 'Ape', maxHp: 19, ac: 12, abilityScores: { str: 16, dex: 14, con: 14, int: 6, wis: 12, cha: 7 }, actionIds: ['act-club'], primaryActionId: 'act-club', speed: 30 }),
  makeLibraryMonster({ id: 'lib-dire-wolf', name: 'Dire Wolf', maxHp: 37, ac: 14, abilityScores: { str: 17, dex: 15, con: 15, int: 3, wis: 12, cha: 7 }, actionIds: ['act-bite'], primaryActionId: 'act-bite', speed: 50 }),
  makeLibraryMonster({ id: 'lib-ghoul', name: 'Ghoul', maxHp: 22, ac: 12, abilityScores: { str: 13, dex: 15, con: 10, int: 7, wis: 10, cha: 6 }, actionIds: ['act-ghoul-claws', 'act-bite'], primaryActionId: 'act-ghoul-claws', immunities: ['poison'], conditionImmunities: ['poisoned', 'charmed'] }),
  makeLibraryMonster({ id: 'lib-acolyte', name: 'Acolyte', maxHp: 9, ac: 10, abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 14, cha: 11 }, actionIds: ['act-sacred-flame', 'act-cure-wounds', 'act-bless', 'act-club'], primaryActionId: 'act-sacred-flame', spellcastingAbility: 'wis', spellSlots: { 1: 3 } }),
  makeLibraryMonster({ id: 'lib-guard', name: 'Guard', maxHp: 11, ac: 16, abilityScores: { str: 13, dex: 12, con: 12, int: 10, wis: 11, cha: 10 }, actionIds: ['act-spear', 'act-light-crossbow'], primaryActionId: 'act-spear' }),
  makeLibraryMonster({ id: 'lib-tribal-warrior', name: 'Tribal Warrior', maxHp: 11, ac: 12, abilityScores: { str: 13, dex: 11, con: 12, int: 8, wis: 11, cha: 8 }, actionIds: ['act-spear'], primaryActionId: 'act-spear' }),
  makeLibraryMonster({ id: 'lib-noble', name: 'Noble', maxHp: 9, ac: 15, abilityScores: { str: 11, dex: 12, con: 11, int: 12, wis: 14, cha: 16 }, actionIds: ['act-rapier'], primaryActionId: 'act-rapier' }),
  makeLibraryMonster({ id: 'lib-veteran', name: 'Veteran', maxHp: 58, ac: 17, abilityScores: { str: 16, dex: 13, con: 14, int: 10, wis: 11, cha: 10 }, actionIds: ['act-longsword-2x', 'act-heavy-crossbow'], primaryActionId: 'act-longsword-2x' }),
  makeLibraryMonster({ id: 'lib-berserker', name: 'Berserker', maxHp: 67, ac: 13, abilityScores: { str: 16, dex: 12, con: 17, int: 9, wis: 11, cha: 9 }, actionIds: ['act-greataxe'], primaryActionId: 'act-greataxe', speed: 30 }),
  makeLibraryMonster({ id: 'lib-giant-eagle', name: 'Giant Eagle', maxHp: 26, ac: 13, abilityScores: { str: 16, dex: 17, con: 13, int: 8, wis: 14, cha: 10 }, actionIds: ['act-claw', 'act-bite'], primaryActionId: 'act-claw', speed: 80 }),
  makeLibraryMonster({ id: 'lib-giant-scorpion', name: 'Giant Scorpion', maxHp: 52, ac: 15, abilityScores: { str: 15, dex: 13, con: 15, int: 1, wis: 9, cha: 3 }, actionIds: ['act-claw-2x'], primaryActionId: 'act-claw-2x', speed: 40 }),
];

// ---------------------------------------------------------------------------
// Default scenario
// ---------------------------------------------------------------------------

export function defaultScenario(): Scenario {
  const monsters = [
    makeGoblin('m-gob1', 'Goblin 1'),
    makeGoblin('m-gob2', 'Goblin 2'),
    makeGoblin('m-gob3', 'Goblin 3'),
    makeOrc('m-orc1', 'Orc 1'),
    makeOrc('m-orc2', 'Orc 2'),
    makeSkeleton('m-skel1', 'Skeleton 1'),
    makeWolf('m-wolf1', 'Wolf 1'),
    makeOgre('m-ogre1', 'Ogre 1'),
  ];
  return {
    name: 'Party of 6 vs Goblins, Orcs, Skeleton, Wolf & Ogre',
    combatants: [...SAMPLE_PCS, ...monsters],
    actions: SRD_ACTIONS,
    weapons: SRD_WEAPONS,
    features: SRD_FEATURES,
    targetLists: [
      // reusable list referenced by the fighter: focus the orcs, then nearest enemy
      { id: 'tl-orcs-first', name: 'Orcs first', entries: ['m-orc1', 'm-orc2'], fallback: 'nearestEnemy' },
    ],
    ruleLibrary: DEFAULT_RULE_LIBRARY,
    conditionLibrary: DEFAULT_CONDITION_LIBRARY,
    initiativeMode: 'rolled',
    encounterDistance: DEFAULT_ENCOUNTER_DISTANCE,
    maxRounds: 30,
  };
}
