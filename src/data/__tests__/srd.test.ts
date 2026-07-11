import { describe, expect, it } from 'vitest';
import {
  defaultScenario,
  DEFAULT_CONDITION_LIBRARY,
  DEFAULT_RULE_LIBRARY,
  LEVEL_1_CLASS_PCS,
  LEVEL_3_CLASS_PCS,
  SAMPLE_MONSTERS,
  SRD_ACTIONS,
  SRD_FEATURES,
} from '../srd';
import { CONDITION_KINDS } from '../../engine/conditions';
import { runSimulation } from '../../engine/simulator';
import { SRD_WEAPONS } from '../weapons';
import { runMany } from '../../engine/statistics';

describe('default scenario', () => {
  it('every combatant references only actions that exist', () => {
    const s = defaultScenario();
    const ids = new Set(s.actions.map((a) => a.id));
    for (const c of s.combatants) {
      expect(c.script.length).toBeGreaterThan(0);
      const combatantActionIds = new Set(c.actionIds);
      for (const aid of c.actionIds) expect(ids.has(aid)).toBe(true);
      for (const r of c.script) {
        expect(ids.has(r.actionId)).toBe(true);
        expect(combatantActionIds.has(r.actionId)).toBe(true);
      }
    }
  });

  it('runs a deterministic smoke simulation with aggregate stats for each combatant', () => {
    const s = defaultScenario();
    const { stats } = runMany(s, 1, 2025);

    expect(stats.simulations).toBe(1);
    expect(['pc', 'monster', 'draw']).toContain(stats.sampleRun.winner);
    expect(stats.pcWinRate + stats.monsterWinRate + stats.drawRate).toBeCloseTo(1, 5);

    const statIds = new Set(stats.combatants.map((combatant) => combatant.id));
    expect(statIds).toEqual(new Set(s.combatants.map((combatant) => combatant.id)));
  });


  it('uses feature-backed SRD rider examples and 2024 Inflict Wounds', () => {
    const scenario = defaultScenario();
    const actionsById = new Map(SRD_ACTIONS.map((action) => [action.id, action]));
    const featuresById = new Map(SRD_FEATURES.map((feature) => [feature.id, feature]));

    expect(actionsById.get('act-rogue-shortbow')?.riders).toBeUndefined();
    expect(actionsById.get('act-greataxe-rage')?.riders).toBeUndefined();
    expect(actionsById.get('act-longbow-hunters-mark')?.riders).toBeUndefined();

    expect(featuresById.get('feat-sneak-attack')).toMatchObject({
      timing: 'onHit',
      condition: { trigger: 'advantageOrAllyAdjacent' },
      actionIds: ['act-rogue-shortbow'],
      oncePerTurn: true,
    });
    expect(featuresById.get('feat-rage-damage')).toMatchObject({
      timing: 'onHit',
      condition: { trigger: 'selfHasCondition', condition: 'raging', meleeOnly: true },
      actionIds: ['act-greataxe-rage'],
    });
    expect(featuresById.get('feat-hunters-mark')).toMatchObject({
      timing: 'onHit',
      condition: { trigger: 'targetHasCondition', condition: 'marked' },
      actionIds: ['act-longbow-hunters-mark'],
    });

    expect(scenario.combatants.find((combatant) => combatant.id === 'pc-rogue')?.featureIds).toContain('feat-sneak-attack');
    expect(scenario.combatants.find((combatant) => combatant.id === 'pc-barbarian')?.featureIds).toContain('feat-rage-damage');
    expect(scenario.combatants.find((combatant) => combatant.id === 'pc-ranger')?.featureIds).toContain('feat-hunters-mark');

    expect(actionsById.get('act-inflict-wounds')).toMatchObject({
      damage: '2d10',
      save: { ability: 'con', onSuccess: 'none' },
    });
    expect(actionsById.get('act-inflict-wounds')?.spellAttack).toBeUndefined();
  });

  it('weapon library exposes mastery traits and reusable weapon attack actions', () => {
    expect(SRD_WEAPONS.length).toBeGreaterThanOrEqual(39);
    expect(SRD_ACTIONS.filter((a) => a.kind === 'attack' && a.weaponId).length).toBeGreaterThanOrEqual(40);

    const weaponIds = new Set(SRD_WEAPONS.map((w) => w.id));
    const attackWeaponIds = new Set(SRD_ACTIONS.filter((a) => a.kind === 'attack').map((a) => a.weaponId));
    // Every weapon except the Net (which has no 2024 mastery) carries a mastery trait.
    for (const weapon of SRD_WEAPONS) {
      if (weapon.id !== 'wpn-net') expect(weapon.mastery).toBeTruthy();
      expect(attackWeaponIds.has(weapon.id)).toBe(true);
    }
    for (const action of SRD_ACTIONS.filter((a) => a.kind === 'attack' && a.weaponId)) {
      expect(weaponIds.has(action.weaponId!)).toBe(true);
    }
  });
});

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

  it('feature library exposes magic item and enhancement features', () => {
    const itemFeatures = SRD_FEATURES.filter((feature) => feature.category === 'itemEffect');
    const ids = new Set(SRD_FEATURES.map((feature) => feature.id));

    expect(itemFeatures.length).toBeGreaterThanOrEqual(26);
    for (const id of ['feat-magic-weapon-1', 'feat-magic-weapon-2', 'feat-magic-weapon-3', 'feat-magic-armor-1', 'feat-magic-armor-2', 'feat-magic-armor-3']) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('all features are unique', () => {
    const ids = SRD_FEATURES.map((feature) => feature.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preset PC and monster can be simulated on either side', () => {
    for (const template of [...LEVEL_1_CLASS_PCS, ...LEVEL_3_CLASS_PCS, ...SAMPLE_MONSTERS]) {
      const pc = { ...template, id: `${template.id}-pc-test`, side: 'pc' as const };
      const monster = { ...template, id: `${template.id}-monster-test`, side: 'monster' as const };
      expect(() => runSimulation({ ...defaultScenario(), combatants: [pc, monster] }, 2025)).not.toThrow();
    }
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
