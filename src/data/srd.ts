// Curated SRD-flavored content: a reusable action library, sample PCs and monsters,
// and a default scenario that demonstrates scripting (priorities, conditions, targets).

import type { Action, Combatant, Scenario } from '../engine/types';

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
  note: 'Abstract movement; uses the whole turn for now.',
};

export const SRD_ACTIONS: Action[] = [
  ACTION_DODGE,
  ACTION_MOVE,
  {
    id: 'act-mace',
    name: 'Mace',
    kind: 'attack',
    targets: 1,
    attackBonus: 4,
    attackCount: 1,
    damage: '1d6+2',
    damageType: 'bludgeoning',
  },
  {
    id: 'act-longsword',
    name: 'Longsword',
    kind: 'attack',
    targets: 1,
    attackBonus: 5,
    attackCount: 1,
    damage: '1d8+3',
    damageType: 'slashing',
  },
  {
    id: 'act-longsword-2x',
    name: 'Longsword (Extra Attack)',
    kind: 'attack',
    targets: 1,
    attackBonus: 5,
    attackCount: 2,
    damage: '1d8+3',
    damageType: 'slashing',
    note: 'Two longsword attacks against one target (Extra Attack).',
  },
  {
    id: 'act-shortbow',
    name: 'Shortbow',
    kind: 'attack',
    targets: 1,
    attackBonus: 5,
    attackCount: 1,
    damage: '1d6+3',
    damageType: 'piercing',
  },
  {
    id: 'act-scimitar',
    name: 'Scimitar',
    kind: 'attack',
    targets: 1,
    attackBonus: 4,
    attackCount: 1,
    damage: '1d6+2',
    damageType: 'slashing',
  },
  // --- spells ---
  {
    id: 'act-cure-wounds',
    name: 'Cure Wounds (L1)',
    kind: 'spell',
    targets: 1,
    spellLevel: 1,
    heal: '1d8+3',
    note: 'Heal a single ally (lowest HP by default).',
  },
  {
    id: 'act-bless',
    name: 'Bless',
    kind: 'spell',
    targets: 3,
    spellLevel: 1,
    concentration: true,
    applyConditions: [{ kind: 'blessed', duration: { type: 'concentration', sourceId: '' } }],
    note: 'Up to 3 allies gain +1d4 to attacks and saves while you concentrate.',
  },
  {
    id: 'act-sleep',
    name: 'Sleep (L1)',
    kind: 'spell',
    targets: 3,
    spellLevel: 1,
    save: { ability: 'wis', dc: 13, onSuccess: 'none' },
    applyConditions: [{ kind: 'asleep', duration: { type: 'rounds', rounds: 10 } }],
    note: 'Targets fall asleep on a failed save (abstracted; wakes when damaged).',
  },
  {
    id: 'act-magic-missile',
    name: 'Magic Missile (L1)',
    kind: 'spell',
    targets: 1,
    spellLevel: 1,
    damage: '3d4+3',
    damageType: 'force',
    note: 'Auto-hits for 3 darts (3d4+3 to one target).',
  },
  {
    id: 'act-fire-bolt',
    name: 'Fire Bolt (cantrip)',
    kind: 'spell',
    targets: 1,
    attackBonus: 6,
    damage: '1d10',
    damageType: 'fire',
    note: 'Cantrip spell attack — no slot cost.',
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
    actionIds: ['act-cure-wounds', 'act-bless', 'act-mace'],
    spellSlots: { 1: 4 },
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
    actionIds: ['act-longsword-2x'],
    spellSlots: {},
    script: [
      {
        priority: 1,
        label: 'Extra Attack on priority target',
        condition: { type: 'always' },
        actionId: 'act-longsword-2x',
        target: { strategy: 'namedThenLowestHpEnemy' },
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
    actionIds: ['act-sleep', 'act-magic-missile', 'act-fire-bolt'],
    spellSlots: { 1: 4 },
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
    id: 'pc-rogue',
    name: 'Rogue',
    side: 'pc',
    maxHp: 22,
    ac: 15,
    abilityScores: { str: 10, dex: 16, con: 12, int: 12, wis: 13, cha: 14 },
    saveProficiencies: ['dex', 'int'],
    proficiencyBonus: 2,
    actionIds: ['act-shortbow'],
    spellSlots: {},
    script: [
      {
        priority: 1,
        label: 'Shoot lowest-HP enemy',
        condition: { type: 'always' },
        actionId: 'act-shortbow',
        target: { strategy: 'lowestHpEnemy', excludeIncapacitated: true },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Sample monsters
// ---------------------------------------------------------------------------

export function makeGoblin(id: string, name: string): Combatant {
  return {
    id,
    name,
    side: 'monster',
    maxHp: 7,
    ac: 15,
    abilityScores: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    saveProficiencies: [],
    proficiencyBonus: 2,
    actionIds: ['act-scimitar'],
    spellSlots: {},
    script: [
      {
        priority: 1,
        label: 'Attack lowest-HP PC',
        condition: { type: 'always' },
        actionId: 'act-scimitar',
        target: { strategy: 'lowestHpEnemy' },
      },
    ],
  };
}

export function makeOrc(id: string, name: string): Combatant {
  return {
    id,
    name,
    side: 'monster',
    maxHp: 15,
    ac: 13,
    abilityScores: { str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10 },
    saveProficiencies: ['str'],
    proficiencyBonus: 2,
    actionIds: ['act-longsword'],
    spellSlots: {},
    script: [
      {
        priority: 1,
        label: 'Greataxe the lowest-HP PC',
        condition: { type: 'always' },
        actionId: 'act-longsword',
        target: { strategy: 'lowestHpEnemy' },
      },
    ],
  };
}

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
  ];
  // give the fighter a named priority target
  const pcs = SAMPLE_PCS.map((p) =>
    p.id === 'pc-fighter' ? { ...p, defaultTargets: ['m-orc1', 'm-orc2'] } : p,
  );
  return {
    name: 'Party of 4 vs 3 Goblins & 2 Orcs',
    combatants: [...pcs, ...monsters],
    actions: SRD_ACTIONS,
    initiativeMode: 'rolled',
    maxRounds: 30,
  };
}
