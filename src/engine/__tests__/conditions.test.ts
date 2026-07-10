import { describe, expect, it } from 'vitest';
import { CONDITION_CATALOG, CONDITION_KINDS, effectiveSpeed, isIncapacitated } from '../conditions';
import type { ConditionKind } from '../types';

const SRD_CONDITIONS: ConditionKind[] = [
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
];

describe('condition catalog', () => {
  it('includes all SRD condition names', () => {
    expect(CONDITION_KINDS).toEqual(expect.arrayContaining(SRD_CONDITIONS));
  });

  it('models invisible attack advantage and defense disadvantage', () => {
    expect(CONDITION_CATALOG.invisible.attackByAdvantage).toBe('advantage');
    expect(CONDITION_CATALOG.invisible.attackAgainstAdvantage).toBe('disadvantage');
  });

  it('models incapacitating SRD conditions as unable to act without making every condition incapacitating', () => {
    for (const kind of ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'] as ConditionKind[]) {
      expect(isIncapacitated([{ kind, duration: { type: 'rounds', rounds: 1 } }])).toBe(true);
    }
    for (const kind of ['charmed', 'deafened', 'frightened', 'grappled', 'invisible', 'poisoned', 'prone', 'restrained'] as ConditionKind[]) {
      expect(isIncapacitated([{ kind, duration: { type: 'rounds', rounds: 1 } }])).toBe(false);
    }
  });

  it('models speed-zero conditions separately from duration', () => {
    expect(effectiveSpeed(30, [{ kind: 'grappled', duration: { type: 'permanent' }, sourceId: 'ogre' }])).toBe(0);
    expect(effectiveSpeed(30, [{ kind: 'grappled', duration: { type: 'rounds', rounds: 1 }, sourceId: 'ogre' }])).toBe(0);
    expect(effectiveSpeed(30, [{ kind: 'poisoned', duration: { type: 'rounds', rounds: 1 } }])).toBe(30);
  });
});
