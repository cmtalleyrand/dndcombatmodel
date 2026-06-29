import { useState } from 'react';
import type {
  Combatant,
  ConditionKind,
  Rule,
  RuleCondition,
  RuleConditionType,
  Scenario,
  ScriptPreset,
  TargetStrategy,
} from '../engine/types';
import { deletePreset, loadPresets, savePreset } from '../state/store';

interface Props {
  combatant: Combatant;
  scenario: Scenario;
  onChange: (script: Rule[]) => void;
}

const CONDITION_TYPES: { value: RuleConditionType; label: string; needs: 'none' | 'value' | 'condition' }[] = [
  { value: 'always', label: 'Always', needs: 'none' },
  { value: 'selfHpBelowPct', label: 'Self HP below %', needs: 'value' },
  { value: 'anyAllyHpBelowPct', label: 'Any ally HP below % (incl. self)', needs: 'value' },
  { value: 'enemyCountAtLeast', label: 'Living enemies ≥', needs: 'value' },
  { value: 'enemyCountAtMost', label: 'Living enemies ≤', needs: 'value' },
  { value: 'selfHasCondition', label: 'Self has condition', needs: 'condition' },
  { value: 'anyEnemyHasCondition', label: 'Any enemy has condition', needs: 'condition' },
  { value: 'roundAtLeast', label: 'Round ≥', needs: 'value' },
  { value: 'roundAtMost', label: 'Round ≤', needs: 'value' },
  { value: 'notConcentrating', label: 'Not concentrating', needs: 'none' },
  { value: 'anyEnemyConcentrating', label: 'An enemy is concentrating', needs: 'none' },
  { value: 'slotAvailable', label: "Spell slot available (for this action's level)", needs: 'none' },
];

const TARGET_STRATEGIES: { value: TargetStrategy; label: string }[] = [
  { value: 'nearestEnemy', label: 'Nearest enemy' },
  { value: 'lowestHpEnemy', label: 'Lowest-HP enemy' },
  { value: 'highestHpEnemy', label: 'Highest-HP enemy' },
  { value: 'none', label: 'Explicit list / target list (below)' },
  { value: 'allEnemies', label: 'All enemies (AoE)' },
  { value: 'nearestAlly', label: 'Nearest ally (incl. self)' },
  { value: 'lowestHpAlly', label: 'Lowest-HP ally (incl. self)' },
  { value: 'allAllies', label: 'All allies (incl. self)' },
  { value: 'self', label: 'Self' },
];

/** Fallback strategies offered for explicit lists. */
const FALLBACK_STRATEGIES: { value: TargetStrategy; label: string }[] = [
  { value: 'nearestEnemy', label: 'then nearest enemy' },
  { value: 'lowestHpEnemy', label: 'then lowest-HP enemy' },
  { value: 'nearestAlly', label: 'then nearest ally' },
  { value: 'lowestHpAlly', label: 'then lowest-HP ally' },
  { value: 'none', label: 'no fallback' },
];

const CONDITION_KINDS: ConditionKind[] = [
  'prone', 'poisoned', 'asleep', 'unconscious', 'blinded', 'restrained',
  'stunned', 'paralyzed', 'frightened', 'blessed', 'dodging', 'raging', 'marked',
];

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

  return (
    <div>
      <PresetBar rules={rules} onApply={(r) => onChange(renumber([...rules, ...r]))} />
      {rules.map((rule, idx) => {
        const condMeta = CONDITION_TYPES.find((c) => c.value === rule.condition.type)!;
        return (
          <div className="rule" key={idx}>
            <div className="row spread">
              <strong>Priority {rule.priority}</strong>
              <div className="row">
                <button className="ghost mini" onClick={() => move(idx, -1)} disabled={idx === 0}>↑</button>
                <button className="ghost mini" onClick={() => move(idx, 1)} disabled={idx === rules.length - 1}>↓</button>
                <button className="secondary mini" onClick={() => duplicate(idx)}>⧉ Duplicate</button>
                <button className="danger mini" onClick={() => remove(idx)}>✕</button>
              </div>
            </div>

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
                  value
                  <input
                    className="num"
                    type="number"
                    value={rule.condition.value ?? 0}
                    onChange={(e) =>
                      setRule(idx, { condition: { ...rule.condition, value: +e.target.value } })
                    }
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

function defaultCondition(type: RuleConditionType): RuleCondition {
  switch (type) {
    case 'selfHpBelowPct':
    case 'anyAllyHpBelowPct':
      return { type, value: 50 };
    case 'enemyCountAtLeast':
    case 'enemyCountAtMost':
      return { type, value: 2 };
    case 'roundAtLeast':
    case 'roundAtMost':
      return { type, value: 1 };
    case 'selfHasCondition':
    case 'anyEnemyHasCondition':
      return { type, condition: 'asleep' };
    default:
      return { type };
  }
}
