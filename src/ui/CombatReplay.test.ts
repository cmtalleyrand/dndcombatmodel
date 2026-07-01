import { describe, expect, it } from 'vitest';
import type { TurnFrame } from '../engine/log';
import { collectReplayBeams, collectReplayEventEffects } from './CombatReplay';

const baseFrame: TurnFrame = {
  index: 3,
  round: 1,
  actorId: 'hero',
  snapshot: [
    { id: 'hero', hp: 12, maxHp: 12, position: 15, alive: true },
    { id: 'goblin', hp: 2, maxHp: 7, position: 15, alive: true },
    { id: 'cleric', hp: 8, maxHp: 10, position: 0, alive: true },
  ],
  events: [],
};

describe('combat replay effects', () => {
  it('accumulates damage, healing, and death markers per target', () => {
    const frame: TurnFrame = {
      ...baseFrame,
      events: [
        { round: 1, actorId: 'hero', actorName: 'Hero', type: 'attack', targetId: 'goblin', targetName: 'Goblin', damage: 3, message: 'Hero hits Goblin.' },
        { round: 1, actorId: 'hero', actorName: 'Hero', type: 'attack', targetId: 'goblin', targetName: 'Goblin', damage: 2, message: 'Hero hits Goblin again.' },
        { round: 1, actorId: 'hero', actorName: 'Hero', type: 'death', targetId: 'goblin', targetName: 'Goblin', message: 'Goblin dies.' },
        { round: 1, actorId: 'cleric', actorName: 'Cleric', type: 'heal', targetId: 'hero', targetName: 'Hero', healing: 4, message: 'Cleric heals Hero.' },
      ],
    };

    expect(collectReplayEventEffects(frame)).toEqual({
      goblin: { dmg: 5, heal: 0, died: true },
      hero: { dmg: 0, heal: 4, died: false },
    });
  });

  it('derives visual beams only for movement and actor-to-target combat events', () => {
    const frame: TurnFrame = {
      ...baseFrame,
      events: [
        { round: 1, actorId: 'hero', actorName: 'Hero', type: 'move', message: 'Hero moves.' },
        { round: 1, actorId: 'hero', actorName: 'Hero', type: 'attack', targetId: 'goblin', targetName: 'Goblin', damage: 5, message: 'Hero hits Goblin.' },
        { round: 1, actorId: 'cleric', actorName: 'Cleric', type: 'heal', targetId: 'hero', targetName: 'Hero', healing: 2, message: 'Cleric heals Hero.' },
        { round: 1, actorId: 'goblin', actorName: 'Goblin', type: 'skip', message: 'Goblin waits.' },
      ],
    };

    expect(collectReplayBeams(frame)).toEqual([
      { key: '3-0-move', type: 'move', fromId: 'hero', toId: 'hero', label: 'move' },
      { key: '3-1-attack', type: 'attack', fromId: 'hero', toId: 'goblin', label: '-5' },
      { key: '3-2-heal', type: 'heal', fromId: 'cleric', toId: 'hero', label: '+2' },
    ]);
  });
});
