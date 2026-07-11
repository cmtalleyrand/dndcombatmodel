import { useMemo, useState } from 'react';
import { ABILITIES, type Combatant, type Scenario } from '../engine/types';
import { abilityMod, DEFAULT_MAX_ROUNDS } from '../engine/state';
import { convertDraftToScenario } from '../ai/convertDraftToScenario';
import type { AIScenarioDraft } from '../ai/types';
import { describeAction, describeFeature } from './describe';
import { describeCondition, describeTarget } from './ruleMeta';
import { HeartIcon, ShieldHalfIcon, pickCombatantIcon } from './icons';

/**
 * Read-only "what will be applied" preview. Instead of a raw JSON / plain-text
 * dump, we run the draft through the very same {@link convertDraftToScenario}
 * pipeline that Approve uses, then render the resulting combatants as the same
 * kind of stat cards the manual editors show. That guarantees the preview is an
 * exact rehearsal of the applied scenario (identical derived to-hit, damage, and
 * save DCs), and it only ever renders a draft that would actually convert.
 */
export function DraftPreview({ draft }: { draft: AIScenarioDraft }) {
  // Convert once; if the draft can't convert yet, fall back to a lightweight
  // view built straight off the draft so users still see their PCs/monsters.
  const converted = useMemo(() => {
    try {
      return { scenario: convertDraftToScenario(draft), error: null as string | null };
    } catch (error) {
      return { scenario: null, error: error instanceof Error ? error.message : 'Draft is not ready to preview yet.' };
    }
  }, [draft]);

  const pcs = converted.scenario?.combatants.filter((c) => c.side === 'pc') ?? [];
  const monsters = converted.scenario?.combatants.filter((c) => c.side === 'monster') ?? [];

  return (
    <div className="draft-preview">
      <div className="draft-overview">
        <div className="draft-summary">{draft.scenarioSummary || 'AI-authored encounter draft'}</div>
        <div className="draft-facts">
          <span className="stat-chip">{pcs.length || draft.pcs.length} PC{(pcs.length || draft.pcs.length) === 1 ? '' : 's'}</span>
          <span className="stat-chip">{monsters.length || draft.enemies.length} monster{(monsters.length || draft.enemies.length) === 1 ? '' : 's'}</span>
          <span className="stat-chip">{draft.actions.length} action{draft.actions.length === 1 ? '' : 's'}</span>
          <span className="stat-chip">{draft.maxRounds ?? DEFAULT_MAX_ROUNDS} max rounds</span>
        </div>
      </div>

      {converted.error && (
        <div className="rule" style={{ borderColor: 'var(--warning)', marginTop: '0.75rem' }}>
          <div className="muted">
            ⚠ These cards are a best-effort preview — the draft can't be applied until the issues below the JSON are fixed.
          </div>
        </div>
      )}

      {converted.scenario ? (
        <>
          <PreviewSection title="Player Characters" side="pc" combatants={pcs} scenario={converted.scenario} />
          <PreviewSection title="Monsters" side="monster" combatants={monsters} scenario={converted.scenario} />
        </>
      ) : (
        <div className="card-grid draft-cards">
          {[...draft.pcs, ...draft.enemies].map((c, i) => (
            <RawDraftCard key={`${c.name}-${i}`} combatant={c} />
          ))}
        </div>
      )}

    </div>
  );
}

function PreviewSection({
  title,
  side,
  combatants,
  scenario,
}: {
  title: string;
  side: 'pc' | 'monster';
  combatants: Combatant[];
  scenario: Scenario;
}) {
  if (combatants.length === 0) return null;
  return (
    <div className="draft-section">
      <div className="section-title" style={{ marginBottom: '0.5rem' }}>
        {title} <span className="muted">({combatants.length})</span>
      </div>
      <div className={`card-grid draft-cards ${side}-cards`}>
        {combatants.map((c) => (
          <PreviewCombatantCard key={c.id} combatant={c} scenario={scenario} />
        ))}
      </div>
    </div>
  );
}

/** A read-only stat card for one converted draft combatant, expandable for detail. */
function PreviewCombatantCard({ combatant, scenario }: { combatant: Combatant; scenario: Scenario }) {
  const [open, setOpen] = useState(false);
  const { Icon, label } = pickCombatantIcon(combatant, scenario);
  const actions = scenario.actions.filter((a) => combatant.actionIds.includes(a.id));
  const features = (scenario.features ?? []).filter((f) => combatant.featureIds?.includes(f.id));
  const slots = Object.entries(combatant.spellSlots ?? {}).filter(([, n]) => n > 0);

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
        </div>
        <div className="row">
          <button type="button" className="secondary mini" onClick={() => setOpen((v) => !v)}>
            {open ? 'Less' : 'Details'}
          </button>
        </div>
      </div>

      <div className="meta-line">
        {actions.length} action{actions.length === 1 ? '' : 's'} · {combatant.script.length} rule{combatant.script.length === 1 ? '' : 's'}
        {combatant.position !== undefined && ` · position ${combatant.position} ft`}
        {combatant.speed !== undefined && ` · speed ${combatant.speed} ft`}
        {combatant.level !== undefined && ` · level ${combatant.level}`}
      </div>

      {open && (
        <div style={{ marginTop: '0.75rem' }}>
          <div className="ability-grid draft-abilities">
            {ABILITIES.map((ab) => {
              const mod = abilityMod(combatant.abilityScores[ab]);
              const proficient = combatant.saveProficiencies.includes(ab);
              return (
                <div key={ab} className="draft-ability">
                  <span className="draft-ability-label">
                    {ab.toUpperCase()}
                    {proficient && <span title="Saving throw proficiency"> ●</span>}
                  </span>
                  <span className="draft-ability-score">{combatant.abilityScores[ab]}</span>
                  <span className="draft-ability-mod">{mod >= 0 ? '+' : ''}{mod}</span>
                </div>
              );
            })}
          </div>

          {(combatant.resistances?.length || combatant.immunities?.length || combatant.vulnerabilities?.length || combatant.conditionImmunities?.length) ? (
            <div className="draft-defenses">
              {combatant.resistances?.length ? <span className="tag">Resist: {combatant.resistances.join(', ')}</span> : null}
              {combatant.immunities?.length ? <span className="tag">Immune: {combatant.immunities.join(', ')}</span> : null}
              {combatant.vulnerabilities?.length ? <span className="tag">Vulnerable: {combatant.vulnerabilities.join(', ')}</span> : null}
              {combatant.conditionImmunities?.length ? <span className="tag">Cond. immune: {combatant.conditionImmunities.join(', ')}</span> : null}
            </div>
          ) : null}

          {slots.length > 0 && (
            <div className="draft-defenses">
              {slots.map(([lvl, n]) => (
                <span key={lvl} className="tag">L{lvl}: {n} slot{n === 1 ? '' : 's'}</span>
              ))}
            </div>
          )}

          <div className="draft-block-title">Actions</div>
          {actions.length === 0 ? (
            <div className="muted">None</div>
          ) : (
            actions.map((a) => (
              <div className="action-line" key={a.id}>
                <span>{a.name}</span>
                <span className="derived">{describeAction(combatant, a, {})}</span>
              </div>
            ))
          )}

          {features.length > 0 && (
            <>
              <div className="draft-block-title">Features</div>
              {features.map((f) => (
                <div className="action-line" key={f.id}>
                  <span>{f.name}</span>
                  <span className="derived">{describeFeature(f)}</span>
                </div>
              ))}
            </>
          )}

          <div className="draft-block-title">Priority script</div>
          {combatant.script.length === 0 ? (
            <div className="muted">No rules — will Dodge each turn.</div>
          ) : (
            combatant.script.map((rule, i) => {
              const action = scenario.actions.find((a) => a.id === rule.actionId);
              return (
                <div className="draft-rule" key={i}>
                  <span className="priority-badge">{rule.priority}</span>
                  <span className="draft-rule-body">
                    {rule.label ? <strong>{rule.label} — </strong> : null}
                    <span>Use <strong>{action?.name ?? rule.actionId}</strong></span>
                    <span className="muted"> · when {describeCondition(rule.condition)} · target {describeTarget(rule.target)}</span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/** Fallback card used only when the draft can't yet be converted. */
function RawDraftCard({ combatant }: { combatant: AIScenarioDraft['pcs'][number] }) {
  return (
    <div className={`card ${combatant.side === 'pc' ? 'pc' : 'monster'}`}>
      <div className="card-head">
        <div className="card-title">
          <strong>{combatant.name || 'Unnamed'}</strong>
          <div className="card-subtitle">{combatant.side === 'pc' ? 'Player character' : 'Monster'}</div>
        </div>
        <div className="card-stats">
          <span className="stat-chip"><HeartIcon size={13} />{combatant.maxHp}</span>
          <span className="stat-chip"><ShieldHalfIcon size={13} />{combatant.ac}</span>
        </div>
      </div>
      <div className="meta-line">Actions: {combatant.actionNames.join(', ') || 'none'}</div>
    </div>
  );
}
