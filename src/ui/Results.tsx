import { useMemo, useState } from 'react';
import type { Scenario } from '../engine/types';
import { approximateProportionInterval, type AggregateStats, type CombatantStats } from '../engine/statistics';
import type { LogEvent } from '../engine/log';

interface Props {
  stats: AggregateStats;
  scenario: Scenario;
  onOpenReplay: () => void;
}

function pct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize the aggregate results to CSV: a summary block followed by a per-combatant table. */
export function buildResultsCsv(stats: AggregateStats, scenario: Scenario): string {
  const rows: string[] = [];
  rows.push(['section', 'key', 'value'].join(','));
  rows.push(['summary', 'scenario', csvEscape(scenario.name)].join(','));
  rows.push(['summary', 'simulations', stats.simulations].join(','));
  rows.push(['summary', 'partyWinRate', stats.pcWinRate.toFixed(4)].join(','));
  rows.push(['summary', 'drawRate', stats.drawRate.toFixed(4)].join(','));
  rows.push(['summary', 'monsterWinRate', stats.monsterWinRate.toFixed(4)].join(','));
  rows.push(['summary', 'avgRounds', stats.avgRounds.toFixed(2)].join(','));
  rows.push('');
  rows.push(['name', 'side', 'maxHp', 'survivalRate', 'avgEndHp', 'avgDamageDealt', 'avgDamageTaken', 'avgHealingDone'].join(','));
  for (const c of stats.combatants) {
    rows.push([
      csvEscape(c.name), c.side, c.maxHp,
      c.survivalRate.toFixed(4), c.avgEndHp.toFixed(2),
      c.avgDamageDealt.toFixed(2), c.avgDamageTaken.toFixed(2), c.avgHealingDone.toFixed(2),
    ].join(','));
  }
  return rows.join('\n');
}

function downloadResultsCsv(stats: AggregateStats, scenario: Scenario): void {
  const blob = new Blob([buildResultsCsv(stats, scenario)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (scenario.name || 'scenario').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  a.href = url;
  a.download = `${safeName}-results.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function Results({ stats, scenario, onOpenReplay }: Props) {
  const pcStats = stats.combatants.filter((c) => c.side === 'pc');
  const monsterStats = stats.combatants.filter((c) => c.side === 'monster');
  const roundsUsed = Math.min(
    scenario.maxRounds,
    Math.max(1, Math.ceil(stats.avgRounds) + 2),
  );

  return (
    <div>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
        <button
          className="secondary"
          onClick={() => downloadResultsCsv(stats, scenario)}
          title="Download aggregate results (win rates + per-combatant stats) as CSV"
        >
          Export CSV
        </button>
      </div>

      <Outcome stats={stats} />

      <div className="grid-2">
        <RosterPanel title="Party" side="pc" rows={pcStats} />
        <RosterPanel title="Monsters" side="monster" rows={monsterStats} />
      </div>

      <PerRoundDamage stats={stats} rounds={roundsUsed} />

      <SampleRunLog events={stats.sampleRun.events} winner={stats.sampleRun.winner} rounds={stats.sampleRun.rounds} onOpenReplay={onOpenReplay} />
    </div>
  );
}

/** Headline outcome: a single stacked win-rate bar plus summary chips. */
function Outcome({ stats }: { stats: AggregateStats }) {
  const segs = [
    { key: 'pc', label: 'Party', value: stats.pcWinRate, cls: 'pc' },
    { key: 'draw', label: 'Draw', value: stats.drawRate, cls: 'draw' },
    { key: 'monster', label: 'Monsters', value: stats.monsterWinRate, cls: 'monster' },
  ].filter((s) => s.value > 0);

  const intervals = [
    { key: 'pc', label: 'Party', interval: approximateProportionInterval(stats.pcWinRate, stats.simulations) },
    { key: 'draw', label: 'Draws', interval: approximateProportionInterval(stats.drawRate, stats.simulations) },
    { key: 'monster', label: 'Monsters', interval: approximateProportionInterval(stats.monsterWinRate, stats.simulations) },
  ];

  return (
    <div className="panel">
      <div className="row spread" style={{ alignItems: 'baseline' }}>
        <h2>Outcome</h2>
        <span className="muted">{stats.simulations.toLocaleString()} simulations</span>
      </div>

      <div className="winbar" role="img" aria-label="Win rate distribution" aria-hidden="true">
        {segs.map((s) => (
          <div key={s.key} className={`winbar-seg ${s.cls}`} style={{ width: `${s.value * 100}%` }}>
            {s.value >= 0.08 && <span>{pct(s.value)}</span>}
          </div>
        ))}
      </div>

      <table className="sr-only">
        <caption>Win rate distribution with approximate 95% intervals</caption>
        <thead><tr><th>Outcome</th><th>Rate</th><th>95% interval</th></tr></thead>
        <tbody>
          {intervals.map(({ key, label, interval }) => (
            <tr key={key}>
              <th scope="row">{label}</th>
              <td>{pct(key === 'pc' ? stats.pcWinRate : key === 'draw' ? stats.drawRate : stats.monsterWinRate)}</td>
              <td>{pct(interval.lower)}–{pct(interval.upper)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="winbar-key">
        <span className="legend-chip pc">Party {pct(stats.pcWinRate)}</span>
        <span className="legend-chip draw">Draws {pct(stats.drawRate)}</span>
        <span className="legend-chip monster">Monsters {pct(stats.monsterWinRate)}</span>
        <span className="tag">Avg length {stats.avgRounds.toFixed(1)} rounds</span>
      </div>

      <div className="help" style={{ marginTop: '0.75rem' }}>
        Approximate 95% intervals from Monte-Carlo sampling:{' '}
        {intervals.map(({ key, label, interval }) => (
          <span key={key} className="tag" style={{ marginRight: '0.35rem' }}>
            {label} {pct(interval.lower)}–{pct(interval.upper)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One side's roster, each combatant shown with survival and end-HP meters. */
function RosterPanel({ title, side, rows }: { title: string; side: 'pc' | 'monster'; rows: CombatantStats[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="panel">
      <h3 className={`roster-title ${side}`}>{title}</h3>
      <p className="help" style={{ marginTop: 0 }}>Averages per simulation.</p>
      {rows.map((r) => (
        <div className="cstat" key={r.id}>
          <div className="cstat-head">
            <span className="cstat-name">{r.name}<span className="sr-only"> ({side === 'pc' ? 'party member' : 'monster'})</span></span>
            <span className="muted">{pct(r.survivalRate)} survive</span>
          </div>
          <div className="meter" title={`Survival ${pct(r.survivalRate)}`} role="img" aria-label={`Survival rate ${pct(r.survivalRate)}`}>
            <div className={`meter-fill ${side}`} style={{ width: `${r.survivalRate * 100}%` }} />
          </div>
          <div className="cstat-figs">
            <span className="cstat-fig">
              <span className="cstat-fig-label">End HP</span>
              <span className="cstat-fig-val">{r.avgEndHp.toFixed(1)} / {r.maxHp}</span>
            </span>
            <span className="cstat-fig">
              <span className="cstat-fig-label">Dealt</span>
              <span className="cstat-fig-val">{r.avgDamageDealt.toFixed(1)}</span>
            </span>
            <span className="cstat-fig">
              <span className="cstat-fig-label">Taken</span>
              <span className="cstat-fig-val">{r.avgDamageTaken.toFixed(1)}</span>
            </span>
            <span className="cstat-fig">
              <span className="cstat-fig-label">Healing</span>
              <span className="cstat-fig-val">{r.avgHealingDone > 0 ? r.avgHealingDone.toFixed(1) : '—'}</span>
            </span>
          </div>
        </div>
      ))}
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
      <table className="sr-only">
        <caption>Average damage dealt per round by combatant</caption>
        <thead>
          <tr>
            <th>Combatant</th>
            {Array.from({ length: rounds }, (_, i) => <th key={i}>Round {i + 1}</th>)}
          </tr>
        </thead>
        <tbody>
          {stats.combatants.map((c) => (
            <tr key={c.id}>
              <th scope="row">{c.name} ({c.side === 'pc' ? 'party' : 'monster'})</th>
              {Array.from({ length: rounds }, (_, i) => <td key={i}>{(c.avgDamageByRound[i] ?? 0).toFixed(1)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="dmg-chart" aria-hidden="true">
        {stats.combatants.map((c) => (
          <div className="dmg-row" key={c.id}>
            <span className={`dmg-name ${c.side}`}>{c.name}</span>
            <div className="dmg-cells">
              {Array.from({ length: rounds }, (_, i) => {
                const v = c.avgDamageByRound[i] ?? 0;
                return (
                  <div className="dmg-cell" key={i} title={`Round ${i + 1}: ${v.toFixed(2)}`}>
                    <div className="dmg-track">
                      <div
                        className={`dmg-fill ${c.side}`}
                        style={{ height: `${Math.max(3, (v / max) * 100)}%` }}
                      />
                    </div>
                    <span className="dmg-val">{v >= 0.05 ? v.toFixed(1) : ''}</span>
                    <span className="dmg-rlabel">R{i + 1}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SampleRunLog({ events, winner, rounds, onOpenReplay }: { events: LogEvent[]; winner: string; rounds: number; onOpenReplay: () => void }) {
  const [show, setShow] = useState(false);
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
        <h3>Combat log (one representative simulation)</h3>
        <div className="row"><button className="secondary" onClick={onOpenReplay}>Open representative replay</button><button className="secondary" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></div>
      </div>
      <div className="muted" style={{ marginBottom: '0.5rem' }}>
        Result: <strong style={{ color: winner === 'pc' ? 'var(--pc)' : winner === 'monster' ? 'var(--monster)' : 'inherit' }}>
          {winner === 'pc' ? 'Party wins' : winner === 'monster' ? 'Monsters win' : 'Draw'}
        </strong> after {rounds} rounds. <span className="muted">Watch it play out on the Replay tab.</span>
      </div>
      {show && (
        <div className="log">
          {grouped.map(([round, evs]) => (
            <div key={round}>
              <div className="round-head">── Round {round} ──</div>
              {evs.map((e, i) => (
                <div
                  key={i}
                  className={
                    e.type === 'death' ? 'death'
                    : e.type === 'heal' ? 'heal'
                    : e.type === 'skip' ? 'skip'
                    : e.type === 'move' ? 'move'
                    : ''
                  }
                >
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
