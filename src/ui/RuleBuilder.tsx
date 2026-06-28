import type {
  Combatant,
  ConditionKind,
  Rule,
  RuleCondition,
  RuleConditionType,
  Scenario,
  TargetStrategy,
} from '../engine/types';

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
  { value: 'slotAvailable', label: "Spell slot available (for this action's level)", needs: 'none' },
];

const TARGET_STRATEGIES: { value: TargetStrategy; label: string }[] = [
  { value: 'lowestHpEnemy', label: 'Lowest-HP enemy' },
  { value: 'highestHpEnemy', label: 'Highest-HP enemy' },
  { value: 'namedThenLowestHpEnemy', label: 'Named priority list → lowest-HP enemy' },
  { value: 'allEnemies', label: 'All enemies (AoE)' },
  { value: 'lowestHpAlly', label: 'Lowest-HP ally (incl. self)' },
  { value: 'allAllies', label: 'All allies (incl. self)' },
  { value: 'self', label: 'Self' },
];

const CONDITION_KINDS: ConditionKind[] = [
  'prone', 'poisoned', 'asleep', 'unconscious', 'blinded', 'restrained',
  'stunned', 'paralyzed', 'frightened', 'blessed', 'dodging',
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
      {rules.map((rule, idx) => {
        const condMeta = CONDITION_TYPES.find((c) => c.value === rule.condition.type)!;
        return (
          <div className="rule" key={idx}>
            <div className="row spread">
              <strong>Priority {rule.priority}</strong>
              <div className="row">
                <button className="ghost" onClick={() => move(idx, -1)} disabled={idx === 0}>↑</button>
                <button className="ghost" onClick={() => move(idx, 1)} disabled={idx === rules.length - 1}>↓</button>
                <button className="danger" onClick={() => remove(idx)}>✕</button>
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

            {rule.target.strategy === 'namedThenLowestHpEnemy' && (
              <div style={{ marginTop: '0.4rem' }}>
                <div className="muted" style={{ fontSize: '0.75rem' }}>Named priority order (checked = in list):</div>
                <div className="row">
                  {enemies.map((en) => {
                    const list = rule.target.namedTargets ?? [];
                    const checked = list.includes(en.id);
                    return (
                      <label key={en.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const set = e.target.checked
                              ? [...list, en.id]
                              : list.filter((x) => x !== en.id);
                            setRule(idx, { target: { ...rule.target, namedTargets: set } });
                          }}
                        />
                        {en.name}
                      </label>
                    );
                  })}
                </div>
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
