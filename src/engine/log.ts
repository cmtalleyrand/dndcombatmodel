// Structured event log produced during a simulation, used for the per-round narrative.

export interface LogEvent {
  round: number;
  actorId: string;
  actorName: string;
  /** the action taken, or a meta-event like 'skip'. */
  type: 'attack' | 'spell' | 'ability' | 'heal' | 'dodge' | 'skip' | 'condition' | 'death';
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
