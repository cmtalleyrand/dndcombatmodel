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

  for (const combatant of [...draft.pcs, ...draft.enemies]) {
    if (combatantNames.has(combatant.name)) errors.push(`Duplicate combatant name: ${combatant.name}`);
    combatantNames.add(combatant.name);
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

  return errors;
}
