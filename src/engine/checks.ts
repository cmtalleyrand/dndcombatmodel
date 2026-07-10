import { rollD20, type Advantage, type D20Result, type RNG } from './dice';
import type { Ability, Combatant, Skill } from './types';

export type TestRoll = D20Result;

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function abilityCheckBonus(c: Combatant, ability: Ability): number {
  return abilityMod(c.abilityScores[ability]);
}

export function savingThrowBonus(c: Combatant, ability: Ability): number {
  const mod = abilityMod(c.abilityScores[ability]);
  return c.saveProficiencies.includes(ability) ? mod + c.proficiencyBonus : mod;
}

export const SKILL_ABILITIES: Record<Skill, Ability> = {
  athletics: 'str',
  acrobatics: 'dex',
  sleightOfHand: 'dex',
  stealth: 'dex',
  arcana: 'int',
  history: 'int',
  investigation: 'int',
  nature: 'int',
  religion: 'int',
  animalHandling: 'wis',
  insight: 'wis',
  medicine: 'wis',
  perception: 'wis',
  survival: 'wis',
  deception: 'cha',
  intimidation: 'cha',
  performance: 'cha',
  persuasion: 'cha',
};

export function skillCheckBonus(c: Combatant, skill: Skill): number {
  const ability = SKILL_ABILITIES[skill];
  const mod = abilityMod(c.abilityScores[ability]);
  return c.skillProficiencies?.includes(skill) ? mod + c.proficiencyBonus : mod;
}

export function rollAbilityCheck(rng: RNG, c: Combatant, ability: Ability, adv: Advantage = 'normal'): TestRoll {
  return rollD20(rng, abilityCheckBonus(c, ability), adv);
}

export function rollSavingThrow(rng: RNG, c: Combatant, ability: Ability, adv: Advantage = 'normal'): TestRoll {
  return rollD20(rng, savingThrowBonus(c, ability), adv);
}

export function rollSkillCheck(rng: RNG, c: Combatant, skill: Skill, adv: Advantage = 'normal'): TestRoll {
  return rollD20(rng, skillCheckBonus(c, skill), adv);
}
