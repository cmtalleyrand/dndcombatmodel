import type { Rule, Scenario, TargetSelector } from './types';

export interface ScenarioReadinessIssue {
  code: string;
  message: string;
}

export interface ScenarioReadiness {
  errors: ScenarioReadinessIssue[];
  warnings: ScenarioReadinessIssue[];
  isReady: boolean;
}

function checkTargetSelector(
  selector: TargetSelector,
  context: string,
  combatantIds: Set<string>,
  targetListIds: Set<string>,
  errors: ScenarioReadinessIssue[],
) {
  if (selector.listId && !targetListIds.has(selector.listId)) {
    errors.push({
      code: 'missing-rule-target-list',
      message: `${context} references missing target list "${selector.listId}".`,
    });
  }

  for (const targetId of selector.namedTargets ?? []) {
    if (!combatantIds.has(targetId)) {
      errors.push({
        code: 'missing-rule-target',
        message: `${context} references missing combatant "${targetId}" in its inline target list.`,
      });
    }
  }
}

function checkRule(
  rule: Rule,
  context: string,
  actionIds: Set<string>,
  combatantIds: Set<string>,
  targetListIds: Set<string>,
  errors: ScenarioReadinessIssue[],
) {
  if (!actionIds.has(rule.actionId)) {
    errors.push({
      code: 'missing-rule-action',
      message: `${context} references missing action "${rule.actionId}".`,
    });
  }
  checkTargetSelector(rule.target, context, combatantIds, targetListIds, errors);
}

export function validateScenarioReadiness(scenario: Scenario): ScenarioReadiness {
  const errors: ScenarioReadinessIssue[] = [];
  const warnings: ScenarioReadinessIssue[] = [];
  const actionIds = new Set(scenario.actions.map((a) => a.id));
  const combatantIds = new Set(scenario.combatants.map((c) => c.id));
  const targetListIds = new Set(scenario.targetLists.map((t) => t.id));
  const featureIds = new Set((scenario.features ?? []).map((f) => f.id));
  const referencedFeatureIds = new Set<string>();

  if (!scenario.combatants.some((c) => c.side === 'pc')) {
    errors.push({ code: 'missing-pc-side', message: 'Add at least one PC combatant.' });
  }
  if (!scenario.combatants.some((c) => c.side === 'monster')) {
    errors.push({ code: 'missing-monster-side', message: 'Add at least one monster combatant.' });
  }

  for (const combatant of scenario.combatants) {
    if (combatant.maxHp <= 0) {
      errors.push({
        code: 'non-positive-hp',
        message: `${combatant.name} has non-positive maximum HP (${combatant.maxHp}).`,
      });
    }

    if (combatant.actionIds.length === 0) {
      warnings.push({
        code: 'no-assigned-actions',
        message: `${combatant.name} has no assigned actions, so it may only be able to skip turns.`,
      });
    }

    for (const actionId of combatant.actionIds) {
      if (!actionIds.has(actionId)) {
        errors.push({
          code: 'missing-assigned-action',
          message: `${combatant.name} is assigned missing action "${actionId}".`,
        });
      }
    }

    for (const targetId of combatant.defaultTargets ?? []) {
      if (!combatantIds.has(targetId)) {
        errors.push({
          code: 'missing-combatant-target',
          message: `${combatant.name}'s default target list references missing combatant "${targetId}".`,
        });
      }
    }

    for (const featureId of combatant.featureIds ?? []) {
      referencedFeatureIds.add(featureId);
      if (!featureIds.has(featureId)) {
        errors.push({
          code: 'missing-combatant-feature',
          message: `${combatant.name} references missing feature "${featureId}".`,
        });
      }
    }

    for (const rule of combatant.script) {
      checkRule(rule, `${combatant.name}'s script rule ${rule.priority}`, actionIds, combatantIds, targetListIds, errors);
    }
  }

  for (const targetList of scenario.targetLists) {
    for (const targetId of targetList.entries) {
      if (!combatantIds.has(targetId)) {
        errors.push({
          code: 'missing-target-list-combatant',
          message: `Target list "${targetList.name}" references missing combatant "${targetId}".`,
        });
      }
    }
  }

  for (const rule of scenario.ruleLibrary) {
    checkRule(
      { ...rule, priority: 0 },
      `Rule library entry "${rule.name}"`,
      actionIds,
      combatantIds,
      targetListIds,
      errors,
    );
  }

  for (const feature of scenario.features ?? []) {
    if (!referencedFeatureIds.has(feature.id) && !scenario.combatants.some((combatant) => (combatant.features ?? []).some((inline) => inline.id === feature.id))) {
      warnings.push({
        code: 'orphaned-feature',
        message: `Feature "${feature.name}" is not referenced by any combatant.`,
      });
    }
  }

  if (scenario.initiativeMode === 'fixed') {
    for (const combatantId of scenario.fixedOrder ?? []) {
      if (!combatantIds.has(combatantId)) {
        errors.push({
          code: 'missing-fixed-initiative-combatant',
          message: `Fixed initiative references missing combatant "${combatantId}".`,
        });
      }
    }
  }

  return { errors, warnings, isReady: errors.length === 0 };
}
