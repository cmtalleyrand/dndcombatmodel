import { useMemo, useState } from 'react';
import type { AIDraft } from '../state/store';
import {
  deleteAIDraft,
  duplicateAIDraft,
  genId,
  loadAIDrafts,
  upsertAIDraft,
} from '../state/store';

const EMPTY_DRAFT_DATA = '{\n  "changes": []\n}';

export function AIAuthoringTab() {
  const [drafts, setDrafts] = useState<AIDraft[]>(() => loadAIDrafts());
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('Untitled AI draft');
  const [approvalTemplate, setApprovalTemplate] = useState('Review and approve these proposed combat scenario changes.');
  const [draftDataText, setDraftDataText] = useState(EMPTY_DRAFT_DATA);
  const [error, setError] = useState<string | null>(null);

  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedId),
    [drafts, selectedId],
  );

  const loadDraft = (id: string) => {
    const draft = drafts.find((d) => d.id === id);
    if (!draft) return;
    setSelectedId(draft.id);
    setName(draft.name);
    setApprovalTemplate(draft.approvalTemplate);
    setDraftDataText(JSON.stringify(draft.draftData, null, 2));
    setError(null);
  };

  const saveDraft = () => {
    try {
      const draftData = JSON.parse(draftDataText) as AIDraft['draftData'];
      const now = new Date().toISOString();
      const draft: AIDraft = {
        id: selectedDraft?.id ?? genId('draft'),
        name: name.trim() || 'Untitled AI draft',
        created: selectedDraft?.created ?? now,
        updated: now,
        approvalTemplate,
        draftData,
      };
      const next = upsertAIDraft(draft);
      setDrafts(next);
      setSelectedId(draft.id);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Draft data must be valid JSON.');
    }
  };

  const newDraft = () => {
    setSelectedId('');
    setName('Untitled AI draft');
    setApprovalTemplate('Review and approve these proposed combat scenario changes.');
    setDraftDataText(EMPTY_DRAFT_DATA);
    setError(null);
  };

  return (
    <div className="panel">
      <div className="row spread">
        <div>
          <h2>AI Authoring Drafts</h2>
          <div className="muted">Save reusable AI-generated drafts separately from scenario JSON.</div>
        </div>
        <div className="row">
          <button className="secondary" onClick={newDraft}>New draft</button>
          <button onClick={saveDraft}>Save current draft</button>
        </div>
      </div>

      <div className="row" style={{ alignItems: 'flex-end', marginTop: '0.75rem' }}>
        <label>
          Saved drafts
          <select value={selectedId} onChange={(e) => loadDraft(e.target.value)}>
            <option value="">Choose a saved draft</option>
            {drafts.map((draft) => (
              <option key={draft.id} value={draft.id}>{draft.name}</option>
            ))}
          </select>
        </label>
        <button className="secondary" disabled={!selectedId} onClick={() => loadDraft(selectedId)}>
          Load
        </button>
        <button
          className="secondary"
          disabled={!selectedId}
          onClick={() => {
            const next = duplicateAIDraft(selectedId);
            setDrafts(next);
            const copy = next[next.length - 1];
            if (copy) {
              setSelectedId(copy.id);
              setName(copy.name);
              setApprovalTemplate(copy.approvalTemplate);
              setDraftDataText(JSON.stringify(copy.draftData, null, 2));
              setError(null);
            }
          }}
        >
          Duplicate
        </button>
        <button
          className="danger"
          disabled={!selectedId}
          onClick={() => {
            const next = deleteAIDraft(selectedId);
            setDrafts(next);
            newDraft();
          }}
        >
          Delete
        </button>
      </div>

      <div className="card" style={{ marginTop: '0.75rem' }}>
        <div className="row">
          <label style={{ flex: '1 1 16rem' }}>
            Draft name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {selectedDraft && <span className="tag">Updated {new Date(selectedDraft.updated).toLocaleString()}</span>}
        </div>
        <label style={{ marginTop: '0.5rem', width: '100%' }}>
          Readable approval template
          <textarea value={approvalTemplate} onChange={(e) => setApprovalTemplate(e.target.value)} />
        </label>
        <label style={{ marginTop: '0.5rem', width: '100%' }}>
          Machine-readable draft data (JSON)
          <textarea value={draftDataText} onChange={(e) => setDraftDataText(e.target.value)} />
        </label>
        {error && <div style={{ color: 'var(--monster)' }}>{error}</div>}
      </div>
    </div>
  );
}
