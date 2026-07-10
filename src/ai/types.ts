import type {
  Ability,
  AbilityScores,
  Action,
  ConditionKind,
  DamageType,
  RuleCondition,
  Side,
  SpellSlots,
  TargetStrategy,
} from '../engine/types';

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
  assumptionsRequiringApproval: string[];
  maxRounds?: number;
}

export interface DraftValidationResult {
  valid: boolean;
  errors: string[];
}
