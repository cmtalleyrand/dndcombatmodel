import { useState } from 'react';
import { ABILITIES, type Ability, type Combatant, type Scenario, type Side } from '../engine/types';
import { genId, removeCombatant, upsertCombatant } from '../state/store';
import { RuleBuilder } from './RuleBuilder';

interface Props {
  side: Side;
  max: number;
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
}

function blankCombatant(side: Side): Combatant {
  return {
    id: genId(side),
    name: side === 'pc' ? 'New PC' : 'New Monster',
    side,
    maxHp: 20,
    ac: 13,
    abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProficiencies: [],
    proficiencyBonus: 2,
    actionIds: [],
    script: [],
    spellSlots: {},
  };
}

export function CombatantsTab({ side, max, scenario, setScenario }: Props) {
  const combatants = scenario.combatants.filter((c) => c.side === side);
  const [openId, setOpenId] = useState<string | null>(null);

  const add = () => {
    if (combatants.length >= max) return;
    const c = blankCombatant(side);
    setScenario(upsertCombatant(scenario, c));
    setOpenId(c.id);
  };

  return (
    <div>
      <div className="panel">
        <div className="row spread">
          <h2>{side === 'pc' ? 'Player Characters' : 'Monsters'}</h2>
          <button onClick={add} disabled={combatants.length >= max}>
            + Add {side === 'pc' ? 'PC' : 'Monster'} ({combatants.length}/{max})
          </button>
        </div>
        <p className="help">
          Each combatant needs stats, at least one action, and a priority script. Rules run
          top-to-bottom; the first one whose condition passes and whose action is available (slots
          left, a legal target) fires. A built-in Dodge fallback is used when nothing else applies.
        </p>
      </div>

      {combatants.length === 0 && <div className="panel muted">No {side === 'pc' ? 'PCs' : 'monsters'} yet.</div>}

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

  return (
    <div className={`card ${combatant.side}`}>
      <div className="row spread">
        <div className="row">
          <strong>{combatant.name}</strong>
          <span className="tag">HP {combatant.maxHp}</span>
          <span className="tag">AC {combatant.ac}</span>
          <span className="tag">{combatant.actionIds.length} actions</span>
          <span className="tag">{combatant.script.length} rules</span>
          {validation.length > 0 && (
            <span className="tag" style={{ color: 'var(--accent-2)', borderColor: 'var(--accent-2)' }}>
              ⚠ {validation.length} issue{validation.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="row">
          <button className="secondary" onClick={onToggle}>
            {open ? 'Collapse' : 'Edit'}
          </button>
          <button className="danger" onClick={() => setScenario(removeCombatant(scenario, combatant.id))}>
            Delete
          </button>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: '0.75rem' }}>
          {validation.length > 0 && (
            <div className="rule" style={{ borderColor: 'var(--accent-2)' }}>
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

          <h3 style={{ marginTop: '0.75rem' }}>Available Actions</h3>
          <p className="help">Pick which library actions this combatant can use in its script.</p>
          <div className="row">
            {scenario.actions
              .filter((a) => a.kind !== 'dodge' && a.kind !== 'move')
              .map((a) => (
                <label key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={combatant.actionIds.includes(a.id)}
                    onChange={(e) => {
                      const set = new Set(combatant.actionIds);
                      if (e.target.checked) set.add(a.id);
                      else set.delete(a.id);
                      update({ actionIds: [...set] });
                    }}
                  />
                  {a.name}
                </label>
              ))}
          </div>

          <h3 style={{ marginTop: '0.75rem' }}>Priority Script</h3>
          <RuleBuilder combatant={combatant} scenario={scenario} onChange={(script) => update({ script })} />
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
