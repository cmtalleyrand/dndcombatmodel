import { useMemo, useState } from 'react';
import type {
  Ability,
  Action,
  ActionKind,
  ConditionKind,
  DamageType,
  Scenario,
  Weapon,
  WeaponProperty,
} from '../engine/types';
import {
  duplicateAction,
  genId,
  removeAction,
  removeWeapon,
  upsertAction,
  upsertWeapon,
} from '../state/store';
import { describeActionGeneric } from './describe';

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
const WEAPON_PROPS: WeaponProperty[] = ['finesse', 'ranged', 'versatile', 'twoHanded', 'light', 'heavy', 'thrown'];

export function ActionLibraryTab({ scenario, setScenario }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const weaponsById = useMemo(() => {
    const m: Record<string, Weapon> = {};
    for (const w of scenario.weapons) m[w.id] = w;
    return m;
  }, [scenario.weapons]);

  const add = () => {
    const a: Action = {
      id: genId('act'),
      name: 'New Attack',
      kind: 'attack',
      targets: 1,
      weaponId: scenario.weapons[0]?.id,
      attackCount: 1,
    };
    setScenario(upsertAction(scenario, a));
    setOpenId(a.id);
  };

  const used = (id: string) =>
    scenario.combatants.filter((c) => c.actionIds.includes(id) || c.script.some((r) => r.actionId === id));

  return (
    <div>
      <WeaponsSection scenario={scenario} setScenario={setScenario} />

      <div className="panel">
        <div className="row spread">
          <h2>Action Library</h2>
          <button onClick={add}>+ Add Action</button>
        </div>
        <p className="help">
          Reusable attacks, spells and abilities. Weapon attacks and spells derive their numbers
          from whoever uses them; the adjustments below add on top. Duplicate an action to make an
          edited variant.
        </p>
      </div>

      {scenario.actions.map((a) => {
        const usedBy = used(a.id);
        const builtin = a.id === 'act-dodge' || a.id === 'act-move';
        return (
          <div className="card" key={a.id}>
            <div className="row spread">
              <div className="row">
                <strong>{a.name}</strong>
                <span className="tag">{a.kind}</span>
                {a.spellLevel ? <span className="tag">L{a.spellLevel} slot</span> : null}
                {a.concentration ? <span className="tag">concentration</span> : null}
                <span className="tag">used by {usedBy.length}</span>
              </div>
              <div className="row">
                <button className="secondary mini" onClick={() => setOpenId(openId === a.id ? null : a.id)}>
                  {openId === a.id ? 'Collapse' : 'Edit'}
                </button>
                {!builtin && (
                  <button
                    className="secondary mini"
                    onClick={() => {
                      const { scenario: next, newId } = duplicateAction(scenario, a.id);
                      setScenario(next);
                      setOpenId(newId);
                    }}
                  >
                    ⧉ Duplicate
                  </button>
                )}
                <button className="danger mini" disabled={builtin} onClick={() => setScenario(removeAction(scenario, a.id))}>
                  Delete
                </button>
              </div>
            </div>
            {!builtin && (
              <div className="derived" style={{ marginTop: '0.4rem' }}>
                {describeActionGeneric(a, weaponsById)}
              </div>
            )}
            {openId === a.id && (
              <ActionEditor
                action={a}
                weapons={scenario.weapons}
                onChange={(next) => setScenario(upsertAction(scenario, next))}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActionEditor({ action, weapons, onChange }: { action: Action; weapons: Weapon[]; onChange: (a: Action) => void }) {
  const up = (patch: Partial<Action>) => onChange({ ...action, ...patch });
  const isAttack = action.kind === 'attack';
  const isSpellLike = action.kind === 'spell' || action.kind === 'ability';
  const weapon = action.weaponId ? weapons.find((w) => w.id === action.weaponId) : undefined;

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div className="field-row">
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
        <label>
          Limited uses
          <input className="num" type="number" min={0} placeholder="∞" value={action.uses ?? ''} onChange={(e) => up({ uses: e.target.value === '' ? undefined : +e.target.value })} />
        </label>
      </div>

      {isAttack && (
        <div className="section">
          <div className="section-title">Weapon (to-hit & damage derive from the wielder)</div>
          <div className="field-row">
            <label>
              Weapon
              <select value={action.weaponId ?? ''} onChange={(e) => up({ weaponId: e.target.value || undefined })}>
                <option value="">— manual (no weapon) —</option>
                {weapons.map((w) => (
                  <option key={w.id} value={w.id}>{w.name} ({w.damage} {w.damageType})</option>
                ))}
              </select>
            </label>
            <label>
              Attacks/turn
              <input className="num" type="number" min={1} value={action.attackCount ?? 1} onChange={(e) => up({ attackCount: +e.target.value })} />
            </label>
            {weapon?.versatileDamage && (
              <label className="check-inline" style={{ marginTop: '0.9rem' }}>
                <input type="checkbox" checked={action.useVersatile ?? false} onChange={(e) => up({ useVersatile: e.target.checked })} />
                two-handed ({weapon.versatileDamage})
              </label>
            )}
            <label>
              Ability
              <select value={action.abilityOverride ?? ''} onChange={(e) => up({ abilityOverride: (e.target.value || undefined) as Ability | undefined })}>
                <option value="">auto ({weapon ? (weapon.properties.includes('ranged') ? 'DEX' : weapon.properties.includes('finesse') ? 'STR/DEX' : 'STR') : 'STR'})</option>
                {ABILITIES.map((ab) => <option key={ab} value={ab}>{ab.toUpperCase()}</option>)}
              </select>
            </label>
            <label className="check-inline" style={{ marginTop: '0.9rem' }}>
              <input type="checkbox" checked={action.notProficient ?? false} onChange={(e) => up({ notProficient: e.target.checked })} />
              not proficient
            </label>
          </div>
          {!weapon && (
            <div className="field-row">
              <label>
                Manual to-hit
                <input className="num" type="number" placeholder="0" value={action.attackBonus ?? ''} onChange={(e) => up({ attackBonus: e.target.value === '' ? undefined : +e.target.value })} />
              </label>
              <label>
                Manual damage
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
        </div>
      )}

      {isSpellLike && (
        <div className="section">
          <div className="section-title">Spell / Ability</div>
          <div className="field-row">
            <label>
              Slot level
              <input className="num" type="number" min={0} value={action.spellLevel ?? 0} onChange={(e) => up({ spellLevel: +e.target.value || undefined })} />
            </label>
            <label className="check-inline" style={{ marginTop: '0.9rem' }}>
              <input type="checkbox" checked={action.concentration ?? false} onChange={(e) => up({ concentration: e.target.checked })} />
              concentration
            </label>
            <label className="check-inline" style={{ marginTop: '0.9rem' }}>
              <input type="checkbox" checked={action.spellAttack ?? false} onChange={(e) => up({ spellAttack: e.target.checked, save: e.target.checked ? undefined : action.save })} />
              spell attack roll
            </label>
          </div>

          <div className="field-row">
            <label>
              Damage
              <input className="short" placeholder="e.g. 2d6" value={action.damage ?? ''} onChange={(e) => up({ damage: e.target.value || undefined })} />
            </label>
            <label>
              Damage type
              <select value={action.damageType ?? 'force'} onChange={(e) => up({ damageType: e.target.value as DamageType })}>
                {DAMAGE_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>
              Heal
              <input className="short" placeholder="e.g. 1d8" value={action.heal ?? ''} onChange={(e) => up({ heal: e.target.value || undefined })} />
            </label>
            {action.heal && (
              <label className="check-inline" style={{ marginTop: '0.9rem' }}>
                <input type="checkbox" checked={action.addSpellModToHeal ?? false} onChange={(e) => up({ addSpellModToHeal: e.target.checked })} />
                + spell mod
              </label>
            )}
          </div>

          <div className="field-row">
            <label className="check-inline" style={{ marginTop: '0.9rem' }}>
              <input
                type="checkbox"
                checked={!!action.save}
                onChange={(e) => up({ save: e.target.checked ? { ability: 'dex', onSuccess: 'half' } : undefined, spellAttack: e.target.checked ? false : action.spellAttack })}
              />
              save-based (DC derived)
            </label>
            {action.save && (
              <>
                <label>
                  Save ability
                  <select value={action.save.ability} onChange={(e) => up({ save: { ...action.save!, ability: e.target.value as Ability } })}>
                    {ABILITIES.map((ab) => <option key={ab} value={ab}>{ab.toUpperCase()}</option>)}
                  </select>
                </label>
                <label>
                  Explicit DC
                  <input className="num" type="number" placeholder="auto" value={action.save.dc ?? ''} onChange={(e) => up({ save: { ...action.save!, dc: e.target.value === '' ? undefined : +e.target.value } })} />
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
        </div>
      )}

      {(isAttack || isSpellLike) && (
        <div className="modifiers">
          <div className="section-title" style={{ marginBottom: '0.4rem' }}>Modifiers (added on top of derived values)</div>
          <div className="field-row">
            <label>
              + to hit
              <input className="num" type="number" placeholder="0" value={action.toHitBonus ?? ''} onChange={(e) => up({ toHitBonus: e.target.value === '' ? undefined : +e.target.value })} />
            </label>
            <label>
              + damage
              <input className="num" type="number" placeholder="0" value={action.damageBonus ?? ''} onChange={(e) => up({ damageBonus: e.target.value === '' ? undefined : +e.target.value })} />
            </label>
            <label>
              + bonus dice
              <input className="short" placeholder="e.g. 1d6" value={action.bonusDamageDice ?? ''} onChange={(e) => up({ bonusDamageDice: e.target.value || undefined })} />
            </label>
            <label>
              magic (hit & dmg)
              <input className="num" type="number" placeholder="0" value={action.magicBonus ?? ''} onChange={(e) => up({ magicBonus: e.target.value === '' ? undefined : +e.target.value })} />
            </label>
            {isSpellLike && action.save && (
              <label>
                + save DC
                <input className="num" type="number" placeholder="0" value={action.saveDcBonus ?? ''} onChange={(e) => up({ saveDcBonus: e.target.value === '' ? undefined : +e.target.value })} />
              </label>
            )}
          </div>
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

const COND_KINDS: ConditionKind[] = ['prone', 'poisoned', 'asleep', 'blinded', 'restrained', 'stunned', 'paralyzed', 'frightened', 'blessed'];

function ConditionEditor({ action, onChange }: { action: Action; onChange: (a: Action) => void }) {
  const apps = action.applyConditions ?? [];
  if (action.kind === 'dodge' || action.kind === 'move') return null;

  const setApps = (next: typeof apps) => onChange({ ...action, applyConditions: next.length ? next : undefined });

  return (
    <div className="section">
      <div className="section-title">Conditions applied on hit / failed save</div>
      {apps.map((app, i) => (
        <div className="field-row" key={i}>
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
          <button className="danger mini" onClick={() => setApps(apps.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button className="ghost mini" onClick={() => setApps([...apps, { kind: 'prone', duration: { type: 'rounds', rounds: 3 } }])}>
        + Add applied condition
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weapons management
// ---------------------------------------------------------------------------

function WeaponsSection({ scenario, setScenario }: Props) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const add = () => {
    const w: Weapon = { id: genId('wpn'), name: 'New Weapon', damage: '1d6', damageType: 'slashing', properties: [], category: 'martial' };
    setScenario(upsertWeapon(scenario, w));
    setEditId(w.id);
    setOpen(true);
  };

  return (
    <div className="panel">
      <div className="row spread">
        <h2>Weapons {open ? '' : `(${scenario.weapons.length})`}</h2>
        <div className="row">
          <button className="secondary mini" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>
          {open && <button className="mini" onClick={add}>+ Add Weapon</button>}
        </div>
      </div>
      {open && (
        <>
          <p className="help">Weapons supply the damage die, type, and properties (finesse, ranged, versatile…). Attack actions reference a weapon; the wielder's ability mod and proficiency are applied automatically.</p>
          {scenario.weapons.map((w) => (
            <div className="card" key={w.id} style={{ marginBottom: '0.5rem' }}>
              <div className="row spread">
                <div className="row">
                  <strong>{w.name}</strong>
                  <span className="tag">{w.damage}{w.versatileDamage ? `/${w.versatileDamage}` : ''} {w.damageType}</span>
                  {w.properties.map((p) => <span className="tag" key={p}>{p}</span>)}
                </div>
                <div className="row">
                  <button className="secondary mini" onClick={() => setEditId(editId === w.id ? null : w.id)}>{editId === w.id ? 'Collapse' : 'Edit'}</button>
                  <button className="danger mini" onClick={() => setScenario(removeWeapon(scenario, w.id))}>Delete</button>
                </div>
              </div>
              {editId === w.id && <WeaponEditor weapon={w} onChange={(n) => setScenario(upsertWeapon(scenario, n))} />}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function WeaponEditor({ weapon, onChange }: { weapon: Weapon; onChange: (w: Weapon) => void }) {
  const up = (patch: Partial<Weapon>) => onChange({ ...weapon, ...patch });
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div className="field-row">
        <label>Name<input value={weapon.name} onChange={(e) => up({ name: e.target.value })} /></label>
        <label>Damage<input className="short" value={weapon.damage} onChange={(e) => up({ damage: e.target.value })} /></label>
        <label>Versatile<input className="short" placeholder="—" value={weapon.versatileDamage ?? ''} onChange={(e) => up({ versatileDamage: e.target.value || undefined })} /></label>
        <label>
          Type
          <select value={weapon.damageType} onChange={(e) => up({ damageType: e.target.value as DamageType })}>
            {DAMAGE_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label>
          Category
          <select value={weapon.category} onChange={(e) => up({ category: e.target.value as 'simple' | 'martial' })}>
            <option value="simple">simple</option>
            <option value="martial">martial</option>
          </select>
        </label>
      </div>
      <div className="row">
        {WEAPON_PROPS.map((p) => (
          <label key={p} className="check-inline">
            <input
              type="checkbox"
              checked={weapon.properties.includes(p)}
              onChange={(e) => {
                const set = new Set(weapon.properties);
                if (e.target.checked) set.add(p);
                else set.delete(p);
                up({ properties: [...set] });
              }}
            />
            {p}
          </label>
        ))}
      </div>
    </div>
  );
}
