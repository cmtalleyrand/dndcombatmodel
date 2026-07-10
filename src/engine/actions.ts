// Resolve a chosen action against chosen targets, mutating combat state and emitting log events.

import { CONDITION_CATALOG, resistsPhysical } from './conditions';
import { rollD20, rollDice, type RNG, type Advantage, combineAdvantage } from './dice';
import {
  resolveAttackProfile,
  spellAttackBonus,
  spellSaveDC,
  healFlat,
} from './derive';
import type { LogEvent } from './log';
import { approach, effectiveRange, reposition } from './movement';
import {
  abilityMod,
  attackAdvantage,
  distance,
  isAlive,
  saveBonus,
  targetAdvantage,
  type CombatantState,
  type CombatState,
} from './state';
import type { Action, ConditionApplication, DamageType } from './types';

const BLESS_BONUS = '1d4';

const PHYSICAL: DamageType[] = ['bludgeoning', 'piercing', 'slashing'];

/** Apply damage to a target, handling resistance, concentration checks and death. */
function applyDamage(
  state: CombatState,
  rng: RNG,
  source: CombatantState,
  target: CombatantState,
  amount: number,
  events: LogEvent[],
  damageType?: DamageType,
): void {
  if (amount <= 0) return;
  // Physical resistance (e.g. Rage) halves bludgeoning/piercing/slashing damage.
  if (damageType && PHYSICAL.includes(damageType) && resistsPhysical(target.conditions)) {
    amount = Math.floor(amount / 2);
    if (amount <= 0) return;
  }
  // Petrified creatures have resistance to all damage.
  if (target.conditions.some((c) => CONDITION_CATALOG[c.kind].resistAll)) {
    amount = Math.floor(amount / 2);
    if (amount <= 0) return;
  }
  target.hp -= amount;
  target.damageTaken += amount;
  source.damageDealt += amount;

  // Taking damage wakes a sleeping creature.
  if (target.conditions.some((c) => c.kind === 'asleep')) {
    target.conditions = target.conditions.filter((c) => c.kind !== 'asleep');
    events.push({
      round: state.round,
      actorId: source.base.id,
      actorName: source.base.name,
      type: 'condition',
      targetId: target.base.id,
      targetName: target.base.name,
      message: `${target.base.name} wakes up from the damage.`,
    });
  }

  // Concentration check: CON save DC = max(10, floor(damage/2)).
  if (target.concentratingOn && isAlive(target)) {
    const dc = Math.max(10, Math.floor(amount / 2));
    const bonus = saveBonus(target.base, 'con');
    const roll = rollD20(rng, bonus, concentrationAdvantage(target));
    if (roll.total < dc) {
      dropConcentration(state, target, events);
    }
  }

  if (target.hp <= 0) {
    target.hp = 0;
    target.down = true;
    // dropping unconscious ends concentration
    if (target.concentratingOn) dropConcentration(state, target, events);
    events.push({
      round: state.round,
      actorId: source.base.id,
      actorName: source.base.name,
      type: 'death',
      targetId: target.base.id,
      targetName: target.base.name,
      message: `${target.base.name} drops to 0 HP and is ${
        target.base.side === 'monster' ? 'slain' : 'down'
      }.`,
    });
  }
}

function concentrationAdvantage(_target: CombatantState): Advantage {
  return 'normal';
}

/** End a combatant's concentration, removing conditions it was sustaining. */
export function dropConcentration(
  state: CombatState,
  caster: CombatantState,
  events: LogEvent[],
): void {
  const actionId = caster.concentratingOn;
  if (!actionId) return;
  caster.concentratingOn = undefined;
  // remove any condition instances linked to this caster's concentration
  for (const target of state.combatants) {
    const before = target.conditions.length;
    target.conditions = target.conditions.filter(
      (c) => !(c.duration.type === 'concentration' && c.duration.sourceId === caster.base.id),
    );
    if (target.conditions.length !== before) {
      events.push({
        round: state.round,
        actorId: caster.base.id,
        actorName: caster.base.name,
        type: 'condition',
        targetId: target.base.id,
        targetName: target.base.name,
        message: `${caster.base.name} loses concentration; effect on ${target.base.name} ends.`,
      });
    }
  }
}

function applyConditionsTo(
  target: CombatantState,
  source: CombatantState,
  apps: ConditionApplication[],
  state: CombatState,
  events: LogEvent[],
): void {
  for (const app of apps) {
    const duration =
      app.duration.type === 'concentration'
        ? { ...app.duration, sourceId: source.base.id }
        : app.duration;
    target.conditions.push({ kind: app.kind, duration, sourceId: source.base.id });
    events.push({
      round: state.round,
      actorId: source.base.id,
      actorName: source.base.name,
      type: 'condition',
      targetId: target.base.id,
      targetName: target.base.name,
      message: `${target.base.name} is now ${CONDITION_CATALOG[app.kind].label}.`,
    });
  }
}

function critDouble(formula: string): string {
  // crude crit handling: double the dice count, keep modifier.
  // "2d6+3" -> "4d6+3"; flat numbers unchanged.
  const m = /^(\d*)d(\d+)([+-]\d+)?$/.exec(formula.replace(/\s+/g, '').toLowerCase());
  if (!m) return formula;
  const count = (m[1] === '' ? 1 : parseInt(m[1], 10)) * 2;
  return `${count}d${m[2]}${m[3] ?? ''}`;
}

/** Roll a damage profile: each die formula (doubled on crit) plus a flat bonus (never doubled). */
function rollDamageTotal(rng: RNG, dice: string[], flat: number, crit: boolean): number {
  let total = flat;
  for (const d of dice) {
    total += rollDice(rng, crit ? critDouble(d) : d).total;
  }
  return Math.max(0, total);
}

/** Begin concentrating on an action, dropping any prior concentration. */
function startConcentration(
  state: CombatState,
  caster: CombatantState,
  action: Action,
  events: LogEvent[],
): void {
  if (caster.concentratingOn && caster.concentratingOn !== action.id) {
    dropConcentration(state, caster, events);
  }
  caster.concentratingOn = action.id;
}

/**
 * Execute an action by `actor` against `targets`. Mutates state and pushes log events.
 * Returns true if the action consumed the turn (always true here).
 */
export function performAction(
  state: CombatState,
  rng: RNG,
  actor: CombatantState,
  action: Action,
  targets: CombatantState[],
  events: LogEvent[],
): void {
  // Spend resources up front.
  if (action.spellLevel && action.spellLevel > 0) {
    actor.spellSlots[action.spellLevel] = (actor.spellSlots[action.spellLevel] ?? 0) - 1;
  }
  if (action.uses !== undefined) {
    actor.usesRemaining[action.id] =
      (actor.usesRemaining[action.id] ?? action.uses) - 1;
  }
  if (action.concentration) {
    startConcentration(state, actor, action, events);
  }

  switch (action.kind) {
    case 'move': {
      reposition(state, actor, action.moveMode ?? 'advance', events);
      return;
    }
    case 'dodge': {
      // Dodge grants the dodging condition until the actor's next turn.
      actor.conditions.push({ kind: 'dodging', duration: { type: 'rounds', rounds: 1 } });
      events.push({
        round: state.round,
        actorId: actor.base.id,
        actorName: actor.base.name,
        type: 'dodge',
        actionId: action.id,
        message: `${actor.base.name} takes the Dodge action.`,
      });
      return;
    }

    case 'attack': {
      resolveAttack(state, rng, actor, action, targets, events);
      return;
    }

    case 'spell':
    case 'ability': {
      resolveSpellOrAbility(state, rng, actor, action, targets, events);
      return;
    }
  }
}

function blessAdvantageBonus(actor: CombatantState): { bless: boolean } {
  return { bless: actor.conditions.some((c) => c.kind === 'blessed') };
}

/** Whether an ally of `actor` (not the actor) is in melee (same block) of `target`. */
function allyAdjacentToTarget(state: CombatState, actor: CombatantState, target: CombatantState): boolean {
  return state.combatants.some(
    (c) => c.base.side === actor.base.side && c !== actor && isAlive(c) && distance(c, target) === 0,
  );
}

/**
 * Apply conditional damage riders on a hit (Sneak Attack, Rage, Hunter's Mark, etc.).
 * Returns the total bonus damage and logs each rider that fires.
 */
function applyRiders(
  state: CombatState,
  rng: RNG,
  actor: CombatantState,
  target: CombatantState,
  action: Action,
  adv: Advantage,
  gap: number,
  crit: boolean,
  events: LogEvent[],
): number {
  if (!action.riders?.length) return 0;
  let total = 0;
  for (let i = 0; i < action.riders.length; i++) {
    const r = action.riders[i];
    const key = `${action.id}#${i}`;
    if (r.meleeOnly && gap > 0) continue;
    if (r.oncePerTurn && actor.riderUsedThisTurn.has(key)) continue;

    let ok = false;
    switch (r.trigger) {
      case 'always':
        ok = true;
        break;
      case 'hasAdvantage':
        ok = adv === 'advantage';
        break;
      case 'advantageOrAllyAdjacent':
        ok = adv === 'advantage' || allyAdjacentToTarget(state, actor, target);
        break;
      case 'targetHasCondition':
        ok = !!r.condition && target.conditions.some((c) => c.kind === r.condition);
        break;
      case 'selfHasCondition':
        ok = !!r.condition && actor.conditions.some((c) => c.kind === r.condition);
        break;
    }
    if (!ok) continue;

    let bonus = r.bonusFlat ?? 0;
    if (r.bonusDice) bonus += rollDice(rng, crit ? critDouble(r.bonusDice) : r.bonusDice).total;
    if (bonus <= 0) continue;
    total += bonus;
    if (r.oncePerTurn) actor.riderUsedThisTurn.add(key);
    events.push({
      round: state.round,
      actorId: actor.base.id,
      actorName: actor.base.name,
      type: 'attack',
      actionId: action.id,
      targetId: target.base.id,
      targetName: target.base.name,
      message: `  ↳ ${r.label ?? 'rider'}: +${bonus} damage.`,
    });
  }
  return total;
}

function isMeleeAutoCrit(target: CombatantState, gap: number): boolean {
  return (
    gap <= 5 &&
    target.conditions.some(
      (c) => c.kind === 'unconscious' || c.kind === 'asleep' || c.kind === 'paralyzed',
    )
  );
}

function resolveAttack(
  state: CombatState,
  rng: RNG,
  actor: CombatantState,
  action: Action,
  targets: CombatantState[],
  events: LogEvent[],
): void {
  const attackCount = action.attackCount ?? 1;
  const weapon = action.weaponId ? state.weaponsById[action.weaponId] : undefined;
  const profile = resolveAttackProfile(actor.base, action, weapon);
  const { bless } = blessAdvantageBonus(actor);
  const range = effectiveRange(action, weapon);

  // Move into range of the primary target if needed (move + action economy).
  if (targets[0] && targets[0] !== actor) approach(state, actor, targets[0], range, events);

  for (const target of targets) {
    // Range check (after movement): out of range aborts; long range = disadvantage.
    const gap = distance(actor, target);
    let rangeAdv: Advantage = 'normal';
    if (gap > range) {
      if (weapon?.longRange && gap <= weapon.longRange) {
        rangeAdv = 'disadvantage';
      } else {
        events.push({
          round: state.round,
          actorId: actor.base.id,
          actorName: actor.base.name,
          type: 'attack',
          actionId: action.id,
          targetId: target.base.id,
          targetName: target.base.name,
          message: `${actor.base.name} can't reach ${target.base.name} with ${action.name} (${gap}ft away, range ${range}ft).`,
        });
        continue;
      }
    }

    for (let i = 0; i < attackCount; i++) {
      if (!isAlive(target)) break;
      const adv = combineAdvantage(
        combineAdvantage(attackAdvantage(actor), targetAdvantage(target, actor)),
        rangeAdv,
      );
      let toHit = profile.toHit;
      let blessNote = '';
      if (bless) {
        const b = rollDice(rng, BLESS_BONUS).total;
        toHit += b;
        blessNote = ` (+${b} bless)`;
      }
      const roll = rollD20(rng, toHit, adv);
      const hit = roll.isCrit || (!roll.isCritMiss && roll.total >= target.base.ac);

      if (!hit) {
        events.push({
          round: state.round,
          actorId: actor.base.id,
          actorName: actor.base.name,
          type: 'attack',
          actionId: action.id,
          targetId: target.base.id,
          targetName: target.base.name,
          message: `${actor.base.name} attacks ${target.base.name} with ${action.name}: rolls ${roll.total}${blessNote} vs AC ${target.base.ac} — miss.`,
        });
        continue;
      }

      let dmg = rollDamageTotal(
        rng,
        profile.damageDice,
        profile.damageFlat,
        isMeleeAutoCrit(target, gap) || roll.isCrit,
      );
      // Conditional feature riders (Sneak Attack, Rage, Hunter's Mark…).
      const riderBonus = applyRiders(state, rng, actor, target, action, adv, gap, roll.isCrit, events);
      dmg += riderBonus;
      applyDamage(state, rng, actor, target, dmg, events, profile.damageType);
      events.push({
        round: state.round,
        actorId: actor.base.id,
        actorName: actor.base.name,
        type: 'attack',
        actionId: action.id,
        targetId: target.base.id,
        targetName: target.base.name,
        damage: dmg,
        message: `${actor.base.name} hits ${target.base.name} with ${action.name}${
          roll.isCrit ? ' (CRIT)' : ''
        }: rolls ${roll.total}${blessNote} vs AC ${target.base.ac} — ${dmg} damage (${target.base.name} at ${target.hp} HP).`,
      });
      if (hit && action.applyConditions?.length) {
        applyConditionsTo(target, actor, action.applyConditions, state, events);
      }
    }
  }
}

function resolveSpellOrAbility(
  state: CombatState,
  rng: RNG,
  actor: CombatantState,
  action: Action,
  targets: CombatantState[],
  events: LogEvent[],
): void {
  const spellRange = effectiveRange(action, undefined);

  // Move toward the primary target for touch/short-range spells.
  if (targets[0] && targets[0] !== actor) approach(state, actor, targets[0], spellRange, events);

  // Area of effect: hit everyone on the primary target's side within the radius.
  if (action.aoeRadius && targets[0]) {
    const center = targets[0];
    targets = state.combatants.filter(
      (c) =>
        isAlive(c) &&
        c.base.side === center.base.side &&
        Math.abs(c.position - center.position) <= action.aoeRadius!,
    );
  }

  // Drop targets still out of range after moving (finite-range spells only).
  if (isFinite(spellRange)) {
    targets = targets.filter((t) => {
      if (t === actor || distance(actor, t) <= spellRange) return true;
      events.push({
        round: state.round,
        actorId: actor.base.id,
        actorName: actor.base.name,
        type: 'spell',
        actionId: action.id,
        targetId: t.base.id,
        targetName: t.base.name,
        message: `${actor.base.name} can't reach ${t.base.name} with ${action.name} (out of range).`,
      });
      return false;
    });
  }

  // Healing
  if (action.heal) {
    const flat = healFlat(actor.base, action);
    for (const target of targets) {
      const healAmt = rollDice(rng, action.heal).total + flat;
      const before = target.hp;
      // healing a downed PC brings them back up
      target.down = false;
      target.hp = Math.min(target.base.maxHp, target.hp + healAmt);
      const actual = target.hp - before;
      actor.healingDone += Math.max(0, actual);
      events.push({
        round: state.round,
        actorId: actor.base.id,
        actorName: actor.base.name,
        type: 'heal',
        actionId: action.id,
        targetId: target.base.id,
        targetName: target.base.name,
        healing: actual,
        message: `${actor.base.name} heals ${target.base.name} for ${actual} (now ${target.hp} HP).`,
      });
    }
    return;
  }

  const { bless } = blessAdvantageBonus(actor);
  // Spell damage parts derive from the action's formula + adjustments (no ability mod).
  const dmgProfile = resolveAttackProfile(actor.base, action, undefined);
  // Whether this spell uses an attack roll (explicit flag, or legacy: had an attackBonus).
  const usesSpellAttack = action.spellAttack === true || (action.attackBonus !== undefined && !action.save);

  for (const target of targets) {
    if (!isAlive(target)) continue;

    if (action.save) {
      // Saving-throw effect with a derived DC.
      const meta = CONDITION_CATALOG;
      const ability = action.save.ability;
      const dc = spellSaveDC(actor.base, action);
      const autoFail = target.conditions.some((c) =>
        meta[c.kind].autoFailSaves?.includes(ability),
      );
      let saveTotal = 0;
      let saved = false;
      if (autoFail) {
        saved = false;
      } else {
        let sb = saveBonus(target.base, ability);
        if (bless) sb += rollDice(rng, BLESS_BONUS).total;
        const adv = saveAdvantage(target, ability);
        const roll = rollD20(rng, sb, adv);
        saveTotal = roll.total;
        saved = roll.total >= dc;
      }

      let dmg = 0;
      if (action.damage) {
        dmg = rollDamageTotal(rng, dmgProfile.damageDice, dmgProfile.damageFlat, false);
        if (saved) dmg = action.save.onSuccess === 'half' ? Math.floor(dmg / 2) : 0;
        applyDamage(state, rng, actor, target, dmg, events, dmgProfile.damageType);
      }
      if (!saved && action.applyConditions?.length) {
        applyConditionsTo(target, actor, action.applyConditions, state, events);
      }
      events.push({
        round: state.round,
        actorId: actor.base.id,
        actorName: actor.base.name,
        type: action.kind === 'spell' ? 'spell' : 'ability',
        actionId: action.id,
        targetId: target.base.id,
        targetName: target.base.name,
        damage: dmg,
        message: `${actor.base.name} uses ${action.name} on ${target.base.name}: ${
          autoFail ? 'auto-fails' : `saves ${saveTotal} vs DC ${dc} — ${saved ? 'success' : 'fail'}`
        }${action.damage ? `, ${dmg} damage (now ${target.hp} HP)` : ''}.`,
      });
    } else if (usesSpellAttack) {
      // Spell attack roll with a derived attack bonus.
      const adv = combineAdvantage(attackAdvantage(actor), targetAdvantage(target, actor));
      let toHit = action.attackBonus ?? spellAttackBonus(actor.base, action);
      if (bless) toHit += rollDice(rng, BLESS_BONUS).total;
      const roll = rollD20(rng, toHit, adv);
      const hit = roll.isCrit || (!roll.isCritMiss && roll.total >= target.base.ac);
      let dmg = 0;
      if (hit) {
        dmg = rollDamageTotal(
          rng,
          dmgProfile.damageDice,
          dmgProfile.damageFlat,
          isMeleeAutoCrit(target, distance(actor, target)) || roll.isCrit,
        );
        applyDamage(state, rng, actor, target, dmg, events, dmgProfile.damageType);
        if (action.applyConditions?.length) {
          applyConditionsTo(target, actor, action.applyConditions, state, events);
        }
      }
      events.push({
        round: state.round,
        actorId: actor.base.id,
        actorName: actor.base.name,
        type: 'spell',
        actionId: action.id,
        targetId: target.base.id,
        targetName: target.base.name,
        damage: dmg,
        message: `${actor.base.name} casts ${action.name} at ${target.base.name}: ${
          hit ? `hits for ${dmg} (now ${target.hp} HP)` : 'misses'
        }.`,
      });
    } else {
      // Auto-hit damage (e.g. magic missile) or pure condition application.
      let dmg = 0;
      if (action.damage) {
        dmg = rollDamageTotal(rng, dmgProfile.damageDice, dmgProfile.damageFlat, false);
        applyDamage(state, rng, actor, target, dmg, events, dmgProfile.damageType);
      }
      if (action.applyConditions?.length) {
        applyConditionsTo(target, actor, action.applyConditions, state, events);
      }
      events.push({
        round: state.round,
        actorId: actor.base.id,
        actorName: actor.base.name,
        type: action.kind === 'spell' ? 'spell' : 'ability',
        actionId: action.id,
        targetId: target.base.id,
        targetName: target.base.name,
        damage: dmg,
        message: `${actor.base.name} uses ${action.name} on ${target.base.name}${
          action.damage ? ` for ${dmg} damage (now ${target.hp} HP)` : ''
        }.`,
      });
    }
  }
}

function saveAdvantage(target: CombatantState, ability: import('./types').Ability): Advantage {
  // 'dodging' grants advantage on Dex saves; restrained gives disadvantage on Dex saves.
  let adv: Advantage = 'normal';
  if (ability === 'dex') {
    if (target.conditions.some((c) => c.kind === 'dodging')) adv = combineAdvantage(adv, 'advantage');
    if (target.conditions.some((c) => c.kind === 'restrained'))
      adv = combineAdvantage(adv, 'disadvantage');
  }
  return adv;
}

// re-export for tests
export { abilityMod };
