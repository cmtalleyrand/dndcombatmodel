import { useState } from 'react';
import type { Scenario } from '../engine/types';
import { runMany, type AggregateStats } from '../engine/statistics';
import { Results } from './Results';
import { validateScenarioReadiness } from '../engine/validation';
import { InfoHint } from './InfoHint';

interface Props {
  scenario: Scenario;
  stats: AggregateStats | null;
  onResults: (stats: AggregateStats) => void;
  onOpenReplay: () => void;
}

export function RunTab({ scenario, stats, onResults, onOpenReplay }: Props) {
  const [sims, setSims] = useState(500);
  const [seed, setSeed] = useState(12345);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const readiness = validateScenarioReadiness(scenario);
  const canRun = readiness.isReady;

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
        <ReadinessPanel errors={readiness.errors} warnings={readiness.warnings} />
      </div>

      {stats && <Results stats={stats} scenario={scenario} onOpenReplay={onOpenReplay} />}
    </div>
  );
}

function ReadinessPanel({ errors, warnings }: { errors: { message: string }[]; warnings: { message: string }[] }) {
  const ready = errors.length === 0;
  return (
    <div style={{ marginTop: '1rem' }}>
      <strong>{ready ? '✓ Scenario structurally ready' : '⚠ Scenario needs attention before running'}</strong>
      {errors.length > 0 && (
        <>
          <p className="help" style={{ color: 'var(--warning-soft)' }}>Blocking errors</p>
          <ul>
            {errors.map((issue, i) => <li key={i}>{issue.message}</li>)}
          </ul>
        </>
      )}
      {warnings.length > 0 && (
        <>
          <p className="help">Warnings</p>
          <ul>
            {warnings.map((issue, i) => <li key={i}>{issue.message}</li>)}
          </ul>
        </>
      )}
      {ready && warnings.length === 0 && <p className="help">No blocking graph-reference problems were found.</p>}
    </div>
  );
}
