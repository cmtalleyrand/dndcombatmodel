import type { AIScenarioDraft } from './types';

export const AI_AUTHORING_SCHEMA_PROMPT = `Return only an approved-draft JSON object with these sections: scenarioSummary, pcs, enemies, actions, priorityScripts, targetPriorities, assumptionsRequiringApproval. Use exact names consistently; names will be resolved to simulator ids only after validation.`;

export function formatApprovalTemplate(draft: AIScenarioDraft): string {
  const lines = [
    `# Scenario summary\n${draft.scenarioSummary}`,
    `# PCs\n${draft.pcs.map((pc) => `- ${pc.name}: HP ${pc.maxHp}, AC ${pc.ac}, actions ${pc.actionNames.join(', ')}`).join('\n') || '- none'}`,
    `# Enemies\n${draft.enemies.map((enemy) => `- ${enemy.name}: HP ${enemy.maxHp}, AC ${enemy.ac}, actions ${enemy.actionNames.join(', ')}`).join('\n') || '- none'}`,
    `# Actions/spells/abilities\n${draft.actions.map((action) => `- ${action.name} (${action.kind})`).join('\n') || '- none'}`,
    `# Priority scripts\n${draft.priorityScripts.map((rule) => `- ${rule.actorName} [${rule.priority}]: ${rule.actionName} -> ${rule.target.strategy}`).join('\n') || '- none'}`,
    `# Target priorities\n${draft.targetPriorities.map((priority) => `- ${priority.name}: ${priority.targetNames.join(', ')}; fallback ${priority.fallback}`).join('\n') || '- none'}`,
    `# Assumptions requiring user approval\n${draft.assumptionsRequiringApproval.map((item) => `- ${item}`).join('\n') || '- none'}`,
  ];
  return lines.join('\n\n');
}
