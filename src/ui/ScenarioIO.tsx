import { useRef, useState } from 'react';
import type { Scenario } from '../engine/types';
import { exportFullBundle, exportScenario, importFullBundle, importScenario } from '../state/store';

interface Props {
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  onReset: () => void;
}

type ImportMode = 'scenario' | 'bundle';

export function ScenarioIO({ scenario, setScenario, onReset }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const importModeRef = useRef<ImportMode>('scenario');
  const [error, setError] = useState<string | null>(null);

  const downloadJson = (contents: string, filename: string) => {
    const blob = new Blob([contents], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCurrentScenario = () => {
    downloadJson(exportScenario(scenario), `${scenario.name.replace(/\s+/g, '_') || 'scenario'}.json`);
  };

  const exportBundle = () => {
    downloadJson(exportFullBundle(scenario), `${scenario.name.replace(/\s+/g, '_') || 'scenario'}_bundle.json`);
  };

  const chooseImport = (mode: ImportMode) => {
    importModeRef.current = mode;
    fileRef.current?.click();
  };

  const doImport = async (file: File) => {
    try {
      const text = await file.text();
      if (importModeRef.current === 'bundle') {
        const bundle = importFullBundle(text);
        setScenario(bundle.currentScenario);
      } else {
        setScenario(importScenario(text));
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import');
    }
  };

  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <button className="secondary" onClick={exportCurrentScenario}>
        ⬇ Export current scenario
      </button>
      <button className="secondary" onClick={() => chooseImport('scenario')}>
        ⬆ Import scenario
      </button>
      <button className="secondary" onClick={exportBundle}>
        ⬇ Export full bundle
      </button>
      <button className="secondary" onClick={() => chooseImport('bundle')}>
        ⬆ Import full bundle
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
