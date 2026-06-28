import { useRef, useState } from 'react';
import type { Scenario } from '../engine/types';
import { exportScenario, importScenario } from '../state/store';

interface Props {
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  onReset: () => void;
}

export function ScenarioIO({ scenario, setScenario, onReset }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const doExport = () => {
    const blob = new Blob([exportScenario(scenario)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenario.name.replace(/\s+/g, '_') || 'scenario'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (file: File) => {
    try {
      const text = await file.text();
      setScenario(importScenario(text));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import');
    }
  };

  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <button className="secondary" onClick={doExport}>
        ⬇ Export JSON
      </button>
      <button className="secondary" onClick={() => fileRef.current?.click()}>
        ⬆ Import JSON
      </button>
      <button className="ghost" onClick={onReset}>
        ↺ Reset to sample
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void doImport(f);
          e.target.value = '';
        }}
      />
      {error && <div style={{ color: 'var(--monster)' }}>{error}</div>}
    </div>
  );
}
