import { useMemo, useState } from 'react';
import type {
  Ability,
  Action,
  ActionKind,
  ConditionKind,
  ConditionPreset,
  DamageRider,
  DamageType,
  DurationKind,
  RuleTemplate,
  Scenario,
  TargetList,
  TargetStrategy,
  Weapon,
  WeaponProperty,
} from '../engine/types';
import {
  duplicateAction,
  duplicateConditionPreset,
  duplicateRuleTemplate,
  genId,
  removeAction,
  removeConditionPreset,
  removeRuleTemplate,
  removeTargetList,
  removeWeapon,
  upsertAction,
  upsertConditionPreset,
  upsertRuleTemplate,
  upsertTargetList,
  upsertWeapon,
} from '../state/store';
import { CONDITION_CATALOG, CONDITION_KINDS } from '../engine/conditions';
import { CONDITION_TYPES, defaultCondition, describeCondition, describeTarget, FALLBACK_STRATEGIES, TARGET_STRATEGIES } from './ruleMeta';
import { describeActionGeneric } from './describe';
import { InfoHint } from './InfoHint';
import { ScrollIcon, TrashIcon, pickActionIcon, pickWeaponIcon } from './icons';

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
      <TargetListsSection scenario={scenario} setScenario={setScenario} />
      <ConditionsLibrarySection scenario={scenario} setScenario={setScenario} />
      <RulesLibrarySection scenario={scenario} setScenario={setScenario} />

      <div className="panel">
        <div className="row spread">
          <h2>
            Action Library
            <InfoHint>
              Reusable attacks, spells and abilities. Weapon attacks and spells derive their
              numbers from whoever uses them; the adjustments below add on top. Duplicate an
              action to make an edited variant.
            </InfoHint>
          </h2>
          <button onClick={add}>+ Add Action</button>
        </div>
      </div>

      <div className="card-grid">
        {scenario.actions.map((a) => {
          const usedBy = used(a.id);
          const builtin = a.id === 'act-dodge' || a.id === 'act-move';
          const { Icon, color } = pickActionIcon(a.kind);
          return (
            <div className="card" key={a.id}>
              <div className="card-head">
                <div className="card-head-main">
                  <div className="card-icon" style={{ color }}>
                    <Icon size={18} />
                  </div>
                  <div className="card-title">
                    <strong>{a.name}</strong>
                    <div className="card-subtitle">{a.kind}</div>
                  </div>
                </div>
                <div className="card-stats">
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
                  <button className="danger mini icon-only" disabled={builtin} onClick={() => setScenario(removeAction(scenario, a.id))} title="Delete" aria-label="Delete">
                    <TrashIcon size={14} />
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
                  conditionLibrary={scenario.conditionLibrary}
                  onChange={(next) => setScenario(upsertAction(scenario, next))}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActionEditor({
  action,
  weapons,
  conditionLibrary,
  onChange,
}: {
  action: Action;
  weapons: Weapon[];
  conditionLibrary: ConditionPreset[];
  onChange: (a: Action) => void;
}) {
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

      {(isAttack || isSpellLike) && (
        <div className="section">
          <div className="section-title">Range & area (feet)</div>
          <div className="field-row">
            <label>
              Range
              <input className="num" type="number" placeholder={isAttack ? 'weapon' : '∞'} value={action.range ?? ''} onChange={(e) => up({ range: e.target.value === '' ? undefined : +e.target.value })} />
            </label>
            <label>
              AoE radius
              <input className="num" type="number" placeholder="—" value={action.aoeRadius ?? ''} onChange={(e) => up({ aoeRadius: e.target.value === '' ? undefined : +e.target.value })} />
            </label>
            <span className="help" style={{ marginTop: '0.9rem' }}>
              Melee range 0 = same block. AoE hits everyone within radius of the primary target.
            </span>
          </div>
        </div>
      )}

      {action.kind === 'move' && (
        <div className="field-row">
          <label>
            Move mode
            <select value={action.moveMode ?? 'advance'} onChange={(e) => up({ moveMode: e.target.value as 'advance' | 'retreat' })}>
              <option value="advance">advance toward nearest enemy</option>
              <option value="retreat">retreat from nearest enemy (kite)</option>
            </select>
          </label>
        </div>
      )}

      {(isAttack || isSpellLike) && <RidersEditor action={action} onChange={onChange} />}

      <ConditionEditor action={action} conditionLibrary={conditionLibrary} onChange={onChange} />

      <label style={{ width: '100%', marginTop: '0.4rem' }}>
        Note
        <input value={action.note ?? ''} onChange={(e) => up({ note: e.target.value })} />
      </label>
    </div>
  );
}

const RIDER_TRIGGERS: { value: DamageRider['trigger']; label: string }[] = [
  { value: 'always', label: 'always on hit' },
  { value: 'hasAdvantage', label: 'when you have advantage' },
  { value: 'advantageOrAllyAdjacent', label: 'advantage or ally adjacent (Sneak Attack)' },
  { value: 'targetHasCondition', label: 'target has condition (Hunter’s Mark)' },
  { value: 'selfHasCondition', label: 'self has condition (Rage)' },
];

const RIDER_PRESETS: Record<string, DamageRider> = {
  sneak: { label: 'Sneak Attack', bonusDice: '2d6', trigger: 'advantageOrAllyAdjacent', oncePerTurn: true },
  rage: { label: 'Rage', bonusFlat: 2, trigger: 'selfHasCondition', condition: 'raging', meleeOnly: true },
  mark: { label: "Hunter's Mark", bonusDice: '1d6', trigger: 'targetHasCondition', condition: 'marked' },
};

function RidersEditor({ action, onChange }: { action: Action; onChange: (a: Action) => void }) {
  const riders = action.riders ?? [];
  const set = (next: DamageRider[]) => onChange({ ...action, riders: next.length ? next : undefined });
  const upd = (i: number, patch: Partial<DamageRider>) => set(riders.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="section">
      <div className="section-title">Conditional damage riders</div>
      {riders.map((r, i) => (
        <div className="modifiers" key={i}>
          <div className="field-row">
            <label>
              Label
              <input className="short" value={r.label ?? ''} onChange={(e) => upd(i, { label: e.target.value })} />
            </label>
            <label>
              Bonus dice
              <input className="short" placeholder="e.g. 2d6" value={r.bonusDice ?? ''} onChange={(e) => upd(i, { bonusDice: e.target.value || undefined })} />
            </label>
            <label>
              + flat
              <input className="num" type="number" placeholder="0" value={r.bonusFlat ?? ''} onChange={(e) => upd(i, { bonusFlat: e.target.value === '' ? undefined : +e.target.value })} />
            </label>
            <button className="danger mini" style={{ marginTop: '0.9rem' }} onClick={() => set(riders.filter((_, j) => j !== i))}>✕</button>
          </div>
          <div className="field-row">
            <label>
              Trigger
              <select value={r.trigger} onChange={(e) => upd(i, { trigger: e.target.value as DamageRider['trigger'] })}>
                {RIDER_TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            {(r.trigger === 'targetHasCondition' || r.trigger === 'selfHasCondition') && (
              <label>
                Condition
                <select value={r.condition ?? 'marked'} onChange={(e) => upd(i, { condition: e.target.value as ConditionKind })}>
                  {CONDITION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
            )}
            <label className="check-inline" style={{ marginTop: '0.9rem' }}>
              <input type="checkbox" checked={r.oncePerTurn ?? false} onChange={(e) => upd(i, { oncePerTurn: e.target.checked })} />
              once/turn
            </label>
            <label className="check-inline" style={{ marginTop: '0.9rem' }}>
              <input type="checkbox" checked={r.meleeOnly ?? false} onChange={(e) => upd(i, { meleeOnly: e.target.checked })} />
              melee only
            </label>
          </div>
        </div>
      ))}
      <div className="toolbar">
        <button className="ghost mini" onClick={() => set([...riders, RIDER_PRESETS.sneak])}>+ Sneak Attack</button>
        <button className="ghost mini" onClick={() => set([...riders, RIDER_PRESETS.rage])}>+ Rage</button>
        <button className="ghost mini" onClick={() => set([...riders, RIDER_PRESETS.mark])}>+ Hunter's Mark</button>
        <button className="ghost mini" onClick={() => set([...riders, { bonusDice: '1d6', trigger: 'always' }])}>+ Custom</button>
      </div>
    </div>
  );
}

function ConditionEditor({
  action,
  conditionLibrary,
  onChange,
}: {
  action: Action;
  conditionLibrary: ConditionPreset[];
  onChange: (a: Action) => void;
}) {
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
            {CONDITION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
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
      <div className="toolbar">
        <button className="ghost mini" onClick={() => setApps([...apps, { kind: 'prone', duration: { type: 'rounds', rounds: 3 } }])}>
          + Add applied condition
        </button>
        <select
          value=""
          onChange={(e) => {
            const preset = conditionLibrary.find((p) => p.id === e.target.value);
            if (preset) setApps([...apps, { kind: preset.kind, duration: preset.duration }]);
          }}
          disabled={conditionLibrary.length === 0}
        >
          <option value="">{conditionLibrary.length ? '+ from Conditions Library…' : '(library empty)'}</option>
          {conditionLibrary.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
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
        <h2>
          Weapons {open ? '' : `(${scenario.weapons.length})`}
          {open && (
            <InfoHint>
              Weapons supply the damage die, type, and properties (finesse, ranged, versatile…).
              Attack actions reference a weapon; the wielder's ability mod and proficiency are
              applied automatically.
            </InfoHint>
          )}
        </h2>
        <div className="row">
          <button className="secondary mini" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>
          {open && <button className="mini" onClick={add}>+ Add Weapon</button>}
        </div>
      </div>
      {open && (
        <div className="card-grid">
          {scenario.weapons.map((w) => {
            const Icon = pickWeaponIcon(w);
            return (
              <div className="card" key={w.id}>
                <div className="card-head">
                  <div className="card-head-main">
                    <div className="card-icon">
                      <Icon size={17} />
                    </div>
                    <div className="card-title">
                      <strong>{w.name}</strong>
                    </div>
                  </div>
                  <div className="card-stats">
                    <span className="tag">{w.damage}{w.versatileDamage ? `/${w.versatileDamage}` : ''} {w.damageType}</span>
                    {w.properties.map((p) => <span className="tag" key={p}>{p}</span>)}
                  </div>
                  <div className="row">
                    <button className="secondary mini" onClick={() => setEditId(editId === w.id ? null : w.id)}>{editId === w.id ? 'Collapse' : 'Edit'}</button>
                    <button className="danger mini icon-only" onClick={() => setScenario(removeWeapon(scenario, w.id))} title="Delete" aria-label="Delete">
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>
                {editId === w.id && <WeaponEditor weapon={w} onChange={(n) => setScenario(upsertWeapon(scenario, n))} />}
              </div>
            );
          })}
        </div>
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
        <label>Range (ft)<input className="num" type="number" placeholder="0" value={weapon.range ?? ''} onChange={(e) => up({ range: e.target.value === '' ? undefined : +e.target.value })} /></label>
        <label>Long range<input className="num" type="number" placeholder="—" value={weapon.longRange ?? ''} onChange={(e) => up({ longRange: e.target.value === '' ? undefined : +e.target.value })} /></label>
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

// ---------------------------------------------------------------------------
// Reusable target lists
// ---------------------------------------------------------------------------

const LIST_FALLBACKS: { value: TargetStrategy; label: string }[] = [
  { value: 'nearestEnemy', label: 'then nearest enemy' },
  { value: 'lowestHpEnemy', label: 'then lowest-HP enemy' },
  { value: 'nearestAlly', label: 'then nearest ally' },
  { value: 'lowestHpAlly', label: 'then lowest-HP ally' },
  { value: 'none', label: 'no fallback' },
];

function TargetListsSection({ scenario, setScenario }: Props) {
  const [open, setOpen] = useState(false);

  const add = () => {
    const t: TargetList = { id: genId('tl'), name: 'New List', entries: [], fallback: 'nearestEnemy' };
    setScenario(upsertTargetList(scenario, t));
    setOpen(true);
  };

  return (
    <div className="panel">
      <div className="row spread">
        <h2>
          Target Lists {open ? '' : `(${scenario.targetLists.length})`}
          {open && (
            <InfoHint>
              Reusable, explicit target priority lists referenced by rules (e.g. "enemy1 → enemy2
              → then nearest"). The combatant doesn't need omniscient knowledge — it works down
              the list, then uses the fallback.
            </InfoHint>
          )}
        </h2>
        <div className="row">
          <button className="secondary mini" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>
          {open && <button className="mini" onClick={add}>+ Add List</button>}
        </div>
      </div>
      {open && (
        <>
          {scenario.targetLists.map((tl) => (
            <div className="card" key={tl.id} style={{ marginBottom: '0.5rem' }}>
              <div className="field-row">
                <label>Name<input value={tl.name} onChange={(e) => setScenario(upsertTargetList(scenario, { ...tl, name: e.target.value }))} /></label>
                <label>
                  Fallback
                  <select value={tl.fallback} onChange={(e) => setScenario(upsertTargetList(scenario, { ...tl, fallback: e.target.value as TargetStrategy }))}>
                    {LIST_FALLBACKS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </label>
                <button className="danger mini" style={{ marginTop: '0.9rem' }} onClick={() => setScenario(removeTargetList(scenario, tl.id))}>Delete</button>
              </div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>Priority order (numbered as you check; uncheck to remove):</div>
              <div className="row">
                {scenario.combatants.map((c) => {
                  const order = tl.entries.indexOf(c.id);
                  return (
                    <label key={c.id} className="check-inline" style={{ color: c.side === 'pc' ? 'var(--pc)' : 'var(--monster)' }}>
                      <input
                        type="checkbox"
                        checked={order >= 0}
                        onChange={(e) => {
                          const entries = e.target.checked ? [...tl.entries, c.id] : tl.entries.filter((x) => x !== c.id);
                          setScenario(upsertTargetList(scenario, { ...tl, entries }));
                        }}
                      />
                      {order >= 0 ? `${order + 1}. ` : ''}{c.name}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rules library: reusable rule "recipes" insertable into any combatant's script
// ---------------------------------------------------------------------------

function RulesLibrarySection({ scenario, setScenario }: Props) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const add = () => {
    const t: RuleTemplate = {
      id: genId('ruletpl'),
      name: 'New Rule Template',
      condition: { type: 'always' },
      actionId: scenario.actions[0]?.id ?? '',
      target: { strategy: 'lowestHpEnemy' },
    };
    setScenario(upsertRuleTemplate(scenario, t));
    setEditId(t.id);
    setOpen(true);
  };

  return (
    <div className="panel">
      <div className="row spread">
        <h2>
          Rules Library {open ? '' : `(${scenario.ruleLibrary.length})`}
          {open && (
            <InfoHint>
              Reusable tactical "recipes" — a condition, an action, and a targeting strategy —
              that you can insert into any combatant's priority script from the Rules Library
              picker there. Inserting copies the recipe; editing a combatant's rule afterward
              doesn't change the template.
            </InfoHint>
          )}
        </h2>
        <div className="row">
          <button className="secondary mini" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>
          {open && <button className="mini" onClick={add}>+ Add Rule Template</button>}
        </div>
      </div>
      {open && (
        <div className="card-grid">
          {scenario.ruleLibrary.map((t) => (
            <div className="card" key={t.id}>
              <div className="card-head">
                <div className="card-head-main">
                  <div className="card-icon">
                    <ScrollIcon size={17} />
                  </div>
                  <div className="card-title">
                    <strong>{t.name}</strong>
                  </div>
                </div>
                <div className="card-stats">
                  <span className="tag">{describeCondition(t.condition)}</span>
                  <span className="tag">{describeTarget(t.target)}</span>
                </div>
                <div className="row">
                  <button className="secondary mini" onClick={() => setEditId(editId === t.id ? null : t.id)}>
                    {editId === t.id ? 'Collapse' : 'Edit'}
                  </button>
                  <button
                    className="secondary mini"
                    onClick={() => {
                      const { scenario: next, newId } = duplicateRuleTemplate(scenario, t.id);
                      setScenario(next);
                      setEditId(newId);
                    }}
                  >
                    ⧉ Duplicate
                  </button>
                  <button className="danger mini icon-only" onClick={() => setScenario(removeRuleTemplate(scenario, t.id))} title="Delete" aria-label="Delete">
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
              {editId === t.id && (
                <RuleTemplateEditor
                  template={t}
                  actions={scenario.actions}
                  onChange={(next) => setScenario(upsertRuleTemplate(scenario, next))}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RuleTemplateEditor({
  template,
  actions,
  onChange,
}: {
  template: RuleTemplate;
  actions: Action[];
  onChange: (t: RuleTemplate) => void;
}) {
  const up = (patch: Partial<RuleTemplate>) => onChange({ ...template, ...patch });
  const condMeta = CONDITION_TYPES.find((c) => c.value === template.condition.type)!;

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div className="field-row">
        <label>Name<input value={template.name} onChange={(e) => up({ name: e.target.value })} /></label>
      </div>
      <div className="field-row">
        <label>
          IF
          <select
            value={template.condition.type}
            onChange={(e) => up({ condition: defaultCondition(e.target.value as typeof template.condition.type) })}
          >
            {CONDITION_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        {condMeta.needs === 'value' && (
          <label>
            value
            <input
              className="num"
              type="number"
              value={template.condition.value ?? 0}
              onChange={(e) => up({ condition: { ...template.condition, value: +e.target.value } })}
            />
          </label>
        )}
        {condMeta.needs === 'condition' && (
          <label>
            condition
            <select
              value={template.condition.condition ?? 'asleep'}
              onChange={(e) => up({ condition: { ...template.condition, condition: e.target.value as ConditionKind } })}
            >
              {CONDITION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="field-row">
        <label>
          THEN use
          <select value={template.actionId} onChange={(e) => up({ actionId: e.target.value })}>
            {actions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label>
          targeting
          <select
            value={template.target.strategy}
            onChange={(e) => up({ target: { ...template.target, strategy: e.target.value as TargetStrategy } })}
          >
            {TARGET_STRATEGIES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        {template.target.strategy === 'none' && (
          <label>
            Fallback
            <select
              value={template.target.fallback ?? 'nearestEnemy'}
              onChange={(e) => up({ target: { ...template.target, fallback: e.target.value as TargetStrategy } })}
            >
              {FALLBACK_STRATEGIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
        )}
        <label className="check-inline" style={{ marginTop: '0.9rem' }}>
          <input
            type="checkbox"
            checked={template.target.excludeIncapacitated ?? false}
            onChange={(e) => up({ target: { ...template.target, excludeIncapacitated: e.target.checked } })}
          />
          skip incapacitated
        </label>
      </div>
      <label style={{ width: '100%' }}>
        Log label (optional)
        <input value={template.label ?? ''} onChange={(e) => up({ label: e.target.value })} />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conditions library: reusable "apply this condition" recipes (kind + duration)
// ---------------------------------------------------------------------------

function ConditionsLibrarySection({ scenario, setScenario }: Props) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const add = () => {
    const p: ConditionPreset = {
      id: genId('condpre'),
      name: 'New Condition Preset',
      kind: 'prone',
      duration: { type: 'rounds', rounds: 3 },
    };
    setScenario(upsertConditionPreset(scenario, p));
    setEditId(p.id);
    setOpen(true);
  };

  return (
    <div className="panel">
      <div className="row spread">
        <h2>
          Conditions Library {open ? '' : `(${scenario.conditionLibrary.length})`}
          {open && (
            <InfoHint>
              Reusable "apply this condition" recipes — a condition kind plus a duration — that
              you can add to any action's on-hit / failed-save conditions from the picker there,
              instead of reconfiguring the same kind and duration every time.
            </InfoHint>
          )}
        </h2>
        <div className="row">
          <button className="secondary mini" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>
          {open && <button className="mini" onClick={add}>+ Add Condition Preset</button>}
        </div>
      </div>
      {open && (
        <div className="card-grid">
          {scenario.conditionLibrary.map((p) => (
            <div className="card" key={p.id}>
              <div className="card-head">
                <div className="card-head-main">
                  <div className="card-icon">
                    <ScrollIcon size={17} />
                  </div>
                  <div className="card-title">
                    <strong>{p.name}</strong>
                  </div>
                </div>
                <div className="card-stats">
                  <span className="tag">{CONDITION_CATALOG[p.kind].label}</span>
                  <span className="tag">{describeDuration(p.duration)}</span>
                </div>
                <div className="row">
                  <button className="secondary mini" onClick={() => setEditId(editId === p.id ? null : p.id)}>
                    {editId === p.id ? 'Collapse' : 'Edit'}
                  </button>
                  <button
                    className="secondary mini"
                    onClick={() => {
                      const { scenario: next, newId } = duplicateConditionPreset(scenario, p.id);
                      setScenario(next);
                      setEditId(newId);
                    }}
                  >
                    ⧉ Duplicate
                  </button>
                  <button className="danger mini icon-only" onClick={() => setScenario(removeConditionPreset(scenario, p.id))} title="Delete" aria-label="Delete">
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
              {editId === p.id && (
                <ConditionPresetEditor preset={p} onChange={(next) => setScenario(upsertConditionPreset(scenario, next))} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function describeDuration(d: DurationKind): string {
  switch (d.type) {
    case 'rounds': return `${d.rounds} round${d.rounds === 1 ? '' : 's'}`;
    case 'saveEnds': return `save ends (DC ${d.dc} ${d.ability.toUpperCase()})`;
    case 'concentration': return 'while concentrating';
    case 'permanent': return 'permanent';
  }
}

function ConditionPresetEditor({ preset, onChange }: { preset: ConditionPreset; onChange: (p: ConditionPreset) => void }) {
  const up = (patch: Partial<ConditionPreset>) => onChange({ ...preset, ...patch });

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div className="field-row">
        <label>Name<input value={preset.name} onChange={(e) => up({ name: e.target.value })} /></label>
        <label>
          Kind
          <select value={preset.kind} onChange={(e) => up({ kind: e.target.value as ConditionKind })}>
            {CONDITION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label>
          Duration
          <select
            value={preset.duration.type}
            onChange={(e) => {
              const t = e.target.value;
              const duration: DurationKind =
                t === 'rounds' ? { type: 'rounds', rounds: 3 }
                : t === 'concentration' ? { type: 'concentration', sourceId: '' }
                : t === 'saveEnds' ? { type: 'saveEnds', ability: 'con', dc: 13 }
                : { type: 'permanent' };
              up({ duration });
            }}
          >
            <option value="rounds">for N rounds</option>
            <option value="saveEnds">save ends</option>
            <option value="concentration">while concentrating</option>
            <option value="permanent">permanent</option>
          </select>
        </label>
        {preset.duration.type === 'rounds' && (
          <label>
            Rounds
            <input
              className="num"
              type="number"
              min={1}
              value={preset.duration.rounds}
              onChange={(e) => up({ duration: { type: 'rounds', rounds: +e.target.value } })}
            />
          </label>
        )}
        {preset.duration.type === 'saveEnds' && (
          <>
            <label>
              Save ability
              <select
                value={preset.duration.ability}
                onChange={(e) => up({ duration: { ...preset.duration as { type: 'saveEnds'; ability: Ability; dc: number }, ability: e.target.value as Ability } })}
              >
                {ABILITIES.map((ab) => <option key={ab} value={ab}>{ab.toUpperCase()}</option>)}
              </select>
            </label>
            <label>
              DC
              <input
                className="num"
                type="number"
                value={preset.duration.dc}
                onChange={(e) => up({ duration: { ...preset.duration as { type: 'saveEnds'; ability: Ability; dc: number }, dc: +e.target.value } })}
              />
            </label>
          </>
        )}
      </div>
      <p className="help" style={{ marginTop: 0 }}>{CONDITION_CATALOG[preset.kind].description}</p>
    </div>
  );
}
