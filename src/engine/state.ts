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
  Feature,
} from './types';
import { combineAdvantage, rollD20, rollDice, type Advantage, type RNG } from './dice';
import { savingThrowBonus } from './checks';

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
  /** remaining per-combat feature resources, keyed by resource pool id. */
  resources: Record<string, number>;
  /** temporary hit points; absorbed before real HP and never stacked (take the higher). */
  tempHp: number;
  /** true once HP <= 0 and (for monsters) dead, or (for PCs) downed/unconscious. */
  down: boolean;
  /** true once removed from play for good: a slain monster or a PC who failed its death saves. */
  dead: boolean;
  /** a downed PC who succeeded three death saves is stable and stops rolling. */
  stable: boolean;
  /** running death-save tally for a downed PC. */
  deathSaves: { successes: number; failures: number };
  /** current position on the 1D battlefield (feet). */
  position: number;
  /** movement speed in feet per turn. */
  speed: number;
  /** rider ids/labels already used this turn (for once-per-turn riders). */
  riderUsedThisTurn: Set<string>;
  /** feature ids already used this turn (for once-per-turn features). */
  featureUsedThisTurn: Set<string>;
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
  featuresById: Record<string, Feature>;
}

export function initCombatantState(c: Combatant, fallbackPosition = 0): CombatantState {
  const usesRemaining: Record<string, number> = {};
  const resources: Record<string, number> = {};
  return {
    base: c,
    hp: c.maxHp,
    conditions: [],
    spellSlots: { ...c.spellSlots },
    usesRemaining,
    resources,
    tempHp: 0,
    down: false,
    dead: false,
    stable: false,
    deathSaves: { successes: 0, failures: 0 },
    position: c.position ?? fallbackPosition,
    speed: c.speed ?? 30,
    riderUsedThisTurn: new Set(),
    featureUsedThisTurn: new Set(),
    movedThisTurn: 0,
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
  };
}

export const DEFAULT_ENCOUNTER_DISTANCE = 30;
export const DEFAULT_MONSTER_FRONT_POSITION = 30;
export const DEFAULT_FORMATION_SPACING = 15;

export function defaultPosition(
  side: Side,
  indexInSide: number,
  encounterDistance = DEFAULT_ENCOUNTER_DISTANCE,
): number {
  if (side === 'monster') return Math.max(0, DEFAULT_MONSTER_FRONT_POSITION - indexInSide * DEFAULT_FORMATION_SPACING);
  return DEFAULT_MONSTER_FRONT_POSITION + encounterDistance + indexInSide * DEFAULT_FORMATION_SPACING;
}

export function buildCombatState(scenario: Scenario): CombatState {
  const actionsById: Record<string, Action> = {};
  for (const a of scenario.actions) actionsById[a.id] = a;
  const weaponsById: Record<string, Weapon> = {};
  for (const w of scenario.weapons ?? []) weaponsById[w.id] = w;
  const targetListsById: Record<string, TargetList> = {};
  for (const t of scenario.targetLists ?? []) targetListsById[t.id] = t;
  const featuresById: Record<string, Feature> = {};
  for (const f of scenario.features ?? []) featuresById[f.id] = f;
  // assign default positions per side, by order within that side
  const sideIndex: Record<string, number> = { pc: 0, monster: 0 };
  const combatants = scenario.combatants.map((c) => {
    const idx = sideIndex[c.side]++;
    const cs = initCombatantState(c, defaultPosition(c.side, idx, scenario.encounterDistance));
    for (const f of [...(c.features ?? []), ...(c.featureIds ?? []).map((id) => featuresById[id]).filter(Boolean)]) {
      if (f.resource) cs.resources[f.resource.id] = f.resource.max;
    }
    return cs;
  });
  return {
    combatants,
    order: [],
    round: 0,
    actionsById,
    weaponsById,
    targetListsById,
    featuresById,
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
export { savingThrowBonus as saveBonus, abilityCheckBonus, skillCheckBonus } from './checks';

/** Advantage on a saving throw of `ability` contributed by the target's own conditions. */
export function saveAdvantage(target: CombatantState, ability: Ability): Advantage {
  // 'dodging' grants advantage on Dex saves; restrained gives disadvantage on Dex saves.
  let adv: Advantage = 'normal';
  if (ability === 'dex') {
    if (target.conditions.some((c) => c.kind === 'dodging')) adv = combineAdvantage(adv, 'advantage');
    if (target.conditions.some((c) => c.kind === 'restrained'))
      adv = combineAdvantage(adv, 'disadvantage');
  }
  return adv;
}

export interface SaveOutcome {
  saved: boolean;
  /** total of the roll, or 0 when auto-failed. */
  total: number;
  autoFail: boolean;
}

/**
 * Resolve a saving throw for `target` against `dc`, honoring auto-fail conditions,
 * condition-driven advantage/disadvantage, and the target's own Bless (+1d4).
 */
export function resolveSave(
  rng: RNG,
  target: CombatantState,
  ability: Ability,
  dc: number,
): SaveOutcome {
  const autoFail = target.conditions.some((c) =>
    CONDITION_CATALOG[c.kind].autoFailSaves?.includes(ability),
  );
  if (autoFail) return { saved: false, total: 0, autoFail: true };
  let bonus = savingThrowBonus(target.base, ability);
  if (target.conditions.some((c) => c.kind === 'blessed')) bonus += rollDice(rng, '1d4').total;
  const roll = rollD20(rng, bonus, saveAdvantage(target, ability));
  return { saved: roll.total >= dc, total: roll.total, autoFail: false };
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
