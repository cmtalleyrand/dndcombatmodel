// Resolve a chosen action against chosen targets, mutating combat state and emitting log events.

import { CONDITION_CATALOG, resistsPhysical } from './conditions';
import { rollD20, rollDice, type RNG, type Advantage, combineAdvantage } from './dice';
import { rollSavingThrow } from './checks';
import {
  resolveAttackProfile,
  spellAttackBonus,
  spellSaveDC,
  healFlat,
} from './derive';
import type { LogEvent } from './log';
import { approach, applyMovementPolicy, effectiveRange, keepAtRange, reposition } from './movement';
import {
  abilityMod,
  attackAdvantage,
  distance,
  isAlive,
  resolveSave,
  targetAdvantage,
  type CombatantState,
  type CombatState,
} from './state';
import type { Action, AoeTargets, ConditionApplication, DamageType, Feature, ModifierPolicy, TacticalDecision } from './types';

const BLESS_BONUS = '1d4';

const PHYSICAL: DamageType[] = ['bludgeoning', 'piercing', 'slashing'];

/**
 * Probability an attack lands, used only for tactical-policy EV previews (whether to spend a
 * to-hit feature). Now accounts for advantage/disadvantage (roll-twice math) and Bless (the
 * +1d4 approximated as its +2.5 average shift), so previews rank options the way the actual
 * roll will resolve them — a flat 5%..95% base ignored both.
 */
function hitChance(toHit: number, ac: number, adv: Advantage = 'normal', bless = false): number {
  const needed = ac - (toHit + (bless ? 2.5 : 0));
  const successfulFaces = Math.max(1, Math.min(19, 21 - needed));
  const base = successfulFaces / 20;
  if (adv === 'advantage') return 1 - (1 - base) ** 2;
  if (adv === 'disadvantage') return base ** 2;
  return base;
}

function usePreRollFeature(
  feature: Feature,
  policy: ModifierPolicy | undefined,
  baseToHit: number,
  targetAc: number,
  adv: Advantage = 'normal',
  bless = false,
): boolean {
  if (!feature.attackModifier) return true;
  if (policy?.featureIds && !policy.featureIds.includes(feature.id)) return false;
  if (!policy || policy.kind === 'always') return true;
  if (policy.kind === 'never') return false;
  const modifiedToHit = baseToHit + (feature.attackModifier.toHit ?? 0);
  if (policy.kind === 'minimumHitChance') return hitChance(modifiedToHit, targetAc, adv, bless) >= (policy.minimumHitChance ?? 0);
  const damageDelta = policy.damageDelta ?? feature.attackModifier.damage ?? 0;
  const toHitDelta = policy.toHitDelta ?? feature.attackModifier.toHit ?? 0;
  const pMod = hitChance(modifiedToHit, targetAc, adv, bless);
  return pMod * damageDelta + (pMod - hitChance(baseToHit, targetAc, adv, bless)) * Math.max(0, damageDelta - toHitDelta) > 0;
}

/** Combine typed resistance/immunity/vulnerability (combatant traits + conditions) into a multiplier. */
function damageMultiplier(target: CombatantState, damageType?: DamageType): { mult: number; note: string } {
  if (damageType && target.base.immunities?.includes(damageType)) return { mult: 0, note: ' (immune)' };
  const physical = !!damageType && PHYSICAL.includes(damageType);
  const resisted =
    (!!damageType && !!target.base.resistances?.includes(damageType)) ||
    (physical && resistsPhysical(target.conditions)) ||
    target.conditions.some((c) => CONDITION_CATALOG[c.kind].resistAll);
  const vulnerable = !!damageType && !!target.base.vulnerabilities?.includes(damageType);
  if (resisted && vulnerable) return { mult: 1, note: '' }; // cancel
  if (resisted) return { mult: 0.5, note: ' (resisted)' };
  if (vulnerable) return { mult: 2, note: ' (vulnerable)' };
  return { mult: 1, note: '' };
}

/** Apply damage to a target, handling resistance, temp HP, concentration checks, death, and death saves. */
function applyDamage(
  state: CombatState,
  rng: RNG,
  source: CombatantState,
  target: CombatantState,
  amount: number,
  events: LogEvent[],
  damageType?: DamageType,
  crit = false,
): void {
  if (amount <= 0) return;
  const { mult, note } = damageMultiplier(target, damageType);
  amount = mult === 0.5 ? Math.floor(amount / 2) : Math.floor(amount * mult);
  if (amount <= 0) {
    if (note) {
      events.push({
        round: state.round,
        actorId: source.base.id,
        actorName: source.base.name,
        type: 'attack',
        targetId: target.base.id,
        targetName: target.base.name,
        message: `${target.base.name} is unaffected${note}.`,
      });
    }
    return;
  }

  const wasDown = target.down;

  // Temporary HP absorbs damage first, but the full (post-resistance) amount still
  // counts as damage taken for stats and concentration.
  const dealt = amount;
  if (target.tempHp > 0) {
    const soaked = Math.min(target.tempHp, amount);
    target.tempHp -= soaked;
    amount -= soaked;
  }
  target.hp -= amount;
  target.damageTaken += dealt;
  source.damageDealt += dealt;

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
    const dc = Math.max(10, Math.floor(dealt / 2));
    const roll = rollSavingThrow(rng, target.base, 'con', concentrationAdvantage(target));
    if (roll.total < dc) {
      dropConcentration(state, target, events);
    }
  }

  if (target.hp <= 0) {
    const overkill = -target.hp; // how far below 0 this hit pushed them
    target.hp = 0;
    if (target.concentratingOn) dropConcentration(state, target, events);
    handleDropToZero(state, source, target, wasDown, overkill, crit, events);
  }
}

/** Resolve a combatant reaching 0 HP: monsters die; PCs fall unconscious and start death saves. */
function handleDropToZero(
  state: CombatState,
  source: CombatantState,
  target: CombatantState,
  wasDown: boolean,
  overkill: number,
  crit: boolean,
  events: LogEvent[],
): void {
  const log = (message: string, type: LogEvent['type'] = 'death') =>
    events.push({
      round: state.round,
      actorId: source.base.id,
      actorName: source.base.name,
      type,
      targetId: target.base.id,
      targetName: target.base.name,
      message,
    });

  if (target.base.side === 'monster') {
    target.down = true;
    target.dead = true;
    log(`${target.base.name} drops to 0 HP and is slain.`);
    return;
  }

  // PC
  if (wasDown) {
    // A hit on an unconscious PC is 1 death-save failure (2 on a crit / auto-crit).
    target.deathSaves.failures += crit ? 2 : 1;
    if (target.deathSaves.failures >= 3) {
      target.dead = true;
      log(`${target.base.name} is struck while down and dies.`);
    } else {
      log(`${target.base.name} takes a hit while down (death-save failure ${target.deathSaves.failures}/3).`, 'condition');
    }
    return;
  }

  target.down = true;
  if (overkill >= target.base.maxHp) {
    target.dead = true;
    log(`${target.base.name} takes massive damage and dies instantly.`);
  } else {
    log(`${target.base.name} drops to 0 HP and falls unconscious.`);
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
    if (target.base.conditionImmunities?.includes(app.kind)) {
      events.push({
        round: state.round,
        actorId: source.base.id,
        actorName: source.base.name,
        type: 'condition',
        targetId: target.base.id,
        targetName: target.base.name,
        message: `${target.base.name} is immune to ${CONDITION_CATALOG[app.kind].label}.`,
      });
      continue;
    }
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
  decision?: TacticalDecision,
): void {
  // Spend resources up front.
  if (action.spellLevel && action.spellLevel > 0) {
    actor.spellSlots[action.spellLevel] = (actor.spellSlots[action.spellLevel] ?? 0) - 1;
  }
  if (action.uses !== undefined) {
    actor.usesRemaining[action.id] =
      (actor.usesRemaining[action.id] ?? action.uses) - 1;
    actor.resources[action.id] = actor.usesRemaining[action.id];
  }
  if (action.concentration) {
    startConcentration(state, actor, action, events);
  }

  // Heterogeneous multiattack: perform each child action in order (e.g. bite + 2 claws).
  if (action.sequence?.length) {
    for (const childId of action.sequence) {
      const child = state.actionsById[childId];
      if (!child) continue;
      const live = targets.filter(isAlive);
      performAction(state, rng, actor, child, live.length ? live : targets, events);
    }
    return;
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
      resolveAttack(state, rng, actor, action, targets, events, decision);
      keepAtRange(
        state,
        actor,
        targets[0],
        effectiveRange(action, action.weaponId ? state.weaponsById[action.weaponId] : undefined),
        events,
      );
      return;
    }

    case 'spell':
    case 'ability': {
      resolveSpellOrAbility(state, rng, actor, action, targets, events);
      if (action.damage || action.save || action.spellAttack) {
        keepAtRange(state, actor, targets[0], effectiveRange(action, undefined), events);
      }
      return;
    }
  }
}


function combatantFeatures(state: CombatState, actor: CombatantState): Feature[] {
  return [...(actor.base.features ?? []), ...(actor.base.featureIds ?? []).map((id) => state.featuresById[id]).filter(Boolean)];
}

function legacyActionFeatures(action: Action): Feature[] {
  const features: Feature[] = [];
  for (let i = 0; i < (action.extraDamage?.length ?? 0); i++) {
    features.push({ id: `${action.id}:legacyExtraDamage:${i}`, name: action.extraDamage![i].label ?? 'Extra Damage', timing: 'onHit', extraDamage: [action.extraDamage![i]] });
  }
  if (action.applyConditions?.length) {
    features.push({ id: `${action.id}:legacyConditions`, name: 'Condition effect', timing: 'onHit', applyConditions: action.applyConditions });
  }
  return features;
}

function featureConditionApplies(
  state: CombatState,
  actor: CombatantState,
  feature: Feature,
  target?: CombatantState,
  adv: Advantage = 'normal',
  gap = 0,
): boolean {
  const condition = feature.condition;
  if (!condition) return true;
  if (condition.meleeOnly && gap > 0) return false;
  switch (condition.trigger) {
    case 'always':
      return true;
    case 'hasAdvantage':
      return adv === 'advantage';
    case 'advantageOrAllyAdjacent':
      return adv === 'advantage' || (!!target && allyAdjacentToTarget(state, actor, target));
    case 'targetHasCondition':
      return !!target && !!condition.condition && target.conditions.some((c) => c.kind === condition.condition);
    case 'selfHasCondition':
      return !!condition.condition && actor.conditions.some((c) => c.kind === condition.condition);
  }
}

function applicableFeatures(
  state: CombatState,
  actor: CombatantState,
  action: Action,
  timing: Feature['timing'],
  target?: CombatantState,
  adv: Advantage = 'normal',
  gap = 0,
): Feature[] {
  return [...combatantFeatures(state, actor), ...legacyActionFeatures(action)].filter(
    (f) => f.timing === timing && (!f.actionIds || f.actionIds.includes(action.id)) && featureConditionApplies(state, actor, f, target, adv, gap),
  );
}

function canSpendFeature(actor: CombatantState, feature: Feature): boolean {
  if (feature.oncePerTurn && actor.featureUsedThisTurn.has(feature.id)) return false;
  if (!feature.spend) return true;
  return (actor.resources[feature.spend.resourceId] ?? 0) >= feature.spend.amount;
}

function spendFeature(actor: CombatantState, feature: Feature): void {
  if (feature.oncePerTurn) actor.featureUsedThisTurn.add(feature.id);
  if (feature.spend) actor.resources[feature.spend.resourceId] -= feature.spend.amount;
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

/**
 * Resolve an action's extra typed-damage packets against one target (each vs its own
 * resistances). `scale` lets save-for-half effects halve (0.5) or negate (0) the extras.
 */
function applyExtraDamage(
  state: CombatState,
  rng: RNG,
  actor: CombatantState,
  target: CombatantState,
  action: Action,
  crit: boolean,
  events: LogEvent[],
  scale = 1,
): void {
  if (!action.extraDamage?.length || scale <= 0) return;
  for (const extra of action.extraDamage) {
    if (!isAlive(target)) break;
    let dmg = extra.flat ?? 0;
    if (extra.dice) dmg += rollDice(rng, crit ? critDouble(extra.dice) : extra.dice).total;
    dmg = Math.floor(dmg * scale);
    if (dmg <= 0) continue;
    applyDamage(state, rng, actor, target, dmg, events, extra.type, crit);
    events.push({
      round: state.round,
      actorId: actor.base.id,
      actorName: actor.base.name,
      type: 'attack',
      actionId: action.id,
      targetId: target.base.id,
      targetName: target.base.name,
      damage: dmg,
      message: `  ↳ ${extra.label ?? extra.type}: +${dmg} ${extra.type} damage.`,
    });
  }
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
  decision?: TacticalDecision,
): void {
  const attackCount = action.attackCount ?? 1;
  const weapon = action.weaponId ? state.weaponsById[action.weaponId] : undefined;
  const profile = resolveAttackProfile(actor.base, action, weapon);
  const { bless } = blessAdvantageBonus(actor);
  const range = effectiveRange(action, weapon);

  // Movement policy is evaluated before attack; legacy behavior closes only when needed.
  if (decision?.movementPolicy) applyMovementPolicy(state, actor, targets[0], decision.movementPolicy, range, events);
  else if (targets[0] && targets[0] !== actor) approach(state, actor, targets[0], range, events);

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
      const baseAdv = combineAdvantage(
        combineAdvantage(attackAdvantage(actor), targetAdvantage(target, actor)),
        rangeAdv,
      );
      const candidatePreRollFeatures = applicableFeatures(state, actor, action, 'beforeAttackRoll', target, baseAdv, gap);
      const featureAdv = candidatePreRollFeatures.reduce(
        (current, feature) => combineAdvantage(current, feature.attackModifier?.advantage ?? 'normal'),
        'normal' as Advantage,
      );
      const adv = combineAdvantage(baseAdv, featureAdv);
      const preRollFeatures = candidatePreRollFeatures.filter((f) => canSpendFeature(actor, f) && usePreRollFeature(f, decision?.modifierPolicy, profile.toHit, target.base.ac + (f.attackModifier?.ac ?? 0), adv, bless));
      let toHit = profile.toHit;
      for (const feature of preRollFeatures) {
        toHit += feature.attackModifier?.toHit ?? 0;
        if (feature.spend?.trigger === 'always') spendFeature(actor, feature);
      }
      let damageModifier = preRollFeatures.reduce((sum, f) => sum + (f.attackModifier?.damage ?? 0), 0);
      const ac = target.base.ac + preRollFeatures.reduce((sum, f) => sum + (f.attackModifier?.ac ?? 0), 0);
      let blessNote = '';
      if (bless) {
        const b = rollDice(rng, BLESS_BONUS).total;
        toHit += b;
        blessNote = ` (+${b} bless)`;
      }
      const roll = rollD20(rng, toHit, adv);
      let rollTotal = roll.total;
      const postRollFeatures = applicableFeatures(state, actor, action, 'afterAttackRollBeforeHitResolution', target, adv, gap);
      for (const feature of postRollFeatures) {
        if (!canSpendFeature(actor, feature) || roll.isCritMiss || roll.isCrit || rollTotal >= ac) continue;
        const maximum = feature.spend?.missThreshold ?? feature.attackModifier?.toHit ?? 0;
        if (feature.spend?.trigger === 'missWithin' && ac - rollTotal > maximum) continue;
        const bonus = feature.attackModifier?.toHit ?? 0;
        rollTotal += bonus;
        spendFeature(actor, feature);
        events.push({
          round: state.round,
          actorId: actor.base.id,
          actorName: actor.base.name,
          type: 'attack',
          actionId: action.id,
          targetId: target.base.id,
          targetName: target.base.name,
          message: `  ↳ ${feature.name}: +${bonus} to hit.`,
        });
      }
      const hit = roll.isCrit || (!roll.isCritMiss && rollTotal >= ac);

      if (!hit) {
        events.push({
          round: state.round,
          actorId: actor.base.id,
          actorName: actor.base.name,
          type: 'attack',
          actionId: action.id,
          targetId: target.base.id,
          targetName: target.base.name,
          message: `${actor.base.name} attacks ${target.base.name} with ${action.name}: rolls ${rollTotal}${blessNote} vs AC ${ac} — miss.`,
        });
        continue;
      }

      const isCritHit = isMeleeAutoCrit(target, gap) || roll.isCrit;
      let dmg = rollDamageTotal(rng, profile.damageDice, profile.damageFlat + damageModifier, isCritHit);
      // Conditional feature riders (Sneak Attack, Rage, Hunter's Mark…). Use isCritHit so
      // rider dice double on a melee auto-crit (vs paralyzed/unconscious), matching the
      // weapon dice above — not just on a natural 20.
      const riderBonus = applyRiders(state, rng, actor, target, action, adv, gap, isCritHit, events);
      dmg += riderBonus;
      const onHitFeatures = applicableFeatures(state, actor, action, 'onHit', target, adv, gap).filter((f) => canSpendFeature(actor, f));
      for (const feature of onHitFeatures) {
        if (feature.spend?.trigger === 'onHit' || feature.spend?.trigger === 'always') spendFeature(actor, feature);
      }
      applyDamage(state, rng, actor, target, dmg, events, profile.damageType, isCritHit);
      for (const feature of onHitFeatures) {
        if (!feature.extraDamage?.length) continue;
        for (const extra of feature.extraDamage) {
          if (!isAlive(target)) break;
          let extraDamage = extra.flat ?? 0;
          if (extra.dice) extraDamage += rollDice(rng, isCritHit ? critDouble(extra.dice) : extra.dice).total;
          applyDamage(state, rng, actor, target, extraDamage, events, extra.type, isCritHit);
          events.push({
            round: state.round, actorId: actor.base.id, actorName: actor.base.name, type: 'attack', actionId: action.id,
            targetId: target.base.id, targetName: target.base.name, damage: extraDamage,
            message: `  ↳ ${feature.name}: +${extraDamage} ${extra.type} damage.`,
          });
        }
      }
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
        }: rolls ${rollTotal}${blessNote} vs AC ${ac} — ${dmg} damage (${target.base.name} at ${target.hp} HP).`,
      });
      for (const feature of onHitFeatures) {
        if (feature.applyConditions?.length) applyConditionsTo(target, actor, feature.applyConditions, state, events);
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

  // Area of effect: everyone within the radius of the center point. Damage/save spells
  // catch both sides (friendly fire) by default; heals default to allies only.
  if (action.aoeRadius && targets[0]) {
    const center = targets[0];
    const mode: AoeTargets = action.aoeTargets ?? (action.heal ? 'allies' : 'all');
    targets = state.combatants.filter((c) => {
      if (!isAlive(c)) return false;
      if (Math.abs(c.position - center.position) > action.aoeRadius!) return false;
      if (mode === 'allies') return c.base.side === actor.base.side;
      if (mode === 'enemies') return c.base.side !== actor.base.side;
      return true;
    });
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

  // Temporary HP (e.g. Heroism, False Life) — takes the higher, never stacks.
  if (action.tempHp) {
    for (const target of targets) {
      if (target.dead) continue;
      const amt = rollDice(rng, action.tempHp).total;
      if (amt > target.tempHp) target.tempHp = amt;
      events.push({
        round: state.round,
        actorId: actor.base.id,
        actorName: actor.base.name,
        type: 'heal',
        actionId: action.id,
        targetId: target.base.id,
        targetName: target.base.name,
        message: `${actor.base.name} grants ${target.base.name} ${target.tempHp} temporary HP.`,
      });
    }
    if (!action.heal && !action.damage && !action.save) return;
  }

  // Healing
  if (action.heal) {
    const flat = healFlat(actor.base, action);
    for (const target of targets) {
      if (target.dead) continue; // the dead cannot be healed
      const healAmt = rollDice(rng, action.heal).total + flat;
      const before = target.hp;
      // healing a downed PC brings them back up and clears death-save progress
      if (target.down) {
        target.down = false;
        target.stable = false;
        target.deathSaves = { successes: 0, failures: 0 };
      }
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
      const ability = action.save.ability;
      const dcFeatures = applicableFeatures(state, actor, action, 'beforeAttackRoll', target).filter((f) => canSpendFeature(actor, f));
      const dc = spellSaveDC(actor.base, action) + dcFeatures.reduce((sum, f) => sum + (f.attackModifier?.saveDc ?? 0), 0);
      for (const feature of dcFeatures) {
        if (feature.spend?.trigger === 'always') spendFeature(actor, feature);
      }
      const { saved, autoFail, total: saveTotal } = resolveSave(rng, target, ability, dc);

      let dmg = 0;
      if (action.damage) {
        dmg = rollDamageTotal(rng, dmgProfile.damageDice, dmgProfile.damageFlat, false);
        if (saved) dmg = action.save.onSuccess === 'half' ? Math.floor(dmg / 2) : 0;
        applyDamage(state, rng, actor, target, dmg, events, dmgProfile.damageType);
      }
      const extraScale = saved ? (action.save.onSuccess === 'half' ? 0.5 : 0) : 1;
      applyExtraDamage(state, rng, actor, target, action, false, events, extraScale);
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
      const baseAdv = combineAdvantage(attackAdvantage(actor), targetAdvantage(target, actor));
      const preRollFeatures = applicableFeatures(state, actor, action, 'beforeAttackRoll', target, baseAdv, distance(actor, target)).filter((f) => canSpendFeature(actor, f));
      const adv = combineAdvantage(
        baseAdv,
        preRollFeatures.reduce((current, feature) => combineAdvantage(current, feature.attackModifier?.advantage ?? 'normal'), 'normal' as Advantage),
      );
      let toHit = action.attackBonus ?? spellAttackBonus(actor.base, action);
      toHit += preRollFeatures.reduce((sum, f) => sum + (f.attackModifier?.toHit ?? 0), 0);
      const ac = target.base.ac + preRollFeatures.reduce((sum, f) => sum + (f.attackModifier?.ac ?? 0), 0);
      for (const feature of preRollFeatures) {
        if (feature.spend?.trigger === 'always') spendFeature(actor, feature);
      }
      if (bless) toHit += rollDice(rng, BLESS_BONUS).total;
      const roll = rollD20(rng, toHit, adv);
      const hit = roll.isCrit || (!roll.isCritMiss && roll.total >= ac);
      let dmg = 0;
      if (hit) {
        dmg = rollDamageTotal(
          rng,
          dmgProfile.damageDice,
          dmgProfile.damageFlat,
          isMeleeAutoCrit(target, distance(actor, target)) || roll.isCrit,
        );
        applyDamage(state, rng, actor, target, dmg, events, dmgProfile.damageType, roll.isCrit);
        applyExtraDamage(state, rng, actor, target, action, roll.isCrit, events);
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
      applyExtraDamage(state, rng, actor, target, action, false, events);
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


export function applyTimedFeatures(
  state: CombatState,
  rng: RNG,
  actor: CombatantState,
  timing: 'precombat' | 'startOfTurn',
  events: LogEvent[],
): void {
  const action: Action = { id: '', name: timing, kind: 'ability', targets: 0 };
  for (const feature of applicableFeatures(state, actor, action, timing)) {
    if (!canSpendFeature(actor, feature)) continue;
    if (feature.spend?.trigger === 'always') spendFeature(actor, feature);
    if (feature.applyConditions?.length) applyConditionsTo(actor, actor, feature.applyConditions, state, events);
    if (feature.extraDamage?.length) {
      for (const extra of feature.extraDamage) {
        let damage = extra.flat ?? 0;
        if (extra.dice) damage += rollDice(rng, extra.dice).total;
        applyDamage(state, rng, actor, actor, damage, events, extra.type);
        events.push({
          round: state.round,
          actorId: actor.base.id,
          actorName: actor.base.name,
          type: 'attack',
          targetId: actor.base.id,
          targetName: actor.base.name,
          damage,
          message: `  ↳ ${feature.name}: ${damage} ${extra.type} damage.`,
        });
      }
    }
  }
}

export function consumeExtraActionFeature(state: CombatState, actor: CombatantState): number {
  for (const feature of applicableFeatures(state, actor, { id: '', name: '', kind: 'ability', targets: 0 }, 'actionEconomy')) {
    if (!feature.extraAction || !canSpendFeature(actor, feature)) continue;
    spendFeature(actor, feature);
    return feature.extraAction.count;
  }
  return 0;
}

// re-export for tests
export { abilityMod, critDouble, rollDamageTotal };


export function performTacticalDecision(
  state: CombatState,
  rng: RNG,
  actor: CombatantState,
  decision: TacticalDecision,
  events: LogEvent[],
): void {
  const targets = decision.targets
    .map((id) => state.combatants.find((c) => c.base.id === id))
    .filter((c): c is CombatantState => !!c);
  performAction(state, rng, actor, decision.baseAction, targets, events, decision);
}
