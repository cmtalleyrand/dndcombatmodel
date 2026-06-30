import type { Action, Combatant, Scenario, TargetList } from '../engine/types';
import type { AIDraftCombatant, AIScenarioDraft } from './types';
import { validateDraft } from './validateDraft';

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

function uniqueId(prefix: string, value: string, used: Set<string>): string {
  const base = `${prefix}-${slug(value)}`;
  let id = base;
  let index = 2;
  while (used.has(id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  used.add(id);
  return id;
}

export function convertDraftToScenario(draft: AIScenarioDraft): Scenario {
  const errors = validateDraft(draft);
  if (errors.length > 0) throw new Error(errors.join('\n'));

  const usedActionIds = new Set<string>();
  const actionIdsByName = new Map<string, string>();
  const actions: Action[] = draft.actions.map((action) => {
    const id = action.id || uniqueId('act', action.name, usedActionIds);
    usedActionIds.add(id);
    actionIdsByName.set(action.name, id);
    return { ...action, id };
  });

  const usedCombatantIds = new Set<string>();
  const combatantIdsByName = new Map<string, string>();
  const makeCombatant = (entry: AIDraftCombatant): Combatant => {
    const id = uniqueId(entry.side === 'pc' ? 'pc' : 'm', entry.name, usedCombatantIds);
    combatantIdsByName.set(entry.name, id);
    return {
      id,
      name: entry.name,
      side: entry.side,
      maxHp: entry.maxHp,
      ac: entry.ac,
      abilityScores: entry.abilityScores,
      saveProficiencies: entry.saveProficiencies ?? [],
      proficiencyBonus: entry.proficiencyBonus,
      spellcastingAbility: entry.spellcastingAbility,
      actionIds: entry.actionNames.map((name) => actionIdsByName.get(name)!),
      script: [],
      spellSlots: entry.spellSlots ?? {},
      position: entry.position,
      speed: entry.speed,
    };
  };

  const combatants = [...draft.pcs, ...draft.enemies].map(makeCombatant);
  const combatantsById = new Map(combatants.map((combatant) => [combatant.id, combatant]));

  const usedTargetListIds = new Set<string>();
  const targetLists: TargetList[] = draft.targetPriorities.map((priority) => ({
    id: uniqueId('tl', priority.name, usedTargetListIds),
    name: priority.name,
    entries: priority.targetNames.map((name) => combatantIdsByName.get(name)!),
    fallback: priority.fallback,
  }));

  const targetListIdsByActor = new Map<string, string>();
  draft.targetPriorities.forEach((priority, index) => {
    if (priority.actorName) targetListIdsByActor.set(priority.actorName, targetLists[index].id);
  });

  for (const rule of draft.priorityScripts) {
    const actorId = combatantIdsByName.get(rule.actorName)!;
    const actor = combatantsById.get(actorId)!;
    actor.script.push({
      priority: rule.priority,
      label: rule.label,
      condition: rule.condition,
      actionId: actionIdsByName.get(rule.actionName)!,
      target: {
        strategy: rule.target.strategy,
        namedTargets: rule.target.targetNames?.map((name) => combatantIdsByName.get(name)!),
        fallback: rule.target.fallback,
        excludeIncapacitated: rule.target.excludeIncapacitated,
        listId: targetListIdsByActor.get(rule.actorName),
      },
    });
  }

  for (const combatant of combatants) {
    combatant.script.sort((a, b) => a.priority - b.priority);
  }

  return {
    name: draft.scenarioSummary || 'AI-authored scenario',
    combatants,
    actions,
    weapons: [],
    targetLists,
    initiativeMode: 'rolled',
    maxRounds: draft.maxRounds ?? 30,
  };
}
