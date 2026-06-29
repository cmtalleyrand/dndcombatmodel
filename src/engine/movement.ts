// Linear movement on the 1D battlefield: approaching targets and explicit repositioning.

import { distance, enemiesOf, isAlive, type CombatantState, type CombatState } from './state';
import type { LogEvent } from './log';
import type { Action, Weapon } from './types';

/** Effective range of an action in feet. Melee defaults to 0 (same 15ft block). */
export function effectiveRange(action: Action, weapon?: Weapon): number {
  if (action.kind === 'attack') return action.range ?? weapon?.range ?? 0;
  // spells/abilities are only range-gated when an explicit range is set
  return action.range ?? Infinity;
}

/** Move `actor` toward `target` to get within `range`, spending up to remaining speed. */
export function approach(
  state: CombatState,
  actor: CombatantState,
  target: CombatantState,
  range: number,
  events: LogEvent[],
): void {
  if (!isFinite(range)) return;
  const gap = distance(actor, target);
  if (gap <= range) return;
  const need = gap - range;
  const avail = actor.speed - actor.movedThisTurn;
  const step = Math.min(need, avail);
  if (step <= 0) return;
  const dir = target.position >= actor.position ? 1 : -1;
  actor.position += dir * step;
  actor.movedThisTurn += step;
  events.push({
    round: state.round,
    actorId: actor.base.id,
    actorName: actor.base.name,
    type: 'move',
    targetId: target.base.id,
    targetName: target.base.name,
    message: `${actor.base.name} advances ${step}ft toward ${target.base.name} (now ${distance(actor, target)}ft away).`,
  });
}

/** Explicit move: advance toward, or retreat from, the nearest enemy up to full speed. */
export function reposition(
  state: CombatState,
  actor: CombatantState,
  mode: 'advance' | 'retreat',
  events: LogEvent[],
): void {
  const foes = enemiesOf(state, actor).filter(isAlive);
  if (foes.length === 0) return;
  // nearest enemy
  let foe = foes[0];
  for (const f of foes) if (distance(actor, f) < distance(actor, foe)) foe = f;
  const avail = actor.speed - actor.movedThisTurn;
  if (avail <= 0) return;
  const toward = foe.position >= actor.position ? 1 : -1;
  const dir = mode === 'advance' ? toward : -toward;
  const next = Math.max(0, actor.position + dir * avail);
  const moved = Math.abs(next - actor.position);
  if (moved === 0) return;
  actor.position = next;
  actor.movedThisTurn += moved;
  events.push({
    round: state.round,
    actorId: actor.base.id,
    actorName: actor.base.name,
    type: 'move',
    message: `${actor.base.name} ${mode === 'advance' ? 'advances' : 'retreats'} ${moved}ft (now ${distance(actor, foe)}ft from ${foe.base.name}).`,
  });
}
