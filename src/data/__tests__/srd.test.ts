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
  it('every combatant has a non-empty script', () => {
    const s = defaultScenario();
    for (const c of s.combatants) expect(c.script.length).toBeGreaterThan(0);
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


  it('uses feature-backed SRD rider examples, basic actions, and 2024 Inflict Wounds', () => {
    const scenario = defaultScenario();
    const actionsById = new Map(SRD_ACTIONS.map((action) => [action.id, action]));
    const featuresById = new Map(SRD_FEATURES.map((feature) => [feature.id, feature]));

    expect(actionsById.has('act-rogue-shortbow')).toBe(false);
    expect(actionsById.has('act-greataxe-rage')).toBe(false);
    expect(actionsById.has('act-longbow-hunters-mark')).toBe(false);

    for (const [id, kind] of [
      ['act-dash', 'dash'],
      ['act-disengage', 'disengage'],
      ['act-help', 'help'],
      ['act-hide', 'hide'],
      ['act-ready', 'ready'],
      ['act-search', 'search'],
    ] as const) {
      expect(actionsById.get(id)).toMatchObject({ kind });
    }

    expect(featuresById.get('feat-sneak-attack')).toMatchObject({
      timing: 'onHit',
      condition: { trigger: 'advantageOrAllyAdjacent' },
      actionIds: ['act-shortbow'],
      oncePerTurn: true,
    });
    expect(featuresById.get('feat-rage-damage')).toMatchObject({
      timing: 'onHit',
      condition: { trigger: 'selfHasCondition', condition: 'raging', meleeOnly: true },
      actionIds: ['act-greataxe'],
    });
    expect(featuresById.get('feat-hunters-mark')).toMatchObject({
      timing: 'onHit',
      condition: { trigger: 'targetHasCondition', condition: 'marked' },
      actionIds: ['act-longbow'],
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

    const attackWeaponIds = new Set(SRD_ACTIONS.filter((a) => a.kind === 'attack').map((a) => a.weaponId));
    // Every weapon except the Net (which has no 2024 mastery) carries a mastery trait.
    for (const weapon of SRD_WEAPONS) {
      if (weapon.id !== 'wpn-net') expect(weapon.mastery).toBeTruthy();
      expect(attackWeaponIds.has(weapon.id)).toBe(true);
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

  it.each([
    ['action', SRD_ACTIONS.map((action) => action.id)] as const,
    ['feature', SRD_FEATURES.map((feature) => feature.id)] as const,
    ['weapon', SRD_WEAPONS.map((weapon) => weapon.id)] as const,
  ])('all %s ids are unique', (_label, ids) => {
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

  it('every preset PC and monster can be simulated on either side', () => {
    for (const template of [...LEVEL_1_CLASS_PCS, ...LEVEL_3_CLASS_PCS, ...SAMPLE_MONSTERS]) {
      const pc = { ...template, id: `${template.id}-pc-test`, side: 'pc' as const };
      const monster = { ...template, id: `${template.id}-monster-test`, side: 'monster' as const };
      expect(() => runSimulation({ ...defaultScenario(), combatants: [pc, monster] }, 2025)).not.toThrow();
    }
  });

  it.each([
    ['rule template', DEFAULT_RULE_LIBRARY, (template: (typeof DEFAULT_RULE_LIBRARY)[number]) => new Set(SRD_ACTIONS.map((a) => a.id)).has(template.actionId)] as const,
    ['condition preset', DEFAULT_CONDITION_LIBRARY, (preset: (typeof DEFAULT_CONDITION_LIBRARY)[number]) => new Set(CONDITION_KINDS).has(preset.kind)] as const,
  ])('every %s has a unique id and name and references an available value', (_label, items, isValidReference) => {
    const ids = new Set<string>();
    const names = new Set<string>();

    for (const item of items) {
      expect(ids.has(item.id)).toBe(false);
      expect(names.has(item.name)).toBe(false);
      expect(isValidReference(item as never)).toBe(true);

      ids.add(item.id);
      names.add(item.name);
    }
  });

  it('defaultScenario can be simulated without throwing', () => {
    expect(() => runSimulation(defaultScenario(), 2025)).not.toThrow();
  });
});
