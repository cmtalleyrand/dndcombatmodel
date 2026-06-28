// Monte Carlo driver and aggregate statistics across many simulations.

import { deriveSeed } from './dice';
import { runSimulation, type RunResult } from './simulator';
import type { Scenario, Side } from './types';

export interface CombatantStats {
  id: string;
  name: string;
  side: Side;
  maxHp: number;
  survivalRate: number; // fraction of runs survived
  avgEndHp: number;
  avgDamageDealt: number;
  avgDamageTaken: number;
  avgHealingDone: number;
  /** average damage dealt in each round index (0 = round 1). length = maxRounds. */
  avgDamageByRound: number[];
}

export interface AggregateStats {
  simulations: number;
  pcWinRate: number;
  monsterWinRate: number;
  drawRate: number;
  avgRounds: number;
  combatants: CombatantStats[];
  /** one representative run (the first) for the per-round narrative. */
  sampleRun: RunResult;
}

export interface MonteCarloResult {
  runs: RunResult[];
  stats: AggregateStats;
}

export function runMany(scenario: Scenario, simulations: number, baseSeed: number): MonteCarloResult {
  const runs: RunResult[] = [];
  for (let i = 0; i < simulations; i++) {
    runs.push(runSimulation(scenario, deriveSeed(baseSeed, i)));
  }
  return { runs, stats: aggregate(scenario, runs) };
}

export function aggregate(scenario: Scenario, runs: RunResult[]): AggregateStats {
  const n = runs.length || 1;
  const maxRounds = scenario.maxRounds;

  let pcWins = 0;
  let monsterWins = 0;
  let draws = 0;
  let totalRounds = 0;

  for (const r of runs) {
    if (r.winner === 'pc') pcWins++;
    else if (r.winner === 'monster') monsterWins++;
    else draws++;
    totalRounds += r.rounds;
  }

  const combatants: CombatantStats[] = scenario.combatants.map((c) => {
    let survived = 0;
    let endHp = 0;
    let dealt = 0;
    let taken = 0;
    let healed = 0;
    const byRound = new Array(maxRounds).fill(0);

    for (const r of runs) {
      const o = r.outcomes.find((x) => x.id === c.id);
      if (o) {
        if (o.survived) survived++;
        endHp += o.endHp;
        dealt += o.damageDealt;
        taken += o.damageTaken;
        healed += o.healingDone;
      }
      const dmgRounds = r.damageByRound[c.id] ?? [];
      for (let i = 0; i < maxRounds; i++) {
        byRound[i] += dmgRounds[i] ?? 0;
      }
    }

    return {
      id: c.id,
      name: c.name,
      side: c.side,
      maxHp: c.maxHp,
      survivalRate: survived / n,
      avgEndHp: endHp / n,
      avgDamageDealt: dealt / n,
      avgDamageTaken: taken / n,
      avgHealingDone: healed / n,
      avgDamageByRound: byRound.map((v) => v / n),
    };
  });

  return {
    simulations: runs.length,
    pcWinRate: pcWins / n,
    monsterWinRate: monsterWins / n,
    drawRate: draws / n,
    avgRounds: totalRounds / n,
    combatants,
    sampleRun: runs[0],
  };
}
