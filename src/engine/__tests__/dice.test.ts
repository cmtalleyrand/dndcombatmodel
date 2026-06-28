import { describe, it, expect } from 'vitest';
import {
  RNG,
  deriveSeed,
  parseDice,
  rollDice,
  rollD20,
  combineAdvantage,
} from '../dice';

describe('RNG', () => {
  it('is deterministic for the same seed', () => {
    const a = new RNG(12345);
    const b = new RNG(12345);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = new RNG(1);
    const b = new RNG(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('die() stays within bounds', () => {
    const rng = new RNG(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng.die(20);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
  });
});

describe('deriveSeed', () => {
  it('is stable and distinct per index', () => {
    expect(deriveSeed(100, 0)).toEqual(deriveSeed(100, 0));
    expect(deriveSeed(100, 0)).not.toEqual(deriveSeed(100, 1));
  });
});

describe('parseDice', () => {
  it('parses standard formulas', () => {
    expect(parseDice('2d6+3')).toEqual({ count: 2, sides: 6, modifier: 3 });
    expect(parseDice('1d8')).toEqual({ count: 1, sides: 8, modifier: 0 });
    expect(parseDice('d20-1')).toEqual({ count: 1, sides: 20, modifier: -1 });
    expect(parseDice('5')).toEqual({ count: 0, sides: 0, modifier: 5 });
  });

  it('throws on invalid input', () => {
    expect(() => parseDice('abc')).toThrow();
  });
});

describe('rollDice', () => {
  it('respects formula range', () => {
    const rng = new RNG(7);
    for (let i = 0; i < 500; i++) {
      const { total } = rollDice(rng, '2d6+3');
      expect(total).toBeGreaterThanOrEqual(5); // 2*1+3
      expect(total).toBeLessThanOrEqual(15); // 2*6+3
    }
  });

  it('flat formula returns the modifier', () => {
    const rng = new RNG(1);
    expect(rollDice(rng, '4').total).toBe(4);
  });
});

describe('rollD20', () => {
  it('advantage is >= disadvantage on average', () => {
    const advRng = new RNG(42);
    const disRng = new RNG(42);
    let advSum = 0;
    let disSum = 0;
    for (let i = 0; i < 2000; i++) {
      advSum += rollD20(advRng, 0, 'advantage').natural;
      disSum += rollD20(disRng, 0, 'disadvantage').natural;
    }
    expect(advSum).toBeGreaterThan(disSum);
  });

  it('flags crits and crit-misses', () => {
    const rng = new RNG(3);
    let sawCrit = false;
    let sawMiss = false;
    for (let i = 0; i < 500; i++) {
      const r = rollD20(rng, 5, 'normal');
      if (r.isCrit) sawCrit = true;
      if (r.isCritMiss) sawMiss = true;
    }
    expect(sawCrit).toBe(true);
    expect(sawMiss).toBe(true);
  });
});

describe('combineAdvantage', () => {
  it('cancels opposites to normal', () => {
    expect(combineAdvantage('advantage', 'disadvantage')).toBe('normal');
    expect(combineAdvantage('normal', 'advantage')).toBe('advantage');
    expect(combineAdvantage('advantage', 'advantage')).toBe('advantage');
    expect(combineAdvantage('disadvantage', 'normal')).toBe('disadvantage');
  });
});
