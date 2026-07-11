// The simulation driver: initiative, round loop, turn resolution, and a single-run record.

import { applyTimedFeatures, consumeExtraActionFeature, dropConcentration, performAction, performTacticalDecision } from './actions';
import { CONDITION_CATALOG } from './conditions';
import { RNG, rollD20, rollDice, deriveSeed } from './dice';
import type { LogEvent, TurnFrame, CombatantSnapshot } from './log';
import { chooseAction, chooseTacticalDecision } from './rules';
import type { TacticalDecision } from './types';
import {
  abilityMod,
  buildCombatState,
  canAct,
  isAlive,
  resolveSave,
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
  /** per-turn state snapshots for animated replay; empty unless recordFrames was set. */
  frames: TurnFrame[];
}

/** Capture every combatant's animatable state at the current moment. */
function snapshotState(state: CombatState): CombatantSnapshot[] {
  return state.combatants.map((c) => ({
    id: c.base.id,
    hp: Math.max(0, c.hp),
    maxHp: c.base.maxHp,
    position: c.position,
    alive: isAlive(c),
  }));
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

/**
 * Start-of-turn condition upkeep: decrement round-based durations and expire conditions
 * whose source can no longer maintain them. Save-ends effects are handled at end of turn
 * (see `tickSaveEnds`) so they get a full round of effect before the first save, per 5e.
 */
function tickConditions(state: CombatState, c: CombatantState, events: LogEvent[]): void {
  const kept = [];
  for (const cond of c.conditions) {
    const meta = CONDITION_CATALOG[cond.kind];
    if (meta.endsWhenSourceCannotAct && cond.sourceId) {
      const source = state.combatants.find((x) => x.base.id === cond.sourceId);
      if (!source || !isAlive(source) || !canAct(source)) {
        events.push(expireEvent(state, c, cond.kind, ' (source cannot maintain it)'));
        continue;
      }
    }
    const dur = cond.duration;
    if (dur.type === 'rounds') {
      const remaining = dur.rounds - 1;
      if (remaining > 0) {
        kept.push({ ...cond, duration: { ...dur, rounds: remaining } });
      } else {
        events.push(expireEvent(state, c, cond.kind));
      }
    } else {
      // saveEnds (rolled at end of turn), permanent, concentration: persist here.
      kept.push(cond);
    }
  }
  c.conditions = kept;
}

/**
 * End-of-turn saving throws for save-ends conditions. Uses the shared save resolver so
 * advantage (dodging/restrained), the target's Bless, and auto-fail conditions all apply.
 */
function tickSaveEnds(state: CombatState, c: CombatantState, rng: RNG, events: LogEvent[]): void {
  const kept = [];
  for (const cond of c.conditions) {
    if (cond.duration.type !== 'saveEnds') {
      kept.push(cond);
      continue;
    }
    const { ability, dc } = cond.duration;
    const { saved, total, autoFail } = resolveSave(rng, c, ability, dc);
    if (saved) {
      events.push(expireEvent(state, c, cond.kind, ` (saved ${total} vs DC ${dc})`));
    } else {
      events.push(
        expireEventFailed(state, c, cond.kind, autoFail ? ' (auto-fails the save)' : ` (fails ${total} vs DC ${dc})`),
      );
      kept.push(cond);
    }
  }
  c.conditions = kept;
}

/** A downed PC's death saving throw. Nat 20 revives at 1 HP; 3 successes stabilize; 3 failures kill. */
function rollDeathSave(state: CombatState, c: CombatantState, rng: RNG, events: LogEvent[]): void {
  const roll = rng.die(20);
  const log = (message: string, type: LogEvent['type'] = 'condition') =>
    events.push({ round: state.round, actorId: c.base.id, actorName: c.base.name, type, message });

  if (roll === 20) {
    c.down = false;
    c.stable = false;
    c.deathSaves = { successes: 0, failures: 0 };
    c.hp = 1;
    log(`${c.base.name} rolls a natural 20 on a death save and regains consciousness at 1 HP.`);
    return;
  }
  if (roll === 1) {
    c.deathSaves.failures += 2;
  } else if (roll >= 10) {
    c.deathSaves.successes += 1;
  } else {
    c.deathSaves.failures += 1;
  }

  if (c.deathSaves.failures >= 3) {
    c.dead = true;
    log(`${c.base.name} fails a third death save and dies.`, 'death');
  } else if (c.deathSaves.successes >= 3) {
    c.stable = true;
    log(`${c.base.name} stabilizes.`);
  } else {
    log(
      `${c.base.name} makes a death save (roll ${roll}): ${c.deathSaves.successes} successes, ${c.deathSaves.failures} failures.`,
    );
  }
}

function expireEventFailed(
  state: CombatState,
  c: CombatantState,
  kind: import('./types').ConditionKind,
  extra: string,
): LogEvent {
  return {
    round: state.round,
    actorId: c.base.id,
    actorName: c.base.name,
    type: 'condition',
    message: `${c.base.name} is still ${CONDITION_CATALOG[kind].label}${extra}.`,
  };
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

/**
 * Run a single full combat simulation. When `recordFrames` is set, a per-turn
 * `TurnFrame` snapshot is captured for animated replay (skipped otherwise to keep
 * the Monte-Carlo bulk light).
 */
export function runSimulation(scenario: Scenario, seed: number, recordFrames = false): RunResult {
  const rng = new RNG(seed);
  const state = buildCombatState(scenario);
  state.order = rollInitiative(scenario, rng);

  const events: LogEvent[] = [];
  const damageByRound: Record<string, number[]> = {};
  for (const c of state.combatants) damageByRound[c.base.id] = [];

  const frames: TurnFrame[] = [];
  const precombatStart = events.length;
  for (const c of state.combatants) applyTimedFeatures(state, rng, c, 'precombat', events);

  if (recordFrames) {
    // Frame 0: pre-combat setup — after opening feature effects.
    frames.push({ index: 0, round: 0, actorId: null, events: events.slice(precombatStart), snapshot: snapshotState(state) });
  }

  let winner: Side | 'draw' = 'draw';

  for (let round = 1; round <= scenario.maxRounds; round++) {
    state.round = round;
    // snapshot per-combatant damage at the start of the round to compute per-round delta
    const dmgAtRoundStart: Record<string, number> = {};
    for (const c of state.combatants) dmgAtRoundStart[c.base.id] = c.damageDealt;

    for (const id of state.order) {
      const actor = state.combatants.find((c) => c.base.id === id);
      if (!actor) continue;
      if (actor.dead) continue;

      // A downed-but-not-dead PC spends its turn making a death saving throw.
      if (actor.down) {
        if (!actor.stable && actor.hp <= 0) {
          const eventsBeforeDs = events.length;
          rollDeathSave(state, actor, rng, events);
          if (recordFrames) {
            frames.push({
              index: frames.length,
              round,
              actorId: actor.base.id,
              events: events.slice(eventsBeforeDs),
              snapshot: snapshotState(state),
            });
          }
        }
        continue;
      }
      if (!isAlive(actor)) continue;

      // Reset per-turn movement budget and once-per-turn rider usage.
      actor.movedThisTurn = 0;
      actor.riderUsedThisTurn.clear();
      actor.featureUsedThisTurn.clear();

      // Mark where this turn's events begin so we can attach them to its frame.
      const eventsBefore = events.length;

      // Conditions tick at the start of the bearer's turn: durations applied during
      // other combatants' turns (e.g. Dodge, Sleep) last a full round before resolving.
      tickConditions(state, actor, events);
      applyTimedFeatures(state, rng, actor, 'startOfTurn', events);

      if (!canAct(actor)) {
        events.push({
          round,
          actorId: actor.base.id,
          actorName: actor.base.name,
          type: 'skip',
          message: `${actor.base.name} cannot act (incapacitated).`,
        });
      } else {
        const choice = actor.base.tacticalPolicy ? chooseTacticalDecision(state, actor) : chooseAction(state, actor);
        if (!choice) {
          events.push({
            round,
            actorId: actor.base.id,
            actorName: actor.base.name,
            type: 'skip',
            message: `${actor.base.name} has no valid action and waits.`,
          });
        } else {
          if ('baseAction' in choice) performTacticalDecision(state, rng, actor, choice as TacticalDecision, events);
          else performAction(state, rng, actor, choice.action, choice.targets, events);
        }

        // Bonus-action phase: after the main action, take one bonus-cost action if a rule fires.
        if (isAlive(actor) && canAct(actor)) {
          const bonus = actor.base.tacticalPolicy ? chooseTacticalDecision(state, actor, 'bonus') : chooseAction(state, actor, 'bonus');
          if (bonus) {
            if ('baseAction' in bonus) performTacticalDecision(state, rng, actor, bonus as TacticalDecision, events);
            else performAction(state, rng, actor, bonus.action, bonus.targets, events);
          }
        }

        const extraActions = isAlive(actor) && canAct(actor) ? consumeExtraActionFeature(state, actor) : 0;
        for (let extra = 0; extra < extraActions && isAlive(actor) && canAct(actor); extra++) {
          const extraChoice = actor.base.tacticalPolicy ? chooseTacticalDecision(state, actor) : chooseAction(state, actor);
          if (extraChoice) {
            if ('baseAction' in extraChoice) performTacticalDecision(state, rng, actor, extraChoice as TacticalDecision, events);
            else performAction(state, rng, actor, extraChoice.action, extraChoice.targets, events);
          }
        }
      }

      // Save-ends conditions roll their save at the end of the bearer's turn.
      if (isAlive(actor)) tickSaveEnds(state, actor, rng, events);

      if (recordFrames) {
        frames.push({
          index: frames.length,
          round,
          actorId: actor.base.id,
          events: events.slice(eventsBefore),
          snapshot: snapshotState(state),
        });
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
      return finalize(state, round, winner, events, damageByRound, frames);
    }
  }

  return finalize(state, scenario.maxRounds, 'draw', events, damageByRound, frames);
}

function finalize(
  state: CombatState,
  rounds: number,
  winner: Side | 'draw',
  events: LogEvent[],
  damageByRound: Record<string, number[]>,
  frames: TurnFrame[],
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
  return { winner, rounds, events, outcomes, damageByRound, frames };
}

// re-export helpers some callers/tests may want
export { rollDice, deriveSeed, dropConcentration };
