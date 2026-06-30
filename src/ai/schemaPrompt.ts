import type { AIScenarioDraft } from './types';

export const AI_AUTHORING_SCHEMA_PROMPT = `Return only an approved-draft JSON object with these sections: scenarioSummary, pcs, enemies, actions, priorityScripts, targetPriorities, assumptionsRequiringApproval. Use exact names consistently; names will be resolved to simulator ids only after validation.`;

/** System prompt instructing an LLM to author an AIScenarioDraft as raw JSON. */
export const AI_GENERATION_SYSTEM_PROMPT = `You help design D&D 5e combat encounters for a turn-based combat simulator. Given a description of player characters, enemies, and tactics, respond with ONLY a single JSON object (no markdown fences, no commentary) matching this TypeScript shape:

interface AIScenarioDraft {
  scenarioSummary: string;
  pcs: AIDraftCombatant[];
  enemies: AIDraftCombatant[];
  actions: Action[]; // reusable attacks/spells/abilities referenced by name
  priorityScripts: AIDraftRule[]; // one or more rules per combatant, evaluated top-to-bottom
  targetPriorities: AIDraftTargetPriority[]; // optional named target lists
  assumptionsRequiringApproval: string[]; // call out any guesses you made
  maxRounds?: number;
}

interface AIDraftCombatant {
  name: string; // unique across pcs+enemies
  side: 'pc' | 'monster';
  maxHp: number;
  ac: number;
  abilityScores: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  saveProficiencies?: ('str'|'dex'|'con'|'int'|'wis'|'cha')[];
  proficiencyBonus: number;
  spellcastingAbility?: 'str'|'dex'|'con'|'int'|'wis'|'cha';
  actionNames: string[]; // must match an Action.name in "actions"
  spellSlots?: Record<number, number>; // spell level -> slots
  position?: number; // feet on a single 1D battlefield axis (0 = monster rear)
  speed?: number; // feet per turn, default 30
}

interface Action {
  id: ''; // leave empty; the app assigns ids
  name: string; // unique
  kind: 'attack' | 'spell' | 'ability' | 'heal' | 'dodge' | 'move';
  targets: number;
  attackBonus?: number;
  attackCount?: number;
  damage?: string; // dice expression, e.g. "1d8+3"
  damageType?: string;
  healAmount?: string;
  saveAbility?: 'str'|'dex'|'con'|'int'|'wis'|'cha';
  saveDc?: number;
}

interface AIDraftRule {
  actorName: string; // must match a combatant name
  actionName: string; // must match an Action.name
  priority: number; // lower fires first
  label?: string;
  condition: { type: 'always' } | { type: 'hpBelow'; threshold: number } | { type: 'enemyCountAtLeast'; count: number };
  target: { strategy: 'lowestHpEnemy' | 'nearestEnemy' | 'lowestHpAlly' | 'self' | 'namedList'; targetNames?: string[]; fallback?: string; excludeIncapacitated?: boolean };
}

interface AIDraftTargetPriority {
  name: string;
  actorName?: string;
  targetNames: string[];
  fallback: string;
}

Rules: every actionName referenced by a combatant or rule must exist in "actions"; every combatant referenced by name must exist in "pcs" or "enemies"; combatant and action names must be unique. Keep ability scores, AC, and HP within normal 5e ranges for the stated level/CR. If the request is ambiguous, make a reasonable assumption and record it in assumptionsRequiringApproval rather than asking a question — this draft is reviewed by a human before anything is applied.`;

/** User-turn prompt for an initial draft from a chat-style description. */
export function buildGenerationUserPrompt(description: string): string {
  return `Encounter request:\n${description.trim()}\n\nRespond with the JSON object only.`;
}

/** User-turn prompt asking the model to revise an existing draft per new instructions. */
export function buildRevisionUserPrompt(currentDraftJson: string, instructions: string): string {
  return `Here is the current draft JSON:\n${currentDraftJson}\n\nRevise it per these instructions, keeping everything else the same unless the instructions imply otherwise:\n${instructions.trim()}\n\nRespond with the complete, updated JSON object only.`;
}

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
