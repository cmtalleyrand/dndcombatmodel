// Core data model for the D&D 5e combat simulator engine.
// Everything here is plain data (serializable) so scenarios can be saved/loaded as JSON.

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export type Skill =
  | 'athletics'
  | 'acrobatics'
  | 'sleightOfHand'
  | 'stealth'
  | 'arcana'
  | 'history'
  | 'investigation'
  | 'nature'
  | 'religion'
  | 'animalHandling'
  | 'insight'
  | 'medicine'
  | 'perception'
  | 'survival'
  | 'deception'
  | 'intimidation'
  | 'performance'
  | 'persuasion';

export type AbilityScores = Record<Ability, number>;

export type Side = 'pc' | 'monster';

/** A condition that can be attached to a combatant during combat. */
export type ConditionKind =
  | 'prone'
  | 'grappled'
  | 'poisoned'
  | 'asleep' // unconscious from sleep; incapacitated, attacks against have advantage
  | 'incapacitated'
  | 'unconscious'
  | 'invisible'
  | 'blinded'
  | 'charmed'
  | 'deafened'
  | 'restrained'
  | 'stunned'
  | 'paralyzed'
  | 'petrified'
  | 'frightened'
  | 'blessed' // +1d4 to attacks & saves
  | 'dodging' // attacks against have disadvantage
  | 'raging' // resistance to physical damage; powers melee rage rider
  | 'marked'; // Hunter's Mark / Hex target; powers the marked-target rider

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

export const DAMAGE_TYPES: DamageType[] = [
  'bludgeoning',
  'piercing',
  'slashing',
  'fire',
  'cold',
  'lightning',
  'acid',
  'poison',
  'necrotic',
  'radiant',
  'force',
  'psychic',
  'thunder',
];

export type ActionKind = 'attack' | 'spell' | 'ability' | 'dodge' | 'move' | 'dash' | 'disengage' | 'help' | 'hide' | 'ready' | 'search';

/** How targets are resolved for a save-based effect. */
export interface SaveSpec {
  ability: Ability;
  /** Explicit DC. If omitted, the DC is derived (8 + spellcasting mod + proficiency). */
  dc?: number;
  /** On a successful save: take half damage, no effect, or no condition. */
  onSuccess: 'half' | 'none';
}

// ---------------------------------------------------------------------------
// Weapons (referenced by attack actions; values derive from the wielder)
// ---------------------------------------------------------------------------

export type WeaponMastery = 'cleave' | 'graze' | 'nick' | 'push' | 'sap' | 'slow' | 'topple' | 'vex';

export type WeaponProperty =
  | 'finesse'
  | 'ranged'
  | 'versatile'
  | 'twoHanded'
  | 'light'
  | 'heavy'
  | 'thrown';

export interface Weapon {
  id: string;
  name: string;
  /** one-handed damage die, e.g. "1d8". */
  damage: string;
  /** two-handed damage die for versatile weapons, e.g. "1d10". */
  versatileDamage?: string;
  damageType: DamageType;
  properties: WeaponProperty[];
  category: 'simple' | 'martial';
  /** normal range in feet (melee reach = 5). Beyond this up to longRange = disadvantage. */
  range?: number;
  /** melee reach in feet for reach weapons (e.g. 10 for a glaive). Melee attacks within reach have no penalty. */
  reach?: number;
  /** long range in feet; attacks beyond normal but within long are at disadvantage. */
  longRange?: number;
  /** 2024 weapon mastery trait attached to this weapon. */
  mastery?: WeaponMastery;
}

/** A condition to apply to a target as part of an action's effect. */
export interface ConditionApplication {
  kind: ConditionKind;
  duration: DurationKind;
}

/** An extra packet of damage of a distinct type, resolved separately against resistances. */
export interface ExtraDamage {
  /** extra dice, e.g. "2d6". */
  dice?: string;
  /** extra flat damage. */
  flat?: number;
  type: DamageType;
  /** human label shown in the log, e.g. "cold". */
  label?: string;
}

/** Which combatants an area-of-effect action affects, relative to its center target. */
export type AoeTargets = 'all' | 'allies' | 'enemies';

/** Action-economy cost: a full action (default) or a bonus action. */
export type ActionCost = 'action' | 'bonus';

/** When a damage rider's bonus applies. */
export type RiderTrigger =
  | 'always'
  | 'hasAdvantage' // the attack roll had advantage
  | 'advantageOrAllyAdjacent' // advantage OR an ally is adjacent to the target (Sneak Attack)
  | 'targetHasCondition' // the target has `condition` (Hunter's Mark / Hex)
  | 'selfHasCondition'; // the attacker has `condition` (Rage)

/** Conditional extra damage on a hit (Sneak Attack, Rage, Hunter's Mark, etc.). */
export interface FeatureTrigger {
  trigger: RiderTrigger;
  /** condition parameter for target/self-has-condition triggers. */
  condition?: ConditionKind;
  /** only applies to melee (same-block) attacks (Rage). */
  meleeOnly?: boolean;
}

export interface DamageRider {
  /** human label shown in the log, e.g. "Sneak Attack". */
  label?: string;
  /** extra dice on a hit, e.g. "2d6". */
  bonusDice?: string;
  /** extra flat damage on a hit. */
  bonusFlat?: number;
  trigger: RiderTrigger;
  /** condition parameter for target/self-has-condition triggers. */
  condition?: ConditionKind;
  /** at most once per turn (Sneak Attack). */
  oncePerTurn?: boolean;
  /** only applies to melee (same-block) attacks (Rage). */
  meleeOnly?: boolean;
}


// ---------------------------------------------------------------------------
// Features and resources
// ---------------------------------------------------------------------------

export type FeatureTiming =
  | 'precombat'
  | 'startOfTurn'
  | 'beforeAttackRoll'
  | 'afterAttackRollBeforeHitResolution'
  | 'onHit'
  | 'actionEconomy';

export interface ResourcePoolDefinition {
  id: string;
  max: number;
}

export type FeatureSpendTrigger = 'always' | 'onHit' | 'missWithin';

export interface FeatureResourceSpend {
  resourceId: string;
  amount: number;
  trigger?: FeatureSpendTrigger;
  /** For missWithin, spend only when this maximum bonus can turn the miss into a hit. */
  missThreshold?: number;
}

export interface AttackModifierEffect {
  toHit?: number;
  damage?: number;
  /** Advantage state added to the attack roll; advantage and disadvantage cancel normally. */
  advantage?: 'normal' | 'advantage' | 'disadvantage';
  /** Additive modifier to a spell or ability save DC. */
  saveDc?: number;
  /** Additive modifier to the defender's AC for this attack; negative values make hits easier. */
  ac?: number;
  label?: string;
}

export interface ExtraActionEffect {
  count: number;
  cost?: ActionCost;
}

/**
 * Where a feature comes from — a logical classification for organising the feature library.
 * Mutually exclusive and keyed to how 5e content is sourced, so the library can group by it.
 */
export type FeatureCategory =
  | 'classFeature' // a class or subclass ability (Sneak Attack, Rage, Action Surge, Divine Smite)
  | 'speciesTrait' // a species/lineage trait (Relentless Endurance, Breath Weapon)
  | 'feat' // a feat (Sharpshooter, Great Weapon Master, Sentinel)
  | 'monsterTrait' // an innate monster ability (Pack Tactics, Regeneration, Multiattack)
  | 'spellEffect' // an ongoing effect granted by a spell (Hunter's Mark, Bless, Hex)
  | 'itemEffect'; // an effect granted by a magic item

export const FEATURE_CATEGORIES: FeatureCategory[] = [
  'classFeature',
  'speciesTrait',
  'feat',
  'monsterTrait',
  'spellEffect',
  'itemEffect',
];

/** Human-readable labels for each feature category. */
export const FEATURE_CATEGORY_LABELS: Record<FeatureCategory, string> = {
  classFeature: 'Class feature',
  speciesTrait: 'Species trait',
  feat: 'Feat',
  monsterTrait: 'Monster trait',
  spellEffect: 'Spell effect',
  itemEffect: 'Item effect',
};

export interface Feature {
  id: string;
  name: string;
  /** logical classification for grouping the feature library. */
  category?: FeatureCategory;
  timing: FeatureTiming;
  resource?: ResourcePoolDefinition;
  spend?: FeatureResourceSpend;
  /** Optional combat-state predicate that must be true before this feature applies. */
  condition?: FeatureTrigger;
  attackModifier?: AttackModifierEffect;
  extraDamage?: ExtraDamage[];
  applyConditions?: ConditionApplication[];
  extraAction?: ExtraActionEffect;
  /** Limit this feature to specific action ids. Omitted means any attack action. */
  actionIds?: string[];
  /** At most once per actor turn. */
  oncePerTurn?: boolean;
}

/**
 * A reusable action. Stored in the action library and referenced by id from
 * combatant scripts. Movement and "move" use the simulator's 1D linear battlefield.
 */
export interface Action {
  id: string;
  name: string;
  kind: ActionKind;
  /** Number of distinct targets this action affects (1 for single target). */
  targets: number;

  // --- weapon-based attack (preferred): numbers derive from the wielder ---
  /** weapon from the library; to-hit & damage derive from the wielder + this weapon. */
  weaponId?: string;
  /** use the two-handed (versatile) damage die. */
  useVersatile?: boolean;
  /** force a specific ability for the attack instead of the auto choice. */
  abilityOverride?: Ability;
  /** wielder is NOT proficient with this weapon (omit proficiency bonus). */
  notProficient?: boolean;

  // --- legacy / manual attack (back-compat escape hatch) ---
  /** explicit to-hit bonus. If a weaponId is set, this is ignored in favor of derivation. */
  attackBonus?: number;
  /** number of separate attack rolls (e.g. multiattack / two attacks). */
  attackCount?: number;
  /** explicit damage formula, e.g. "1d8+3". Used when no weaponId is set. */
  damage?: string;
  damageType?: DamageType;

  // --- additive adjustments (layered on top of derived values) ---
  /** +N to hit (fighting style, feat). */
  toHitBonus?: number;
  /** +N flat damage (rage, dueling). */
  damageBonus?: number;
  /** extra damage dice rolled on a hit, e.g. "1d6" (smite, elemental). */
  bonusDamageDice?: string;
  /** magic weapon/focus bonus added to BOTH attack and damage, e.g. +1. */
  magicBonus?: number;

  // --- spell delivery ---
  /** true if this spell uses a spell attack roll (e.g. Fire Bolt). Otherwise auto-hits or uses a save. */
  spellAttack?: boolean;

  // --- save-based effect ---
  save?: SaveSpec;
  /** +N to a derived save DC. */
  saveDcBonus?: number;

  // --- extra typed damage (resolved separately against resistances) ---
  /** additional damage packets of distinct types (e.g. Ice Storm bludgeoning + cold). */
  extraDamage?: ExtraDamage[];

  // --- healing ---
  heal?: string; // dice formula, e.g. "1d8"
  /** add the caster's spellcasting modifier to the heal (e.g. Cure Wounds = 1d8 + mod). */
  addSpellModToHeal?: boolean;
  /** grant temporary HP to the target(s), dice formula e.g. "2d4"; takes the higher, never stacks. */
  tempHp?: string;

  // --- conditions applied on hit / failed save ---
  applyConditions?: ConditionApplication[];

  // --- positioning: range & area of effect (linear, in feet) ---
  /** explicit range in feet; overrides the weapon's range for this action. */
  range?: number;
  /** if set, the action affects all eligible targets within this many feet of the primary target. */
  aoeRadius?: number;
  /** which combatants an AoE affects; defaults to 'all' for damage and 'allies' for heals. */
  aoeTargets?: AoeTargets;
  /** for 'move' actions: advance toward, or retreat from, the nearest enemy. */
  moveMode?: 'advance' | 'retreat';

  // --- conditional feature riders (extra damage gated by a trigger) ---
  riders?: DamageRider[];

  // --- spell economy ---
  /** Spell slot level consumed when cast. Undefined => no slot cost. */
  spellLevel?: number;
  /** Whether casting requires concentration (drops other concentration). */
  concentration?: boolean;

  /** Limited-use resource: total uses available per combat (e.g. 3). Undefined => unlimited. */
  uses?: number;

  /** action economy: 'action' (default) or 'bonus'. */
  actionCost?: ActionCost;

  /** if true, the damage dice count scales with the caster's level like a 5e cantrip (tiers at 5/11/17). */
  cantripScaling?: boolean;

  /** ordered child action ids performed in sequence this turn (heterogeneous multiattack). */
  sequence?: string[];

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
  | 'anyEnemyConcentrating' // an enemy is concentrating (target it to break concentration)
  | 'slotAvailable'; // requires a spell slot of the action's level

export const RULE_CONDITION_TYPES: RuleConditionType[] = [
  'always',
  'selfHpBelowPct',
  'anyAllyHpBelowPct',
  'enemyCountAtLeast',
  'enemyCountAtMost',
  'selfHasCondition',
  'anyEnemyHasCondition',
  'roundAtLeast',
  'roundAtMost',
  'notConcentrating',
  'anyEnemyConcentrating',
  'slotAvailable',
];

export interface RuleCondition {
  type: RuleConditionType;
  /** numeric parameter (percentage, count, round). */
  value?: number;
  /** condition parameter for has-condition predicates. */
  condition?: ConditionKind;
  /**
   * Additional leaf predicates combined with the primary one via `combine`. Each entry is a
   * plain leaf (its own `extra` is ignored) — a single level of AND/OR, which covers
   * "bloodied AND enemy concentrating" without opening up arbitrary nesting.
   */
  extra?: RuleCondition[];
  /** how to combine the primary predicate with `extra` (default 'and'). */
  combine?: 'and' | 'or';
}

/**
 * Target selection for an action. Prefer an explicit ordered list of combatants
 * (a reusable TargetList or an inline `namedTargets`) with a computed `fallback`
 * when the list is exhausted — this avoids assuming omniscient knowledge.
 */
export type TargetStrategy =
  | 'lowestHpEnemy'
  | 'highestHpEnemy'
  | 'nearestEnemy'
  | 'lowestHpAlly' // includes self
  | 'nearestAlly' // includes self
  | 'self'
  | 'allEnemies'
  | 'allAllies'
  | 'namedThenLowestHpEnemy' // legacy alias kept for back-compat
  | 'none';

export const TARGET_STRATEGIES: TargetStrategy[] = [
  'lowestHpEnemy',
  'highestHpEnemy',
  'nearestEnemy',
  'lowestHpAlly',
  'nearestAlly',
  'self',
  'allEnemies',
  'allAllies',
  'namedThenLowestHpEnemy',
  'none',
];

export interface TargetSelector {
  strategy: TargetStrategy;
  /** reference a reusable scenario-level TargetList by id. */
  listId?: string;
  /** ordered explicit combatant ids (inline list). */
  namedTargets?: string[];
  /** computed strategy used after the explicit list is exhausted. */
  fallback?: TargetStrategy;
  /** if true, only consider targets that are not incapacitated. */
  excludeIncapacitated?: boolean;
}

/** A reusable, named ordered list of explicit target combatants + a computed fallback. */
export interface TargetList {
  id: string;
  name: string;
  /** ordered combatant ids (priority order). */
  entries: string[];
  /** computed strategy used when the explicit entries are exhausted/unavailable. */
  fallback: TargetStrategy;
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

/**
 * A reusable, named rule "recipe" — a Rule without a priority (priority is
 * assigned when it's inserted into a specific combatant's script). Stored in
 * the scenario's rule library and referenced from the Rules Library UI to
 * quickly seed common tactical patterns (e.g. "heal a hurt ally").
 */

export type MovementPolicyKind = 'maintainRange' | 'close' | 'retreatKite' | 'holdPosition';
export type BaseActionSelectorKind = 'rulePriority' | 'actionId' | 'kind';
export type ModifierPolicyKind = 'always' | 'never' | 'minimumHitChance' | 'positiveExpectedValue';
export type TargetPolicyKind = 'ruleTarget' | 'namedPriority' | 'concentratingTarget' | 'lowAcTarget' | 'lowHpTarget' | 'nearestMeleeThreat';
export type ResourcePolicyKind = 'conserve' | 'spendEarly' | 'spendIfChangesOutcome' | 'highValueTargets';

export interface MovementPolicy {
  kind: MovementPolicyKind;
  preferredRange?: number;
  threatRange?: number;
}

export interface BaseActionSelector {
  kind: BaseActionSelectorKind;
  actionId?: string;
  actionKind?: ActionKind;
}

export interface ModifierPolicy {
  kind: ModifierPolicyKind;
  featureIds?: string[];
  minimumHitChance?: number;
  damageDelta?: number;
  toHitDelta?: number;
}

export interface TargetPolicy {
  kind: TargetPolicyKind;
  namedTargets?: string[];
  fallback?: TargetStrategy;
}

export interface ResourcePolicy {
  kind: ResourcePolicyKind;
  featureIds?: string[];
}

export interface TacticalPolicy {
  movementPolicy?: MovementPolicy;
  baseActionSelector?: BaseActionSelector;
  modifierPolicy?: ModifierPolicy;
  targetPolicy?: TargetPolicy;
  resourcePolicy?: ResourcePolicy;
  extraActionPolicy?: ResourcePolicy;
}

export interface TacticalDecision {
  rule?: Rule;
  movementPolicy?: MovementPolicy;
  baseAction: Action;
  targets: string[];
  modifierPolicy?: ModifierPolicy;
  targetPolicy?: TargetPolicy;
  resourcePolicy?: ResourcePolicy;
  extraActionPolicy?: ResourcePolicy;
}

export interface RuleTemplate {
  id: string;
  name: string;
  condition: RuleCondition;
  actionId: string;
  target: TargetSelector;
  label?: string;
}

/**
 * A reusable, named "apply this condition" recipe (kind + duration), stored in
 * the scenario's condition library and referenced from an action's applied-on-hit
 * conditions to avoid reconfiguring the same kind/duration combo every time.
 */
export interface ConditionPreset {
  id: string;
  name: string;
  kind: ConditionKind;
  duration: DurationKind;
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
  /** skills the combatant is proficient in for ability checks. */
  skillProficiencies?: Skill[];
  /** proficiency bonus (used for saves, weapon attacks, and spell DCs). */
  proficiencyBonus: number;
  /** spellcasting ability for derived spell attack bonus and save DC. */
  spellcastingAbility?: Ability;
  /** action ids available to this combatant (from the action library). */
  actionIds: string[];
  /** feature ids available to this combatant (from the feature library). */
  featureIds?: string[];
  /** inline features available only to this combatant. */
  features?: Feature[];
  /** ordered priority script. */
  script: Rule[];
  /** optional richer policy evaluated after the legacy priority rule path selects a legal base action. */
  tacticalPolicy?: TacticalPolicy;
  /** spell slots by level. */
  spellSlots: SpellSlots;
  /** default target priority used by actions whose selector is 'namedThenLowestHpEnemy' without its own list. */
  defaultTargets?: string[];
  /** starting position on the 1D battlefield (feet; multiples of 15). Defaults by side/index. */
  position?: number;
  /** movement speed in feet per turn (default 30). */
  speed?: number;
  /** character/monster level, used for cantrip scaling (default 1). */
  level?: number;
  /** damage types this combatant takes half damage from. */
  resistances?: DamageType[];
  /** damage types this combatant takes no damage from. */
  immunities?: DamageType[];
  /** damage types this combatant takes double damage from. */
  vulnerabilities?: DamageType[];
  /** condition kinds this combatant cannot be affected by. */
  conditionImmunities?: ConditionKind[];
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
  /** shared library of class/species/feat features referenced by combatants. */
  features?: Feature[];
  /** shared library of weapons referenced by attack actions. */
  weapons: Weapon[];
  /** reusable named target priority lists referenced by rules. */
  targetLists: TargetList[];
  /** reusable named rule "recipes" that can be inserted into any combatant's script. */
  ruleLibrary: RuleTemplate[];
  /** reusable named condition kind+duration "recipes" for actions' applied-on-hit conditions. */
  conditionLibrary: ConditionPreset[];
  initiativeMode: InitiativeMode;
  /** for fixed initiative: ordered combatant ids (first acts first). */
  fixedOrder?: string[];
  /** starting distance in feet between the front-most monster and front-most PC. */
  encounterDistance?: number;
  /** max rounds before declaring a draw. */
  maxRounds: number;
}

// ---------------------------------------------------------------------------
// Reusable script presets (stored in localStorage, not in a scenario)
// ---------------------------------------------------------------------------

export interface ScriptPreset {
  id: string;
  name: string;
  rules: Rule[];
}
