import { describe, expect, it } from 'vitest';
import {
  defaultScenario,
  DEFAULT_CONDITION_LIBRARY,
  DEFAULT_RULE_LIBRARY,
  LEVEL_1_CLASS_PCS,
  LEVEL_3_CLASS_PCS,
  SAMPLE_MONSTERS,
  SRD_ACTIONS,
} from '../srd';
import { CONDITION_KINDS } from '../../engine/conditions';
import { runSimulation } from '../../engine/simulator';
import { SRD_WEAPONS } from '../weapons';

const allCombatants = () => [
  ...defaultScenario().combatants,
  ...LEVEL_1_CLASS_PCS,
  ...LEVEL_3_CLASS_PCS,
  ...SAMPLE_MONSTERS,
];

describe('SRD graph validity', () => {
  it('every combatant action id and script rule points to an available action', () => {
    const actionIds = new Set(SRD_ACTIONS.map((action) => action.id));

    for (const combatant of allCombatants()) {
      const combatantActionIds = new Set(combatant.actionIds);

      for (const actionId of combatant.actionIds) {
        expect(actionIds.has(actionId)).toBe(true);
      }

      for (const rule of combatant.script) {
        expect(actionIds.has(rule.actionId)).toBe(true);
        expect(combatantActionIds.has(rule.actionId)).toBe(true);
      }
    }
  });

  it('every weapon attack action references an available weapon', () => {
    const weaponIds = new Set(SRD_WEAPONS.map((weapon) => weapon.id));

    for (const action of SRD_ACTIONS) {
      if (action.kind === 'attack' && action.weaponId) {
        expect(weaponIds.has(action.weaponId)).toBe(true);
      }
    }
  });

  it('all action ids are unique', () => {
    const ids = SRD_ACTIONS.map((action) => action.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all weapon ids are unique', () => {
    const ids = SRD_WEAPONS.map((weapon) => weapon.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every rule template has a unique id and name and references an available action', () => {
    const actionIds = new Set(SRD_ACTIONS.map((action) => action.id));
    const ids = new Set<string>();
    const names = new Set<string>();

    for (const template of DEFAULT_RULE_LIBRARY) {
      expect(ids.has(template.id)).toBe(false);
      expect(names.has(template.name)).toBe(false);
      expect(actionIds.has(template.actionId)).toBe(true);

      ids.add(template.id);
      names.add(template.name);
    }
  });

  it('every condition preset has a unique id and name and uses an available condition kind', () => {
    const kinds = new Set(CONDITION_KINDS);
    const ids = new Set<string>();
    const names = new Set<string>();

    for (const preset of DEFAULT_CONDITION_LIBRARY) {
      expect(ids.has(preset.id)).toBe(false);
      expect(names.has(preset.name)).toBe(false);
      expect(kinds.has(preset.kind)).toBe(true);

      ids.add(preset.id);
      names.add(preset.name);
    }
  });

  it('defaultScenario can be simulated without throwing', () => {
    expect(() => runSimulation(defaultScenario(), 2025)).not.toThrow();
  });
});
