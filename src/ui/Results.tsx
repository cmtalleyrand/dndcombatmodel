import { useMemo, useState } from 'react';
import type { Scenario } from '../engine/types';
import type { AggregateStats } from '../engine/statistics';
import type { LogEvent } from '../engine/log';

interface Props {
  stats: AggregateStats;
  scenario: Scenario;
}

function pct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

export function Results({ stats, scenario }: Props) {
  const pcStats = stats.combatants.filter((c) => c.side === 'pc');
  const monsterStats = stats.combatants.filter((c) => c.side === 'monster');
  const roundsUsed = Math.min(
    scenario.maxRounds,
    Math.max(1, Math.ceil(stats.avgRounds) + 2),
  );

  return (
    <div>
      <div className="panel">
        <h2>Outcome ({stats.simulations} simulations)</h2>
        <div className="grid-2">
          <div>
            <div className="muted">Party (PC) win rate</div>
            <div className="stat-big" style={{ color: 'var(--pc)' }}>{pct(stats.pcWinRate)}</div>
          </div>
          <div>
            <div className="muted">Monster win rate</div>
            <div className="stat-big" style={{ color: 'var(--monster)' }}>{pct(stats.monsterWinRate)}</div>
          </div>
        </div>
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <span className="tag">Draws: {pct(stats.drawRate)}</span>
          <span className="tag">Avg rounds: {stats.avgRounds.toFixed(1)}</span>
        </div>
      </div>

      <StatTable title="Player Characters" rows={pcStats} />
      <StatTable title="Monsters" rows={monsterStats} />

      <PerRoundDamage stats={stats} rounds={roundsUsed} />

      <SampleRunLog events={stats.sampleRun.events} winner={stats.sampleRun.winner} rounds={stats.sampleRun.rounds} />
    </div>
  );
}

function StatTable({ title, rows }: { title: string; rows: AggregateStats['combatants'] }) {
  if (rows.length === 0) return null;
  return (
    <div className="panel">
      <h3>{title} — averages per simulation</h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th className="num">Survival</th>
            <th className="num">End HP</th>
            <th className="num">Dmg dealt</th>
            <th className="num">Dmg taken</th>
            <th className="num">Healing</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td className="num">{pct(r.survivalRate)}</td>
              <td className="num">{r.avgEndHp.toFixed(1)} / {r.maxHp}</td>
              <td className="num">{r.avgDamageDealt.toFixed(1)}</td>
              <td className="num">{r.avgDamageTaken.toFixed(1)}</td>
              <td className="num">{r.avgHealingDone > 0 ? r.avgHealingDone.toFixed(1) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerRoundDamage({ stats, rounds }: { stats: AggregateStats; rounds: number }) {
  // find a max value to scale bars
  const max = useMemo(() => {
    let m = 0;
    for (const c of stats.combatants) {
      for (let i = 0; i < rounds; i++) m = Math.max(m, c.avgDamageByRound[i] ?? 0);
    }
    return m || 1;
  }, [stats, rounds]);

  return (
    <div className="panel">
      <h3>Average damage dealt per round</h3>
      <table>
        <thead>
          <tr>
            <th>Combatant</th>
            {Array.from({ length: rounds }, (_, i) => (
              <th key={i} className="num">R{i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.combatants.map((c) => (
            <tr key={c.id}>
              <td style={{ color: c.side === 'pc' ? 'var(--pc)' : 'var(--monster)' }}>{c.name}</td>
              {Array.from({ length: rounds }, (_, i) => {
                const v = c.avgDamageByRound[i] ?? 0;
                return (
                  <td key={i} className="num" title={v.toFixed(2)}>
                    <div
                      className={`hbar ${c.side === 'monster' ? 'monster' : ''}`}
                      style={{ width: `${Math.max(2, (v / max) * 40)}px`, display: 'inline-block', marginRight: 4, verticalAlign: 'middle' }}
                    />
                    {v.toFixed(1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SampleRunLog({ events, winner, rounds }: { events: LogEvent[]; winner: string; rounds: number }) {
  const [show, setShow] = useState(true);
  const grouped = useMemo(() => {
    const byRound = new Map<number, LogEvent[]>();
    for (const e of events) {
      if (!byRound.has(e.round)) byRound.set(e.round, []);
      byRound.get(e.round)!.push(e);
    }
    return [...byRound.entries()].sort((a, b) => a[0] - b[0]);
  }, [events]);

  return (
    <div className="panel">
      <div className="row spread">
        <h3>Sample run narrative (one representative simulation)</h3>
        <button className="secondary" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
      </div>
      <div className="muted" style={{ marginBottom: '0.5rem' }}>
        Result: <strong style={{ color: winner === 'pc' ? 'var(--pc)' : winner === 'monster' ? 'var(--monster)' : 'inherit' }}>
          {winner === 'pc' ? 'Party wins' : winner === 'monster' ? 'Monsters win' : 'Draw'}
        </strong> after {rounds} rounds.
      </div>
      {show && (
        <div className="log">
          {grouped.map(([round, evs]) => (
            <div key={round}>
              <div className="round-head">── Round {round} ──</div>
              {evs.map((e, i) => (
                <div key={i} className={e.type === 'death' ? 'death' : e.type === 'heal' ? 'heal' : e.type === 'skip' ? 'skip' : ''}>
                  {e.message}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
