import { useState } from 'react';
import type { Ability, Action, ActionKind, ConditionKind, DamageType, Scenario } from '../engine/types';
import { genId, removeAction, upsertAction } from '../state/store';

interface Props {
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
}

const KINDS: ActionKind[] = ['attack', 'spell', 'ability', 'dodge', 'move'];
const DAMAGE_TYPES: DamageType[] = [
  'bludgeoning', 'piercing', 'slashing', 'fire', 'cold', 'lightning', 'acid',
  'poison', 'necrotic', 'radiant', 'force', 'psychic', 'thunder',
];
const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export function ActionLibraryTab({ scenario, setScenario }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const add = () => {
    const a: Action = { id: genId('act'), name: 'New Action', kind: 'attack', targets: 1, attackBonus: 4, attackCount: 1, damage: '1d6+2', damageType: 'slashing' };
    setScenario(upsertAction(scenario, a));
    setOpenId(a.id);
  };

  const used = (id: string) => scenario.combatants.filter((c) => c.actionIds.includes(id) || c.script.some((r) => r.actionId === id));

  return (
    <div>
      <div className="panel">
        <div className="row spread">
          <h2>Action Library</h2>
          <button onClick={add}>+ Add Action</button>
        </div>
        <p className="help">
          Reusable attacks, spells and abilities. Combatants reference these by selecting them on
          their card and using them in script rules. For now move, an attack sequence, a spell, or
          an ability each consume a full turn.
        </p>
      </div>

      {scenario.actions.map((a) => {
        const usedBy = used(a.id);
        return (
          <div className="card" key={a.id}>
            <div className="row spread">
              <div className="row">
                <strong>{a.name}</strong>
                <span className="tag">{a.kind}</span>
                {a.spellLevel ? <span className="tag">L{a.spellLevel} slot</span> : null}
                {a.damage ? <span className="tag">{a.damage} {a.damageType}</span> : null}
                {a.heal ? <span className="tag">heal {a.heal}</span> : null}
                {a.concentration ? <span className="tag">concentration</span> : null}
                <span className="tag">used by {usedBy.length}</span>
              </div>
              <div className="row">
                <button className="secondary" onClick={() => setOpenId(openId === a.id ? null : a.id)}>
                  {openId === a.id ? 'Collapse' : 'Edit'}
                </button>
                <button
                  className="danger"
                  disabled={a.id === 'act-dodge' || a.id === 'act-move'}
                  onClick={() => setScenario(removeAction(scenario, a.id))}
                >
                  Delete
                </button>
              </div>
            </div>
            {openId === a.id && (
              <ActionEditor
                action={a}
                onChange={(next) => setScenario(upsertAction(scenario, next))}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActionEditor({ action, onChange }: { action: Action; onChange: (a: Action) => void }) {
  const up = (patch: Partial<Action>) => onChange({ ...action, ...patch });
  const isAttack = action.kind === 'attack';
  const isSpellLike = action.kind === 'spell' || action.kind === 'ability';

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div className="row">
        <label>
          Name
          <input value={action.name} onChange={(e) => up({ name: e.target.value })} />
        </label>
        <label>
          Kind
          <select value={action.kind} onChange={(e) => up({ kind: e.target.value as ActionKind })}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label>
          Targets
          <input className="num" type="number" min={0} value={action.targets} onChange={(e) => up({ targets: +e.target.value })} />
        </label>
        {isSpellLike && (
          <>
            <label>
              Slot level
              <input className="num" type="number" min={0} value={action.spellLevel ?? 0} onChange={(e) => up({ spellLevel: +e.target.value || undefined })} />
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: '0.9rem' }}>
              <input type="checkbox" checked={action.concentration ?? false} onChange={(e) => up({ concentration: e.target.checked })} />
              concentration
            </label>
          </>
        )}
        <label>
          Limited uses
          <input className="num" type="number" min={0} placeholder="∞" value={action.uses ?? ''} onChange={(e) => up({ uses: e.target.value === '' ? undefined : +e.target.value })} />
        </label>
      </div>

      {(isAttack || isSpellLike) && (
        <div className="row" style={{ marginTop: '0.4rem' }}>
          <label>
            To-hit bonus
            <input className="num" type="number" placeholder="—" value={action.attackBonus ?? ''} onChange={(e) => up({ attackBonus: e.target.value === '' ? undefined : +e.target.value })} />
          </label>
          {isAttack && (
            <label>
              Attacks/turn
              <input className="num" type="number" min={1} value={action.attackCount ?? 1} onChange={(e) => up({ attackCount: +e.target.value })} />
            </label>
          )}
          <label>
            Damage
            <input className="short" placeholder="e.g. 1d8+3" value={action.damage ?? ''} onChange={(e) => up({ damage: e.target.value || undefined })} />
          </label>
          <label>
            Damage type
            <select value={action.damageType ?? 'slashing'} onChange={(e) => up({ damageType: e.target.value as DamageType })}>
              {DAMAGE_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>
      )}

      {isSpellLike && (
        <div className="row" style={{ marginTop: '0.4rem' }}>
          <label>
            Heal
            <input className="short" placeholder="e.g. 1d8+3" value={action.heal ?? ''} onChange={(e) => up({ heal: e.target.value || undefined })} />
          </label>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: '0.9rem' }}>
            <input
              type="checkbox"
              checked={!!action.save}
              onChange={(e) => up({ save: e.target.checked ? { ability: 'dex', dc: 13, onSuccess: 'half' } : undefined })}
            />
            save-based
          </label>
          {action.save && (
            <>
              <label>
                Save
                <select value={action.save.ability} onChange={(e) => up({ save: { ...action.save!, ability: e.target.value as Ability } })}>
                  {ABILITIES.map((ab) => <option key={ab} value={ab}>{ab.toUpperCase()}</option>)}
                </select>
              </label>
              <label>
                DC
                <input className="num" type="number" value={action.save.dc} onChange={(e) => up({ save: { ...action.save!, dc: +e.target.value } })} />
              </label>
              <label>
                On success
                <select value={action.save.onSuccess} onChange={(e) => up({ save: { ...action.save!, onSuccess: e.target.value as 'half' | 'none' } })}>
                  <option value="half">half damage</option>
                  <option value="none">no effect</option>
                </select>
              </label>
            </>
          )}
        </div>
      )}

      <ConditionEditor action={action} onChange={onChange} />

      <label style={{ width: '100%', marginTop: '0.4rem' }}>
        Note
        <input value={action.note ?? ''} onChange={(e) => up({ note: e.target.value })} />
      </label>
    </div>
  );
}

const COND_KINDS = ['prone', 'poisoned', 'asleep', 'blinded', 'restrained', 'stunned', 'paralyzed', 'frightened', 'blessed'] as const;

function ConditionEditor({ action, onChange }: { action: Action; onChange: (a: Action) => void }) {
  const apps = action.applyConditions ?? [];
  if (action.kind === 'dodge' || action.kind === 'move') return null;

  const setApps = (next: typeof apps) => onChange({ ...action, applyConditions: next.length ? next : undefined });

  return (
    <div style={{ marginTop: '0.4rem' }}>
      <div className="muted" style={{ fontSize: '0.75rem' }}>Conditions applied on hit / failed save:</div>
      {apps.map((app, i) => (
        <div className="row" key={i} style={{ marginTop: '0.3rem' }}>
          <select
            value={app.kind}
            onChange={(e) => setApps(apps.map((a, j) => (j === i ? { ...a, kind: e.target.value as ConditionKind } : a)))}
          >
            {COND_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select
            value={app.duration.type}
            onChange={(e) => {
              const t = e.target.value;
              const duration =
                t === 'rounds' ? { type: 'rounds' as const, rounds: 3 }
                : t === 'concentration' ? { type: 'concentration' as const, sourceId: '' }
                : t === 'saveEnds' ? { type: 'saveEnds' as const, ability: 'con' as Ability, dc: 13 }
                : { type: 'permanent' as const };
              setApps(apps.map((a, j) => (j === i ? { ...a, duration } : a)));
            }}
          >
            <option value="rounds">for N rounds</option>
            <option value="saveEnds">save ends</option>
            <option value="concentration">while concentrating</option>
            <option value="permanent">permanent</option>
          </select>
          {app.duration.type === 'rounds' && (
            <input
              className="num"
              type="number"
              min={1}
              value={app.duration.rounds}
              onChange={(e) => setApps(apps.map((a, j) => (j === i ? { ...a, duration: { type: 'rounds', rounds: +e.target.value } } : a)))}
            />
          )}
          <button className="danger" onClick={() => setApps(apps.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button className="ghost" style={{ marginTop: '0.3rem' }} onClick={() => setApps([...apps, { kind: 'prone', duration: { type: 'rounds', rounds: 3 } }])}>
        + Add applied condition
      </button>
    </div>
  );
}
