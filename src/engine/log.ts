// Structured event log produced during a simulation, used for the per-round narrative.

export interface LogEvent {
  round: number;
  actorId: string;
  actorName: string;
  /** the action taken, or a meta-event like 'skip'. */
  type: 'attack' | 'spell' | 'ability' | 'heal' | 'dodge' | 'skip' | 'condition' | 'death' | 'move';
  /** short human-readable description. */
  message: string;
  /** structured details for richer rendering / future stats. */
  targetId?: string;
  targetName?: string;
  damage?: number;
  healing?: number;
  /** the action id used, when applicable. */
  actionId?: string;
}

export type RoundLog = LogEvent[];

/** Snapshot of a single combatant's animatable state at a point in time. */
export interface CombatantSnapshot {
  id: string;
  hp: number;
  maxHp: number;
  position: number;
  alive: boolean;
}

/**
 * A replayable frame: the state of every combatant after one turn (or the initial
 * setup), plus the log events that occurred during that turn. Drives the animated
 * combat replay. Frame 0 is the pre-combat setup (round 0, no actor, no events).
 */
export interface TurnFrame {
  index: number;
  round: number;
  actorId: string | null;
  events: LogEvent[];
  snapshot: CombatantSnapshot[];
}
