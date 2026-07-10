// Runtime combat state derived from a Scenario. Mutated during a single simulation.

import { CONDITION_CATALOG, isIncapacitated } from './conditions';
import type {
  Ability,
  Action,
  Combatant,
  ConditionInstance,
  Scenario,
  Side,
  SpellSlots,
  TargetList,
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
  /** current position on the 1D battlefield (feet). */
  position: number;
  /** movement speed in feet per turn. */
  speed: number;
  /** rider ids/labels already used this turn (for once-per-turn riders). */
  riderUsedThisTurn: Set<string>;
  /** feet of movement already spent this turn. */
  movedThisTurn: number;
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
  targetListsById: Record<string, TargetList>;
}

export function initCombatantState(c: Combatant, fallbackPosition = 0): CombatantState {
  const usesRemaining: Record<string, number> = {};
  return {
    base: c,
    hp: c.maxHp,
    conditions: [],
    spellSlots: { ...c.spellSlots },
    usesRemaining,
    down: false,
    position: c.position ?? fallbackPosition,
    speed: c.speed ?? 30,
    riderUsedThisTurn: new Set(),
    movedThisTurn: 0,
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
  };
}

/**
 * Default 1D layout when a combatant has no explicit position: monsters occupy the
 * left (rear 0 → front 30), PCs the right (front 30 → rear 45+), fronts meeting at 30.
 */
export function defaultPosition(side: Side, indexInSide: number): number {
  if (side === 'monster') return Math.max(0, 30 - indexInSide * 15);
  return 30 + indexInSide * 15;
}

export function buildCombatState(scenario: Scenario): CombatState {
  const actionsById: Record<string, Action> = {};
  for (const a of scenario.actions) actionsById[a.id] = a;
  const weaponsById: Record<string, Weapon> = {};
  for (const w of scenario.weapons ?? []) weaponsById[w.id] = w;
  const targetListsById: Record<string, TargetList> = {};
  for (const t of scenario.targetLists ?? []) targetListsById[t.id] = t;
  // assign default positions per side, by order within that side
  const sideIndex: Record<string, number> = { pc: 0, monster: 0 };
  const combatants = scenario.combatants.map((c) => {
    const idx = sideIndex[c.side]++;
    return initCombatantState(c, defaultPosition(c.side, idx));
  });
  return {
    combatants,
    order: [],
    round: 0,
    actionsById,
    weaponsById,
    targetListsById,
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

/** Linear distance in feet between two combatants. */
export function distance(a: CombatantState, b: CombatantState): number {
  return Math.abs(a.position - b.position);
}

/** Nearest living combatant from a list to `from` (ties broken by list order). */
export function nearest(from: CombatantState, candidates: CombatantState[]): CombatantState | undefined {
  let best: CombatantState | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = distance(from, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
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
export function targetAdvantage(target: CombatantState, attacker?: CombatantState): Advantage {
  let adv: Advantage = 'normal';
  const gap = attacker ? distance(attacker, target) : undefined;
  for (const cond of target.conditions) {
    const meta = CONDITION_CATALOG[cond.kind];
    if (meta.attackAgainstAdvantage) adv = combineAdvantage(adv, meta.attackAgainstAdvantage);
    if (gap !== undefined) {
      if (gap <= 5 && meta.meleeAttackAgainstAdvantage) {
        adv = combineAdvantage(adv, meta.meleeAttackAgainstAdvantage);
      }
      if (gap > 5 && meta.rangedAttackAgainstAdvantage) {
        adv = combineAdvantage(adv, meta.rangedAttackAgainstAdvantage);
      }
    }
  }
  return adv;
}
