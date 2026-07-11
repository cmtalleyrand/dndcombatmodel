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
  /** the run that went worst for the party, re-recorded with frames for replay. */
  worstRun: RunResult;
}

export interface MonteCarloResult {
  runs: RunResult[];
  stats: AggregateStats;
}

export interface ProportionInterval {
  estimate: number;
  lower: number;
  upper: number;
}

export function approximateProportionInterval(estimate: number, trials: number, z = 1.96): ProportionInterval {
  if (trials <= 0) return { estimate, lower: estimate, upper: estimate };
  const halfWidth = z * Math.sqrt((estimate * (1 - estimate)) / trials);
  return {
    estimate,
    lower: Math.max(0, estimate - halfWidth),
    upper: Math.min(1, estimate + halfWidth),
  };
}

export function runMany(scenario: Scenario, simulations: number, baseSeed: number): MonteCarloResult {
  const runs: RunResult[] = [];
  for (let i = 0; i < simulations; i++) {
    // Only the representative run (the first, surfaced as sampleRun) records
    // per-turn frames for the animated replay — the rest stay light.
    runs.push(runSimulation(scenario, deriveSeed(baseSeed, i), i === 0));
  }
  const stats = aggregate(scenario, runs);

  // Identify the run that went worst for the party (loss first, then fewest surviving PCs,
  // then lowest total PC ending HP) and re-run its seed with frames on — deterministic, so
  // it reproduces exactly and gives an animatable "worst case" replay without recording all runs.
  const pcIds = new Set(scenario.combatants.filter((c) => c.side === 'pc').map((c) => c.id));
  const partyScore = (r: RunResult): number => {
    const pcOutcomes = r.outcomes.filter((o) => pcIds.has(o.id));
    const survivors = pcOutcomes.filter((o) => o.survived).length;
    const endHp = pcOutcomes.reduce((s, o) => s + Math.max(0, o.endHp), 0);
    const winRank = r.winner === 'monster' ? 0 : r.winner === 'draw' ? 1 : 2;
    return winRank * 1e9 + survivors * 1e6 + endHp; // lower = worse for the party
  };
  let worstIdx = 0;
  for (let i = 1; i < runs.length; i++) if (partyScore(runs[i]) < partyScore(runs[worstIdx])) worstIdx = i;
  stats.worstRun = worstIdx === 0 ? runs[0] : runSimulation(scenario, deriveSeed(baseSeed, worstIdx), true);

  return { runs, stats };
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
    // default; runMany replaces this with the actual worst-for-party run (with frames).
    worstRun: runs[0],
  };
}
