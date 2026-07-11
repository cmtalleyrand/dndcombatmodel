// A tiny, deterministic, sandboxed arithmetic evaluator for author-supplied formulas.
//
// This lets AI-authored (or hand-authored) content compute numbers dynamically — e.g. a save DC
// that scales with the caster's spellcasting modifier, or bonus damage that scales with how hurt
// the target is — WITHOUT `eval`/`new Function` and without any access to the host environment.
// Only the whitelisted variables and functions below are reachable, everything is pure arithmetic,
// and the same formula + context always yields the same number, preserving engine determinism.

/** Variables an expression may reference. Kept as a fixed whitelist so the validator can check
 *  formulas up-front and so evaluation can never read anything outside this context. */
export const EXPR_VARIABLES = [
  'level', // the actor's level
  'prof', // the actor's proficiency bonus
  'casterMod', // the actor's spellcasting-ability modifier (0 if none)
  'round', // current combat round (1-based)
  'selfHpPct', // the actor's current HP as a percentage (0..100)
  'selfMissingHp', // the actor's missing HP (maxHp - hp)
  'targetHpPct', // the primary target's HP percentage (0 when no target)
  'targetMissingHp', // the primary target's missing HP (0 when no target)
  'enemyCount', // living enemies of the actor
  'allyCount', // living allies of the actor (including self)
] as const;

export type ExprVariable = (typeof EXPR_VARIABLES)[number];
export type ExprContext = Record<ExprVariable, number>;

const VARIABLE_SET = new Set<string>(EXPR_VARIABLES);

/** Whitelisted functions, by arity. All deterministic and total. */
const FUNCTIONS: Record<string, { arity: number; fn: (args: number[]) => number }> = {
  min: { arity: 2, fn: ([a, b]) => Math.min(a, b) },
  max: { arity: 2, fn: ([a, b]) => Math.max(a, b) },
  floor: { arity: 1, fn: ([a]) => Math.floor(a) },
  ceil: { arity: 1, fn: ([a]) => Math.ceil(a) },
  round: { arity: 1, fn: ([a]) => Math.round(a) },
  abs: { arity: 1, fn: ([a]) => Math.abs(a) },
  clamp: { arity: 3, fn: ([x, lo, hi]) => Math.min(Math.max(x, lo), hi) },
};

export const EXPR_FUNCTIONS = Object.keys(FUNCTIONS);

// --- Tokenizer ---------------------------------------------------------------

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ident'; value: string }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '%' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t' || ch === '\n') { i++; continue; }
    if (ch >= '0' && ch <= '9') {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      const num = Number(input.slice(i, j));
      if (!Number.isFinite(num)) throw new Error(`invalid number "${input.slice(i, j)}"`);
      tokens.push({ kind: 'num', value: num });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j])) j++;
      tokens.push({ kind: 'ident', value: input.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%') {
      tokens.push({ kind: 'op', value: ch });
      i++;
      continue;
    }
    if (ch === '(') { tokens.push({ kind: 'lparen' }); i++; continue; }
    if (ch === ')') { tokens.push({ kind: 'rparen' }); i++; continue; }
    if (ch === ',') { tokens.push({ kind: 'comma' }); i++; continue; }
    throw new Error(`unexpected character "${ch}"`);
  }
  return tokens;
}

// --- Parser (recursive descent) ---------------------------------------------
// grammar: expr := term (('+'|'-') term)*
//          term := unary (('*'|'/'|'%') unary)*
//          unary := '-' unary | primary
//          primary := num | ident | ident '(' args ')' | '(' expr ')'

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: ExprVariable }
  | { kind: 'neg'; arg: Node }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/' | '%'; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[] };

function parse(tokens: Token[]): Node {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr(): Node {
    let left = parseTerm();
    while (peek()?.kind === 'op' && (peek() as { value: string }).value.match(/[+-]/)) {
      const op = (next() as { value: '+' | '-' }).value;
      left = { kind: 'bin', op, left, right: parseTerm() };
    }
    return left;
  }

  function parseTerm(): Node {
    let left = parseUnary();
    while (peek()?.kind === 'op' && (peek() as { value: string }).value.match(/[*/%]/)) {
      const op = (next() as { value: '*' | '/' | '%' }).value;
      left = { kind: 'bin', op, left, right: parseUnary() };
    }
    return left;
  }

  function parseUnary(): Node {
    if (peek()?.kind === 'op' && (peek() as { value: string }).value === '-') {
      next();
      return { kind: 'neg', arg: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary(): Node {
    const tok = peek();
    if (!tok) throw new Error('unexpected end of formula');
    if (tok.kind === 'num') { next(); return { kind: 'num', value: tok.value }; }
    if (tok.kind === 'lparen') {
      next();
      const inner = parseExpr();
      if (peek()?.kind !== 'rparen') throw new Error('missing ")"');
      next();
      return inner;
    }
    if (tok.kind === 'ident') {
      next();
      if (peek()?.kind === 'lparen') {
        next();
        const args: Node[] = [];
        if (peek()?.kind !== 'rparen') {
          args.push(parseExpr());
          while (peek()?.kind === 'comma') { next(); args.push(parseExpr()); }
        }
        if (peek()?.kind !== 'rparen') throw new Error('missing ")" in call');
        next();
        const fn = FUNCTIONS[tok.value];
        if (!fn) throw new Error(`unknown function "${tok.value}"`);
        if (args.length !== fn.arity) throw new Error(`${tok.value}() takes ${fn.arity} argument(s)`);
        return { kind: 'call', name: tok.value, args };
      }
      if (!VARIABLE_SET.has(tok.value)) throw new Error(`unknown variable "${tok.value}"`);
      return { kind: 'var', name: tok.value as ExprVariable };
    }
    throw new Error('unexpected token');
  }

  const node = parseExpr();
  if (pos !== tokens.length) throw new Error('trailing tokens in formula');
  return node;
}

function evalNode(node: Node, ctx: ExprContext): number {
  switch (node.kind) {
    case 'num': return node.value;
    case 'var': return ctx[node.name] ?? 0;
    case 'neg': return -evalNode(node.arg, ctx);
    case 'call': return FUNCTIONS[node.name].fn(node.args.map((a) => evalNode(a, ctx)));
    case 'bin': {
      const l = evalNode(node.left, ctx);
      const r = evalNode(node.right, ctx);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return r === 0 ? 0 : l / r; // division by zero yields 0, never NaN/Infinity
        case '%': return r === 0 ? 0 : l % r;
      }
    }
  }
}

/** Parse-check a formula. Returns an error message, or undefined if it is valid. */
export function validateExpr(formula: string): string | undefined {
  try {
    parse(tokenize(formula));
    return undefined;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export function isValidExpr(formula: string): boolean {
  return validateExpr(formula) === undefined;
}

/**
 * Evaluate a formula against a context. Invalid formulas evaluate to `fallback` (default 0) rather
 * than throwing, so a bad author formula degrades gracefully in the simulation loop; author-time
 * validation (see {@link validateExpr}) is where problems should surface.
 */
export function evalExpr(formula: string, ctx: ExprContext, fallback = 0): number {
  try {
    const result = evalNode(parse(tokenize(formula)), ctx);
    return Number.isFinite(result) ? result : fallback;
  } catch {
    return fallback;
  }
}
