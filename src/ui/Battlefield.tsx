import { useMemo } from 'react';
import type { Scenario } from '../engine/types';
import { defaultPosition } from '../engine/state';
import { InfoHint } from './InfoHint';

interface Props {
  scenario: Scenario;
}

/** Read-only 1D battlefield map: plots every combatant at its position (feet). */
export function Battlefield({ scenario }: Props) {
  const placed = useMemo(() => {
    const sideIndex: Record<string, number> = { pc: 0, monster: 0 };
    return scenario.combatants.map((c) => {
      const idx = sideIndex[c.side]++;
      const pos = c.position ?? defaultPosition(c.side, idx, scenario.encounterDistance);
      return { id: c.id, name: c.name, side: c.side, pos };
    });
  }, [scenario.combatants, scenario.encounterDistance]);

  if (placed.length === 0) return null;

  const min = Math.min(0, ...placed.map((p) => p.pos));
  const max = Math.max(45, ...placed.map((p) => p.pos));
  const span = Math.max(1, max - min);
  const pct = (pos: number) => ((pos - min) / span) * 100;

  // group combatants sharing a position so labels stack instead of overlapping
  const byPos = new Map<number, typeof placed>();
  for (const p of placed) {
    if (!byPos.has(p.pos)) byPos.set(p.pos, []);
    byPos.get(p.pos)!.push(p);
  }

  return (
    <div className="panel">
      <h3>
        Battlefield (linear, feet)
        <InfoHint>
          Distance 0 = enemy rear. Melee = same block; ranged/AoE use these distances. Edit a
          combatant's position on its card.
        </InfoHint>
      </h3>
      <div style={{ position: 'relative', height: `${[...byPos.values()].reduce((m, g) => Math.max(m, g.length), 1) * 26 + 40}px`, margin: '1rem 0' }}>
        {/* axis line */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 2, background: 'var(--border)' }} />
        {/* ticks every 15ft */}
        {Array.from({ length: Math.floor(span / 15) + 1 }, (_, i) => min + i * 15).map((ft) => (
          <div key={ft} style={{ position: 'absolute', left: `${pct(ft)}%`, top: 4, transform: 'translateX(-50%)' }}>
            <div style={{ width: 1, height: 10, background: 'var(--border)', margin: '0 auto' }} />
            <div className="muted" style={{ fontSize: '0.65rem', marginTop: 2 }}>{ft}</div>
          </div>
        ))}
        {/* markers */}
        {[...byPos.entries()].map(([pos, group]) =>
          group.map((p, i) => (
            <div
              key={p.id}
              title={`${p.name} @ ${pos}ft`}
              style={{
                position: 'absolute',
                left: `${pct(pos)}%`,
                top: 28 + i * 26,
                transform: 'translateX(-50%)',
                background: p.side === 'pc' ? 'var(--pc)' : 'var(--monster)',
                color: 'white',
                borderRadius: 4,
                padding: '2px 7px',
                fontSize: '0.72rem',
                whiteSpace: 'nowrap',
              }}
            >
              {p.name}
            </div>
          )),
        )}
      </div>
    </div>
  );
}
