// Derive attack/spell numbers from a combatant (ability mods, proficiency, weapon,
// spellcasting ability) plus additive manual adjustments. This is the heart of the
// "primarily derived with manual adjustments" model.

import { abilityMod } from './state';
import type { Ability, Action, Combatant, DamageType, Weapon } from './types';

/** Which ability backs a weapon attack: finesse → better of STR/DEX, ranged → DEX, else STR. */
export function attackAbility(c: Combatant, action: Action, weapon?: Weapon): Ability {
  if (action.abilityOverride) return action.abilityOverride;
  if (!weapon) return 'str';
  if (weapon.properties.includes('ranged')) return 'dex';
  if (weapon.properties.includes('finesse')) {
    return abilityMod(c.abilityScores.dex) >= abilityMod(c.abilityScores.str) ? 'dex' : 'str';
  }
  return 'str';
}

export interface AttackProfile {
  toHit: number;
  /** rollable dice formulas (each may carry its own flat, e.g. legacy "1d8+3"). */
  damageDice: string[];
  /** extra flat damage added once (ability mod + bonuses for weapon attacks). */
  damageFlat: number;
  damageType: DamageType;
  /** the ability used (for UI previews); undefined for legacy/manual attacks. */
  ability?: Ability;
}

/**
 * Compute an attack's to-hit and damage. Uses the weapon + wielder when `weapon` is
 * given (or the action has a weaponId); otherwise falls back to the legacy explicit
 * `attackBonus`/`damage` fields. Manual adjustments are always layered on additively.
 */
export function resolveAttackProfile(c: Combatant, action: Action, weapon?: Weapon): AttackProfile {
  const toHitAdj = (action.toHitBonus ?? 0) + (action.magicBonus ?? 0);
  const dmgAdj = (action.damageBonus ?? 0) + (action.magicBonus ?? 0);

  if (weapon) {
    const ability = attackAbility(c, action, weapon);
    const mod = abilityMod(c.abilityScores[ability]);
    const prof = action.notProficient ? 0 : c.proficiencyBonus;
    const baseDie =
      action.useVersatile && weapon.versatileDamage ? weapon.versatileDamage : weapon.damage;
    const damageDice = [baseDie];
    if (action.bonusDamageDice) damageDice.push(action.bonusDamageDice);
    return {
      toHit: mod + prof + toHitAdj,
      damageDice,
      damageFlat: mod + dmgAdj,
      damageType: weapon.damageType,
      ability,
    };
  }

  // Legacy / manual attack: explicit numbers, adjustments still additive.
  const damageDice = action.damage ? [action.damage] : [];
  if (action.bonusDamageDice) damageDice.push(action.bonusDamageDice);
  return {
    toHit: (action.attackBonus ?? 0) + toHitAdj,
    damageDice,
    damageFlat: dmgAdj,
    damageType: action.damageType ?? 'bludgeoning',
  };
}

/** Spellcasting ability modifier, defaulting to INT when unset. */
export function spellMod(c: Combatant): number {
  return abilityMod(c.abilityScores[c.spellcastingAbility ?? 'int']);
}

/** Derived spell attack bonus = spell mod + proficiency + adjustments. */
export function spellAttackBonus(c: Combatant, action: Action): number {
  return spellMod(c) + c.proficiencyBonus + (action.toHitBonus ?? 0) + (action.magicBonus ?? 0);
}

/** Derived spell save DC = 8 + spell mod + proficiency (+ adjustment), or an explicit DC. */
export function spellSaveDC(c: Combatant, action: Action): number {
  const base = action.save?.dc ?? 8 + spellMod(c) + c.proficiencyBonus;
  return base + (action.saveDcBonus ?? 0);
}

/** Flat bonus added to a heal (the caster's spell mod when the action opts in). */
export function healFlat(c: Combatant, action: Action): number {
  return action.addSpellModToHeal ? spellMod(c) : 0;
}
