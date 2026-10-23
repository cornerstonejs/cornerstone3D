import {
  DEFINED_LITERAL,
  FORBIDDEN_PROPERTIES,
  parseExpressionSource,
} from './parser';
import type { ExpressionNode } from './parser';
import { ExpressionSyntaxError } from './tokenizer';
import { asArrayFirst, toFiniteFirst } from '@cornerstonejs/utils';
import { MATCH_HELPERS } from '../matchTests';
import { RuleCompileError } from '../schema';
import {
  compareFinite,
  hasNoValue,
  isAbsent,
  isEmpty,
  isTrue,
  looseEquals,
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
  /** The receivers of the aggregates at the place, and their parameters. */
  receivers?: Readonly<Record<string, string>>;
  /** The message of a receiver that the place does not give. */
  unavailable?: Readonly<Record<string, string>>;
  /** True inside the argument of an aggregate, where an aggregate is refused. */
  inAggregate?: boolean;
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
   * Inside the argument of an aggregate (see `receivers`) bare identifiers
   * always read the fields of the element, whatever this option says.
   */
  implicitScope?: boolean | string;
  /**
   * The receivers of the aggregates at the place, and the parameter that holds
   * the list of each one: `{ series: 'instances' }` makes
   * `series.instances.max(x)`, `.min(x)`, `.sum(x)`, `.count(x)` and
   * `.count()` run over the list of the parameter `instances`. The argument
   * is evaluated one time for each element, with the element as the innermost
   * implicit scope. A receiver that is not here is a compile error.
   */
  receivers?: Readonly<Record<string, string>>;
  /** The error message for a receiver that the place does not give. */
  unavailableReceivers?: Readonly<Record<string, string>>;
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

/** A number helper: `undefined` in, or a result that is not finite, gives `undefined`. */
function numeric(
  operation: (value: number) => number
): (value: unknown) => number | undefined {
  return (value) => {
    const number = toFiniteFirst(value);
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
    .map((value) => toFiniteFirst(value))
    .filter((value): value is number => value !== undefined);
}

/** Whitelisted helper functions callable by bare name. */
const HELPERS: Record<string, (...args: unknown[]) => unknown> = {
  // The meanings of the operators of the same names (see `matchTests.ts`).
  includes: MATCH_HELPERS.includes,
  contains: MATCH_HELPERS.contains,
  startsWith: MATCH_HELPERS.startsWith,
  endsWith: MATCH_HELPERS.endsWith,
  lower: (value) =>
    hasNoValue(value) ? undefined : String(asArrayFirst(value)).toLowerCase(),
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
  Number: (value) => toFiniteFirst(value),
  String: (value) => (hasNoValue(value) ? '' : String(value)),
};

/** The aggregate functions: `series.instances.max(x)`. */
const AGGREGATES = new Set(['min', 'max', 'sum', 'count']);

/** True when a call node is an aggregate: it has a receiver. */
function isAggregateCall(
  node: Extract<ExpressionNode, { type: 'call' }>
): boolean {
  return node.receiver !== undefined;
}

/** True for a bare aggregate: `max(x)` with one argument, `count()`, `sum(x)`. */
function isBareAggregate(
  node: Extract<ExpressionNode, { type: 'call' }>
): boolean {
  if (node.receiver !== undefined || !AGGREGATES.has(node.callee)) {
    return false;
  }
  return node.callee === 'min' || node.callee === 'max'
    ? node.args.length === 1
    : true;
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
  /** True when the read is an index access, `name[...]`. */
  indexed?: boolean;
};

/**
 * Every read of an identifier in an expression, in source order, with the
 * field of a direct member access (`timeClusters.start` gives `start`) and
 * whether the read is inside the argument of an aggregate (`max(Rows)`). Pass
 * `aggregates: true` for a place that compiles with `receivers`.
 */
export function collectReads(
  node: ExpressionNode,
  options: { aggregates?: boolean } = {}
): ExpressionRead[] {
  const reads: ExpressionRead[] = [];

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
        if (current.object.type === 'identifier') {
          reads.push({
            name: current.object.name,
            indexed: true,
            inAggregate,
          });
        } else {
          walk(current.object, inAggregate);
        }
        walk(current.index, inAggregate);
        return;
      case 'call': {
        const aggregate =
          inAggregate || (!!options.aggregates && isAggregateCall(current));
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
  for (const read of collectReads(node, {
    aggregates: !!context.receivers,
  })) {
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
const COMPARISONS: Record<string, (left: unknown, right: unknown) => boolean> =
  {
    '<': compareFinite((a, b) => a < b),
    '<=': compareFinite((a, b) => a <= b),
    '>': compareFinite((a, b) => a > b),
    '>=': compareFinite((a, b) => a >= b),
  };

/**
 * `- * / %`: both sides are numbers after `toFiniteFirst`, so `'6' - 1` is 5. No
 * value, a value that is not a number, or a result that is not finite gives
 * `undefined`, and never 0 or `NaN`. A text literal operand is a compile error
 * (see {@link isTextOperand}). `+` is {@link plus}.
 */
function arithmetic(
  operation: (a: number, b: number) => number
): (left: unknown, right: unknown) => number | undefined {
  return (left, right) => {
    const a = toFiniteFirst(left);
    const b = toFiniteFirst(right);
    if (a === undefined || b === undefined) {
      return undefined;
    }
    const result = operation(a, b);
    return Number.isFinite(result) ? result : undefined;
  };
}

/**
 * `+` follows the type of its left operand.
 *
 * - Text on the left joins, `''` included: `'2' + 3` is `'23'`, and
 *   `'' + Rows` is `'512'`. No value on the right joins as `''`, so
 *   `'b=' + B` is `'b='` when `B` is absent.
 * - No value on the left (absent or `null`) gives `undefined`, so arithmetic
 *   on a missing attribute stays "no value". Write `'' + B + 5` to join.
 * - Any other left operand adds as a number: `3 + '2'` is 5, and
 *   `0 + '2' + 3` is 5. No value on the right gives `undefined`. A number plus
 *   text that is not a number (`Rows + 'x'`) throws, so the expression warns
 *   once and gives `undefined`.
 */
function plus(left: unknown, right: unknown): unknown {
  const first = asArrayFirst(left);
  if (typeof first === 'string') {
    return first + (hasNoValue(right) ? '' : String(asArrayFirst(right)));
  }
  if (hasNoValue(left) || hasNoValue(right)) {
    return undefined;
  }
  const a = toFiniteFirst(left);
  const b = toFiniteFirst(right);
  if (a === undefined || b === undefined) {
    throw new TypeError(
      `'+' adds numbers when the left side is not text, and ${JSON.stringify(
        a === undefined ? left : right
      )} is not a number; put the text first, or use a template`
    );
  }
  const result = a + b;
  return Number.isFinite(result) ? result : undefined;
}

/**
 * True for an operand that is always text: a template literal, or a string
 * literal that is not a number. `- * / %` give `undefined` for it, so the
 * compiler rejects it.
 */
function isTextOperand(node: ExpressionNode): boolean {
  if (node.type === 'template') {
    return true;
  }
  return (
    node.type === 'literal' &&
    typeof node.value === 'string' &&
    toFiniteFirst(node.value) === undefined
  );
}

const ARITHMETIC: Record<string, (left: unknown, right: unknown) => unknown> = {
  '+': plus,
  '-': arithmetic((a, b) => a - b),
  '*': arithmetic((a, b) => a * b),
  '/': arithmetic((a, b) => a / b),
  '%': arithmetic((a, b) => a % b),
};

/**
 * The test of `X == <literal>` when the literal names a kind of value:
 * `undefined` tests "absent", `null` (or `''`) tests "no value", and
 * `defined` tests "has a value".
 */
function missingValueTest(
  node: ExpressionNode
): ((value: unknown) => boolean) | undefined {
  if (node.type === 'literal') {
    if (node.value === DEFINED_LITERAL) {
      return (value) => !hasNoValue(value);
    }
    if (isAbsent(node.value)) {
      return isAbsent;
    }
    if (isEmpty(node.value)) {
      return hasNoValue;
    }
  }
  return undefined;
}

/** `X == []` is a compile error: an empty array literal accepts no value. */
function rejectEmptyArrayLiteral(
  node: Extract<ExpressionNode, { type: 'binary' }>,
  context: NodeContext
): void {
  for (const side of [node.left, node.right]) {
    if (side.type === 'array' && !side.elements.length) {
      throw new ExpressionSyntaxError(
        `'${node.operator} []' accepts no value; give one or more values, or use '${node.operator} null' to test for no value`,
        context.expression
      );
    }
  }
}

/**
 * `==` and `!=`, with the meaning of {@link looseEquals}: a scalar against an
 * array is "in", and two arrays are equal element by element, in order.
 */
function compileEquality(
  node: Extract<ExpressionNode, { type: 'binary' }>,
  context: NodeContext
): NodeEvaluator {
  const negate = node.operator === '!=';
  rejectEmptyArrayLiteral(node, context);
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
  const over = context.receivers[node.receiver];
  const element = node.args[0]
    ? compileNode(node.args[0], { ...context, inAggregate: true })
    : undefined;
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
      if (value === DEFINED_LITERAL) {
        throw new ExpressionSyntaxError(
          "'defined' is a literal for '== defined' and '!= defined' only",
          expression
        );
      }
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
          return (scope) => !isTrue(argument(scope));
        case '-': {
          const negate = numeric((value) => -value);
          return (scope) => negate(argument(scope));
        }
        case '+':
          return (scope) => toFiniteFirst(argument(scope));
      }
      break;
    }
    case 'logical': {
      const left = compileNode(node.left, context);
      const right = compileNode(node.right, context);
      // A boolean, and no value is false: `Rows && Rows > 1000` is `false`
      // when Rows is absent.
      return node.operator === '&&'
        ? (scope) => isTrue(left(scope)) && isTrue(right(scope))
        : (scope) => isTrue(left(scope)) || isTrue(right(scope));
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
      if (ARITHMETIC[node.operator] && node.operator !== '+') {
        const text = [node.left, node.right].find(isTextOperand);
        if (text) {
          throw new ExpressionSyntaxError(
            `'${node.operator}' works on numbers only, and ${text.type === 'template' ? 'a template literal' : `'${String((text as { value: unknown }).value)}'`} is not a number`,
            expression
          );
        }
      }
      const left = compileNode(node.left, context);
      const right = compileNode(node.right, context);
      const comparison = COMPARISONS[node.operator];
      if (comparison) {
        return (scope) => comparison(left(scope), right(scope));
      }
      const operation = ARITHMETIC[node.operator];
      if (operation) {
        return (scope) => operation(left(scope), right(scope));
      }
      if (node.operator === 'in') {
        // `X in list` has the meaning of `includes(list, X)`.
        return (scope) => MATCH_HELPERS.includes(right(scope), left(scope));
      }
      throw new ExpressionSyntaxError(
        `Unknown operator '${node.operator}'`,
        expression
      );
    }
    case 'conditional': {
      const test = compileNode(node.test, context);
      const consequent = compileNode(node.consequent, context);
      const alternate = compileNode(node.alternate, context);
      return (scope) =>
        isTrue(test(scope)) ? consequent(scope) : alternate(scope);
    }
    case 'call': {
      const { callee } = node;
      if (isAggregateCall(node)) {
        const { receiver } = node;
        if (
          !Object.prototype.hasOwnProperty.call(
            context.receivers ?? {},
            receiver
          )
        ) {
          throw new ExpressionSyntaxError(
            context.unavailable?.[receiver] ??
              `${receiver}.instances.${callee}() is not available here`,
            expression
          );
        }
        if (context.inAggregate) {
          // Each level multiplies the work by the number of instances.
          throw new ExpressionSyntaxError(
            `${receiver}.instances.${callee}() is not allowed inside the argument of another aggregate; put the inner aggregate in its own context entry, and read that name`,
            expression
          );
        }
        const arity = node.args.length;
        if (callee === 'count' ? arity > 1 : arity !== 1) {
          throw new ExpressionSyntaxError(
            `${receiver}.instances.${callee}() takes ${callee === 'count' ? 'zero or one argument' : 'one argument'}`,
            expression
          );
        }
        return compileAggregate(node, context);
      }
      if (isBareAggregate(node)) {
        const places = Object.keys(context.receivers ?? {}).map(
          (receiver) => `${receiver}.instances.${callee}(...)`
        );
        throw new ExpressionSyntaxError(
          places.length
            ? `${callee}(...) needs a receiver; use ${places.join(' or ')}`
            : `${callee}(...) is not available here: this place has no list of instances`,
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
 * functions (`defined`, `includes`, `contains`, `startsWith`, `endsWith`,
 * `lower`, `abs`,
 * `min`, `max`, `round`, `floor`, `ceil`, `Number`, `String`) and, where the
 * place gives a receiver (`options.receivers`), the aggregates
 * `series.instances.min(x)`, `.max(x)`, `.sum(x)`, `.count(x)` and `.count()`.
 * A bare one-argument `min(x)`, `max(x)`, `sum(x)`, `count(x)` or `count()` is
 * a compile error; `min(a, b)` and `max(a, b)` compare their arguments.
 *
 * The operators use the DICOM meaning of a missing value (see `../values`):
 *
 * - `==` is the only equality, and `===` / `!==` are compile errors. `'1' == 1`
 *   is true.
 * - `==` between a scalar and an array is "in": `X == ['MR', 'CT']` holds when
 *   `X` is one of the elements, on either side. Two arrays are equal when
 *   they have the same elements in the same order. `!=` is the negation. An
 *   empty array literal is a compile error.
 * - The literal tests: `X == undefined` holds when `X` is absent; `X == null`
 *   holds when `X` has no value (absent, or `null`, `''`, `[]`); `X == defined`
 *   holds when `X` has a value. `!=` is the opposite of each. Two values
 *   compared with `==` are equal only when both have a value and are equal, or
 *   both have no value of the same kind: `null == undefined` is false when
 *   both sides are values.
 * - `<`, `<=`, `>` and `>=` give `false` unless both sides are finite numbers
 *   after `toFiniteFirst`, so a numeric string is a number and a missing value never
 *   compares as 0.
 * - `-`, `*`, `/` and `%` read both sides with `toFiniteFirst`, so `'6' - 1`
 *   is 5. No value, or a value that is not a number, gives `undefined`. `+`
 *   follows the type of its left operand (see {@link plus}): `'2' + 3` is
 *   `'23'`, and `3 + '2'` is 5.
 * - `!`, `&&`, `||` and `?:` read no value as false; `&&` and `||` give a
 *   boolean.
 * - `includes`, `contains`, `startsWith`, `endsWith` and `in` have the meaning
 *   of the operators of the same names: `includes` tests whole elements.
 * - The number helpers give `undefined` for a value that is not a number.
 * - An aggregate skips an element whose argument has no value (`count(x)` also
 *   skips `false`). An aggregate inside the argument of another aggregate is a
 *   compile error. `sum` of no element is 0; `min` and `max` of no element
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
  const { implicitScope = true, receivers, unavailableReceivers } = options;
  for (const [receiver, param] of Object.entries(receivers ?? {})) {
    if (!paramNames.includes(param)) {
      throw new ExpressionSyntaxError(
        `the list '${param}' of the receiver '${receiver}' is not one of the parameters (${paramNames.join(', ')})`,
        source
      );
    }
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
  const context: NodeContext = {
    expression: source,
    receivers,
    unavailable: unavailableReceivers,
  };
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
      if (error instanceof RuleCompileError) {
        throw error;
      }
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
