// Runtime combat state derived from a Scenario. Mutated during a single simulation.

import { CONDITION_CATALOG, isIncapacitated } from './conditions';
import type {
  Ability,
  Action,
  Combatant,
  ConditionInstance,
  Scenario,
  SpellSlots,
  Weapon,
} from './types';
import { combineAdvantage, type Advantage } from './dice';

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Live combat state for one combatant during a simulation. */
export interface CombatantState {
  base: Combatant;
  hp: number;
  conditions: ConditionInstance[];
  spellSlots: SpellSlots;
  /** action id this combatant is concentrating on, if any. */
  concentratingOn?: string;
  /** remaining uses for limited-use actions, keyed by action id. */
  usesRemaining: Record<string, number>;
  /** true once HP <= 0 and (for monsters) dead, or (for PCs) downed. */
  down: boolean;
  /** per-run tally of damage dealt / taken / healing done. */
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
}

export interface CombatState {
  combatants: CombatantState[];
  /** ordered ids for the current initiative. */
  order: string[];
  round: number;
  actionsById: Record<string, Action>;
  weaponsById: Record<string, Weapon>;
}

export function initCombatantState(c: Combatant): CombatantState {
  const usesRemaining: Record<string, number> = {};
  return {
    base: c,
    hp: c.maxHp,
    conditions: [],
    spellSlots: { ...c.spellSlots },
    usesRemaining,
    down: false,
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
  };
}

export function buildCombatState(scenario: Scenario): CombatState {
  const actionsById: Record<string, Action> = {};
  for (const a of scenario.actions) actionsById[a.id] = a;
  const weaponsById: Record<string, Weapon> = {};
  for (const w of scenario.weapons ?? []) weaponsById[w.id] = w;
  return {
    combatants: scenario.combatants.map(initCombatantState),
    order: [],
    round: 0,
    actionsById,
    weaponsById,
  };
}

export function getState(cs: CombatState, id: string): CombatantState | undefined {
  return cs.combatants.find((c) => c.base.id === id);
}

export function isAlive(cs: CombatantState): boolean {
  return !cs.down && cs.hp > 0;
}

/** A combatant can take a turn if alive and not incapacitated. */
export function canAct(cs: CombatantState): boolean {
  return isAlive(cs) && !isIncapacitated(cs.conditions);
}

export function alliesOf(state: CombatState, c: CombatantState): CombatantState[] {
  return state.combatants.filter((o) => o.base.side === c.base.side);
}

export function enemiesOf(state: CombatState, c: CombatantState): CombatantState[] {
  return state.combatants.filter((o) => o.base.side !== c.base.side);
}

/** Saving throw bonus for an ability, including proficiency. */
export function saveBonus(c: Combatant, ability: Ability): number {
  const mod = abilityMod(c.abilityScores[ability]);
  return c.saveProficiencies.includes(ability) ? mod + c.proficiencyBonus : mod;
}

/** Advantage state for an attack roll made BY this combatant (from its own conditions). */
export function attackAdvantage(attacker: CombatantState): Advantage {
  let adv: Advantage = 'normal';
  for (const cond of attacker.conditions) {
    const meta = CONDITION_CATALOG[cond.kind];
    if (meta.attackByAdvantage) adv = combineAdvantage(adv, meta.attackByAdvantage);
  }
  return adv;
}

/** Advantage state contributed by the target's conditions (attacks AGAINST target). */
export function targetAdvantage(target: CombatantState): Advantage {
  let adv: Advantage = 'normal';
  for (const cond of target.conditions) {
    const meta = CONDITION_CATALOG[cond.kind];
    if (meta.attackAgainstAdvantage) adv = combineAdvantage(adv, meta.attackAgainstAdvantage);
  }
  return adv;
}
