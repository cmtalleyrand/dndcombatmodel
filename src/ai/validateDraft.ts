import type { AIScenarioDraft } from './types';

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
    for (const targetName of rule.target.targetNames ?? []) {
      if (!combatantNames.has(targetName)) errors.push(`Script references unknown target: ${targetName}`);
    }
  }

  for (const priority of draft.targetPriorities) {
    if (priority.actorName && !combatantNames.has(priority.actorName)) {
      errors.push(`Target priority references unknown actor: ${priority.actorName}`);
    }
    for (const targetName of priority.targetNames) {
      if (!combatantNames.has(targetName)) errors.push(`Target priority references unknown target: ${targetName}`);
    }
  }

  return errors;
}
