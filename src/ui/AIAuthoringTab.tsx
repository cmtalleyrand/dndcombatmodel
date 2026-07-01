import { useMemo, useState } from 'react';
import type { Scenario } from '../engine/types';
import type { AIScenarioDraft } from '../ai/types';
import { convertDraftToScenario } from '../ai/convertDraftToScenario';
import {
  AI_AUTHORING_SCHEMA_PROMPT,
  AI_GENERATION_SYSTEM_PROMPT,
  buildGenerationUserPrompt,
  buildRevisionUserPrompt,
  formatApprovalTemplate,
} from '../ai/schemaPrompt';
import { validateDraft } from '../ai/validateDraft';
import {
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
  currentApiKey,
  currentModel,
  extractJson,
  generateWithAI,
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
  const [prompt, setPrompt] = useState('');
  const [draftText, setDraftText] = useState(JSON.stringify(emptyDraft, null, 2));
  const [approvalTemplate, setApprovalTemplate] = useState(formatApprovalTemplate(emptyDraft));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<AISettings>(() => loadAISettings());

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

  const applyDraftJson = (rawText: string) => {
    const parsed = extractJson(rawText) as AIScenarioDraft;
    setDraftText(JSON.stringify(parsed, null, 2));
    setApprovalTemplate(formatApprovalTemplate(parsed));
    return parsed;
  };

  const generateDraft = async () => {
    if (!hasKey) {
      const next = draftFromScenario(scenario, prompt);
      setDraftText(JSON.stringify(next, null, 2));
      setApprovalTemplate(formatApprovalTemplate(next));
      setMessage('No API key configured — generated a local draft mirroring the current scenario instead. Add a key under AI Provider to generate from your prompt.');
      return;
    }
    if (!prompt.trim()) {
      setMessage('Describe the encounter in the prompt box first.');
      return;
    }
    setBusy(true);
    setMessage(`Asking ${PROVIDER_LABEL[settings.provider]} (${currentModel(settings)}) to draft the encounter…`);
    try {
      const text = await generateWithAI(settings, AI_GENERATION_SYSTEM_PROMPT, buildGenerationUserPrompt(prompt));
      const draft = applyDraftJson(text);
      const issues = validateDraft(draft);
      setMessage(
        issues.length === 0
          ? 'Draft generated. The active scenario is unchanged until approval.'
          : `Draft generated with ${issues.length} issue(s) to fix before approving:\n${issues.join('\n')}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to generate a draft.');
    } finally {
      setBusy(false);
    }
  };

  const reviseDraft = async () => {
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
      setDraftText(JSON.stringify(next, null, 2));
      setApprovalTemplate(formatApprovalTemplate(next));
      setMessage('No API key configured — applied a local note instead of an AI revision. Add a key under AI Provider to revise with your prompt.');
      return;
    }
    if (!prompt.trim()) {
      setMessage('Describe what to change in the prompt box first.');
      return;
    }
    setBusy(true);
    setMessage(`Asking ${PROVIDER_LABEL[settings.provider]} (${currentModel(settings)}) to revise the draft…`);
    try {
      const text = await generateWithAI(settings, AI_GENERATION_SYSTEM_PROMPT, buildRevisionUserPrompt(draftText, prompt));
      const draft = applyDraftJson(text);
      const issues = validateDraft(draft);
      setMessage(
        issues.length === 0
          ? 'Draft revised. Review the approval template before applying.'
          : `Draft revised with ${issues.length} issue(s) to fix before approving:\n${issues.join('\n')}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to revise the draft.');
    } finally {
      setBusy(false);
    }
  };

  const approve = () => {
    if (!parsedDraft) {
      setMessage('Cannot apply invalid JSON.');
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
        <div className="section-title">AI Provider</div>
        <p className="help">
          Bring your own API key. It's stored only in this browser's local storage, sent directly to the chosen
          provider when you generate or revise a draft, and is never included in scenario or bundle exports.
        </p>
        <div className="field-row">
          <label>
            Provider
            <select
              value={settings.provider}
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

      <div className="grid-2" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h3>Chat-style prompt</h3>
          <label style={{ width: '100%' }}>
            Describe PCs, enemies, spells, actions, scripts, positioning, and goals
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Example: Four level-3 PCs ambush two ogres at 60 feet. Wizard prioritizes Sleep, fighter protects the cleric..." />
          </label>
          <div className="row" style={{ marginTop: '0.75rem' }}>
            <button onClick={generateDraft} disabled={busy}>
              {busy ? 'Working…' : hasKey ? 'Generate draft' : 'Generate local draft'}
            </button>
            <button className="secondary" onClick={reviseDraft} disabled={busy}>
              {busy ? 'Working…' : 'Revise draft'}
            </button>
            <button disabled={errors.length > 0 || busy} onClick={approve}>Approve and apply</button>
            <button className="danger" onClick={discard} disabled={busy}>Discard draft</button>
          </div>
          {message && <div className="muted" style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap' }}>{message}</div>}
        </div>

        <div className="card">
          <h3>Editable approval template</h3>
          <textarea value={approvalTemplate} onChange={(event) => setApprovalTemplate(event.target.value)} style={{ minHeight: '18rem' }} />
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="row spread">
          <h3>Typed draft data</h3>
          <span className={errors.length === 0 ? 'tag' : 'tag'}>{errors.length === 0 ? 'Valid' : `${errors.length} issue(s)`}</span>
        </div>
        <textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} style={{ minHeight: '22rem' }} />
        {errors.length > 0 && <pre style={{ color: 'var(--monster-soft)', whiteSpace: 'pre-wrap' }}>{errors.join('\n')}</pre>}
      </div>
    </div>
  );
}
