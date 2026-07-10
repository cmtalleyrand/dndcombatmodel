import { describe, expect, it } from 'vitest';
import {
  defaultScenario,
  DEFAULT_CONDITION_LIBRARY,
  DEFAULT_RULE_LIBRARY,
  LEVEL_1_CLASS_PCS,
  LEVEL_3_CLASS_PCS,
  SAMPLE_MONSTERS,
  SAMPLE_PCS,
  SRD_ACTIONS,
} from '../srd';
import { CONDITION_KINDS } from '../../engine/conditions';
import { SRD_WEAPONS } from '../weapons';
import { runMany } from '../../engine/statistics';
import { DEFAULT_ENCOUNTER_DISTANCE } from '../../engine/state';
import type { Combatant } from '../../engine/types';

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

  it('weapon library exposes mastery traits and reusable weapon attack actions', () => {
    expect(SRD_WEAPONS.length).toBeGreaterThanOrEqual(39);
    expect(SRD_ACTIONS.filter((a) => a.kind === 'attack' && a.weaponId).length).toBeGreaterThanOrEqual(40);

    const weaponIds = new Set(SRD_WEAPONS.map((w) => w.id));
    const attackWeaponIds = new Set(SRD_ACTIONS.filter((a) => a.kind === 'attack').map((a) => a.weaponId));
    for (const weapon of SRD_WEAPONS) {
      expect(weapon.mastery).toBeTruthy();
      expect(attackWeaponIds.has(weapon.id)).toBe(true);
    }
    for (const action of SRD_ACTIONS.filter((a) => a.kind === 'attack' && a.weaponId)) {
      expect(weaponIds.has(action.weaponId!)).toBe(true);
    }
  });

  it('action library has a broad spell and ability set', () => {
    const ids = new Set(SRD_ACTIONS.map((a) => a.id));
    for (const id of [
      'act-cure-wounds',
      'act-bless',
      'act-sleep',
      'act-magic-missile',
      'act-guiding-bolt',
      'act-healing-word',
      'act-hold-person',
      'act-lightning-bolt',
      'act-revivify',
    ]) {
      expect(ids.has(id)).toBe(true);
    }
    expect(SRD_ACTIONS.filter((a) => ['spell', 'ability'].includes(a.kind)).length).toBeGreaterThanOrEqual(25);
    expect(SAMPLE_PCS.length).toBe(6);
  });

  it('default scenario includes each added PC and monster with at least one valid rule', () => {
    const s = defaultScenario();
    const combatantsById = new Set(s.combatants.map((combatant) => combatant.id));

    for (const id of ['pc-ranger', 'pc-barbarian', 'm-skel1', 'm-wolf1', 'm-ogre1']) {
      expect(combatantsById.has(id)).toBe(true);
    }
    expect(s.combatants.every((combatant) => combatant.script.length > 0)).toBe(true);
  });

  it('places the default scenario and every combatant preset coherently on the linear battlefield', () => {
    const assertFinitePositions = (combatants: Combatant[]) => {
      for (const combatant of combatants) {
        expect(combatant.position).toEqual(expect.any(Number));
        expect(Number.isFinite(combatant.position)).toBe(true);
      }
    };

    const assertEncounterDistance = (combatants: Combatant[]) => {
      const pcs = combatants.filter((combatant) => combatant.side === 'pc');
      const monsters = combatants.filter((combatant) => combatant.side === 'monster');
      if (pcs.length === 0 || monsters.length === 0) return;

      const pcFront = Math.min(...pcs.map((combatant) => combatant.position!));
      const monsterFront = Math.max(...monsters.map((combatant) => combatant.position!));
      expect(pcFront - monsterFront).toBe(DEFAULT_ENCOUNTER_DISTANCE);
    };

    const defaultCombatants = defaultScenario().combatants;
    const presets = [...LEVEL_1_CLASS_PCS, ...LEVEL_3_CLASS_PCS, ...SAMPLE_MONSTERS];

    assertFinitePositions(defaultCombatants);
    assertFinitePositions(presets);
    assertEncounterDistance(defaultCombatants);
    assertEncounterDistance(presets);
  });



  it('prestocks every class at level 1, at least sixteen level-3 PCs, and at least 32 monsters', () => {
    const allActions = new Set(SRD_ACTIONS.map((action) => action.id));
    const expectedClasses = new Set([
      'Barbarian',
      'Bard',
      'Cleric',
      'Druid',
      'Fighter',
      'Monk',
      'Paladin',
      'Ranger',
      'Rogue',
      'Sorcerer',
      'Warlock',
      'Wizard',
    ]);
    const level1Classes = new Set(LEVEL_1_CLASS_PCS.map((pc) => pc.name.replace('Level 1 ', '')));

    expect(level1Classes).toEqual(expectedClasses);
    expect(LEVEL_3_CLASS_PCS.length).toBeGreaterThanOrEqual(16);
    expect(SAMPLE_MONSTERS.length).toBeGreaterThanOrEqual(32);

    for (const combatant of [...LEVEL_1_CLASS_PCS, ...LEVEL_3_CLASS_PCS, ...SAMPLE_MONSTERS]) {
      expect(combatant.script.length).toBeGreaterThan(0);
      const combatantActions = new Set(combatant.actionIds);
      for (const actionId of combatant.actionIds) expect(allActions.has(actionId)).toBe(true);
      for (const rule of combatant.script) {
        expect(combatantActions.has(rule.actionId)).toBe(true);
        expect(allActions.has(rule.actionId)).toBe(true);
      }
    }
  });

  it('keeps action ids unique as the reusable library grows', () => {
    const ids = SRD_ACTIONS.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes enriched spell options spanning attacks, saves, concentration, and areas', () => {
    const actionsById = new Map(SRD_ACTIONS.map((action) => [action.id, action]));

    expect(actionsById.get('act-scorching-ray')).toMatchObject({
      spellAttack: true,
      damage: '6d6',
      spellLevel: 2,
    });
    expect(actionsById.get('act-call-lightning')).toMatchObject({
      concentration: true,
      aoeRadius: 5,
      save: { ability: 'dex', onSuccess: 'half' },
    });
    expect(actionsById.get('act-ice-storm')).toMatchObject({
      aoeRadius: 20,
      damage: '2d8+4d6',
      spellLevel: 4,
    });
  });

  it('is prestocked with a rules library and a conditions library', () => {
    const s = defaultScenario();
    expect(s.ruleLibrary.length).toBeGreaterThan(0);
    expect(s.conditionLibrary.length).toBeGreaterThan(0);
    expect(s.ruleLibrary).toBe(DEFAULT_RULE_LIBRARY);
    expect(s.conditionLibrary).toBe(DEFAULT_CONDITION_LIBRARY);
  });

  it('every rule template references a real action and has a unique id/name', () => {
    const actionIds = new Set(SRD_ACTIONS.map((a) => a.id));
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const t of DEFAULT_RULE_LIBRARY) {
      expect(actionIds.has(t.actionId)).toBe(true);
      expect(ids.has(t.id)).toBe(false);
      expect(names.has(t.name)).toBe(false);
      ids.add(t.id);
      names.add(t.name);
    }
  });

  it('every condition preset uses a real condition kind and has a unique id/name', () => {
    const kinds = new Set(CONDITION_KINDS);
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const p of DEFAULT_CONDITION_LIBRARY) {
      expect(kinds.has(p.kind)).toBe(true);
      expect(ids.has(p.id)).toBe(false);
      expect(names.has(p.name)).toBe(false);
      ids.add(p.id);
      names.add(p.name);
    }
  });
});
