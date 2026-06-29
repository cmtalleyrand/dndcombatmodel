// The simulation driver: initiative, round loop, turn resolution, and a single-run record.

import { dropConcentration, performAction } from './actions';
import { CONDITION_CATALOG } from './conditions';
import { RNG, rollD20, rollDice, deriveSeed } from './dice';
import type { LogEvent } from './log';
import { chooseAction } from './rules';
import {
  abilityMod,
  buildCombatState,
  canAct,
  isAlive,
  saveBonus,
  type CombatantState,
  type CombatState,
} from './state';
import type { Scenario, Side } from './types';

export interface CombatantOutcome {
  id: string;
  name: string;
  side: Side;
  endHp: number;
  maxHp: number;
  survived: boolean;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
}

export interface RunResult {
  winner: Side | 'draw';
  rounds: number;
  events: LogEvent[];
  outcomes: CombatantOutcome[];
  /** damage dealt by each combatant, per round (index 0 = round 1). */
  damageByRound: Record<string, number[]>;
}

/** Resolve initiative order, returning combatant ids in turn order. */
export function rollInitiative(scenario: Scenario, rng: RNG): string[] {
  if (scenario.initiativeMode === 'fixed' && scenario.fixedOrder?.length) {
    // keep only ids that exist in the scenario, in the given order
    const ids = new Set(scenario.combatants.map((c) => c.id));
    return scenario.fixedOrder.filter((id) => ids.has(id));
  }
  // rolled: d20 + dex mod, descending. Stable tie-break by scenario order.
  const rolls = scenario.combatants.map((c, idx) => ({
    id: c.id,
    init: rollD20(rng, abilityMod(c.abilityScores.dex)).total,
    idx,
  }));
  rolls.sort((a, b) => b.init - a.init || a.idx - b.idx);
  return rolls.map((r) => r.id);
}

function aliveSides(state: CombatState): Set<Side> {
  const sides = new Set<Side>();
  for (const c of state.combatants) if (isAlive(c)) sides.add(c.base.side);
  return sides;
}

/** Process end-of-turn condition durations for a single combatant. */
function tickConditions(state: CombatState, c: CombatantState, rng: RNG, events: LogEvent[]): void {
  const kept = [];
  for (const cond of c.conditions) {
    const dur = cond.duration;
    if (dur.type === 'rounds') {
      const remaining = dur.rounds - 1;
      if (remaining > 0) {
        kept.push({ ...cond, duration: { ...dur, rounds: remaining } });
      } else {
        events.push(expireEvent(state, c, cond.kind));
      }
    } else if (dur.type === 'saveEnds') {
      const bonus = saveBonus(c.base, dur.ability);
      const roll = rollD20(rng, bonus);
      if (roll.total >= dur.dc) {
        events.push(expireEvent(state, c, cond.kind, ` (saved ${roll.total} vs DC ${dur.dc})`));
      } else {
        kept.push(cond);
      }
    } else {
      // permanent / concentration: persist (concentration cleared elsewhere)
      kept.push(cond);
    }
  }
  c.conditions = kept;
}

function expireEvent(
  state: CombatState,
  c: CombatantState,
  kind: import('./types').ConditionKind,
  extra = '',
): LogEvent {
  return {
    round: state.round,
    actorId: c.base.id,
    actorName: c.base.name,
    type: 'condition',
    message: `${c.base.name} is no longer ${CONDITION_CATALOG[kind].label}${extra}.`,
  };
}

/** Run a single full combat simulation. */
export function runSimulation(scenario: Scenario, seed: number): RunResult {
  const rng = new RNG(seed);
  const state = buildCombatState(scenario);
  state.order = rollInitiative(scenario, rng);

  const events: LogEvent[] = [];
  const damageByRound: Record<string, number[]> = {};
  for (const c of state.combatants) damageByRound[c.base.id] = [];

  let winner: Side | 'draw' = 'draw';

  for (let round = 1; round <= scenario.maxRounds; round++) {
    state.round = round;
    // snapshot per-combatant damage at the start of the round to compute per-round delta
    const dmgAtRoundStart: Record<string, number> = {};
    for (const c of state.combatants) dmgAtRoundStart[c.base.id] = c.damageDealt;

    for (const id of state.order) {
      const actor = state.combatants.find((c) => c.base.id === id);
      if (!actor) continue;
      if (!isAlive(actor)) continue;

      // Reset per-turn movement budget and once-per-turn rider usage.
      actor.movedThisTurn = 0;
      actor.riderUsedThisTurn.clear();

      // Conditions tick at the start of the bearer's turn: durations applied during
      // other combatants' turns (e.g. Dodge, Sleep) last a full round before resolving.
      tickConditions(state, actor, rng, events);

      if (!canAct(actor)) {
        events.push({
          round,
          actorId: actor.base.id,
          actorName: actor.base.name,
          type: 'skip',
          message: `${actor.base.name} cannot act (incapacitated).`,
        });
        continue;
      }

      const choice = chooseAction(state, actor);
      if (!choice) {
        events.push({
          round,
          actorId: actor.base.id,
          actorName: actor.base.name,
          type: 'skip',
          message: `${actor.base.name} has no valid action and waits.`,
        });
      } else {
        performAction(state, rng, actor, choice.action, choice.targets, events);
      }

      // check for combat end mid-round
      const sides = aliveSides(state);
      if (sides.size <= 1) break;
    }

    // record per-round damage deltas
    for (const c of state.combatants) {
      damageByRound[c.base.id].push(c.damageDealt - dmgAtRoundStart[c.base.id]);
    }

    const sides = aliveSides(state);
    if (sides.size <= 1) {
      winner = sides.has('pc') ? 'pc' : sides.has('monster') ? 'monster' : 'draw';
      return finalize(state, round, winner, events, damageByRound);
    }
  }

  return finalize(state, scenario.maxRounds, 'draw', events, damageByRound);
}

function finalize(
  state: CombatState,
  rounds: number,
  winner: Side | 'draw',
  events: LogEvent[],
  damageByRound: Record<string, number[]>,
): RunResult {
  const outcomes: CombatantOutcome[] = state.combatants.map((c) => ({
    id: c.base.id,
    name: c.base.name,
    side: c.base.side,
    endHp: c.hp,
    maxHp: c.base.maxHp,
    survived: isAlive(c),
    damageDealt: c.damageDealt,
    damageTaken: c.damageTaken,
    healingDone: c.healingDone,
  }));
  return { winner, rounds, events, outcomes, damageByRound };
}

// re-export helpers some callers/tests may want
export { rollDice, deriveSeed, dropConcentration };
