import type {
  Ability,
  AbilityScores,
  Action,
  ConditionKind,
  DamageType,
  RuleCondition,
  Side,
  SpellSlots,
  TacticalPolicy,
  TargetStrategy,
} from '../engine/types';


export type AIDraftFeatureCategory = 'baseAction' | 'passiveTrait' | 'resource' | 'stackableModifier' | 'triggeredEffect' | 'tacticalPolicy';
export type AIDraftFeatureTiming = 'precombat' | 'startOfCombat' | 'startOfTurn' | 'beforeAttackRoll' | 'afterAttackRollBeforeHitResolution' | 'onHit' | 'afterMiss' | 'actionEconomy' | 'passive';

export interface AIDraftFeatureDecomposition {
  sourceName: string;
  sourceType?: string;
  category: AIDraftFeatureCategory;
  simulatorRepresentation: string;
  triggerTiming: AIDraftFeatureTiming;
  resourceCost?: string;
  stackingBehavior: string;
  appliesToActionNames?: string[];
  consumesResourceName?: string;
  createsResourceName?: string;
  knownApproximationOrUnsupported?: string;
}

export interface AIDraftPassiveTrait {
  name: string;
  sourceName: string;
  speedBonus?: number;
  speedOverride?: number;
  simulatorRepresentation: string;
}

export interface AIDraftResource {
  name: string;
  sourceName: string;
  max: number;
}

export interface AIDraftStackableModifier {
  name: string;
  sourceName: string;
  timing: 'beforeAttackRoll' | 'afterAttackRollBeforeHitResolution' | 'onHit';
  appliesToActionNames: string[];
  toHit?: number;
  damage?: number;
  extraDamageDice?: string;
  extraDamageType?: DamageType;
  resourceName?: string;
  spendTrigger?: 'always' | 'onHit' | 'missWithin';
  missThreshold?: number;
  stackingBehavior: string;
}

export interface AIDraftTriggeredEffect {
  name: string;
  sourceName: string;
  timing: 'precombat' | 'startOfCombat' | 'startOfTurn' | 'onHit' | 'afterMiss' | 'actionEconomy';
  appliesToActionNames?: string[];
  resourceName?: string;
  spendTrigger?: 'always' | 'onHit' | 'missWithin';
  extraDamageDice?: string;
  extraDamageType?: DamageType;
  extraActionCount?: number;
  simulatorRepresentation: string;
}

export interface AIDraftTacticalPolicy {
  actorName: string;
  sourceName?: string;
  policy: TacticalPolicy;
}

export interface AIDraftCombatant {
  name: string;
  side: Side;
  maxHp: number;
  ac: number;
  abilityScores: AbilityScores;
  saveProficiencies?: Ability[];
  proficiencyBonus: number;
  spellcastingAbility?: Ability;
  actionNames: string[];
  spellSlots?: SpellSlots;
  position?: number;
  speed?: number;
  level?: number;
  resistances?: DamageType[];
  immunities?: DamageType[];
  vulnerabilities?: DamageType[];
  conditionImmunities?: ConditionKind[];
  declaredFeatureNames?: string[];
}


export interface AIDraftRule {
  actorName: string;
  actionName: string;
  priority: number;
  label?: string;
  condition: RuleCondition;
  target: {
    strategy: TargetStrategy;
    targetNames?: string[];
    fallback?: TargetStrategy;
    excludeIncapacitated?: boolean;
  };
}

export interface AIDraftTargetPriority {
  name: string;
  actorName?: string;
  targetNames: string[];
  fallback: TargetStrategy;
}

export interface AIScenarioDraft {
  scenarioSummary: string;
  pcs: AIDraftCombatant[];
  enemies: AIDraftCombatant[];
  actions: Action[];
  priorityScripts: AIDraftRule[];
  targetPriorities: AIDraftTargetPriority[];
  featureDecompositions?: AIDraftFeatureDecomposition[];
  passiveTraits?: AIDraftPassiveTrait[];
  resources?: AIDraftResource[];
  stackableModifiers?: AIDraftStackableModifier[];
  triggeredEffects?: AIDraftTriggeredEffect[];
  tacticalPolicies?: AIDraftTacticalPolicy[];
  assumptionsRequiringApproval: string[];
  maxRounds?: number;
}

export interface DraftValidationResult {
  valid: boolean;
  errors: string[];
}
