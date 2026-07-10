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

type Tab = 'pcs' | 'monsters' | 'actions' | 'initiative' | 'ai' | 'run' | 'replay';

const TABS: { id: Tab; label: string }[] = [
  { id: 'pcs', label: 'PCs' },
  { id: 'monsters', label: 'Monsters' },
  { id: 'actions', label: 'Action Library' },
  { id: 'initiative', label: 'Initiative' },
  { id: 'ai', label: 'AI Authoring' },
  { id: 'run', label: 'Run & Results' },
  { id: 'replay', label: 'Replay' },
];

export function App() {
  const [scenario, setScenarioState] = useState<Scenario>(() => loadScenario());
  const [tab, setTab] = useState<Tab>('pcs');
  // The latest Monte-Carlo run, lifted here so both Run & Results and the Replay
  // tab read the same result (the sample run carries the animation frames).
  const [stats, setStats] = useState<AggregateStats | null>(null);

  const setScenario = (s: Scenario) => {
    setScenarioState(s);
    saveScenario(s);
    // A changed scenario invalidates the previous run's results/replay.
    setStats(null);
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

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'pcs' && ` (${pcs.length})`}
            {t.id === 'monsters' && ` (${monsters.length})`}
            {t.id === 'replay' && stats && <span className="tab-dot" aria-label="replay ready" />}
          </button>
        ))}
      </div>

      {tab === 'pcs' && (
        <CombatantsTab side="pc" scenario={scenario} setScenario={setScenario} />
      )}
      {tab === 'monsters' && (
        <CombatantsTab side="monster" scenario={scenario} setScenario={setScenario} />
      )}
      {tab === 'actions' && <ActionLibraryTab scenario={scenario} setScenario={setScenario} />}
      {tab === 'initiative' && <InitiativeTab scenario={scenario} setScenario={setScenario} />}
      {tab === 'ai' && <AIAuthoringTab scenario={scenario} setScenario={setScenario} />}
      {tab === 'run' && <RunTab scenario={scenario} stats={stats} onResults={setStats} />}
      {tab === 'replay' && (
        <ReplayTab scenario={scenario} stats={stats} onGoToRun={() => setTab('run')} />
      )}
    </div>
  );
}
