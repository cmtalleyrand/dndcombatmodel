import { useEffect, useMemo, useState } from 'react';
import type { Scenario } from '../engine/types';
import type { AggregateStats } from '../engine/statistics';
import { loadScenario, saveScenario, resetScenario } from '../state/store';
import { CombatantsTab } from './CombatantsTab';
import { ActionLibraryTab } from './ActionLibraryTab';
import { InitiativeTab } from './InitiativeTab';
import { RunTab } from './RunTab';
import { ReplayTab } from './ReplayTab';
import { ScenarioIO } from './ScenarioIO';
import { AIAuthoringTab } from './AIAuthoringTab';

type Tab = 'pcs' | 'monsters' | 'library' | 'initiative' | 'ai' | 'run' | 'replay';

const TABS: { id: Tab; label: string }[] = [
  { id: 'pcs', label: 'PCs' },
  { id: 'monsters', label: 'Monsters' },
  { id: 'library', label: 'Library' },
  { id: 'initiative', label: 'Initiative' },
  { id: 'ai', label: 'AI Authoring' },
  { id: 'run', label: 'Run & Results' },
  { id: 'replay', label: 'Replay' },
];

export interface RunHistoryEntry {
  id: number;
  label: string;
  at: number;
  simulations: number;
  pcWinRate: number;
  monsterWinRate: number;
  drawRate: number;
  avgRounds: number;
}

export function App() {
  const [scenario, setScenarioState] = useState<Scenario>(() => loadScenario());
  const [tab, setTab] = useState<Tab>('pcs');
  // The latest Monte-Carlo run, lifted here so both Run & Results and the Replay
  // tab read the same result (the sample run carries the animation frames).
  const [stats, setStats] = useState<AggregateStats | null>(null);
  // Results are kept after a scenario edit but flagged stale so you can run,
  // tweak one value, and re-run to compare rather than losing the numbers.
  const [statsStale, setStatsStale] = useState(false);
  const [history, setHistory] = useState<RunHistoryEntry[]>([]);

  const setScenario = (s: Scenario) => {
    setScenarioState(s);
    saveScenario(s);
    // A changed scenario makes the previous run's results/replay out of date,
    // but we keep them visible (marked stale) instead of discarding them.
    setStatsStale(true);
  };

  const recordResults = (next: AggregateStats) => {
    setStats(next);
    setStatsStale(false);
    setHistory((prev) => [
      {
        id: Date.now(),
        label: scenario.name,
        at: Date.now(),
        simulations: next.simulations,
        pcWinRate: next.pcWinRate,
        monsterWinRate: next.monsterWinRate,
        drawRate: next.drawRate,
        avgRounds: next.avgRounds,
      },
      ...prev,
    ].slice(0, 8));
  };

  useEffect(() => {
    document.title = `${scenario.name} — D&D Combat Sim`;
  }, [scenario.name]);

  const pcs = useMemo(() => scenario.combatants.filter((c) => c.side === 'pc'), [scenario]);
  const monsters = useMemo(
    () => scenario.combatants.filter((c) => c.side === 'monster'),
    [scenario],
  );

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>⚔️ D&D 5e Combat Simulator</h1>
          <div className="muted">
            Configure combatants, script their priorities, and run Monte-Carlo simulations.
          </div>
        </div>
        <ScenarioIO scenario={scenario} setScenario={setScenario} onReset={() => setScenario(resetScenario())} />
      </header>

      <div className="tabs" role="tablist" aria-label="Sections">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const dir = e.key === 'ArrowRight' ? 1 : -1;
              const next = TABS[(i + dir + TABS.length) % TABS.length];
              setTab(next.id);
              document.getElementById(`tab-${next.id}`)?.focus();
            }}
          >
            {t.label}
            {t.id === 'pcs' && ` (${pcs.length})`}
            {t.id === 'monsters' && ` (${monsters.length})`}
            {t.id === 'replay' && stats && <span className="tab-dot" aria-label="replay ready" />}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
      {tab === 'pcs' && (
        <CombatantsTab side="pc" scenario={scenario} setScenario={setScenario} />
      )}
      {tab === 'monsters' && (
        <CombatantsTab side="monster" scenario={scenario} setScenario={setScenario} />
      )}
      {tab === 'library' && <ActionLibraryTab scenario={scenario} setScenario={setScenario} />}
      {tab === 'initiative' && <InitiativeTab scenario={scenario} setScenario={setScenario} />}
      {tab === 'ai' && <AIAuthoringTab scenario={scenario} setScenario={setScenario} />}
      {tab === 'run' && (
        <RunTab
          scenario={scenario}
          stats={stats}
          statsStale={statsStale}
          history={history}
          onClearHistory={() => setHistory([])}
          onResults={recordResults}
          onOpenReplay={() => setTab('replay')}
        />
      )}
      {tab === 'replay' && (
        <ReplayTab scenario={scenario} stats={stats} statsStale={statsStale} onGoToRun={() => setTab('run')} />
      )}
      </div>
    </div>
  );
}
