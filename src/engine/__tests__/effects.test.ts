import { describe, expect, it } from 'vitest';
import { performAction, dropConcentration, tickEffectsStartOfTurn, tickEffectSaveEnds } from '../actions';
import { effectiveAc, effectiveBaseSpeed, saveAdvantage, isAlive } from '../state';
import { runSimulation } from '../simulator';
import { RNG } from '../dice';
import { fixtureState, fixtureScenario, fixtureCombatant, fixtureAction } from '../../test/fixtures';
import type { Action } from '../types';

/** A "Haste" cast on self: +2 AC, doubled speed, Dex-save advantage, concentration, end-of-spell lethargy. */
const haste: Action = fixtureAction({
  id: 'haste',
  name: 'Haste',
  kind: 'spell',
  targets: 1,
  concentration: true,
  damage: undefined,
  damageType: undefined,
  effects: [
    {
      label: 'Haste',
      target: 'self',
      modifier: { ac: 2, speedOverride: 60, saveAdvantage: ['dex'], toHit: 0 },
      duration: { type: 'concentration', sourceId: '' },
      onExpire: { applyConditions: [{ kind: 'incapacitated', duration: { type: 'rounds', rounds: 1 } }] },
    },
  ],
});

describe('timed effects', () => {
  it('applies AC, speed, and save-advantage buffs live while active', () => {
    const state = fixtureState([fixtureCombatant('wizard', 'pc', { ac: 13, speed: 30, actionIds: ['haste'] })], [haste]);
    const wizard = state.combatants[0];

    expect(effectiveAc(wizard)).toBe(13);
    expect(effectiveBaseSpeed(wizard)).toBe(30);
    expect(saveAdvantage(wizard, 'dex')).toBe('normal');

    performAction(state, new RNG(1), wizard, haste, [wizard], []);

    expect(effectiveAc(wizard)).toBe(15); // +2
    expect(effectiveBaseSpeed(wizard)).toBe(60); // override
    expect(saveAdvantage(wizard, 'dex')).toBe('advantage');
    expect(wizard.concentratingOn).toBe('haste');
  });

  it("fires the effect's on-expire rider (lethargy) when concentration drops", () => {
    const state = fixtureState([fixtureCombatant('wizard', 'pc', { ac: 13, actionIds: ['haste'] })], [haste]);
    const wizard = state.combatants[0];
    performAction(state, new RNG(1), wizard, haste, [wizard], []);

    dropConcentration(state, wizard, []);

    expect(wizard.effects).toHaveLength(0);
    expect(effectiveAc(wizard)).toBe(13); // buff gone
    expect(wizard.conditions.some((c) => c.kind === 'incapacitated')).toBe(true); // lethargy applied
  });

  it('expires a rounds-limited effect and fires its rider after the set number of turns', () => {
    const buff: Action = fixtureAction({
      id: 'bless-buff', name: 'Bless', kind: 'spell', damage: undefined, damageType: undefined,
      effects: [{ label: 'Bless', target: 'self', modifier: { toHit: 1 }, duration: { type: 'rounds', rounds: 2 } }],
    });
    const state = fixtureState([fixtureCombatant('cleric', 'pc', { actionIds: ['bless-buff'] })], [buff]);
    const cleric = state.combatants[0];
    performAction(state, new RNG(1), cleric, buff, [cleric], []);
    expect(cleric.effects).toHaveLength(1);

    tickEffectsStartOfTurn(state, new RNG(1), cleric, []); // round 1: 2 -> 1
    expect(cleric.effects).toHaveLength(1);
    tickEffectsStartOfTurn(state, new RNG(1), cleric, []); // round 2: 1 -> 0, expires
    expect(cleric.effects).toHaveLength(0);
  });

  it('deals damage-over-time at the start of each turn', () => {
    const dotSpell: Action = fixtureAction({
      id: 'ignite', name: 'Ignite', kind: 'spell', targets: 1, damage: undefined, damageType: undefined,
      effects: [{ label: 'Burning', target: 'target', modifier: { dot: { dice: '2d6', type: 'fire' } }, duration: { type: 'rounds', rounds: 3 } }],
    });
    const state = fixtureState(
      [fixtureCombatant('mage', 'pc', { actionIds: ['ignite'] }), fixtureCombatant('ogre', 'monster', { maxHp: 50 })],
      [dotSpell],
    );
    const [mage, ogre] = state.combatants;
    performAction(state, new RNG(1), mage, dotSpell, [ogre], []);
    const before = ogre.hp;
    tickEffectsStartOfTurn(state, new RNG(1), ogre, []);
    expect(ogre.hp).toBeLessThan(before);
  });

  it('applies a save-ends debuff to enemies and lets them shake it off on a successful save', () => {
    const bane: Action = fixtureAction({
      id: 'bane', name: 'Bane', kind: 'spell', targets: 1, damage: undefined, damageType: undefined,
      effects: [{ label: 'Bane', target: 'allEnemies', modifier: { toHit: -3, saveDisadvantage: 'all' }, duration: { type: 'saveEnds', ability: 'cha', dc: 1 } }],
    });
    const state = fixtureState(
      [fixtureCombatant('caster', 'pc', { actionIds: ['bane'] }), fixtureCombatant('goblin', 'monster', { abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 30 } })],
      [bane],
    );
    const [caster, goblin] = state.combatants;
    performAction(state, new RNG(1), caster, bane, [goblin], []);
    expect(goblin.effects).toHaveLength(1);

    // DC 1 with a huge Cha: the goblin always saves and the debuff ends.
    tickEffectSaveEnds(state, goblin, new RNG(1), []);
    expect(goblin.effects).toHaveLength(0);
    expect(isAlive(goblin)).toBe(true);
  });

  it('drives the effect lifecycle through a full simulation (start-of-turn DoT actually lands)', () => {
    const cloud: Action = fixtureAction({
      id: 'cloud', name: 'Poison Cloud', kind: 'spell', targets: 1, damage: undefined, damageType: undefined,
      effects: [{ label: 'Poison', target: 'allEnemies', modifier: { dot: { dice: '1d4', type: 'poison' } }, duration: { type: 'rounds', rounds: 5 } }],
    });
    const wait: Action = fixtureAction({ id: 'wait', name: 'Wait', kind: 'dodge', targets: 0, damage: undefined, damageType: undefined });
    const caster = fixtureCombatant('caster', 'monster', {
      maxHp: 50, actionIds: ['cloud'],
      script: [{ priority: 1, condition: { type: 'always' }, actionId: 'cloud', target: { strategy: 'nearestEnemy' } }],
    });
    const victim = fixtureCombatant('victim', 'pc', {
      maxHp: 60, ac: 10, actionIds: ['wait'],
      script: [{ priority: 1, condition: { type: 'always' }, actionId: 'wait', target: { strategy: 'self' } }],
    });
    const scenario = fixtureScenario({ combatants: [caster, victim], actions: [cloud, wait], fixedOrder: ['caster', 'victim'], maxRounds: 4 });

    const result = runSimulation(scenario, 7);
    const victimOutcome = result.outcomes.find((o) => o.id === 'victim')!;
    // The victim never gets attacked — all damage taken is the poison DoT ticking each turn.
    expect(victimOutcome.damageTaken).toBeGreaterThan(0);
    expect(result.events.some((e) => /Poison: \d+ poison damage/.test(e.message))).toBe(true);
  });
});
