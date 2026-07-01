// Condition catalog and mechanical hooks.

import type { Ability, ConditionInstance, ConditionKind } from './types';
import type { Advantage } from './dice';

export interface ConditionMeta {
  kind: ConditionKind;
  label: string;
  /** cannot take actions on its turn. */
  incapacitated: boolean;
  /** attacks made BY this combatant get this advantage state. */
  attackByAdvantage?: Advantage;
  /** attacks made AGAINST this combatant get this advantage state. */
  attackAgainstAdvantage?: Advantage;
  /** automatically fails saving throws of these abilities. */
  autoFailSaves?: Ability[];
  /** halves bludgeoning/piercing/slashing damage taken (Rage). */
  resistPhysical?: boolean;
  description: string;
}

export const CONDITION_CATALOG: Record<ConditionKind, ConditionMeta> = {
  prone: {
    kind: 'prone',
    label: 'Prone',
    incapacitated: false,
    attackByAdvantage: 'disadvantage',
    // melee attackers have advantage; abstracting to "against has advantage"
    attackAgainstAdvantage: 'advantage',
    description: 'Disadvantage on attacks; attacks against (melee) have advantage.',
  },
  poisoned: {
    kind: 'poisoned',
    label: 'Poisoned',
    incapacitated: false,
    attackByAdvantage: 'disadvantage',
    description: 'Disadvantage on attack rolls and ability checks.',
  },
  asleep: {
    kind: 'asleep',
    label: 'Asleep',
    incapacitated: true,
    attackAgainstAdvantage: 'advantage',
    autoFailSaves: ['str', 'dex'],
    description: 'Unconscious from sleep: incapacitated, attacks against have advantage.',
  },
  unconscious: {
    kind: 'unconscious',
    label: 'Unconscious',
    incapacitated: true,
    attackAgainstAdvantage: 'advantage',
    autoFailSaves: ['str', 'dex'],
    description: 'Incapacitated; attacks against have advantage and crit if within 5ft.',
  },
  blinded: {
    kind: 'blinded',
    label: 'Blinded',
    incapacitated: false,
    attackByAdvantage: 'disadvantage',
    attackAgainstAdvantage: 'advantage',
    description: 'Disadvantage on attacks; attacks against have advantage.',
  },
  restrained: {
    kind: 'restrained',
    label: 'Restrained',
    incapacitated: false,
    attackByAdvantage: 'disadvantage',
    attackAgainstAdvantage: 'advantage',
    autoFailSaves: [],
    description: 'Disadvantage on attacks and Dex saves; attacks against have advantage.',
  },
  stunned: {
    kind: 'stunned',
    label: 'Stunned',
    incapacitated: true,
    attackAgainstAdvantage: 'advantage',
    autoFailSaves: ['str', 'dex'],
    description: 'Incapacitated; attacks against have advantage; auto-fail Str/Dex saves.',
  },
  paralyzed: {
    kind: 'paralyzed',
    label: 'Paralyzed',
    incapacitated: true,
    attackAgainstAdvantage: 'advantage',
    autoFailSaves: ['str', 'dex'],
    description: 'Incapacitated; auto-fail Str/Dex saves; attacks against have advantage.',
  },
  frightened: {
    kind: 'frightened',
    label: 'Frightened',
    incapacitated: false,
    attackByAdvantage: 'disadvantage',
    description: 'Disadvantage on attack rolls while the source is in sight.',
  },
  blessed: {
    kind: 'blessed',
    label: 'Blessed',
    incapacitated: false,
    description: '+1d4 to attack rolls and saving throws.',
  },
  dodging: {
    kind: 'dodging',
    label: 'Dodging',
    incapacitated: false,
    attackAgainstAdvantage: 'disadvantage',
    description: 'Attacks against have disadvantage; advantage on Dex saves.',
  },
  raging: {
    kind: 'raging',
    label: 'Raging',
    incapacitated: false,
    resistPhysical: true,
    description: 'Resistance to bludgeoning/piercing/slashing; bonus melee damage.',
  },
  marked: {
    kind: 'marked',
    label: 'Marked',
    incapacitated: false,
    description: "Hunter's Mark / Hex: attackers deal bonus dice against this target.",
  },
};

/** Every condition kind, derived from the catalog so UI pickers can't drift out of sync with it. */
export const CONDITION_KINDS = Object.keys(CONDITION_CATALOG) as ConditionKind[];

/** Whether the combatant resists physical damage (e.g. while raging). */
export function resistsPhysical(conditions: ConditionInstance[]): boolean {
  return conditions.some((c) => CONDITION_CATALOG[c.kind].resistPhysical);
}

/** Whether a set of conditions renders a combatant unable to act. */
export function isIncapacitated(conditions: ConditionInstance[]): boolean {
  return conditions.some((c) => CONDITION_CATALOG[c.kind].incapacitated);
}

/** Whether the combatant currently has the 'blessed' condition (for the +1d4 bonus). */
export function isBlessed(conditions: ConditionInstance[]): boolean {
  return conditions.some((c) => c.kind === 'blessed');
}

export function hasCondition(conditions: ConditionInstance[], kind: ConditionKind): boolean {
  return conditions.some((c) => c.kind === kind);
}
