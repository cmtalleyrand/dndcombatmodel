import { useEffect, useMemo, useState } from 'react';
import type { Scenario } from '../engine/types';
import { InfoHint } from './InfoHint';
import { useDialogs } from './Dialogs';
import type { AIScenarioDraft } from '../ai/types';
import { convertDraftToScenario } from '../ai/convertDraftToScenario';
import { DraftPreview } from './DraftPreview';
import {
  AI_AUTHORING_SCHEMA_PROMPT,
  AI_GENERATION_SYSTEM_PROMPT,
  AI_PROMPT_TEMPLATE,
  buildGenerationUserPrompt,
  buildRevisionUserPrompt,
  buildValidationRepairUserPrompt,
  formatApprovalTemplate,
} from '../ai/schemaPrompt';
import { validateDraft } from '../ai/validateDraft';
import {
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
  currentApiKey,
  currentModel,
  generateDraftJson,
  loadAISettings,
  saveAISettings,
  type AIProvider,
  type AISettings,
} from '../ai/providers';

type Props = {
  scenario: Scenario;
  setScenario: (scenario: Scenario) => void;
};

const emptyDraft: AIScenarioDraft = {
  scenarioSummary: 'AI-authored encounter draft',
  pcs: [],
  enemies: [],
  actions: [],
  priorityScripts: [],
  targetPriorities: [],
  featureDecompositions: [],
  passiveTraits: [],
  resources: [],
  stackableModifiers: [],
  triggeredEffects: [],
  tacticalPolicies: [],
  assumptionsRequiringApproval: ['User must confirm that generated mechanics match the intended encounter.'],
};

function draftFromScenario(scenario: Scenario, prompt: string): AIScenarioDraft {
  const actionNamesById = new Map(scenario.actions.map((action) => [action.id, action.name]));
  const combatantNamesById = new Map(scenario.combatants.map((combatant) => [combatant.id, combatant.name]));
  return {
    scenarioSummary: prompt.trim() || scenario.name,
    pcs: scenario.combatants.filter((combatant) => combatant.side === 'pc').map((combatant) => ({
      name: combatant.name,
      side: combatant.side,
      maxHp: combatant.maxHp,
      ac: combatant.ac,
      abilityScores: combatant.abilityScores,
      saveProficiencies: combatant.saveProficiencies,
      proficiencyBonus: combatant.proficiencyBonus,
      spellcastingAbility: combatant.spellcastingAbility,
      actionNames: combatant.actionIds.map((id) => actionNamesById.get(id)).filter((name): name is string => Boolean(name)),
      spellSlots: combatant.spellSlots,
      position: combatant.position,
      speed: combatant.speed,
    })),
    enemies: scenario.combatants.filter((combatant) => combatant.side === 'monster').map((combatant) => ({
      name: combatant.name,
      side: combatant.side,
      maxHp: combatant.maxHp,
      ac: combatant.ac,
      abilityScores: combatant.abilityScores,
      saveProficiencies: combatant.saveProficiencies,
      proficiencyBonus: combatant.proficiencyBonus,
      spellcastingAbility: combatant.spellcastingAbility,
      actionNames: combatant.actionIds.map((id) => actionNamesById.get(id)).filter((name): name is string => Boolean(name)),
      spellSlots: combatant.spellSlots,
      position: combatant.position,
      speed: combatant.speed,
    })),
    actions: scenario.actions,
    priorityScripts: scenario.combatants.flatMap((combatant) => combatant.script.map((rule) => ({
      actorName: combatant.name,
      actionName: actionNamesById.get(rule.actionId) ?? rule.actionId,
      priority: rule.priority,
      label: rule.label,
      condition: rule.condition,
      target: {
        strategy: rule.target.strategy,
        targetNames: rule.target.namedTargets?.map((id) => combatantNamesById.get(id) ?? id),
        fallback: rule.target.fallback,
        excludeIncapacitated: rule.target.excludeIncapacitated,
      },
    }))),
    featureDecompositions: [],
    passiveTraits: [],
    resources: [],
    stackableModifiers: [],
    triggeredEffects: [],
    tacticalPolicies: scenario.combatants.filter((combatant) => combatant.tacticalPolicy).map((combatant) => ({ actorName: combatant.name, sourceName: 'Existing scenario tactical policy', policy: combatant.tacticalPolicy! })),
    targetPriorities: scenario.targetLists.map((list) => ({
      name: list.name,
      targetNames: list.entries.map((id) => combatantNamesById.get(id) ?? id),
      fallback: list.fallback,
    })),
    assumptionsRequiringApproval: [
      'This deterministic local draft mirrors the current simulator scenario; edit the template or JSON before applying.',
      AI_AUTHORING_SCHEMA_PROMPT,
    ],
    maxRounds: scenario.maxRounds,
  };
}

const PROVIDER_LABEL: Record<AIProvider, string> = { anthropic: 'Claude (Anthropic)', openai: 'ChatGPT (OpenAI)' };

export function AIAuthoringTab({ scenario, setScenario }: Props) {
  const { confirm } = useDialogs();
  const [prompt, setPrompt] = useState('');
  const [draftText, setDraftText] = useState(JSON.stringify(emptyDraft, null, 2));
  const [approvalTemplate, setApprovalTemplate] = useState(formatApprovalTemplate(emptyDraft));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'generating' | 'repairing'>('generating');
  const [streamPreview, setStreamPreview] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [settings, setSettings] = useState<AISettings>(() => loadAISettings());
  const [previewMode, setPreviewMode] = useState<'cards' | 'text'>('cards');
  const [showRawJson, setShowRawJson] = useState(false);

  // Live "still working" feedback: a ticking clock while a request is in flight,
  // since encounter drafts can take a while to fully generate.
  useEffect(() => {
    if (!busy) {
      setElapsedMs(0);
      return;
    }
    const start = Date.now();
    setElapsedMs(0);
    const id = setInterval(() => setElapsedMs(Date.now() - start), 200);
    return () => clearInterval(id);
  }, [busy]);

  const updateSettings = (patch: Partial<AISettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAISettings(next);
  };

  const hasKey = currentApiKey(settings).trim().length > 0;
  const modelOptions = settings.provider === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS;

  const parsedDraft = useMemo(() => {
    try {
      return JSON.parse(draftText) as AIScenarioDraft;
    } catch {
      return null;
    }
  }, [draftText]);

  const errors = parsedDraft ? validateDraft(parsedDraft) : ['Draft JSON is not parseable.'];

  const applyParsedDraft = (parsed: AIScenarioDraft) => {
    setDraftText(JSON.stringify(parsed, null, 2));
    setApprovalTemplate(formatApprovalTemplate(parsed));
  };

  const useTemplate = async () => {
    if (prompt.trim() && !(await confirm('Replace the current prompt with the fill-in template?', {
      title: 'Use template', confirmLabel: 'Replace',
    }))) return;
    setPrompt(AI_PROMPT_TEMPLATE);
  };

  const runGeneration = async (userPrompt: string, successVerb: 'generated' | 'revised') => {
    setBusy(true);
    setPhase('generating');
    setStreamPreview('');
    setMessage(`Asking ${PROVIDER_LABEL[settings.provider]} (${currentModel(settings)})…`);
    try {
      const { draft, repaired } = await generateDraftJson(settings, AI_GENERATION_SYSTEM_PROMPT, userPrompt, {
        onChunk: setStreamPreview,
        onPhase: setPhase,
      });
      let typedDraft = draft as AIScenarioDraft;
      let semanticRepaired = false;
      let issues = validateDraft(typedDraft);
      if (issues.length > 0) {
        const repairPrompt = buildValidationRepairUserPrompt(JSON.stringify(typedDraft, null, 2), issues);
        const repairedResult = await generateDraftJson(settings, AI_GENERATION_SYSTEM_PROMPT, repairPrompt, {
          onChunk: setStreamPreview,
          onPhase: setPhase,
        });
        typedDraft = repairedResult.draft as AIScenarioDraft;
        issues = validateDraft(typedDraft);
        semanticRepaired = true;
      }
      applyParsedDraft(typedDraft);
      const prefix = repaired || semanticRepaired ? `Draft ${successVerb} (automatic ${[repaired ? 'JSON' : '', semanticRepaired ? 'semantic' : ''].filter(Boolean).join(' + ')} fix attempted). ` : `Draft ${successVerb}. `;
      setMessage(
        prefix +
          (issues.length === 0
            ? 'The active scenario is unchanged until approval.'
            : `${issues.length} issue(s) to fix before approving:\n${issues.join('\n')}`),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Failed to ${successVerb === 'generated' ? 'generate' : 'revise'} a draft.`);
    } finally {
      setBusy(false);
      setStreamPreview('');
    }
  };

  const generateDraft = () => {
    if (!hasKey) {
      const next = draftFromScenario(scenario, prompt);
      applyParsedDraft(next);
      setMessage('No API key configured — generated a local draft mirroring the current scenario instead. Add a key under AI Provider to generate from your prompt.');
      return;
    }
    if (!prompt.trim()) {
      setMessage('Describe the encounter in the prompt box first (or click "Use template").');
      return;
    }
    void runGeneration(buildGenerationUserPrompt(prompt), 'generated');
  };

  const reviseDraft = () => {
    if (!parsedDraft) {
      setMessage('Cannot revise until draft JSON is valid.');
      return;
    }
    if (!hasKey) {
      const next = {
        ...parsedDraft,
        scenarioSummary: prompt.trim() || parsedDraft.scenarioSummary,
        assumptionsRequiringApproval: [...parsedDraft.assumptionsRequiringApproval, 'User requested revision before approval.'],
      };
      applyParsedDraft(next);
      setMessage('No API key configured — applied a local note instead of an AI revision. Add a key under AI Provider to revise with your prompt.');
      return;
    }
    if (!prompt.trim()) {
      setMessage('Describe what to change in the prompt box first.');
      return;
    }
    void runGeneration(buildRevisionUserPrompt(draftText, prompt), 'revised');
  };

  const approve = async () => {
    if (!parsedDraft) {
      setMessage('Cannot apply invalid JSON.');
      return;
    }
    if (!(await confirm('Approve this draft? It replaces the entire current scenario (combatants, actions, scripts). You can undo this.', {
      title: 'Approve AI draft', confirmLabel: 'Approve & replace', danger: true,
    }))) {
      return;
    }
    try {
      setScenario(convertDraftToScenario(parsedDraft));
      setMessage('Approved draft applied to the scenario.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Draft validation failed.');
    }
  };

  const discard = () => {
    setDraftText(JSON.stringify(emptyDraft, null, 2));
    setApprovalTemplate(formatApprovalTemplate(emptyDraft));
    setMessage('Draft discarded. The active scenario was not changed.');
  };

  return (
    <div className="panel">
      <div className="row spread">
        <div>
          <h2>AI Authoring</h2>
          <div className="muted">Describe an encounter, review a typed draft, then approve it into simulator state.</div>
        </div>
        <span className="tag">Scenario changes only on approval</span>
      </div>

      <div className="section">
        <div className="section-title">
          AI Provider
          <InfoHint>
            Bring your own API key. It's stored only in this browser's local storage, sent
            directly to the chosen provider when you generate or revise a draft, and is never
            included in scenario or bundle exports.
          </InfoHint>
        </div>
        <div className="field-row">
          <label>
            Provider
            <select
              value={settings.provider}
              disabled={busy}
              onChange={(e) => updateSettings({ provider: e.target.value as AIProvider })}
            >
              <option value="anthropic">{PROVIDER_LABEL.anthropic}</option>
              <option value="openai">{PROVIDER_LABEL.openai}</option>
            </select>
          </label>
          <label>
            Model
            <input
              className="model-id"
              list="ai-model-options"
              disabled={busy}
              value={currentModel(settings)}
              onChange={(e) =>
                updateSettings(
                  settings.provider === 'anthropic'
                    ? { anthropicModel: e.target.value }
                    : { openaiModel: e.target.value },
                )
              }
            />
            <datalist id="ai-model-options">
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </datalist>
          </label>
          <label>
            {PROVIDER_LABEL[settings.provider]} API key
            <input
              type="password"
              className="short"
              autoComplete="off"
              disabled={busy}
              placeholder={settings.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
              value={currentApiKey(settings)}
              onChange={(e) =>
                updateSettings(
                  settings.provider === 'anthropic'
                    ? { anthropicApiKey: e.target.value }
                    : { openaiApiKey: e.target.value },
                )
              }
            />
          </label>
        </div>
      </div>

      {/* Prompt sits above the preview (full width) so the description you write and
          the encounter it produces read top-to-bottom, not squeezed side-by-side. */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="row spread">
          <h3>Describe your encounter</h3>
          <button type="button" className="ghost mini" onClick={useTemplate} disabled={busy}>Use template</button>
        </div>
        <label style={{ width: '100%' }}>
          PCs (class, level, key abilities), monsters (type, key abilities), encounter distance, tactics, and goals
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={'Example: 4 PCs — Wizard 5 (INT 18, Fireball/Firebolt), Fighter 5 (STR 18, Longbow), Cleric 5 (WIS 16, Cure Wounds), Rogue 5 (DEX 18, Sneak Attack). Vs 2 Ogres (CR 2, Greatclub). Start 60 ft apart. Wizard opens with Fireball, cleric heals anyone below 50%.'}
            style={{ minHeight: '7rem' }}
          />
        </label>
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <button onClick={generateDraft} disabled={busy}>
            {hasKey ? 'Generate draft' : 'Generate local draft'}
          </button>
          <button className="secondary" onClick={reviseDraft} disabled={busy}>Revise draft</button>
          <button disabled={errors.length > 0 || busy} onClick={approve}>Approve and apply</button>
          <button className="danger" onClick={discard} disabled={busy}>Discard draft</button>
        </div>

        {busy && (
          <div className="ai-live">
            <div className="row spread">
              <span className="muted">
                {phase === 'repairing' ? 'Response had invalid JSON — asking the model to fix it…' : 'Streaming response…'}
              </span>
              <span className="muted">{(elapsedMs / 1000).toFixed(1)}s · {streamPreview.length.toLocaleString()} chars</span>
            </div>
            <pre className="ai-live-text">{streamPreview || 'Waiting for the first tokens…'}</pre>
          </div>
        )}
        {message && <div className="muted" style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap' }}>{message}</div>}
      </div>

      {/* Approval preview: the draft rendered as the same stat cards the editors show,
          so you approve what you can actually see — not a wall of JSON. */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="row spread">
          <h3>
            Approval preview{' '}
            <span className="muted" style={{ fontWeight: 400, fontSize: '0.8rem' }}>
              what Approve will apply — give feedback in the box above and click Revise
            </span>
          </h3>
          <div className="row">
            <div className="seg-toggle" role="group" aria-label="Preview format">
              <button
                type="button"
                className={previewMode === 'cards' ? 'active' : ''}
                onClick={() => setPreviewMode('cards')}
              >
                Cards
              </button>
              <button
                type="button"
                className={previewMode === 'text' ? 'active' : ''}
                onClick={() => setPreviewMode('text')}
              >
                Text
              </button>
            </div>
            <span
              className="tag"
              style={errors.length === 0 ? { color: 'var(--good)', borderColor: 'var(--good)' } : { color: 'var(--danger-soft)', borderColor: 'var(--danger)' }}
            >
              {errors.length === 0 ? 'Valid' : `${errors.length} issue(s)`}
            </span>
          </div>
        </div>

        {previewMode === 'cards' ? (
          parsedDraft ? (
            <DraftPreview draft={parsedDraft} />
          ) : (
            <div className="muted" style={{ marginTop: '0.75rem' }}>
              Draft JSON is not parseable — switch to Text or fix the raw JSON below.
            </div>
          )
        ) : (
          <textarea
            readOnly
            value={parsedDraft ? formatApprovalTemplate(parsedDraft) : approvalTemplate}
            style={{ minHeight: '18rem', marginTop: '0.75rem' }}
          />
        )}

        {errors.length > 0 && (
          <pre style={{ color: 'var(--danger-soft)', whiteSpace: 'pre-wrap', marginTop: '0.75rem' }}>{errors.join('\n')}</pre>
        )}

        <details className="draft-raw" open={showRawJson} onToggle={(e) => setShowRawJson((e.target as HTMLDetailsElement).open)}>
          <summary>Advanced: edit raw draft JSON <span className="muted">(source of truth — this is exactly what Approve applies)</span></summary>
          <textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} style={{ minHeight: '20rem', marginTop: '0.5rem' }} />
        </details>
      </div>
    </div>
  );
}
