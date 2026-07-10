// Seedable RNG and dice helpers. Deterministic given a seed so simulations are reproducible.

/** Mulberry32 PRNG — small, fast, deterministic. */
export class RNG {
  private state: number;

  constructor(seed: number) {
    // ensure a non-zero 32-bit state
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** next float in [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** integer in [1, sides]. */
  die(sides: number): number {
    return 1 + Math.floor(this.next() * sides);
  }

  /** integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

/** derive a child seed deterministically (used to give each simulation its own stream). */
export function deriveSeed(base: number, index: number): number {
  // simple integer hash mixing
  let h = (base ^ (index + 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export interface ParsedDice {
  count: number;
  sides: number;
  modifier: number;
}

/** Parse a dice formula like "2d6+3", "1d8", "d20-1", "5". */
export function parseDice(formula: string): ParsedDice {
  const cleaned = formula.replace(/\s+/g, '').toLowerCase();
  // flat number, e.g. "5"
  const flat = /^[+-]?\d+$/.exec(cleaned);
  if (flat) {
    return { count: 0, sides: 0, modifier: parseInt(cleaned, 10) };
  }
  const m = /^(\d*)d(\d+)([+-]\d+)?$/.exec(cleaned);
  if (!m) {
    throw new Error(`Invalid dice formula: "${formula}"`);
  }
  const count = m[1] === '' ? 1 : parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const modifier = m[3] ? parseInt(m[3], 10) : 0;
  return { count, sides, modifier };
}

/** Whether a string is a dice formula `parseDice` can accept (e.g. "2d6+3", "1d8", "5"). */
export function isValidDiceFormula(formula: string): boolean {
  const cleaned = formula.replace(/\s+/g, '').toLowerCase();
  return /^[+-]?\d+$/.test(cleaned) || /^(\d*)d(\d+)([+-]\d+)?$/.test(cleaned);
}

/** Roll a dice formula. Returns the total and the individual die rolls. */
export function rollDice(rng: RNG, formula: string): { total: number; rolls: number[] } {
  const { count, sides, modifier } = parseDice(formula);
  const rolls: number[] = [];
  let total = modifier;
  for (let i = 0; i < count; i++) {
    const r = rng.die(sides);
    rolls.push(r);
    total += r;
  }
  return { total, rolls };
}

export type Advantage = 'normal' | 'advantage' | 'disadvantage';

export interface D20Result {
  /** final natural d20 value used (after adv/disadv selection). */
  natural: number;
  /** total including the bonus. */
  total: number;
  isCrit: boolean; // natural 20
  isCritMiss: boolean; // natural 1
  raw: number[]; // the natural d20(s) rolled
}

/** Roll a d20 with a bonus, honoring advantage/disadvantage. */
export function rollD20(rng: RNG, bonus: number, adv: Advantage = 'normal'): D20Result {
  const a = rng.die(20);
  let natural = a;
  const raw = [a];
  if (adv !== 'normal') {
    const b = rng.die(20);
    raw.push(b);
    natural = adv === 'advantage' ? Math.max(a, b) : Math.min(a, b);
  }
  return {
    natural,
    total: natural + bonus,
    isCrit: natural === 20,
    isCritMiss: natural === 1,
    raw,
  };
}

/** Combine an advantage state with a new source. adv + disadv cancels to normal. */
export function combineAdvantage(current: Advantage, add: Advantage): Advantage {
  if (add === 'normal') return current;
  if (current === 'normal') return add;
  if (current === add) return current;
  return 'normal'; // one of each cancels
}
