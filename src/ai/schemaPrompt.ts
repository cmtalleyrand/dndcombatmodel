import type { AIScenarioDraft } from './types';

export const AI_AUTHORING_SCHEMA_PROMPT = `Return only an approved-draft JSON object with these sections: scenarioSummary, pcs, enemies, actions, priorityScripts, targetPriorities, featureDecompositions, passiveTraits, resources, stackableModifiers, triggeredEffects, tacticalPolicies, assumptionsRequiringApproval. Use exact names consistently; names will be resolved to simulator ids only after validation.`;

/** System prompt instructing an LLM to author an AIScenarioDraft as raw JSON. */
export const AI_GENERATION_SYSTEM_PROMPT = `You help design D&D 5e combat encounters for a turn-based combat simulator. Given a description of player characters, enemies, and tactics, respond with ONLY a single JSON object (no markdown fences, no commentary) matching this TypeScript shape:

interface AIScenarioDraft {
  scenarioSummary: string;
  pcs: AIDraftCombatant[];
  enemies: AIDraftCombatant[];
  actions: Action[]; // reusable attacks/spells/abilities referenced by name
  priorityScripts: AIDraftRule[]; // one or more rules per combatant, evaluated top-to-bottom
  targetPriorities: AIDraftTargetPriority[]; // optional named target lists, empty array if unused
  featureDecompositions?: AIDraftFeatureDecomposition[]; // one entry per named feat/class/species/item/buff feature requested
  passiveTraits?: AIDraftPassiveTrait[]; // long-duration stat changes such as speed increases
  resources?: AIDraftResource[]; // finite pools such as Action Surge, superiority dice, species feature uses
  stackableModifiers?: AIDraftStackableModifier[]; // feat/maneuver/rider modifiers layered onto base actions
  triggeredEffects?: AIDraftTriggeredEffect[]; // on-hit, after-miss, precombat, start-of-combat, action-economy effects
  tacticalPolicies?: AIDraftTacticalPolicy[]; // movement, target, modifier, and resource policies by actor
  assumptionsRequiringApproval: string[]; // call out any guesses you made
  maxRounds?: number; // defaults to 30
}

interface AIDraftCombatant {
  name: string; // unique across pcs+enemies
  side: 'pc' | 'monster';
  maxHp: number;
  ac: number;
  abilityScores: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  saveProficiencies?: ('str'|'dex'|'con'|'int'|'wis'|'cha')[];
  proficiencyBonus: number;
  spellcastingAbility?: 'str'|'dex'|'con'|'int'|'wis'|'cha'; // only if this combatant casts spells with a save DC
  actionNames: string[]; // must match an Action.name in "actions"
  spellSlots?: Record<number, number>; // spell level (as a string key, e.g. "1") -> slots available
  position?: number; // feet on a single 1D battlefield axis; 0 = monster rear, higher = deeper into PC territory
  speed?: number; // feet per turn, default 30
  level?: number; // character/monster level, used for cantrip scaling; default 1
  resistances?: string[]; // damage types taken at half, e.g. ["bludgeoning","fire"]
  immunities?: string[]; // damage types taken as zero
  vulnerabilities?: string[]; // damage types taken at double
  conditionImmunities?: string[]; // condition kinds this cannot suffer, e.g. ["poisoned","charmed"]
  declaredFeatureNames?: string[]; // names of this combatant's class/species features (e.g. ["Rage","Extra Attack"]); each must match a featureDecompositions[].sourceName so the feature is wired to this combatant
}

// A reusable attack/spell/ability. Prefer the simple "manual" attack/damage fields below
// over anything weapon-library-specific — do not invent a weaponId.
interface Action {
  id: ''; // leave empty; the app assigns ids
  name: string; // unique
  kind: 'attack' | 'spell' | 'ability' | 'dodge' | 'move';
  targets: number; // number of distinct targets this hits, usually 1
  attackBonus?: number; // to-hit bonus for an attack roll
  attackCount?: number; // number of separate attack rolls this action makes (e.g. 2 for Extra Attack)
  damage?: string; // dice expression on a hit, e.g. "1d8+3"
  damageType?: string; // e.g. "slashing", "fire"
  extraDamage?: { dice?: string; flat?: number; type: string; label?: string }[]; // extra typed damage packets, each checked against resistances (e.g. a flaming weapon's "2d6" fire)
  heal?: string; // dice expression healed, e.g. "1d8+3"; set for a healing spell/ability
  tempHp?: string; // dice expression of temporary HP granted (e.g. "2d4"); does not stack
  save?: { ability: 'str'|'dex'|'con'|'int'|'wis'|'cha'; dc?: number; onSuccess: 'half' | 'none' }; // set for a saving-throw effect instead of an attack roll; omit dc to derive it from the caster
  range?: number; // feet; omit to use a sensible melee/ranged default
  aoeRadius?: number; // feet; affects everyone within this radius of the primary target (damage hits both sides)
  aoeTargets?: 'all' | 'allies' | 'enemies'; // who an AoE affects; defaults to 'all' for damage, 'allies' for heals
  spellLevel?: number; // spell slot level consumed, omit for cantrips/non-spells
  concentration?: boolean;
  cantripScaling?: boolean; // true for a damage cantrip whose dice scale with the caster's level (5/11/17)
  actionCost?: 'action' | 'bonus'; // 'bonus' for a bonus-action ability (e.g. Healing Word); default 'action'
  moveMode?: 'advance' | 'retreat'; // only for kind: 'move'
}

interface AIDraftRule {
  actorName: string; // must match a combatant name
  actionName: string; // must match an Action.name
  priority: number; // lower fires first
  label?: string;
  // condition.type must be one of these exact strings; "value" is a percentage (0-100) for
  // *HpBelow* conditions or a headcount for enemyCountAtLeast/AtMost; omit value/condition when unused.
  condition: {
    type: 'always' | 'selfHpBelowPct' | 'anyAllyHpBelowPct' | 'enemyCountAtLeast' | 'enemyCountAtMost'
      | 'selfHasCondition' | 'anyEnemyHasCondition' | 'roundAtLeast' | 'roundAtMost' | 'notConcentrating'
      | 'anyEnemyConcentrating' | 'slotAvailable';
    value?: number;
    condition?: string; // condition kind for selfHasCondition/anyEnemyHasCondition, e.g. "poisoned", "frightened", "blessed"
    // Optional compound predicate: extra leaf conditions (same shape, each with its own type/value/condition)
    // combined with the primary via combine. Use for "bloodied AND an enemy is concentrating".
    extra?: { type: string; value?: number; condition?: string }[];
    combine?: 'and' | 'or'; // how to combine the primary condition with extra (default 'and')
  };
  target: {
    // strategy must be one of these exact strings
    strategy: 'lowestHpEnemy' | 'highestHpEnemy' | 'nearestEnemy' | 'lowestHpAlly' | 'nearestAlly'
      | 'self' | 'allEnemies' | 'allAllies' | 'none';
    targetNames?: string[]; // an explicit ordered priority list of combatant names, used before the strategy
    fallback?: string; // one of the strategy values above, used once targetNames is exhausted
    excludeIncapacitated?: boolean;
  };
}


interface AIDraftFeatureDecomposition {
  sourceName: string; // exact requested rule/feature name, e.g. "Sharpshooter"
  sourceType?: string; // feat, maneuver, species, spell, item, class feature, buff, tactic
  category: 'baseAction' | 'passiveTrait' | 'resource' | 'stackableModifier' | 'triggeredEffect' | 'tacticalPolicy';
  simulatorRepresentation: string; // what field/list below carries it
  triggerTiming: 'precombat' | 'startOfCombat' | 'startOfTurn' | 'beforeAttackRoll' | 'afterAttackRollBeforeHitResolution' | 'onHit' | 'afterMiss' | 'actionEconomy' | 'passive';
  resourceCost?: string; // e.g. "1 superiority die" or "none"
  stackingBehavior: string; // e.g. "stacks with Precision Attack on Longbow"
  appliesToActionNames?: string[]; // base actions affected by the feature
  consumesResourceName?: string;
  createsResourceName?: string;
  knownApproximationOrUnsupported?: string;
}
interface AIDraftPassiveTrait { name: string; sourceName: string; speedBonus?: number; speedOverride?: number; simulatorRepresentation: string; }
interface AIDraftResource { name: string; sourceName: string; max: number; }
interface AIDraftStackableModifier { name: string; sourceName: string; timing: 'beforeAttackRoll'|'afterAttackRollBeforeHitResolution'|'onHit'; appliesToActionNames: string[]; toHit?: number; damage?: number; extraDamageDice?: string; extraDamageType?: string; resourceName?: string; spendTrigger?: 'always'|'onHit'|'missWithin'; missThreshold?: number; stackingBehavior: string; }
interface AIDraftTriggeredEffect { name: string; sourceName: string; timing: 'precombat'|'startOfCombat'|'startOfTurn'|'onHit'|'afterMiss'|'actionEconomy'; appliesToActionNames?: string[]; resourceName?: string; spendTrigger?: 'always'|'onHit'|'missWithin'; extraDamageDice?: string; extraDamageType?: string; extraActionCount?: number; simulatorRepresentation: string; }
interface AIDraftTacticalPolicy { actorName: string; sourceName?: string; policy: TacticalPolicy; }

interface AIDraftTargetPriority {
  name: string;
  actorName?: string;
  targetNames: string[];
  fallback: string; // one of the TargetStrategy values listed above
}

Decomposition rules: never turn a feat, maneuver, species ability, or long-duration buff into a separate Action unless the ability is actually a distinct action chosen in play. A longbow attack with Sharpshooter is one base Action named like "Longbow", plus a stackableModifier named "Sharpshooter". Precision Attack is a post-roll stackableModifier with a resource, not "Precision Attack Longbow". Action Surge is an actionEconomy triggeredEffect/resource, not "Action Surge Attack". Every requested feature must appear in featureDecompositions and must be consumed by at least one passiveTraits, resources, stackableModifiers, triggeredEffects, tacticalPolicies, or assumptionsRequiringApproval entry. For each requested feature record the rule source/name, simulator representation, trigger/timing, resource cost, stacking behavior, and any known approximation or unsupported piece. Movement-affecting features must either change speed through passiveTraits or create a movement policy. Limited-use features must declare a resources entry with a positive max.

Presentation: the user reviews this draft as PC and monster stat cards, not as JSON. Each card shows name, HP, AC, the full ability-score block with modifiers, save proficiencies, damage resistances/immunities, spell slots, every action with its derived to-hit/damage/save DC, features, and the full priority script. Fill every combatant out completely so the cards read like a real stat block: always set the six abilityScores, proficiencyBonus, and level; set saveProficiencies for classed PCs and monsters that have them; set position (in feet) for every combatant so the encounter distance the user asked for is visible; give each combatant at least one action and at least one priority-script rule so it does not merely Dodge.

Rules: every actionName referenced by a combatant or rule must exist in "actions"; every combatant referenced by name must exist in "pcs" or "enemies"; combatant and action names must be unique; condition.type and target.strategy/fallback must be exactly one of the listed strings (do not invent new ones). Keep ability scores, AC, and HP within normal 5e ranges for the stated level/CR. If the request is ambiguous, make a reasonable assumption and record it in assumptionsRequiringApproval rather than asking a question — this draft is reviewed by a human before anything is applied. Keep the encounter reasonably sized (typically no more than ~6 combatants and ~10 actions total) unless asked for something larger, since the whole draft must fit in one response.`;

/**
 * A structured fill-in-the-blank starting point for the chat-style prompt. It mirrors
 * the fields the approval preview cards show (per-PC class/level/abilities, per-monster
 * type/abilities, encounter distance), so a filled-in template gives the model enough
 * to build complete stat cards. Users can edit or delete any line.
 */
export const AI_PROMPT_TEMPLATE = `# Party — Player Characters
Number of PCs: [e.g. 4]
List each PC as one line:
- [Name] — [Class] [Level], key abilities [e.g. INT 18, DEX 14], HP/AC [e.g. 27 HP / 12 AC], signature spells & attacks [e.g. Fireball, Firebolt, Shield], notable features/feats [e.g. Sculpt Spells]
- ...

# Enemies — Monsters
Number of monsters: [e.g. 2]
List each monster (or identical group) as one line:
- [Name] ×[count] — [type/CR, e.g. Ogre CR 2], key abilities [e.g. STR 19, CON 16], HP/AC [e.g. 59 HP / 11 AC], attacks [e.g. Greatclub +6, 2d8+4], notable abilities [e.g. Multiattack]
- ...

# Battlefield
Starting distance between the sides: [e.g. 60 ft]
Positions / terrain: [e.g. PCs clustered together, ogres advancing from cover]

# Tactics & priorities
Who focuses which target: [e.g. everyone focus-fires the nearest ogre]
When to spend limited resources: [e.g. Wizard opens with Fireball, Cleric heals allies below 50% HP]
Retreat / protect / positioning behavior: [e.g. Rogue stays at range, Fighter guards the Cleric]

# What to learn
Question this simulation should answer: [e.g. party win rate and average rounds to victory]`;

/** User-turn prompt for an initial draft from a chat-style description. */
export function buildGenerationUserPrompt(description: string): string {
  return `Encounter request:\n${description.trim()}\n\nRespond with the JSON object only.`;
}

/** User-turn prompt asking the model to revise an existing draft per new instructions. */
export function buildRevisionUserPrompt(currentDraftJson: string, instructions: string): string {
  return `Here is the current draft JSON:\n${currentDraftJson}\n\nRevise it per these instructions, keeping everything else the same unless the instructions imply otherwise:\n${instructions.trim()}\n\nRespond with the complete, updated JSON object only.`;
}

/** User-turn prompt asking the model to fix JSON it returned that failed to parse. */
export function buildValidationRepairUserPrompt(currentDraftJson: string, validationErrors: string[]): string {
  return `The draft JSON parsed, but failed simulator validation with these issues:
${validationErrors.map((error) => `- ${error}`).join('\n')}\n\nHere is the current draft JSON:
${currentDraftJson}\n\nRevise it to fix every issue. Preserve the encounter intent. Decompose pseudo-actions into base actions plus modifiers/resources/policies. Return the complete, updated JSON object only.`;
}

export function buildRepairUserPrompt(brokenText: string, parseError: string): string {
  return `The JSON you returned could not be parsed: ${parseError}\n\nHere is what you returned:\n${brokenText}\n\nReturn the same draft again, but as complete, syntactically valid JSON only — no markdown fences, no commentary, and make sure it is not cut off before the closing brace.`;
}

export function formatApprovalTemplate(draft: AIScenarioDraft): string {
  const lines = [
    `# Scenario summary\n${draft.scenarioSummary}`,
    `# PCs\n${draft.pcs.map((pc) => `- ${pc.name}: HP ${pc.maxHp}, AC ${pc.ac}, actions ${pc.actionNames.join(', ')}`).join('\n') || '- none'}`,
    `# Enemies\n${draft.enemies.map((enemy) => `- ${enemy.name}: HP ${enemy.maxHp}, AC ${enemy.ac}, actions ${enemy.actionNames.join(', ')}`).join('\n') || '- none'}`,
    `# Base actions/spells/abilities\n${draft.actions.map((action) => `- ${action.name} (${action.kind})`).join('\n') || '- none'}`,
    `# Feature decomposition\n${(draft.featureDecompositions ?? []).map((f) => `- ${f.sourceName}: ${f.category}; ${f.triggerTiming}; ${f.simulatorRepresentation}; resource ${f.resourceCost ?? 'none'}; stacks: ${f.stackingBehavior}${f.knownApproximationOrUnsupported ? `; note: ${f.knownApproximationOrUnsupported}` : ''}`).join('\n') || '- none'}`,
    `# Passive traits/resources/modifiers/effects\n${[...(draft.passiveTraits ?? []).map((p) => `- Passive ${p.name}: ${p.simulatorRepresentation}`), ...(draft.resources ?? []).map((r) => `- Resource ${r.name}: ${r.max} use(s)`), ...(draft.stackableModifiers ?? []).map((m) => `- Modifier ${m.name}: ${m.timing} on ${m.appliesToActionNames.join(', ')}${m.resourceName ? `; spends ${m.resourceName}` : ''}`), ...(draft.triggeredEffects ?? []).map((e) => `- Trigger ${e.name}: ${e.timing}; ${e.simulatorRepresentation}`)].join('\n') || '- none'}`,
    `# Tactical policies\n${(draft.tacticalPolicies ?? []).map((p) => `- ${p.actorName}: ${JSON.stringify(p.policy)}`).join('\n') || '- none'}`,
    `# Priority scripts\n${draft.priorityScripts.map((rule) => `- ${rule.actorName} [${rule.priority}]: ${rule.actionName} -> ${rule.target.strategy}`).join('\n') || '- none'}`,
    `# Target priorities\n${draft.targetPriorities.map((priority) => `- ${priority.name}: ${priority.targetNames.join(', ')}; fallback ${priority.fallback}`).join('\n') || '- none'}`,
    `# Assumptions requiring user approval\n${draft.assumptionsRequiringApproval.map((item) => `- ${item}`).join('\n') || '- none'}`,
  ];
  return lines.join('\n\n');
}
