import { describe, expect, it } from 'vitest';
import { defaultScenario, LEVEL_3_CLASS_PCS, SAMPLE_MONSTERS } from '../data/srd';
import { cloneStoredCombatant, addCombatantWithDefaultActions, validateCombatant } from './CombatantsTab';

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

  it('adds missing default actions, weapons, and features when a preset combatant is inserted', () => {
    const template = SAMPLE_MONSTERS[0];
    const scenario = { ...defaultScenario(), combatants: [], actions: [], weapons: [] };

    const next = addCombatantWithDefaultActions(scenario, cloneStoredCombatant(template, []));

    expect(next.actions.map((action) => action.id)).toEqual(template.actionIds);
    expect(next.weapons.map((weapon) => weapon.id)).toContain('wpn-scimitar');
    for (const featureId of template.featureIds ?? []) {
      expect(next.features?.some((feature) => feature.id === featureId)).toBe(true);
    }
    expect(validateCombatant(next.combatants[0], next)).toEqual([]);
  });

  it('can clone a PC preset onto the monster side', () => {
    const template = LEVEL_3_CLASS_PCS[0];
    const clone = cloneStoredCombatant(template, [], 'monster');

    expect(clone.side).toBe('monster');
    expect(clone.id).toMatch(/^monster-/);
    expect(clone.actionIds).toEqual(template.actionIds);
    expect(clone.script[0].target.strategy).toBe('nearestEnemy');
  });

  it('level 3 PC presets use subclass-first names with level suffixes', () => {
    expect(LEVEL_3_CLASS_PCS.map((pc) => pc.name)).toContain('Battlemaster Fighter (Sword and Board) Lvl 3');
    for (const pc of LEVEL_3_CLASS_PCS) {
      expect(pc.name).toMatch(/ Lvl 3$/);
      expect(pc.name.startsWith('Level 3 ')).toBe(false);
    }
  });

  it('stored monsters pass the combatant readiness checks', () => {
    const scenario = {
      actions: [{ id: SAMPLE_MONSTERS[0].actionIds[0] }],
    } as Parameters<typeof validateCombatant>[1];

    expect(validateCombatant(cloneStoredCombatant(SAMPLE_MONSTERS[0], []), scenario)).toEqual([]);
  });
});
