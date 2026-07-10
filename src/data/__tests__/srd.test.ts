import { describe, it, expect } from 'vitest';
import { defaultScenario, SRD_ACTIONS, SAMPLE_PCS } from '../srd';
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
    // probabilities sum to 1
    expect(stats.pcWinRate + stats.monsterWinRate + stats.drawRate).toBeCloseTo(1, 5);
    // combat resolves within the round cap on average
    expect(stats.avgRounds).toBeGreaterThan(0);
    expect(stats.avgRounds).toBeLessThan(s.maxRounds);
    // the party should win the majority of the time against this encounter
    expect(stats.pcWinRate).toBeGreaterThan(0.5);
    // cleric should be doing some healing
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
});
