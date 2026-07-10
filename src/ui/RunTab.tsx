import { useEffect, useRef, useState } from 'react';
import type { Scenario } from '../engine/types';
import { runMany, type AggregateStats } from '../engine/statistics';
import { Results } from './Results';
import { validateScenarioReadiness } from '../engine/validation';
import { InfoHint } from './InfoHint';
import { NumberInput } from './NumberInput';
import type { RunHistoryEntry } from './App';
import type { SimResponse } from './sim.worker';

interface Props {
  scenario: Scenario;
  stats: AggregateStats | null;
  statsStale: boolean;
  history: RunHistoryEntry[];
  onClearHistory: () => void;
  onResults: (stats: AggregateStats) => void;
  onOpenReplay: () => void;
}

export function RunTab({ scenario, stats, statsStale, history, onClearHistory, onResults, onOpenReplay }: Props) {
  const [sims, setSims] = useState(500);
  const [seed, setSeed] = useState(12345);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const readiness = validateScenarioReadiness(scenario);
  const canRun = readiness.isReady;

  // Tear down any running worker when the component unmounts.
  useEffect(() => () => workerRef.current?.terminate(), []);

  const run = () => {
    workerRef.current?.terminate();
    setRunning(true);
    setProgress(0);
    setElapsed(null);
    const t0 = performance.now();
    const count = Math.max(1, sims);

    let worker: Worker;
    try {
      worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      // Fallback: run synchronously if workers are unavailable (e.g. some test envs).
      const { stats: result } = runMany(scenario, count, seed >>> 0);
      onResults(result);
      setElapsed(performance.now() - t0);
      setRunning(false);
      return;
    }
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<SimResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setProgress(msg.done / msg.total);
      } else {
        onResults(msg.stats);
        setElapsed(performance.now() - t0);
        setRunning(false);
        worker.terminate();
        workerRef.current = null;
      }
    };
    worker.postMessage({ scenario, simulations: count, baseSeed: seed >>> 0 });
  };

  const cancel = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setRunning(false);
    setProgress(0);
  };

  return (
    <div>
      <div className="panel">
        <h2>
          Run Simulations
          <InfoHint>
            Runs are reproducible: the same seed + scenario always yields the same results.
            Increase the count for tighter averages. Simulations run in the background so the
            page stays responsive.
          </InfoHint>
        </h2>
        <div className="row">
          <label>
            Simulations
            <NumberInput className="short" min={1} max={50000} value={sims} onChange={setSims} />
          </label>
          <label>
            Seed
            <NumberInput className="short" value={seed} onChange={setSeed} />
          </label>
          {running ? (
            <button onClick={cancel} className="danger" style={{ marginTop: '0.9rem' }}>
              ✕ Cancel
            </button>
          ) : (
            <button onClick={run} disabled={!canRun} style={{ marginTop: '0.9rem' }}>
              ▶ Run {sims} simulations
            </button>
          )}
          {elapsed != null && !running && (
            <span className="muted" style={{ marginTop: '1rem' }}>
              done in {elapsed.toFixed(0)} ms
            </span>
          )}
        </div>

        {running && (
          <div style={{ marginTop: '0.8rem' }} aria-live="polite">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              className="progress-track"
            >
              <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <span className="help">Running… {Math.round(progress * 100)}%</span>
          </div>
        )}

        <ReadinessPanel errors={readiness.errors} warnings={readiness.warnings} />
      </div>

      {history.length > 0 && <RunHistory history={history} onClear={onClearHistory} />}

      {stats && (
        <>
          {statsStale && (
            <div className="stale-banner" role="status">
              ⚠ The scenario changed since this run — these results are out of date. Re-run to refresh.
            </div>
          )}
          <Results stats={stats} scenario={scenario} onOpenReplay={onOpenReplay} />
        </>
      )}
    </div>
  );
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function RunHistory({ history, onClear }: { history: RunHistoryEntry[]; onClear: () => void }) {
  return (
    <div className="panel">
      <h2>
        Run history
        <InfoHint>The last few runs, newest first — tweak the scenario and re-run to compare win rates.</InfoHint>
      </h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="history-table">
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Sims</th>
              <th>PC win</th>
              <th>Monster win</th>
              <th>Draw</th>
              <th>Avg rounds</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td>{h.label}</td>
                <td>{h.simulations}</td>
                <td>{pct(h.pcWinRate)}</td>
                <td>{pct(h.monsterWinRate)}</td>
                <td>{pct(h.drawRate)}</td>
                <td>{h.avgRounds.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="ghost" onClick={onClear} style={{ marginTop: '0.6rem' }}>
        Clear history
      </button>
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
