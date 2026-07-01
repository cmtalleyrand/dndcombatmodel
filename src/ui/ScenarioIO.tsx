import { useRef, useState } from 'react';
import type { Scenario } from '../engine/types';
import { exportFullBundle, exportScenario, importFullBundle, importScenario } from '../state/store';
import { Menu, MenuItem } from './Menu';
import { LoadIcon, ResetIcon, SaveIcon } from './icons';

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
      <Menu
        className="secondary"
        label={
          <>
            <SaveIcon size={14} /> Save
          </>
        }
      >
        <MenuItem onClick={exportCurrentScenario}>Export current scenario</MenuItem>
        <MenuItem onClick={exportBundle}>Export full bundle (scenario + AI drafts)</MenuItem>
      </Menu>
      <Menu
        className="secondary"
        label={
          <>
            <LoadIcon size={14} /> Load
          </>
        }
      >
        <MenuItem onClick={() => chooseImport('scenario')}>Import scenario</MenuItem>
        <MenuItem onClick={() => chooseImport('bundle')}>Import full bundle</MenuItem>
      </Menu>
      <button className="ghost icon-only" onClick={onReset} title="Reset to sample scenario" aria-label="Reset to sample scenario">
        <ResetIcon size={15} />
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
      {error && <div style={{ color: 'var(--danger-soft)' }}>{error}</div>}
    </div>
  );
}
