import { describe, expect, it } from 'vitest';
import { evalExpr, isValidExpr, validateExpr, EXPR_VARIABLES, type ExprContext } from '../expr';

const zeroCtx = Object.fromEntries(EXPR_VARIABLES.map((v) => [v, 0])) as ExprContext;
const ctx = (overrides: Partial<ExprContext>): ExprContext => ({ ...zeroCtx, ...overrides });

describe('expression evaluator', () => {
  it('evaluates arithmetic with correct precedence and parentheses', () => {
    expect(evalExpr('2 + 3 * 4', zeroCtx)).toBe(14);
    expect(evalExpr('(2 + 3) * 4', zeroCtx)).toBe(20);
    expect(evalExpr('10 - 2 - 3', zeroCtx)).toBe(5); // left-associative
    expect(evalExpr('-5 + 2', zeroCtx)).toBe(-3);
    expect(evalExpr('7 % 3', zeroCtx)).toBe(1);
  });

  it('resolves whitelisted variables from the context', () => {
    expect(evalExpr('8 + prof + casterMod', ctx({ prof: 3, casterMod: 4 }))).toBe(15); // a scaling save DC
    expect(evalExpr('floor(level / 2)', ctx({ level: 5 }))).toBe(2);
  });

  it('supports the whitelisted functions', () => {
    expect(evalExpr('max(1, 5)', zeroCtx)).toBe(5);
    expect(evalExpr('min(1, 5)', zeroCtx)).toBe(1);
    expect(evalExpr('clamp(12, 0, 10)', zeroCtx)).toBe(10);
    expect(evalExpr('ceil(2.1)', zeroCtx)).toBe(3);
    expect(evalExpr('abs(0 - 4)', zeroCtx)).toBe(4);
  });

  it('scales with target state (e.g. execute-style bonus damage)', () => {
    const bonus = 'floor((100 - targetHpPct) / 20)';
    expect(evalExpr(bonus, ctx({ targetHpPct: 100 }))).toBe(0);
    expect(evalExpr(bonus, ctx({ targetHpPct: 10 }))).toBe(4);
  });

  it('is deterministic: same formula + context always gives the same result', () => {
    const f = 'casterMod * 2 + max(prof, level)';
    const c = ctx({ casterMod: 3, prof: 2, level: 5 });
    expect(evalExpr(f, c)).toBe(evalExpr(f, c));
  });

  it('degrades safely: division by zero and invalid formulas yield the fallback', () => {
    expect(evalExpr('5 / 0', zeroCtx)).toBe(0);
    expect(evalExpr('this is not math', zeroCtx, -1)).toBe(-1);
    expect(evalExpr('', zeroCtx, 7)).toBe(7);
  });

  it('rejects unknown variables, unknown functions, and malformed input at validation time', () => {
    expect(isValidExpr('8 + prof')).toBe(true);
    expect(validateExpr('8 + wisdom')).toMatch(/unknown variable/);
    expect(validateExpr('sqrt(9)')).toMatch(/unknown function/);
    expect(validateExpr('max(1)')).toMatch(/takes 2/);
    expect(validateExpr('2 +')).toBeTruthy();
    expect(validateExpr('(2 + 3')).toMatch(/\)/);
    expect(validateExpr('2 3')).toMatch(/trailing/);
  });

  it('cannot reach the host environment (no eval / global access)', () => {
    expect(validateExpr('process')).toMatch(/unknown variable/);
    expect(validateExpr('globalThis.foo')).toBeTruthy();
    expect(evalExpr('constructor', zeroCtx, 42)).toBe(42);
  });
});
