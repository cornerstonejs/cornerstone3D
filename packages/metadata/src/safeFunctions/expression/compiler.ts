import { FORBIDDEN_PROPERTIES, parseExpressionSource } from './parser';
import type { ExpressionNode } from './parser';
import { ExpressionSyntaxError } from './tokenizer';
import {
  hasNoValue,
  isAbsent,
  isEmpty,
  looseEquals,
  toFinite,
} from '../values';

/**
 * The runtime scope of a compiled expression: the named parameters (bound to
 * the call arguments positionally) and the implicit scope object (the first
 * argument), whose fields resolve as bare identifiers.
 */
type EvaluationScope = {
  params: Record<string, unknown>;
  implicit: unknown[];
};

type NodeEvaluator = (scope: EvaluationScope) => unknown;

/** What the node compiler needs to know about the place. */
type NodeContext = {
  expression: string;
  /** The parameter that holds the list of the aggregates, if any. */
  over?: string;
};

export type CompiledExpression = ((...args: unknown[]) => unknown) & {
  /** The source the expression was compiled from. */
  expressionSource: string;
};

export type CompileExpressionOptions = {
  /**
   * Names for the positional arguments of the compiled function.  Defaults
   * to `['instance', 'context']`.  Bare identifiers resolve parameter names
   * first, then fields of the implicit scope (see `implicitScope`).
   */
  params?: readonly string[];
  /**
   * Where a bare identifier that is not a parameter name is looked up:
   *
   * - omitted or `true`: the fields of the first argument (the implicit
   *   scope), so `Modality` reads `instance.Modality`.
   * - a parameter name: the fields of that argument.
   * - `false`: nowhere. The expression reads only its parameters, and a bare
   *   identifier that is not a parameter name is a compile-time
   *   {@link ExpressionSyntaxError}.
   *
   * Inside the argument of an aggregate (see `over`) bare identifiers always
   * read the fields of the element, whatever this option says.
   */
  implicitScope?: boolean | string;
  /**
   * The parameter that holds the list of subjects that the aggregates
   * `min(x)`, `max(x)`, `sum(x)`, `count(x)` and `count()` run over. The
   * argument of an aggregate is evaluated once for each element, with the
   * element as the innermost implicit scope. Without this option, `count` and
   * `sum` are compile errors, and `min` and `max` compare their arguments.
   */
  over?: string;
};

/** Reads a property while refusing prototype-chain escape hatches. */
function safeGet(object: unknown, key: unknown): unknown {
  if (object == null) {
    return undefined;
  }
  if (typeof key !== 'string' && typeof key !== 'number') {
    return undefined;
  }
  if (typeof key === 'string' && FORBIDDEN_PROPERTIES.has(key)) {
    return undefined;
  }
  return object[key];
}

function contains(needle: unknown, haystack: unknown): boolean {
  if (Array.isArray(haystack)) {
    return haystack.some((item) => looseEquals(item, needle));
  }
  if (typeof haystack === 'string') {
    return haystack.includes(String(needle));
  }
  return false;
}

/** A number helper: `undefined` in, or a result that is not finite, gives `undefined`. */
function numeric(
  operation: (value: number) => number
): (value: unknown) => number | undefined {
  return (value) => {
    const number = toFinite(value);
    if (number === undefined) {
      return undefined;
    }
    const result = operation(number);
    return Number.isFinite(result) ? result : undefined;
  };
}

/** The finite numbers among the values. */
function finiteValues(values: unknown[]): number[] {
  return values
    .map((value) => toFinite(value))
    .filter((value): value is number => value !== undefined);
}

/** Whitelisted helper functions callable by bare name. */
const HELPERS: Record<string, (...args: unknown[]) => unknown> = {
  defined: (value) => !hasNoValue(value),
  includes: (haystack, needle) => contains(needle, haystack),
  startsWith: (value, prefix) =>
    typeof value === 'string' && value.startsWith(String(prefix)),
  endsWith: (value, suffix) =>
    typeof value === 'string' && value.endsWith(String(suffix)),
  lower: (value) =>
    hasNoValue(value) ? undefined : String(asFirst(value)).toLowerCase(),
  abs: numeric(Math.abs),
  // An argument-less min/max has no value to report, so it reads as "no
  // value" like a missing tag does, and not as ∓Infinity.
  min: (...values) => {
    const numbers = finiteValues(values);
    return numbers.length ? Math.min(...numbers) : undefined;
  },
  max: (...values) => {
    const numbers = finiteValues(values);
    return numbers.length ? Math.max(...numbers) : undefined;
  },
  round: numeric(Math.round),
  floor: numeric(Math.floor),
  ceil: numeric(Math.ceil),
  Number: (value) => toFinite(value),
  String: (value) => (hasNoValue(value) ? '' : String(value)),
};

function asFirst(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/** The aggregate functions, available where the place gives a list (`over`). */
const AGGREGATES = new Set(['min', 'max', 'sum', 'count']);

/** True when a call node is an aggregate over the list of the place. */
function isAggregateCall(
  node: Extract<ExpressionNode, { type: 'call' }>,
  over: string | undefined
): boolean {
  if (!over || !AGGREGATES.has(node.callee)) {
    return false;
  }
  return node.callee === 'count'
    ? node.args.length <= 1
    : node.args.length === 1;
}

/**
 * Every identifier an expression resolves against its scope, de-duplicated.
 *
 * Only `identifier` nodes are scope lookups. A member chain's property names
 * are not (`instance.ViewCodeSequence` looks up `instance` and then reads a
 * field off whatever that is), and a call's callee is resolved against the
 * helper whitelist rather than the scope — so neither appears here.
 *
 * The expression compiler does not check names against a dictionary: it is
 * generic, and it does not know the subject. A consumer that knows its names
 * does the check with this function, or with {@link collectReads}. The display
 * set split rules do so: an identifier that is not a DICOM keyword of the
 * dictionary and not a context name is a compile error there.
 */
export function collectIdentifiers(node: ExpressionNode): string[] {
  return [...new Set(collectReads(node).map((read) => read.name))];
}

/** One read of a name in an expression. See {@link collectReads}. */
export type ExpressionRead = {
  /** The identifier. */
  name: string;
  /** The property of `name.property`, when the read is a member access. */
  field?: string;
  /** True when the read is inside the argument of an aggregate. */
  inAggregate: boolean;
};

/**
 * Every read of an identifier in an expression, in source order, with the
 * field of a direct member access (`timeClusters.start` gives `start`) and
 * whether the read is inside the argument of an aggregate (`max(Rows)`). Pass
 * `aggregates: true` for a place that compiles with the `over` option.
 */
export function collectReads(
  node: ExpressionNode,
  options: { aggregates?: boolean } = {}
): ExpressionRead[] {
  const reads: ExpressionRead[] = [];
  const over = options.aggregates ? '#' : undefined;

  const walk = (current: ExpressionNode, inAggregate: boolean): void => {
    switch (current.type) {
      case 'literal':
        return;
      case 'identifier':
        reads.push({ name: current.name, inAggregate });
        return;
      case 'member':
        if (current.object.type === 'identifier') {
          reads.push({
            name: current.object.name,
            field: current.property,
            inAggregate,
          });
          return;
        }
        walk(current.object, inAggregate);
        return;
      case 'index':
        walk(current.object, inAggregate);
        walk(current.index, inAggregate);
        return;
      case 'call': {
        const aggregate = inAggregate || isAggregateCall(current, over);
        current.args.forEach((argument) => walk(argument, aggregate));
        return;
      }
      case 'unary':
        walk(current.argument, inAggregate);
        return;
      case 'binary':
      case 'logical':
        walk(current.left, inAggregate);
        walk(current.right, inAggregate);
        return;
      case 'conditional':
        walk(current.test, inAggregate);
        walk(current.consequent, inAggregate);
        walk(current.alternate, inAggregate);
        return;
      case 'array':
        current.elements.forEach((element) => walk(element, inAggregate));
        return;
      case 'template':
        current.parts.forEach((part) => {
          if (part.kind === 'expr') {
            walk(part.node, inAggregate);
          }
        });
        return;
    }
  };

  walk(node, false);
  return reads;
}

/**
 * Throws for the first bare identifier that is not a parameter name, outside
 * the argument of an aggregate (where bare identifiers read the element's
 * fields). Used for an expression compiled with no implicit scope.
 */
function assertOnlyParams(
  node: ExpressionNode,
  paramNames: readonly string[],
  context: NodeContext
): void {
  const allowed = new Set(paramNames);
  for (const read of collectReads(node, { aggregates: !!context.over })) {
    if (!read.inAggregate && !allowed.has(read.name)) {
      throw new ExpressionSyntaxError(
        `'${read.name}' is not a parameter, and this expression has no ` +
          `implicit scope; it can read only (${paramNames.join(', ')})`,
        context.expression
      );
    }
  }
}

function resolveIdentifier(name: string, scope: EvaluationScope): unknown {
  if (Object.prototype.hasOwnProperty.call(scope.params, name)) {
    return scope.params[name];
  }
  // Innermost implicit scope first (aggregate elements shadow the first arg).
  for (let i = scope.implicit.length - 1; i >= 0; i--) {
    const implicitScope = scope.implicit[i];
    if (
      implicitScope != null &&
      typeof implicitScope === 'object' &&
      name in implicitScope
    ) {
      return safeGet(implicitScope, name);
    }
  }
  return undefined;
}

/** `<`, `<=`, `>`, `>=`: `false` unless both sides are finite numbers. */
function compareNumbers(
  test: (a: number, b: number) => boolean
): (left: unknown, right: unknown) => boolean {
  return (left, right) => {
    const a = toFinite(left);
    const b = toFinite(right);
    return a !== undefined && b !== undefined && test(a, b);
  };
}

const COMPARISONS: Record<string, (left: unknown, right: unknown) => boolean> =
  {
    '<': compareNumbers((a, b) => a < b),
    '<=': compareNumbers((a, b) => a <= b),
    '>': compareNumbers((a, b) => a > b),
    '>=': compareNumbers((a, b) => a >= b),
  };

/**
 * The test of `X == <literal>` when the literal is a missing value:
 * `undefined` tests "absent", and `null`, `''` or `[]` test "no value".
 */
function missingValueTest(
  node: ExpressionNode
): ((value: unknown) => boolean) | undefined {
  if (node.type === 'literal') {
    if (isAbsent(node.value)) {
      return isAbsent;
    }
    if (isEmpty(node.value)) {
      return hasNoValue;
    }
  }
  if (node.type === 'array' && !node.elements.length) {
    return hasNoValue;
  }
  return undefined;
}

function compileEquality(
  node: Extract<ExpressionNode, { type: 'binary' }>,
  context: NodeContext
): NodeEvaluator {
  const negate = node.operator === '!=';
  const rightTest = missingValueTest(node.right);
  const leftTest = missingValueTest(node.left);
  if (rightTest || leftTest) {
    const test = rightTest ?? leftTest;
    const operand = compileNode(rightTest ? node.left : node.right, context);
    return negate
      ? (scope) => !test(operand(scope))
      : (scope) => test(operand(scope));
  }
  const left = compileNode(node.left, context);
  const right = compileNode(node.right, context);
  return negate
    ? (scope) => !looseEquals(left(scope), right(scope))
    : (scope) => looseEquals(left(scope), right(scope));
}

function compileAggregate(
  node: Extract<ExpressionNode, { type: 'call' }>,
  context: NodeContext
): NodeEvaluator {
  const { callee } = node;
  const over = context.over as string;
  const element = node.args[0] ? compileNode(node.args[0], context) : undefined;
  return (scope) => {
    const list = scope.params[over];
    const items = Array.isArray(list) ? list : [];
    if (!element) {
      return items.length;
    }
    const values = items.map((item) => {
      scope.implicit.push(item);
      try {
        return element(scope);
      } finally {
        scope.implicit.pop();
      }
    });
    if (callee === 'count') {
      return values.filter((value) => !hasNoValue(value) && value !== false)
        .length;
    }
    const numbers = finiteValues(values);
    if (callee === 'sum') {
      return numbers.reduce((total, value) => total + value, 0);
    }
    if (!numbers.length) {
      return undefined;
    }
    return callee === 'min' ? Math.min(...numbers) : Math.max(...numbers);
  };
}

function compileNode(
  node: ExpressionNode,
  context: NodeContext
): NodeEvaluator {
  const { expression } = context;
  switch (node.type) {
    case 'literal': {
      const { value } = node;
      return () => value;
    }
    case 'identifier': {
      const { name } = node;
      return (scope) => resolveIdentifier(name, scope);
    }
    case 'member': {
      const object = compileNode(node.object, context);
      const { property } = node;
      return (scope) => safeGet(object(scope), property);
    }
    case 'index': {
      const object = compileNode(node.object, context);
      const index = compileNode(node.index, context);
      return (scope) => safeGet(object(scope), index(scope));
    }
    case 'array': {
      const elements = node.elements.map((element) =>
        compileNode(element, context)
      );
      return (scope) => elements.map((element) => element(scope));
    }
    case 'template': {
      const parts: NodeEvaluator[] = node.parts.map((part) =>
        part.kind === 'text' ? () => part.text : compileNode(part.node, context)
      );
      return (scope) =>
        parts
          .map((part) => {
            const value = part(scope);
            return hasNoValue(value) ? '' : String(value);
          })
          .join('');
    }
    case 'unary': {
      const argument = compileNode(node.argument, context);
      switch (node.operator) {
        case '!':
          return (scope) => !argument(scope);
        case '-':
          return (scope) => -Number(argument(scope));
        case '+':
          return (scope) => +Number(argument(scope));
      }
      break;
    }
    case 'logical': {
      const left = compileNode(node.left, context);
      const right = compileNode(node.right, context);
      return node.operator === '&&'
        ? (scope) => left(scope) && right(scope)
        : (scope) => left(scope) || right(scope);
    }
    case 'binary': {
      if (node.operator === '==' || node.operator === '!=') {
        return compileEquality(node, context);
      }
      if (node.operator === '===' || node.operator === '!==') {
        throw new ExpressionSyntaxError(
          `'${node.operator}' is not allowed; use '${node.operator === '===' ? '==' : '!='}', the one equality of the rule language`,
          expression
        );
      }
      const left = compileNode(node.left, context);
      const right = compileNode(node.right, context);
      const comparison = COMPARISONS[node.operator];
      if (comparison) {
        return (scope) => comparison(left(scope), right(scope));
      }
      switch (node.operator) {
        case '+':
          return (scope) => (left(scope) as number) + (right(scope) as number);
        case '-':
          return (scope) => (left(scope) as number) - (right(scope) as number);
        case '*':
          return (scope) => (left(scope) as number) * (right(scope) as number);
        case '/':
          return (scope) => (left(scope) as number) / (right(scope) as number);
        case '%':
          return (scope) => (left(scope) as number) % (right(scope) as number);
        case 'in':
          return (scope) => contains(left(scope), right(scope));
        default:
          throw new ExpressionSyntaxError(
            `Unknown operator '${node.operator}'`,
            expression
          );
      }
    }
    case 'conditional': {
      const test = compileNode(node.test, context);
      const consequent = compileNode(node.consequent, context);
      const alternate = compileNode(node.alternate, context);
      return (scope) => (test(scope) ? consequent(scope) : alternate(scope));
    }
    case 'call': {
      const { callee } = node;
      if (isAggregateCall(node, context.over)) {
        return compileAggregate(node, context);
      }
      if (callee === 'count' || callee === 'sum') {
        throw new ExpressionSyntaxError(
          context.over
            ? `${callee}() takes ${callee === 'count' ? 'zero or one argument' : 'one argument'}`
            : `${callee}() is not available here: this place has no list of instances`,
          expression
        );
      }
      const helper = Object.prototype.hasOwnProperty.call(HELPERS, callee)
        ? HELPERS[callee]
        : undefined;
      if (!helper) {
        throw new ExpressionSyntaxError(
          `'${callee}' is not a whitelisted helper function`,
          expression
        );
      }
      const args = node.args.map((argument) => compileNode(argument, context));
      return (scope) => helper(...args.map((argument) => argument(scope)));
    }
  }
  throw new ExpressionSyntaxError('Unsupported expression node', expression);
}

/**
 * Compiles a safe function expression into a plain closure.
 *
 * The expression grammar is a small, safe subset of JavaScript expressions:
 * literals (numbers, quoted strings, template literals, arrays,
 * true/false/null/undefined), identifiers with guarded member/index access
 * (`__proto__`/`prototype`/`constructor` are rejected), comparison, logical
 * and arithmetic operators, `in` (membership), ternaries, whitelisted helper
 * functions (`defined`, `includes`, `startsWith`, `endsWith`, `lower`, `abs`,
 * `min`, `max`, `round`, `floor`, `ceil`, `Number`, `String`) and, where the
 * place gives a list (`options.over`), the aggregates `min(x)`, `max(x)`,
 * `sum(x)`, `count(x)` and `count()`.
 *
 * The operators use the DICOM meaning of a missing value (see `../values`):
 *
 * - `==` is the only equality, and `===` / `!==` are compile errors. `'1' == 1`
 *   is true.
 * - `X == null` holds when `X` has no value (absent, or `null`, `''`, `[]`).
 *   `X == undefined` holds only when `X` is absent (DICOM Type 3 against
 *   Type 2). `!=` is the opposite of each.
 * - `<`, `<=`, `>` and `>=` give `false` unless both sides are finite numbers
 *   after `toFinite`, so a numeric string is a number and a missing value never
 *   compares as 0.
 * - The number helpers give `undefined` for a value that is not a number.
 * - An aggregate skips an element whose argument has no value (`count(x)` also
 *   skips `false`). `sum` of no element is 0; `min` and `max` of no element
 *   are `undefined`; `count()` is the number of elements.
 *
 * Compilation happens once (CSP-safe — no eval / new Function); evaluation is
 * a closure-tree walk.  Parse errors throw an {@link ExpressionSyntaxError}
 * at compile time; runtime errors warn once and return `undefined`.
 *
 * Calling convention: the compiled function's positional arguments bind to
 * `options.params` (default `['instance', 'context']`).  Bare identifiers
 * resolve parameter names first, then fields of the implicit scope - the
 * first argument unless `options.implicitScope` says otherwise.
 *
 * With an implicit scope, an identifier the subject does not carry resolves to
 * `undefined`. The compiler does not check names: a consumer that knows its
 * names checks them with {@link collectReads}. With `implicitScope: false` the
 * set of names is closed - the parameters - so an unknown bare identifier is a
 * compile-time error.
 */
export function compileExpression(
  source: string,
  options: CompileExpressionOptions = {}
): CompiledExpression {
  const paramNames = options.params ?? ['instance', 'context'];
  const { implicitScope = true, over } = options;
  if (over !== undefined && !paramNames.includes(over)) {
    throw new ExpressionSyntaxError(
      `over '${over}' is not one of the parameters (${paramNames.join(', ')})`,
      source
    );
  }
  let implicitIndex = -1;
  if (implicitScope === true) {
    implicitIndex = 0;
  } else if (typeof implicitScope === 'string') {
    implicitIndex = paramNames.indexOf(implicitScope);
    if (implicitIndex === -1) {
      throw new ExpressionSyntaxError(
        `implicitScope '${implicitScope}' is not one of the parameters (${paramNames.join(', ')})`,
        source
      );
    }
  }
  const context: NodeContext = { expression: source, over };
  const ast = parseExpressionSource(source);
  if (implicitIndex === -1) {
    assertOnlyParams(ast, paramNames, context);
  }
  const evaluator = compileNode(ast, context);
  let warned = false;

  const compiled = ((...args: unknown[]) => {
    const params: Record<string, unknown> = Object.create(null);
    paramNames.forEach((name, index) => {
      params[name] = args[index];
    });
    const scope: EvaluationScope = {
      params,
      implicit: implicitIndex === -1 ? [] : [args[implicitIndex]],
    };
    try {
      return evaluator(scope);
    } catch (error) {
      if (!warned) {
        warned = true;
        console.warn(
          `Safe function expression failed at runtime: ${source}`,
          error
        );
      }
      return undefined;
    }
  }) as CompiledExpression;
  compiled.expressionSource = source;
  return compiled;
}

export { ExpressionSyntaxError };
