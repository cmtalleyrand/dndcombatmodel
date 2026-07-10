import { useState } from 'react';
import type {
  Combatant,
  ConditionKind,
  Rule,
  RuleConditionType,
  RuleTemplate,
  Scenario,
  ScriptPreset,
  TargetStrategy,
} from '../engine/types';
import { deletePreset, loadPresets, savePreset } from '../state/store';
import { CONDITION_KINDS } from '../engine/conditions';
import { CONDITION_TYPES, defaultCondition, describeCondition, describeTarget, FALLBACK_STRATEGIES, TARGET_STRATEGIES } from './ruleMeta';
import { NumberInput } from './NumberInput';

interface Props {
  combatant: Combatant;
  scenario: Scenario;
  onChange: (script: Rule[]) => void;
}

export function RuleBuilder({ combatant, scenario, onChange }: Props) {
  const rules = [...combatant.script].sort((a, b) => a.priority - b.priority);
  const available = scenario.actions.filter((a) => combatant.actionIds.includes(a.id));
  const enemies = scenario.combatants.filter((c) => c.side !== combatant.side);

  const renumber = (list: Rule[]): Rule[] => list.map((r, i) => ({ ...r, priority: i + 1 }));

  const setRule = (idx: number, patch: Partial<Rule>) => {
    const next = rules.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(renumber(next));
  };

  const addRule = () => {
    const defaultActionId = available[0]?.id ?? scenario.actions[0]?.id ?? '';
    const rule: Rule = {
      priority: rules.length + 1,
      condition: { type: 'always' },
      actionId: defaultActionId,
      target: { strategy: 'lowestHpEnemy' },
    };
    onChange(renumber([...rules, rule]));
  };

  const remove = (idx: number) => onChange(renumber(rules.filter((_, i) => i !== idx)));

  const duplicate = (idx: number) => {
    const next = [...rules];
    next.splice(idx + 1, 0, { ...rules[idx] });
    onChange(renumber(next));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(renumber(next));
  };

  if (available.length === 0) {
    return <p className="muted">Select at least one action above to build a script.</p>;
  }

  const insertFromLibrary = (template: RuleTemplate) => {
    const actionId = available.some((a) => a.id === template.actionId) ? template.actionId : available[0]?.id ?? template.actionId;
    const rule: Rule = {
      priority: rules.length + 1,
      condition: { ...template.condition },
      actionId,
      target: { ...template.target },
      label: template.label,
    };
    onChange(renumber([...rules, rule]));
  };

  return (
    <div>
      <PresetBar rules={rules} onApply={(r) => onChange(renumber([...rules, ...r]))} />
      <RuleLibraryBar library={scenario.ruleLibrary} onInsert={insertFromLibrary} />
      {rules.map((rule, idx) => {
        const condMeta = CONDITION_TYPES.find((c) => c.value === rule.condition.type)!;
        const actionName = scenario.actions.find((a) => a.id === rule.actionId)?.name ?? '(no action)';
        // Any earlier unconditional rule makes this one unreachable ("first match wins").
        const deadAfter = rules.slice(0, idx).some((r) => r.condition.type === 'always');
        return (
          <div className="rule" key={idx}>
            <div className="row spread">
              <div className="row" style={{ gap: '0.5rem' }}>
                <span className="priority-badge">{rule.priority}</span>
                {rule.label && <span className="muted">{rule.label}</span>}
              </div>
              <div className="row">
                <button className="ghost mini" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Move rule up" title="Move up">↑</button>
                <button className="ghost mini" onClick={() => move(idx, 1)} disabled={idx === rules.length - 1} aria-label="Move rule down" title="Move down">↓</button>
                <button className="secondary mini" onClick={() => duplicate(idx)} aria-label="Duplicate rule">⧉ Duplicate</button>
                <button className="danger mini" onClick={() => remove(idx)} aria-label="Remove rule" title="Remove">✕</button>
              </div>
            </div>

            <div className="rule-sentence">
              IF <strong>{describeCondition(rule.condition)}</strong> THEN <strong>{actionName}</strong> targeting <strong>{describeTarget(rule.target)}</strong>
            </div>
            {deadAfter && (
              <div className="muted" style={{ color: 'var(--warning-soft)', fontSize: '0.78rem' }}>
                ⚠ Unreachable: an earlier “Always” rule fires first, so this rule never runs.
              </div>
            )}

            <div className="row" style={{ marginTop: '0.4rem' }}>
              <label>
                IF
                <select
                  value={rule.condition.type}
                  onChange={(e) =>
                    setRule(idx, { condition: defaultCondition(e.target.value as RuleConditionType) })
                  }
                >
                  {CONDITION_TYPES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>

              {condMeta.needs === 'value' && (
                <label>
                  {rule.condition.type.endsWith('Pct') ? 'percent' : 'value'}
                  <NumberInput
                    className="num"
                    min={0}
                    value={rule.condition.value ?? 0}
                    onChange={(n) => setRule(idx, { condition: { ...rule.condition, value: n } })}
                  />
                </label>
              )}

              {condMeta.needs === 'condition' && (
                <label>
                  condition
                  <select
                    value={rule.condition.condition ?? 'asleep'}
                    onChange={(e) =>
                      setRule(idx, {
                        condition: { ...rule.condition, condition: e.target.value as ConditionKind },
                      })
                    }
                  >
                    {CONDITION_KINDS.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="row" style={{ marginTop: '0.4rem' }}>
              <label>
                THEN use
                <select value={rule.actionId} onChange={(e) => setRule(idx, { actionId: e.target.value })}>
                  {available.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>

              <label>
                targeting
                <select
                  value={rule.target.strategy}
                  onChange={(e) =>
                    setRule(idx, { target: { ...rule.target, strategy: e.target.value as TargetStrategy } })
                  }
                >
                  {TARGET_STRATEGIES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>

              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={rule.target.excludeIncapacitated ?? false}
                  onChange={(e) =>
                    setRule(idx, { target: { ...rule.target, excludeIncapacitated: e.target.checked } })
                  }
                />
                skip incapacitated
              </label>
            </div>

            {(rule.target.strategy === 'none' || rule.target.strategy === 'namedThenLowestHpEnemy') && (
              <div className="modifiers" style={{ marginTop: '0.4rem' }}>
                <div className="field-row">
                  <label>
                    Reusable target list
                    <select
                      value={rule.target.listId ?? ''}
                      onChange={(e) => setRule(idx, { target: { ...rule.target, listId: e.target.value || undefined } })}
                    >
                      <option value="">— inline list below —</option>
                      {scenario.targetLists.map((tl) => (
                        <option key={tl.id} value={tl.id}>{tl.name}</option>
                      ))}
                    </select>
                  </label>
                  {!rule.target.listId && (
                    <label>
                      Fallback
                      <select
                        value={rule.target.fallback ?? 'nearestEnemy'}
                        onChange={(e) => setRule(idx, { target: { ...rule.target, fallback: e.target.value as TargetStrategy } })}
                      >
                        {FALLBACK_STRATEGIES.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                {!rule.target.listId && (
                  <>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>Explicit priority order (check to include; order follows the roster):</div>
                    <div className="row">
                      {enemies.map((en) => {
                        const list = rule.target.namedTargets ?? [];
                        const checked = list.includes(en.id);
                        return (
                          <label key={en.id} className="check-inline">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const set = e.target.checked ? [...list, en.id] : list.filter((x) => x !== en.id);
                                setRule(idx, { target: { ...rule.target, namedTargets: set } });
                              }}
                            />
                            {en.name}
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            <input
              style={{ marginTop: '0.4rem', width: '100%' }}
              placeholder="optional label for the log"
              value={rule.label ?? ''}
              onChange={(e) => setRule(idx, { label: e.target.value })}
            />
          </div>
        );
      })}

      <button className="secondary" onClick={addRule}>+ Add rule</button>
    </div>
  );
}

/** Save the current script as a named preset, or append a saved preset's rules. */
function PresetBar({ rules, onApply }: { rules: Rule[]; onApply: (rules: Rule[]) => void }) {
  const [presets, setPresets] = useState<ScriptPreset[]>(() => loadPresets());

  const save = () => {
    const name = window.prompt('Save this script as a reusable preset named:');
    if (!name) return;
    setPresets(savePreset(name, rules));
  };

  return (
    <div className="toolbar">
      <button className="secondary mini" onClick={save} disabled={rules.length === 0}>
        💾 Save script as preset
      </button>
      <span className="muted" style={{ fontSize: '0.78rem' }}>Apply preset:</span>
      <select
        value=""
        onChange={(e) => {
          const p = presets.find((x) => x.id === e.target.value);
          if (p) onApply(p.rules.map((r) => ({ ...r })));
        }}
        disabled={presets.length === 0}
      >
        <option value="">{presets.length ? '— choose —' : '(none saved)'}</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>{p.name} ({p.rules.length})</option>
        ))}
      </select>
      {presets.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) setPresets(deletePreset(e.target.value));
          }}
        >
          <option value="">🗑 delete preset…</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

/** Insert a copy of a Rules Library template as a new rule at the end of the script. */
function RuleLibraryBar({ library, onInsert }: { library: RuleTemplate[]; onInsert: (template: RuleTemplate) => void }) {
  return (
    <div className="toolbar">
      <span className="muted" style={{ fontSize: '0.78rem' }}>Insert from Rules Library:</span>
      <select
        value=""
        onChange={(e) => {
          const t = library.find((x) => x.id === e.target.value);
          if (t) onInsert(t);
        }}
        disabled={library.length === 0}
      >
        <option value="">{library.length ? '— choose —' : '(library empty)'}</option>
        {library.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <span className="help" style={{ margin: 0 }}>Manage the library in Action Library → Rules Library.</span>
    </div>
  );
}
