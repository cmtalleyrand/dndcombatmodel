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
  const sample = stats?.sampleRun;
  const hasReplay = !!sample && sample.frames.length > 1;

  return (
    <div className="panel">
      <div className="row spread">
        <h2>
          Combat Replay
          <InfoHint>
            A turn-by-turn animation of one representative run on the linear battlefield. Tokens
            slide as combatants move; health bars fall as blows land.
          </InfoHint>
        </h2>
        {hasReplay && <span className="tag">representative simulation</span>}
      </div>

      {hasReplay && statsStale && (
        <div className="stale-banner" role="status">
          ⚠ The scenario changed since this run — this replay is out of date. Re-run to refresh.
        </div>
      )}

      {hasReplay ? (
        <CombatReplay
          scenario={scenario}
          frames={sample!.frames}
          winner={sample!.winner}
          rounds={sample!.rounds}
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
