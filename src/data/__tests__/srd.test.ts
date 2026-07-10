import { describe, expect, it } from 'vitest';
import { defaultScenario, SAMPLE_PCS, SRD_ACTIONS } from '../srd';
import { SRD_WEAPONS } from '../weapons';
import { runMany } from '../../engine/statistics';

describe('default scenario', () => {
  it('every combatant references only actions that exist', () => {
    const s = defaultScenario();
    const ids = new Set(s.actions.map((a) => a.id));
    for (const c of s.combatants) {
      for (const aid of c.actionIds) expect(ids.has(aid)).toBe(true);
      for (const r of c.script) expect(ids.has(r.actionId)).toBe(true);
    }
  });

  it('runs many simulations and produces sensible aggregate stats', () => {
    const s = defaultScenario();
    const { stats } = runMany(s, 300, 2025);
    expect(stats.simulations).toBe(300);
    expect(stats.pcWinRate + stats.monsterWinRate + stats.drawRate).toBeCloseTo(1, 5);
    expect(stats.avgRounds).toBeGreaterThan(0);
    expect(stats.avgRounds).toBeLessThan(s.maxRounds);
    expect(stats.pcWinRate).toBeGreaterThan(0.5);
    const cleric = stats.combatants.find((c) => c.id === 'pc-cleric')!;
    expect(cleric.avgHealingDone).toBeGreaterThan(0);
  });

  it('weapon library exposes mastery traits and reusable weapon attack actions', () => {
    expect(SRD_WEAPONS.length).toBeGreaterThanOrEqual(39);
    expect(SRD_ACTIONS.filter((a) => a.kind === 'attack' && a.weaponId).length).toBeGreaterThanOrEqual(40);

    const weaponIds = new Set(SRD_WEAPONS.map((w) => w.id));
    const attackWeaponIds = new Set(SRD_ACTIONS.filter((a) => a.kind === 'attack').map((a) => a.weaponId));
    for (const weapon of SRD_WEAPONS) {
      expect(weapon.mastery).toBeTruthy();
      if (!['wpn-bite', 'wpn-claw'].includes(weapon.id)) {
        expect(attackWeaponIds.has(weapon.id)).toBe(true);
      }
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
    expect(SAMPLE_PCS.length).toBe(4);
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
});
