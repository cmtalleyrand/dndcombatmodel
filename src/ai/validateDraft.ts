import type { Action } from '../engine/types';
import {
  ABILITIES,
  DAMAGE_TYPES,
  RULE_CONDITION_TYPES,
  TARGET_STRATEGIES,
} from '../engine/types';
import { CONDITION_KINDS } from '../engine/conditions';
import { isValidDiceFormula } from '../engine/dice';
import type { AIScenarioDraft } from './types';

const RULE_CONDITION_SET = new Set<string>(RULE_CONDITION_TYPES);
const TARGET_STRATEGY_SET = new Set<string>(TARGET_STRATEGIES);
const ABILITY_SET = new Set<string>(ABILITIES);
const DAMAGE_TYPE_SET = new Set<string>(DAMAGE_TYPES);
const CONDITION_SET = new Set<string>(CONDITION_KINDS);

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Enforce that stat blocks stay within sane 5e bounds. The system prompt asks the model to
 * "keep ability scores, AC, and HP within normal 5e ranges", but nothing checked it until now,
 * so a hallucinated 9999-HP or AC-0 combatant would silently pass into an approved scenario.
 */
function validateCombatantStats(
  combatant: AIScenarioDraft['pcs'][number],
  errors: string[],
): void {
  const label = combatant.name || '(unnamed combatant)';
  const inRange = (value: number, min: number, max: number) =>
    Number.isFinite(value) && value >= min && value <= max;

  if (!inRange(combatant.maxHp, 1, 1000)) {
    errors.push(`${label}: maxHp ${combatant.maxHp} is outside the expected range (1–1000)`);
  }
  if (!inRange(combatant.ac, 1, 30)) {
    errors.push(`${label}: AC ${combatant.ac} is outside the expected range (1–30)`);
  }
  if (!inRange(combatant.proficiencyBonus, 0, 10)) {
    errors.push(`${label}: proficiencyBonus ${combatant.proficiencyBonus} is outside the expected range (0–10)`);
  }
  for (const ability of ABILITIES) {
    const score = combatant.abilityScores?.[ability];
    if (score === undefined || !inRange(score, 1, 30)) {
      errors.push(`${label}: ${ability} score ${score} is outside the expected range (1–30)`);
    }
  }
  if (combatant.speed !== undefined && !inRange(combatant.speed, 0, 120)) {
    errors.push(`${label}: speed ${combatant.speed} is outside the expected range (0–120)`);
  }
  if (combatant.level !== undefined && !inRange(combatant.level, 1, 20)) {
    errors.push(`${label}: level ${combatant.level} is outside the expected range (1–20)`);
  }
}

function featureMentioned(feature: string, text: string | undefined): boolean {
  if (!text) return false;
  return norm(text).includes(norm(feature));
}

function actionMechanicsKey(action: Action): string {
  const { id: _id, name: _name, note: _note, ...rest } = action;
  return JSON.stringify(rest, Object.keys(rest).sort());
}


/** Collect the dice-formula string fields on an action so we can validate they parse. */
function actionDiceFormulas(action: Action): { field: string; value: string }[] {
  const out: { field: string; value: string }[] = [];
  const push = (field: string, value: string | undefined) => {
    if (value !== undefined && value !== '') out.push({ field, value });
  };
  push('damage', action.damage);
  push('heal', action.heal);
  push('bonusDamageDice', action.bonusDamageDice);
  push('tempHp', action.tempHp);
  action.riders?.forEach((rider, i) => push(`riders[${i}].bonusDice`, rider.bonusDice));
  action.extraDamage?.forEach((extra, i) => push(`extraDamage[${i}].dice`, extra.dice));
  return out;
}

/** Validate a single action's enum-typed fields and dice formulas. */
function validateAction(action: Action, errors: string[]): void {
  const where = `Action "${action.name}"`;
  if (action.damageType && !DAMAGE_TYPE_SET.has(action.damageType)) {
    errors.push(`${where} has invalid damageType: ${action.damageType}`);
  }
  if (action.save && !ABILITY_SET.has(action.save.ability)) {
    errors.push(`${where} save uses invalid ability: ${action.save.ability}`);
  }
  if (action.abilityOverride && !ABILITY_SET.has(action.abilityOverride)) {
    errors.push(`${where} has invalid abilityOverride: ${action.abilityOverride}`);
  }
  for (const app of action.applyConditions ?? []) {
    if (!CONDITION_SET.has(app.kind)) {
      errors.push(`${where} applies unknown condition: ${app.kind}`);
    }
  }
  for (const extra of action.extraDamage ?? []) {
    if (!DAMAGE_TYPE_SET.has(extra.type)) {
      errors.push(`${where} extraDamage has invalid type: ${extra.type}`);
    }
  }
  for (const rider of action.riders ?? []) {
    if (rider.condition && !CONDITION_SET.has(rider.condition)) {
      errors.push(`${where} rider references unknown condition: ${rider.condition}`);
    }
  }
  for (const { field, value } of actionDiceFormulas(action)) {
    if (!isValidDiceFormula(value)) {
      errors.push(`${where} has an invalid dice formula in ${field}: "${value}"`);
    }
  }
}

export function validateDraft(draft: AIScenarioDraft): string[] {
  const errors: string[] = [];
  const combatantNames = new Set<string>();
  const actionNames = new Set<string>();

  if (draft.pcs.length === 0 && draft.enemies.length === 0) {
    errors.push('Draft has no combatants: at least one of pcs / enemies must be non-empty');
  }

  for (const combatant of [...draft.pcs, ...draft.enemies]) {
    if (combatantNames.has(combatant.name)) errors.push(`Duplicate combatant name: ${combatant.name}`);
    combatantNames.add(combatant.name);
    validateCombatantStats(combatant, errors);
  }

  for (const action of draft.actions) {
    if (actionNames.has(action.name)) errors.push(`Duplicate action name: ${action.name}`);
    actionNames.add(action.name);
    validateAction(action, errors);
  }

  for (const combatant of [...draft.pcs, ...draft.enemies]) {
    for (const actionName of combatant.actionNames) {
      if (!actionNames.has(actionName)) {
        errors.push(`${combatant.name} references unknown action: ${actionName}`);
      }
    }
  }

  for (const rule of draft.priorityScripts) {
    if (!combatantNames.has(rule.actorName)) errors.push(`Script references unknown combatant: ${rule.actorName}`);
    if (!actionNames.has(rule.actionName)) errors.push(`Script references unknown action: ${rule.actionName}`);
    if (!RULE_CONDITION_SET.has(rule.condition.type)) {
      errors.push(`Script for ${rule.actorName} uses invalid condition type: ${rule.condition.type}`);
    }
    if (rule.condition.condition && !CONDITION_SET.has(rule.condition.condition)) {
      errors.push(`Script for ${rule.actorName} references unknown condition: ${rule.condition.condition}`);
    }
    if (!TARGET_STRATEGY_SET.has(rule.target.strategy)) {
      errors.push(`Script for ${rule.actorName} uses invalid target strategy: ${rule.target.strategy}`);
    }
    if (rule.target.fallback && !TARGET_STRATEGY_SET.has(rule.target.fallback)) {
      errors.push(`Script for ${rule.actorName} uses invalid target fallback: ${rule.target.fallback}`);
    }
    for (const targetName of rule.target.targetNames ?? []) {
      if (!combatantNames.has(targetName)) errors.push(`Script references unknown target: ${targetName}`);
    }
  }

  for (const priority of draft.targetPriorities) {
    if (priority.actorName && !combatantNames.has(priority.actorName)) {
      errors.push(`Target priority references unknown actor: ${priority.actorName}`);
    }
    if (!TARGET_STRATEGY_SET.has(priority.fallback)) {
      errors.push(`Target priority "${priority.name}" uses invalid fallback: ${priority.fallback}`);
    }
    for (const targetName of priority.targetNames) {
      if (!combatantNames.has(targetName)) errors.push(`Target priority references unknown target: ${targetName}`);
    }
  }



  const resourceNames = new Set((draft.resources ?? []).map((resource) => resource.name));
  for (const resource of draft.resources ?? []) {
    if (!Number.isFinite(resource.max) || resource.max <= 0) {
      errors.push(`Resource "${resource.name}" must have a positive max use limit.`);
    }
  }

  for (const modifier of draft.stackableModifiers ?? []) {
    for (const actionName of modifier.appliesToActionNames) {
      if (!actionNames.has(actionName)) errors.push(`Modifier "${modifier.name}" references unknown base action: ${actionName}`);
    }
    if (modifier.resourceName && !resourceNames.has(modifier.resourceName)) {
      errors.push(`Modifier "${modifier.name}" spends unknown resource: ${modifier.resourceName}`);
    }
    if (modifier.extraDamageType && !DAMAGE_TYPE_SET.has(modifier.extraDamageType)) {
      errors.push(`Modifier "${modifier.name}" has invalid extraDamageType: ${modifier.extraDamageType}`);
    }
    if (modifier.extraDamageDice && !isValidDiceFormula(modifier.extraDamageDice)) {
      errors.push(`Modifier "${modifier.name}" has an invalid extraDamageDice formula: "${modifier.extraDamageDice}"`);
    }
  }

  for (const effect of draft.triggeredEffects ?? []) {
    for (const actionName of effect.appliesToActionNames ?? []) {
      if (!actionNames.has(actionName)) errors.push(`Triggered effect "${effect.name}" references unknown base action: ${actionName}`);
    }
    if (effect.resourceName && !resourceNames.has(effect.resourceName)) {
      errors.push(`Triggered effect "${effect.name}" spends unknown resource: ${effect.resourceName}`);
    }
    if (effect.extraDamageType && !DAMAGE_TYPE_SET.has(effect.extraDamageType)) {
      errors.push(`Triggered effect "${effect.name}" has invalid extraDamageType: ${effect.extraDamageType}`);
    }
    if (effect.extraDamageDice && !isValidDiceFormula(effect.extraDamageDice)) {
      errors.push(`Triggered effect "${effect.name}" has an invalid extraDamageDice formula: "${effect.extraDamageDice}"`);
    }
  }

  for (const policy of draft.tacticalPolicies ?? []) {
    if (!combatantNames.has(policy.actorName)) errors.push(`Tactical policy references unknown combatant: ${policy.actorName}`);
  }

  const consumedFeatureNames = new Set<string>();
  const consume = (sourceName: string | undefined) => { if (sourceName) consumedFeatureNames.add(norm(sourceName)); };
  (draft.passiveTraits ?? []).forEach((item) => consume(item.sourceName));
  (draft.resources ?? []).forEach((item) => consume(item.sourceName));
  (draft.stackableModifiers ?? []).forEach((item) => consume(item.sourceName));
  (draft.triggeredEffects ?? []).forEach((item) => consume(item.sourceName));
  (draft.tacticalPolicies ?? []).forEach((item) => consume(item.sourceName));
  for (const assumption of draft.assumptionsRequiringApproval) {
    for (const feature of draft.featureDecompositions ?? []) {
      if (featureMentioned(feature.sourceName, assumption)) consume(feature.sourceName);
    }
  }
  for (const feature of draft.featureDecompositions ?? []) {
    if (!consumedFeatureNames.has(norm(feature.sourceName))) {
      errors.push(`Feature "${feature.sourceName}" is declared but not consumed by a passive trait, resource, modifier, triggered effect, tactical policy, or explicit assumption.`);
    }
    if ((feature.resourceCost && !/^none$/i.test(feature.resourceCost.trim())) || feature.consumesResourceName) {
      const resourceName = feature.consumesResourceName;
      if (resourceName && !resourceNames.has(resourceName)) errors.push(`Feature "${feature.sourceName}" consumes unknown resource: ${resourceName}`);
      if (!resourceName && !(draft.resources ?? []).some((resource) => featureMentioned(resource.sourceName, feature.sourceName))) {
        errors.push(`Feature "${feature.sourceName}" has a limited resource cost but no resource pool or explicit use limit.`);
      }
    }
    const movementText = `${feature.sourceName} ${feature.simulatorRepresentation} ${feature.knownApproximationOrUnsupported ?? ''}`;
    if (/\b(speed|movement|move|range|kite|retreat|dash)\b/i.test(movementText)) {
      const hasPassiveSpeed = (draft.passiveTraits ?? []).some((trait) => featureMentioned(feature.sourceName, trait.sourceName) && (trait.speedBonus !== undefined || trait.speedOverride !== undefined));
      const hasMovementPolicy = (draft.tacticalPolicies ?? []).some((policy) => featureMentioned(feature.sourceName, policy.sourceName) && !!policy.policy.movementPolicy);
      if (!hasPassiveSpeed && !hasMovementPolicy) {
        errors.push(`Movement-affecting feature "${feature.sourceName}" must affect speed or create a movement policy.`);
      }
    }
  }

  const actionsByMechanics = new Map<string, string>();
  for (const action of draft.actions) {
    const key = actionMechanicsKey(action);
    const duplicate = actionsByMechanics.get(key);
    if (duplicate) {
      const duplicatedFeature = (draft.featureDecompositions ?? []).find((feature) => featureMentioned(feature.sourceName, action.name));
      if (duplicatedFeature) {
        errors.push(`Action "${action.name}" appears to be a pseudo-action for feature "${duplicatedFeature.sourceName}" duplicating "${duplicate}" without mechanical differences; represent it as a modifier/effect instead.`);
      }
    } else {
      actionsByMechanics.set(key, action.name);
    }
  }

  return errors;
}
