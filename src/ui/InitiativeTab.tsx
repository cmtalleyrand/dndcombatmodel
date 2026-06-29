import type { Scenario } from '../engine/types';
import { Battlefield } from './Battlefield';

interface Props {
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
}

export function InitiativeTab({ scenario, setScenario }: Props) {
  const order = scenario.fixedOrder?.length
    ? scenario.fixedOrder.filter((id) => scenario.combatants.some((c) => c.id === id))
    : scenario.combatants.map((c) => c.id);

  // include any combatants missing from a saved order
  const fullOrder = [
    ...order,
    ...scenario.combatants.map((c) => c.id).filter((id) => !order.includes(id)),
  ];

  const byId = (id: string) => scenario.combatants.find((c) => c.id === id)!;

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= fullOrder.length) return;
    const next = [...fullOrder];
    [next[idx], next[j]] = [next[j], next[idx]];
    setScenario({ ...scenario, fixedOrder: next });
  };

  return (
   <div>
    <Battlefield scenario={scenario} />
    <div className="panel">
      <h2>Initiative</h2>
      <div className="row" style={{ marginBottom: '0.75rem' }}>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input
            type="radio"
            checked={scenario.initiativeMode === 'rolled'}
            onChange={() => setScenario({ ...scenario, initiativeMode: 'rolled' })}
          />
          Roll initiative each simulation (d20 + Dex mod)
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input
            type="radio"
            checked={scenario.initiativeMode === 'fixed'}
            onChange={() => setScenario({ ...scenario, initiativeMode: 'fixed', fixedOrder: fullOrder })}
          />
          Fixed order (below)
        </label>
        <label>
          Max rounds
          <input
            className="num"
            type="number"
            min={1}
            value={scenario.maxRounds}
            onChange={(e) => setScenario({ ...scenario, maxRounds: +e.target.value })}
          />
        </label>
      </div>

      <p className="help">
        {scenario.initiativeMode === 'rolled'
          ? 'Order is re-rolled at the start of every simulation. The list below is only used for fixed order.'
          : 'The order below is used for every simulation (first acts first).'}
      </p>

      <ol style={{ paddingLeft: '1.2rem' }}>
        {fullOrder.map((id, idx) => {
          const c = byId(id);
          return (
            <li key={id} style={{ marginBottom: '0.3rem' }}>
              <span className="row" style={{ display: 'inline-flex' }}>
                <span className={`tag`} style={{ color: c.side === 'pc' ? 'var(--pc)' : 'var(--monster)' }}>
                  {c.side}
                </span>
                <strong>{c.name}</strong>
                <span className="muted">Dex {c.abilityScores.dex}</span>
                {scenario.initiativeMode === 'fixed' && (
                  <>
                    <button className="ghost" onClick={() => move(idx, -1)} disabled={idx === 0}>↑</button>
                    <button className="ghost" onClick={() => move(idx, 1)} disabled={idx === fullOrder.length - 1}>↓</button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
   </div>
  );
}
