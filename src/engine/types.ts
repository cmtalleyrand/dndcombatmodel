// Core data model for the D&D 5e combat simulator engine.
// Everything here is plain data (serializable) so scenarios can be saved/loaded as JSON.

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export type AbilityScores = Record<Ability, number>;

export type Side = 'pc' | 'monster';

/** A condition that can be attached to a combatant during combat. */
export type ConditionKind =
  | 'prone'
  | 'poisoned'
  | 'asleep' // unconscious from sleep; incapacitated, attacks against have advantage
  | 'unconscious'
  | 'blinded'
  | 'restrained'
  | 'stunned'
  | 'paralyzed'
  | 'frightened'
  | 'blessed' // +1d4 to attacks & saves
  | 'dodging'; // attacks against have disadvantage

/** How a condition's lifetime is governed. */
export type DurationKind =
  | { type: 'rounds'; rounds: number } // expires after N of the bearer's turns
  | { type: 'saveEnds'; ability: Ability; dc: number } // save at end of turn to end
  | { type: 'concentration'; sourceId: string } // ends when source stops concentrating
  | { type: 'permanent' };

export interface ConditionInstance {
  kind: ConditionKind;
  duration: DurationKind;
  /** Combatant id that applied this condition (for concentration linkage / stats). */
  sourceId?: string;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type DamageType =
  | 'bludgeoning'
  | 'piercing'
  | 'slashing'
  | 'fire'
  | 'cold'
  | 'lightning'
  | 'acid'
  | 'poison'
  | 'necrotic'
  | 'radiant'
  | 'force'
  | 'psychic'
  | 'thunder';

export type ActionKind = 'attack' | 'spell' | 'ability' | 'dodge' | 'move';

/** How targets are resolved for a save-based effect. */
export interface SaveSpec {
  ability: Ability;
  dc: number;
  /** On a successful save: take half damage, no effect, or no condition. */
  onSuccess: 'half' | 'none';
}

/** A condition to apply to a target as part of an action's effect. */
export interface ConditionApplication {
  kind: ConditionKind;
  duration: DurationKind;
}

/**
 * A reusable action. Stored in the action library and referenced by id from
 * combatant scripts. Movement and "move" are abstract for now.
 */
export interface Action {
  id: string;
  name: string;
  kind: ActionKind;
  /** Number of distinct targets this action affects (1 for single target). */
  targets: number;

  // --- attack / attack-roll spell ---
  /** to-hit bonus for an attack roll. If undefined and there's a save, it's save-based. */
  attackBonus?: number;
  /** number of separate attack rolls (e.g. multiattack / two attacks). */
  attackCount?: number;
  /** damage dice formula, e.g. "1d8+3". */
  damage?: string;
  damageType?: DamageType;

  // --- save-based effect ---
  save?: SaveSpec;

  // --- healing ---
  heal?: string; // dice formula, e.g. "1d8+3"

  // --- conditions applied on hit / failed save ---
  applyConditions?: ConditionApplication[];

  // --- spell economy ---
  /** Spell slot level consumed when cast. Undefined => no slot cost. */
  spellLevel?: number;
  /** Whether casting requires concentration (drops other concentration). */
  concentration?: boolean;

  /** Limited-use resource: total uses available per combat (e.g. 3). Undefined => unlimited. */
  uses?: number;

  /** Free-text note shown in UI. */
  note?: string;
}

// ---------------------------------------------------------------------------
// Scripts: conditions (rule predicates) and target selectors
// ---------------------------------------------------------------------------

export type RuleConditionType =
  | 'always'
  | 'selfHpBelowPct'
  | 'anyAllyHpBelowPct' // includes self
  | 'enemyCountAtLeast'
  | 'enemyCountAtMost'
  | 'selfHasCondition'
  | 'anyEnemyHasCondition'
  | 'roundAtLeast'
  | 'roundAtMost'
  | 'notConcentrating'
  | 'slotAvailable'; // requires a spell slot of the action's level

export interface RuleCondition {
  type: RuleConditionType;
  /** numeric parameter (percentage, count, round). */
  value?: number;
  /** condition parameter for has-condition predicates. */
  condition?: ConditionKind;
}

/**
 * Target selection for an action. A combatant references targets by named slot
 * ("enemy1", "ally2", ...) resolved against the current initiative order, with a
 * fallback strategy when named targets are gone.
 */
export type TargetStrategy =
  | 'lowestHpEnemy'
  | 'highestHpEnemy'
  | 'lowestHpAlly' // includes self
  | 'self'
  | 'allEnemies'
  | 'allAllies'
  | 'namedThenLowestHpEnemy';

export interface TargetSelector {
  strategy: TargetStrategy;
  /** ordered named-target ids for the 'namedThen...' strategy. */
  namedTargets?: string[];
  /** if true, only consider targets that are not incapacitated. */
  excludeIncapacitated?: boolean;
}

export interface Rule {
  /** lower number = higher priority. */
  priority: number;
  condition: RuleCondition;
  actionId: string;
  target: TargetSelector;
  /** human label for the log. */
  label?: string;
}

// ---------------------------------------------------------------------------
// Combatant
// ---------------------------------------------------------------------------

/** Spell slots available, indexed by spell level (1..9). slots[1] = number of L1 slots. */
export type SpellSlots = Record<number, number>;

export interface Combatant {
  id: string;
  name: string;
  side: Side;
  maxHp: number;
  ac: number;
  abilityScores: AbilityScores;
  /** abilities the combatant is proficient in for saving throws. */
  saveProficiencies: Ability[];
  /** proficiency bonus (used for saves & default attack math if needed). */
  proficiencyBonus: number;
  /** action ids available to this combatant (from the action library). */
  actionIds: string[];
  /** ordered priority script. */
  script: Rule[];
  /** spell slots by level. */
  spellSlots: SpellSlots;
  /** default target priority used by actions whose selector is 'namedThenLowestHpEnemy' without its own list. */
  defaultTargets?: string[];
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export type InitiativeMode = 'rolled' | 'fixed';

export interface Scenario {
  name: string;
  combatants: Combatant[];
  /** shared library of actions referenced by combatants. */
  actions: Action[];
  initiativeMode: InitiativeMode;
  /** for fixed initiative: ordered combatant ids (first acts first). */
  fixedOrder?: string[];
  /** max rounds before declaring a draw. */
  maxRounds: number;
}
