import { useState } from 'react';
import type { Scenario } from '../engine/types';
import { runMany, type AggregateStats } from '../engine/statistics';
import { Results } from './Results';
import { InfoHint } from './InfoHint';

interface Props {
  scenario: Scenario;
  stats: AggregateStats | null;
  onResults: (stats: AggregateStats) => void;
}

export function RunTab({ scenario, stats, onResults }: Props) {
  const [sims, setSims] = useState(500);
  const [seed, setSeed] = useState(12345);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const pcs = scenario.combatants.filter((c) => c.side === 'pc');
  const monsters = scenario.combatants.filter((c) => c.side === 'monster');
  const canRun = pcs.length > 0 && monsters.length > 0;

  const run = () => {
    setRunning(true);
    // defer so the UI can paint the "running" state
    setTimeout(() => {
      const t0 = performance.now();
      const { stats } = runMany(scenario, Math.max(1, sims), seed >>> 0);
      onResults(stats);
      setElapsed(performance.now() - t0);
      setRunning(false);
    }, 10);
  };

  return (
    <div>
      <div className="panel">
        <h2>
          Run Simulations
          <InfoHint>
            Runs are reproducible: the same seed + scenario always yields the same results.
            Increase the count for tighter averages.
          </InfoHint>
        </h2>
        <div className="row">
          <label>
            Simulations
            <input className="short" type="number" min={1} max={50000} value={sims} onChange={(e) => setSims(+e.target.value)} />
          </label>
          <label>
            Seed
            <input className="short" type="number" value={seed} onChange={(e) => setSeed(+e.target.value)} />
          </label>
          <button onClick={run} disabled={!canRun || running} style={{ marginTop: '0.9rem' }}>
            {running ? 'Running…' : `▶ Run ${sims} simulations`}
          </button>
          {elapsed != null && !running && (
            <span className="muted" style={{ marginTop: '1rem' }}>
              done in {elapsed.toFixed(0)} ms
            </span>
          )}
        </div>
        {!canRun && (
          <p className="help" style={{ color: 'var(--warning-soft)' }}>
            ⚠ You need at least one PC and one monster to run a simulation.
          </p>
        )}
      </div>

      {stats && <Results stats={stats} scenario={scenario} />}
    </div>
  );
}
