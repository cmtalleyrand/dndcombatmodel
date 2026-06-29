// Human-readable, derived descriptions of an action — used for live previews so users
// see the result of character-based derivation (to-hit, damage, save DC).

import {
  resolveAttackProfile,
  spellAttackBonus,
  spellSaveDC,
  spellMod,
} from '../engine/derive';
import type { Action, Combatant, Weapon } from '../engine/types';

function sign(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function damageString(dice: string[], flat: number): string {
  const parts = [...dice];
  if (flat > 0) parts.push(`${flat}`);
  else if (flat < 0) parts.push(`${flat}`);
  return parts.join(' + ').replace(/\+ -/g, '- ') || '0';
}

/** Describe an action's derived numbers for a specific wielder/caster. */
export function describeAction(
  c: Combatant,
  action: Action,
  weaponsById: Record<string, Weapon>,
): string {
  if (action.kind === 'dodge') return 'Dodge — attackers have disadvantage.';
  if (action.kind === 'move') return 'Move / reposition (abstract).';

  if (action.kind === 'attack') {
    const weapon = action.weaponId ? weaponsById[action.weaponId] : undefined;
    const p = resolveAttackProfile(c, action, weapon);
    const count = action.attackCount && action.attackCount > 1 ? `${action.attackCount}× ` : '';
    const abilityNote = p.ability ? ` (${p.ability.toUpperCase()})` : '';
    const rng = action.range ?? weapon?.range;
    const rangeNote = rng ? `, rng ${rng}ft` : ', melee';
    return `${count}${sign(p.toHit)} to hit, ${damageString(p.damageDice, p.damageFlat)} ${p.damageType}${abilityNote}${rangeNote}${riderNote(action)}`;
  }

  // spell / ability
  const bits: string[] = [];
  if (action.heal) {
    const mod = spellMod(c);
    bits.push(`heals ${action.heal}${action.addSpellModToHeal ? ` + ${mod}` : ''}`);
  }
  if (action.damage || action.save || action.spellAttack) {
    const p = resolveAttackProfile(c, action, undefined);
    if (action.save) {
      bits.push(`DC ${spellSaveDC(c, action)} ${action.save.ability.toUpperCase()} save`);
      if (action.damage) bits.push(`${damageString(p.damageDice, p.damageFlat)} ${p.damageType}`);
    } else if (action.spellAttack) {
      bits.push(`${sign(spellAttackBonus(c, action))} to hit`);
      if (action.damage) bits.push(`${damageString(p.damageDice, p.damageFlat)} ${p.damageType}`);
    } else if (action.damage) {
      bits.push(`${damageString(p.damageDice, p.damageFlat)} ${p.damageType} (auto-hit)`);
    }
  }
  if (action.applyConditions?.length) {
    bits.push(`applies ${action.applyConditions.map((a) => a.kind).join(', ')}`);
  }
  if (action.aoeRadius) bits.push(`AoE ${action.aoeRadius}ft`);
  if (action.range) bits.push(`rng ${action.range}ft`);
  if (action.concentration) bits.push('concentration');
  if (action.spellLevel) bits.unshift(`L${action.spellLevel}`);
  const out = bits.join(', ') || action.name;
  return out + riderNote(action);
}

/** Short suffix listing any conditional damage riders. */
function riderNote(action: Action): string {
  if (!action.riders?.length) return '';
  const parts = action.riders.map((r) => {
    const amt = [r.bonusDice, r.bonusFlat ? `+${r.bonusFlat}` : ''].filter(Boolean).join('');
    return `${r.label ?? 'rider'} ${amt}`.trim();
  });
  return ` [${parts.join('; ')}]`;
}

/** A generic (wielder-independent) summary for the action library list. */
export function describeActionGeneric(action: Action, weaponsById: Record<string, Weapon>): string {
  if (action.kind === 'attack') {
    const w = action.weaponId ? weaponsById[action.weaponId] : undefined;
    if (w) {
      const die = action.useVersatile && w.versatileDamage ? w.versatileDamage : w.damage;
      const mods: string[] = [];
      if (action.magicBonus) mods.push(`+${action.magicBonus} magic`);
      if (action.bonusDamageDice) mods.push(`+${action.bonusDamageDice}`);
      return `${w.name} (${die} ${w.damageType})${mods.length ? ' ' + mods.join(', ') : ''} — to-hit & damage from the wielder`;
    }
    return `${action.damage ?? '—'} (manual)`;
  }
  return action.note ?? action.kind;
}
