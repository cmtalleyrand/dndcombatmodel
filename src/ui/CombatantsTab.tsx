import { useMemo, useState } from 'react';
import { ABILITIES, type Ability, type Combatant, type Scenario, type Side, type Skill } from '../engine/types';
import { LEVEL_1_CLASS_PCS, LEVEL_3_CLASS_PCS, SAMPLE_MONSTERS, SRD_ACTIONS } from '../data/srd';
import { copyScript, genId, removeCombatant, upsertCombatant } from '../state/store';
import { SRD_WEAPONS } from '../data/weapons';
import { defaultPosition } from '../engine/state';
import { RuleBuilder } from './RuleBuilder';
import { describeAction } from './describe';
import { InfoHint } from './InfoHint';
import { HeartIcon, ShieldHalfIcon, TrashIcon, pickCombatantIcon } from './icons';

interface Props {
  side: Side;
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
}

function blankCombatant(side: Side): Combatant {
  const actionId = side === 'pc' ? 'act-longsword' : 'act-scimitar';
  return {
    id: genId(side),
    name: side === 'pc' ? 'New PC' : 'New Monster',
    side,
    maxHp: 20,
    ac: 13,
    abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProficiencies: [],
    proficiencyBonus: 2,
    position: defaultPosition(side, 0),
    speed: 30,
    actionIds: [actionId],
    script: [
      {
        priority: 1,
        label: `Attack the nearest ${side === 'pc' ? 'monster' : 'PC'}`,
        condition: { type: 'always' },
        actionId,
        target: { strategy: 'nearestEnemy', excludeIncapacitated: true },
      },
    ],
    spellSlots: {},
  };
}

const PC_LIBRARY = [...LEVEL_1_CLASS_PCS, ...LEVEL_3_CLASS_PCS];

export function addCombatantWithDefaultActions(scenario: Scenario, combatant: Combatant): Scenario {
  const existingActionIds = new Set(scenario.actions.map((action) => action.id));
  const neededActionIds = new Set([
    ...combatant.actionIds,
    ...combatant.script.map((rule) => rule.actionId),
  ]);
  const actions = [
    ...scenario.actions,
    ...SRD_ACTIONS.filter((action) => neededActionIds.has(action.id) && !existingActionIds.has(action.id)),
  ];

  const existingWeaponIds = new Set(scenario.weapons.map((weapon) => weapon.id));
  const neededWeaponIds = new Set(
    actions
      .filter((action) => neededActionIds.has(action.id) && action.kind === 'attack' && action.weaponId)
      .map((action) => action.weaponId!),
  );
  const weapons = [
    ...scenario.weapons,
    ...SRD_WEAPONS.filter((weapon) => neededWeaponIds.has(weapon.id) && !existingWeaponIds.has(weapon.id)),
  ];

  return upsertCombatant({ ...scenario, actions, weapons }, combatant);
}

const SKILLS: { id: Skill; label: string }[] = [
  { id: 'athletics', label: 'Athletics' },
  { id: 'acrobatics', label: 'Acrobatics' },
  { id: 'sleightOfHand', label: 'Sleight of Hand' },
  { id: 'stealth', label: 'Stealth' },
  { id: 'arcana', label: 'Arcana' },
  { id: 'history', label: 'History' },
  { id: 'investigation', label: 'Investigation' },
  { id: 'nature', label: 'Nature' },
  { id: 'religion', label: 'Religion' },
  { id: 'animalHandling', label: 'Animal Handling' },
  { id: 'insight', label: 'Insight' },
  { id: 'medicine', label: 'Medicine' },
  { id: 'perception', label: 'Perception' },
  { id: 'survival', label: 'Survival' },
  { id: 'deception', label: 'Deception' },
  { id: 'intimidation', label: 'Intimidation' },
  { id: 'performance', label: 'Performance' },
  { id: 'persuasion', label: 'Persuasion' },
];

function templatesForSide(side: Side): Combatant[] {
  return side === 'pc' ? PC_LIBRARY : SAMPLE_MONSTERS;
}

export function cloneStoredCombatant(template: Combatant, existing: Combatant[]): Combatant {
  const sameBase = existing.filter(
    (c) => c.name === template.name || c.name.startsWith(`${template.name} `),
  );
  const suffix = sameBase.length + 1;
  return {
    ...template,
    id: genId(template.side),
    name: sameBase.length === 0 ? template.name : `${template.name} ${suffix}`,
    actionIds: [...template.actionIds],
    saveProficiencies: [...template.saveProficiencies],
    abilityScores: { ...template.abilityScores },
    spellSlots: { ...template.spellSlots },
    script: template.script.map((rule) => ({ ...rule, target: { ...rule.target } })),
  };
}

export function CombatantsTab({ side, scenario, setScenario }: Props) {
  const combatants = scenario.combatants.filter((c) => c.side === side);
  const [openId, setOpenId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState('blank');
  const templates = templatesForSide(side);

  const add = () => {
    const template = templates.find((c) => c.id === templateId);
    const c = template ? cloneStoredCombatant(template, scenario.combatants) : blankCombatant(side);
    setScenario(template ? addCombatantWithDefaultActions(scenario, c) : upsertCombatant(scenario, c));
    setOpenId(c.id);
  };

  return (
    <div>
      <div className="panel">
        <div className="row spread">
          <h2>
            {side === 'pc' ? 'Player Characters' : 'Monsters'}
            <InfoHint>
              Each combatant needs stats, at least one action, and a priority script. Rules run
              top-to-bottom; the first one whose condition passes and whose action is available
              (slots left, a legal target) fires. A built-in Dodge fallback is used when nothing
              else applies.
            </InfoHint>
          </h2>
          <div className="toolbar">
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              aria-label={`Stored ${side === 'pc' ? 'PC' : 'monster'} to add`}
            >
              <option value="blank">Blank {side === 'pc' ? 'PC' : 'monster'}</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
            <button onClick={add}>
              + Add {side === 'pc' ? 'PC' : 'Monster'} ({combatants.length})
            </button>
          </div>
        </div>
      </div>

      {combatants.length === 0 && <div className="panel muted">No {side === 'pc' ? 'PCs' : 'monsters'} yet.</div>}

      <div className="card-grid">
        {combatants.map((c) => (
          <CombatantCard
            key={c.id}
            combatant={c}
            scenario={scenario}
            setScenario={setScenario}
            open={openId === c.id}
            onToggle={() => setOpenId(openId === c.id ? null : c.id)}
          />
        ))}
      </div>
    </div>
  );
}

function CombatantCard({
  combatant,
  scenario,
  setScenario,
  open,
  onToggle,
}: {
  combatant: Combatant;
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const update = (patch: Partial<Combatant>) =>
    setScenario(upsertCombatant(scenario, { ...combatant, ...patch }));

  const validation = validateCombatant(combatant, scenario);
  const weaponsById = useMemo(() => {
    const m: Record<string, (typeof scenario.weapons)[number]> = {};
    for (const w of scenario.weapons) m[w.id] = w;
    return m;
  }, [scenario.weapons]);
  const otherSameSide = scenario.combatants.filter(
    (c) => c.side === combatant.side && c.id !== combatant.id,
  );
  const { Icon, label } = pickCombatantIcon(combatant, scenario);
  const sideTemplates = templatesForSide(combatant.side);

  return (
    <div className={`card ${combatant.side}`}>
      <div className="card-head">
        <div className="card-head-main">
          <div className={`card-icon ${combatant.side}`}>
            <Icon size={19} />
          </div>
          <div className="card-title">
            <strong>{combatant.name}</strong>
            <div className="card-subtitle">{label}</div>
          </div>
        </div>
        <div className="card-stats">
          <span className="stat-chip"><HeartIcon size={13} />{combatant.maxHp}</span>
          <span className="stat-chip"><ShieldHalfIcon size={13} />{combatant.ac}</span>
          {validation.length > 0 && (
            <span className="tag" style={{ color: 'var(--warning-soft)', borderColor: 'var(--warning)' }}>
              ⚠ {validation.length} issue{validation.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="row">
          <select
            value=""
            onChange={(e) => {
              const template = sideTemplates.find((t) => t.id === e.target.value);
              if (!template) return;
              const replacement = cloneStoredCombatant(template, scenario.combatants.filter((c) => c.id !== combatant.id));
              setScenario(upsertCombatant(scenario, { ...replacement, id: combatant.id, position: combatant.position }));
            }}
            aria-label={`Change ${combatant.side === 'pc' ? 'PC' : 'monster'} to preset`}
          >
            <option value="">Change to preset…</option>
            {sideTemplates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
          <button className="secondary" onClick={onToggle}>
            {open ? 'Collapse' : 'Edit'}
          </button>
          <button className="danger icon-only" onClick={() => setScenario(removeCombatant(scenario, combatant.id))} title="Delete" aria-label="Delete">
            <TrashIcon size={15} />
          </button>
        </div>
      </div>
      <div className="meta-line">
        {combatant.actionIds.length} action{combatant.actionIds.length === 1 ? '' : 's'} · {combatant.script.length} rule{combatant.script.length === 1 ? '' : 's'}
      </div>

      {open && (
        <div style={{ marginTop: '0.75rem' }}>
          {validation.length > 0 && (
            <div className="rule" style={{ borderColor: 'var(--warning)' }}>
              {validation.map((v, i) => (
                <div key={i} className="muted">⚠ {v}</div>
              ))}
            </div>
          )}

          <div className="row" style={{ marginBottom: '0.5rem' }}>
            <label>
              Name
              <input value={combatant.name} onChange={(e) => update({ name: e.target.value })} />
            </label>
            <label>
              Max HP
              <input
                className="num"
                type="number"
                value={combatant.maxHp}
                onChange={(e) => update({ maxHp: +e.target.value })}
              />
            </label>
            <label>
              AC
              <input
                className="num"
                type="number"
                value={combatant.ac}
                onChange={(e) => update({ ac: +e.target.value })}
              />
            </label>
            <label>
              Prof. Bonus
              <input
                className="num"
                type="number"
                value={combatant.proficiencyBonus}
                onChange={(e) => update({ proficiencyBonus: +e.target.value })}
              />
            </label>
            <label>
              Spellcasting
              <select
                value={combatant.spellcastingAbility ?? ''}
                onChange={(e) =>
                  update({ spellcastingAbility: (e.target.value || undefined) as Ability | undefined })
                }
              >
                <option value="">— none —</option>
                {ABILITIES.map((ab) => (
                  <option key={ab} value={ab}>{ab.toUpperCase()}</option>
                ))}
              </select>
            </label>
            <label>
              Position (ft)
              <input
                className="num"
                type="number"
                step={15}
                value={combatant.position ?? ''}
                placeholder="auto"
                onChange={(e) => update({ position: e.target.value === '' ? undefined : +e.target.value })}
              />
            </label>
            <label>
              Speed (ft)
              <input
                className="num"
                type="number"
                step={5}
                value={combatant.speed ?? 30}
                onChange={(e) => update({ speed: +e.target.value })}
              />
            </label>
          </div>

          <h3 style={{ marginTop: '0.5rem' }}>Ability Scores</h3>
          <div className="ability-grid">
            {ABILITIES.map((ab) => (
              <label key={ab}>
                {ab.toUpperCase()}
                <input
                  className="num"
                  type="number"
                  value={combatant.abilityScores[ab]}
                  onChange={(e) =>
                    update({ abilityScores: { ...combatant.abilityScores, [ab]: +e.target.value } })
                  }
                />
              </label>
            ))}
          </div>

          <h3 style={{ marginTop: '0.75rem' }}>Saving Throw Proficiencies</h3>
          <div className="row">
            {ABILITIES.map((ab) => (
              <label key={ab} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={combatant.saveProficiencies.includes(ab)}
                  onChange={(e) => {
                    const set = new Set(combatant.saveProficiencies);
                    if (e.target.checked) set.add(ab);
                    else set.delete(ab);
                    update({ saveProficiencies: [...set] as Ability[] });
                  }}
                />
                {ab.toUpperCase()}
              </label>
            ))}
          </div>

          <h3 style={{ marginTop: '0.75rem' }}>Skill Proficiencies</h3>
          <div className="row">
            {SKILLS.map((skill) => (
              <label key={skill.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={(combatant.skillProficiencies ?? []).includes(skill.id)}
                  onChange={(e) => {
                    const set = new Set(combatant.skillProficiencies ?? []);
                    if (e.target.checked) set.add(skill.id);
                    else set.delete(skill.id);
                    update({ skillProficiencies: [...set] as Skill[] });
                  }}
                />
                {skill.label}
              </label>
            ))}
          </div>

          <h3 style={{ marginTop: '0.75rem' }}>Spell Slots</h3>
          <div className="row">
            {[1, 2, 3, 4, 5].map((lvl) => (
              <label key={lvl}>
                L{lvl}
                <input
                  className="num"
                  type="number"
                  min={0}
                  value={combatant.spellSlots[lvl] ?? 0}
                  onChange={(e) => {
                    const slots = { ...combatant.spellSlots };
                    const n = +e.target.value;
                    if (n > 0) slots[lvl] = n;
                    else delete slots[lvl];
                    update({ spellSlots: slots });
                  }}
                />
              </label>
            ))}
          </div>

          <div className="section">
            <div className="section-title">
              Available Actions
              <InfoHint>
                Pick which library actions this combatant can use. The derived to-hit / damage /
                save DC shown are computed from this combatant's ability scores, proficiency, and
                the chosen weapon or spellcasting ability.
              </InfoHint>
            </div>
            {scenario.actions
              .filter((a) => a.kind !== 'dodge' && a.kind !== 'move')
              .map((a) => {
                const checked = combatant.actionIds.includes(a.id);
                return (
                  <div className="action-line" key={a.id}>
                    <label className="check-inline">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const set = new Set(combatant.actionIds);
                          if (e.target.checked) set.add(a.id);
                          else set.delete(a.id);
                          update({ actionIds: [...set] });
                        }}
                      />
                      {a.name}
                    </label>
                    {checked && (
                      <span className="derived">{describeAction(combatant, a, weaponsById)}</span>
                    )}
                  </div>
                );
              })}
          </div>

          <div className="section">
            <div className="section-title">Priority Script</div>
            {otherSameSide.length > 0 && (
              <div className="toolbar">
                <span className="muted" style={{ fontSize: '0.78rem' }}>Copy script from:</span>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setScenario(copyScript(scenario, e.target.value, combatant.id));
                  }}
                >
                  <option value="">— choose —</option>
                  {otherSameSide.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            )}
            <RuleBuilder combatant={combatant} scenario={scenario} onChange={(script) => update({ script })} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Surface problems that would make a combatant ineffective in a run. */
export function validateCombatant(c: Combatant, scenario: Scenario): string[] {
  const issues: string[] = [];
  if (c.maxHp <= 0) issues.push('Max HP must be greater than 0.');
  if (c.actionIds.length === 0) issues.push('No actions selected — combatant will only Dodge.');
  if (c.script.length === 0) issues.push('No rules — combatant will only Dodge each turn.');
  const ids = new Set(scenario.actions.map((a) => a.id));
  for (const r of c.script) {
    if (!ids.has(r.actionId)) issues.push(`Rule references a missing action (${r.actionId}).`);
  }
  return issues;
}
