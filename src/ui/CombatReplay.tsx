import { useEffect, useMemo, useRef, useState } from 'react';
import type { Scenario, Side } from '../engine/types';
import type { TurnFrame } from '../engine/log';

interface Props {
  scenario: Scenario;
  frames: TurnFrame[];
  winner: Side | 'draw';
  rounds: number;
}

const LANE = 90; // vertical px per stacked token within a side band
const AXIS_GAP = 30; // px gap straddling the centre axis
const TOP_PAD = 10; // px breathing room at top/bottom of the stage
const INSET = 7; // % horizontal inset so edge tokens don't clip
const PCT_OVERLAP = 7; // tokens closer than this (% of track) stack into lanes
const STEP_MS = 1100; // base ms per turn at 1× speed

/** A single combatant token with HP bar and per-frame combat effects. */
interface Token {
  id: string;
  name: string;
  side: Side;
  pos: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  lane: number;
  dmg: number;
  heal: number;
  died: boolean;
}

export function CombatReplay({ scenario, frames, winner, rounds }: Props) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const last = frames.length - 1;
  const frame = frames[Math.min(idx, last)] ?? frames[0];
  const atEnd = idx >= last;

  // Stable name/side lookup (snapshots carry only id/hp/position).
  const meta = useMemo(() => {
    const m: Record<string, { name: string; side: Side }> = {};
    for (const c of scenario.combatants) m[c.id] = { name: c.name, side: c.side };
    return m;
  }, [scenario.combatants]);

  // Coordinate transform shared with the static Battlefield: fix the axis across
  // ALL frames so tokens slide rather than the scale jumping each turn.
  const { pct, ticks } = useMemo(() => {
    let min = 0;
    let max = 45;
    for (const f of frames) {
      for (const s of f.snapshot) {
        min = Math.min(min, s.position);
        max = Math.max(max, s.position);
      }
    }
    const span = Math.max(1, max - min);
    const tickList = Array.from({ length: Math.floor(span / 15) + 1 }, (_, i) => min + i * 15);
    return { pct: (p: number) => ((p - min) / span) * 100, ticks: tickList };
  }, [frames]);

  // Advance playback while playing.
  useEffect(() => {
    if (!playing) return;
    if (atEnd) {
      setPlaying(false);
      return;
    }
    timer.current = setTimeout(() => setIdx((i) => Math.min(last, i + 1)), STEP_MS / speed);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [playing, idx, speed, atEnd, last]);

  // Build tokens for the current frame, including per-frame damage/heal/death effects.
  const tokens = useMemo<Token[]>(() => {
    const fx: Record<string, { dmg: number; heal: number; died: boolean }> = {};
    for (const e of frame.events) {
      if (!e.targetId) continue;
      const slot = (fx[e.targetId] ??= { dmg: 0, heal: 0, died: false });
      if (typeof e.damage === 'number') slot.dmg += e.damage;
      if (typeof e.healing === 'number') slot.heal += e.healing;
      if (e.type === 'death') slot.died = true;
    }

    const base: Token[] = frame.snapshot.map((s) => ({
      id: s.id,
      name: meta[s.id]?.name ?? s.id,
      side: meta[s.id]?.side ?? 'monster',
      pos: s.position,
      hp: s.hp,
      maxHp: s.maxHp,
      alive: s.alive,
      lane: 0,
      dmg: fx[s.id]?.dmg ?? 0,
      heal: fx[s.id]?.heal ?? 0,
      died: fx[s.id]?.died ?? false,
    }));

    // Greedy lane assignment per side so clustered (melee) tokens stack instead of overlapping.
    for (const side of ['pc', 'monster'] as Side[]) {
      const group = base.filter((t) => t.side === side).sort((a, b) => a.pos - b.pos);
      const laneTail: number[] = []; // last pct placed in each lane
      for (const t of group) {
        const p = pct(t.pos);
        let lane = laneTail.findIndex((tail) => Math.abs(tail - p) >= PCT_OVERLAP);
        if (lane === -1) lane = laneTail.length;
        laneTail[lane] = p;
        t.lane = lane;
      }
    }
    return base;
  }, [frame, meta, pct]);

  const pcLanes = Math.max(1, ...tokens.filter((t) => t.side === 'pc').map((t) => t.lane + 1));
  const monLanes = Math.max(1, ...tokens.filter((t) => t.side === 'monster').map((t) => t.lane + 1));
  const pcBand = pcLanes * LANE;
  const stageH = TOP_PAD + pcBand + AXIS_GAP + monLanes * LANE + TOP_PAD;
  const axisY = TOP_PAD + pcBand + AXIS_GAP / 2;

  const topFor = (t: Token) =>
    t.side === 'pc'
      ? TOP_PAD + pcBand - (t.lane + 1) * LANE
      : TOP_PAD + pcBand + AXIS_GAP + t.lane * LANE;

  // map feet → horizontal % with an inset so edge tokens don't clip the stage
  const xpct = (p: number) => INSET + (pct(p) / 100) * (100 - 2 * INSET);

  const go = (n: number) => {
    setPlaying(false);
    setIdx(Math.max(0, Math.min(last, n)));
  };

  return (
    <div className="replay">
      <div className="replay-bar">
        <div className="replay-round">
          {frame.round === 0 ? (
            <span className="kw">Battle start</span>
          ) : (
            <>
              <span className="kw">Round {frame.round}</span>
              <span className="muted"> · turn {idx} / {last}</span>
            </>
          )}
        </div>
        <div className="replay-legend">
          <span className="legend-chip pc">Party</span>
          <span className="legend-chip monster">Monsters</span>
        </div>
      </div>

      <div className="replay-stage" style={{ height: stageH }}>
        {/* distance axis */}
        <div className="replay-axis" style={{ top: axisY }} />
        {ticks.map((ft) => (
          <div key={ft} className="replay-tick" style={{ left: `${xpct(ft)}%`, top: axisY }}>
            <span className="replay-tick-label">{ft}′</span>
          </div>
        ))}

        {tokens.map((t) => (
          <div
            key={t.id}
            className={`replay-token ${t.side}${t.alive ? '' : ' dead'}${t.died ? ' just-died' : ''}${t.dmg > 0 ? ' hit' : ''}${t.heal > 0 ? ' healed' : ''}`}
            style={{ left: `${xpct(t.pos)}%`, top: topFor(t) }}
            title={`${t.name} — ${t.hp}/${t.maxHp} HP @ ${t.pos}′`}
          >
            {/* floating combat numbers, re-keyed per frame so they re-animate */}
            {t.dmg > 0 && (
              <span key={`d${idx}`} className="float-num dmg">-{t.dmg}</span>
            )}
            {t.heal > 0 && (
              <span key={`h${idx}`} className="float-num heal">+{t.heal}</span>
            )}
            <div className="token-disc">{t.alive ? initials(t.name) : '✕'}</div>
            <div className="token-name">{t.name}</div>
            <div className="token-hpbar">
              <div
                className={`token-hpfill ${t.side}`}
                style={{ width: `${t.maxHp > 0 ? (t.hp / t.maxHp) * 100 : 0}%` }}
              />
            </div>
            <div className="token-hptext">{t.hp}/{t.maxHp}</div>
          </div>
        ))}

        {atEnd && (
          <div className={`replay-winner ${winner}`}>
            {winner === 'pc' ? '🏆 Party is victorious' : winner === 'monster' ? '☠ Monsters prevail' : '⚔ Draw'}
            <span className="muted"> · {rounds} round{rounds === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>

      <div className="replay-caption">
        {frame.events.length === 0 ? (
          <span className="muted">
            {frame.round === 0 ? 'Combatants take their starting positions.' : '…'}
          </span>
        ) : (
          frame.events.map((e, i) => (
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
          ))
        )}
      </div>

      <div className="replay-controls">
        <button className="ghost mini" onClick={() => go(0)} title="Restart" disabled={idx === 0}>⏮</button>
        <button className="ghost mini" onClick={() => go(idx - 1)} title="Step back" disabled={idx === 0}>◀</button>
        <button
          className="mini"
          onClick={() => (atEnd ? (setIdx(0), setPlaying(true)) : setPlaying((p) => !p))}
          title={playing ? 'Pause' : 'Play'}
          style={{ minWidth: '5.5rem' }}
        >
          {playing ? '⏸ Pause' : atEnd ? '↺ Replay' : '▶ Play'}
        </button>
        <button className="ghost mini" onClick={() => go(idx + 1)} title="Step forward" disabled={atEnd}>▶</button>
        <button className="ghost mini" onClick={() => go(last)} title="Skip to end" disabled={atEnd}>⏭</button>

        <input
          className="replay-scrub"
          type="range"
          min={0}
          max={last}
          value={Math.min(idx, last)}
          onChange={(e) => go(+e.target.value)}
        />

        <div className="replay-speed">
          {[0.5, 1, 2].map((s) => (
            <button
              key={s}
              className={`mini ${speed === s ? '' : 'ghost'}`}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
