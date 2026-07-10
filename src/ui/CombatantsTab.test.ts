import { describe, expect, it } from 'vitest';
import { SAMPLE_MONSTERS } from '../data/srd';
import { cloneStoredCombatant, validateCombatant } from './CombatantsTab';

describe('stored combatant templates', () => {
  it('clones a stored monster with a fresh id and ready-to-run actions and rules', () => {
    const template = SAMPLE_MONSTERS[0];
    const clone = cloneStoredCombatant(template, [template]);

    expect(clone.id).not.toBe(template.id);
    expect(clone.name).toBe(`${template.name} 2`);
    expect(clone.actionIds).toEqual(template.actionIds);
    expect(clone.script).toEqual(template.script);
    expect(clone.actionIds.length).toBeGreaterThan(0);
    expect(clone.script.length).toBeGreaterThan(0);
  });

  it('clones nested arrays and objects so later edits do not mutate the stored template', () => {
    const template = SAMPLE_MONSTERS[0];
    const clone = cloneStoredCombatant(template, []);

    clone.actionIds.push('act-extra');
    clone.script[0].target.strategy = 'lowestHpEnemy';

    expect(template.actionIds).not.toContain('act-extra');
    expect(template.script[0].target.strategy).toBe('nearestEnemy');
  });

  it('stored monsters pass the combatant readiness checks', () => {
    const scenario = {
      actions: [{ id: SAMPLE_MONSTERS[0].actionIds[0] }],
    } as Parameters<typeof validateCombatant>[1];

    expect(validateCombatant(cloneStoredCombatant(SAMPLE_MONSTERS[0], []), scenario)).toEqual([]);
  });
});
