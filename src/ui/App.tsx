import { useEffect, useMemo, useState } from 'react';
import type { Scenario } from '../engine/types';
import { loadScenario, saveScenario, resetScenario } from '../state/store';
import { CombatantsTab } from './CombatantsTab';
import { ActionLibraryTab } from './ActionLibraryTab';
import { InitiativeTab } from './InitiativeTab';
import { RunTab } from './RunTab';
import { ScenarioIO } from './ScenarioIO';
import { AIAuthoringTab } from './AIAuthoringTab';

type Tab = 'pcs' | 'monsters' | 'actions' | 'initiative' | 'ai' | 'run';

const TABS: { id: Tab; label: string }[] = [
  { id: 'pcs', label: 'PCs' },
  { id: 'monsters', label: 'Monsters' },
  { id: 'actions', label: 'Action Library' },
  { id: 'initiative', label: 'Initiative' },
  { id: 'ai', label: 'AI Drafts' },
  { id: 'run', label: 'Run & Results' },
];

export function App() {
  const [scenario, setScenarioState] = useState<Scenario>(() => loadScenario());
  const [tab, setTab] = useState<Tab>('pcs');

  const setScenario = (s: Scenario) => {
    setScenarioState(s);
    saveScenario(s);
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
            {t.id === 'pcs' && ` (${pcs.length}/4)`}
            {t.id === 'monsters' && ` (${monsters.length}/8)`}
          </button>
        ))}
      </div>

      {tab === 'pcs' && (
        <CombatantsTab side="pc" max={4} scenario={scenario} setScenario={setScenario} />
      )}
      {tab === 'monsters' && (
        <CombatantsTab side="monster" max={8} scenario={scenario} setScenario={setScenario} />
      )}
      {tab === 'actions' && <ActionLibraryTab scenario={scenario} setScenario={setScenario} />}
      {tab === 'initiative' && <InitiativeTab scenario={scenario} setScenario={setScenario} />}
      {tab === 'ai' && <AIAuthoringTab />}
      {tab === 'run' && <RunTab scenario={scenario} />}
    </div>
  );
}
