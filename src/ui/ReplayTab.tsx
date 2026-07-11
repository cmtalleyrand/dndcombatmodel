import { useState } from 'react';
import type { Scenario } from '../engine/types';
import type { AggregateStats } from '../engine/statistics';
import { CombatReplay } from './CombatReplay';
import { InfoHint } from './InfoHint';

interface Props {
  scenario: Scenario;
  stats: AggregateStats | null;
  statsStale?: boolean;
  onGoToRun: () => void;
}

export function ReplayTab({ scenario, stats, statsStale, onGoToRun }: Props) {
  const [which, setWhich] = useState<'representative' | 'worst'>('representative');
  const run = stats ? (which === 'worst' ? stats.worstRun : stats.sampleRun) : undefined;
  const hasReplay = !!run && run.frames.length > 1;

  return (
    <div className="panel">
      <div className="row spread">
        <h2>
          Combat Replay
          <InfoHint>
            A turn-by-turn animation on the linear battlefield. Tokens slide as combatants move;
            health bars fall as blows land. Switch between a representative run and the run that
            went worst for the party.
          </InfoHint>
        </h2>
        {stats && (
          <div className="row" role="group" aria-label="Which run to replay">
            <button className={which === 'representative' ? '' : 'secondary'} onClick={() => setWhich('representative')}>Representative</button>
            <button className={which === 'worst' ? '' : 'secondary'} onClick={() => setWhich('worst')} title="The simulation that went worst for the party">Worst for party</button>
          </div>
        )}
      </div>

      {hasReplay && statsStale && (
        <div className="stale-banner" role="status">
          ⚠ The scenario changed since this run — this replay is out of date. Re-run to refresh.
        </div>
      )}

      {hasReplay ? (
        <CombatReplay
          scenario={scenario}
          frames={run!.frames}
          winner={run!.winner}
          rounds={run!.rounds}
        />
      ) : (
        <div className="replay-empty">
          <div className="replay-empty-icon">⚔️</div>
          <p>No battle to replay yet.</p>
          <button onClick={onGoToRun}>Go to Run &amp; Results</button>
          <p className="help">Run a simulation there and the animated replay will appear here.</p>
        </div>
      )}
    </div>
  );
}
