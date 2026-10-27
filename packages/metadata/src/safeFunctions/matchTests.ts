/**
 * The **tests** of a condition map: what one entry `name: test` checks on the
 * value of the name.
 *
 * | Test                     | The entry holds when                                     |
 * | ------------------------ | -------------------------------------------------------- |
 * | a scalar                 | the value is equal to the scalar, with `==`              |
 * | an array of scalars      | shorthand for `includes`: one value is in the array       |
 * | `null`                   | the value has no value: absent or empty                  |
 * | an object, one operator  | the operator holds (see {@link MATCH_OPERATORS})          |
 * | a function               | `test(value, subject, context)` is true                  |
 *
 * The operators have the names of the OHIF hanging protocol constraints.
 * `equals` compares the whole value: an array operand equals an array value
 * element by element. `notNull` is the opposite of `null`, `includes` accepts
 * a scalar operand. `greaterThan` / `lessThan` are strict, and
 * `greaterThanOrEqual` / `lessThanOrEqual` include the limit; the four read a
 * numeric string or the first element of an array as a number. A test on no
 * value fails, and the `does...Not` form holds.
 *
 * @module safeFunctions/matchTests
 */

import { asArray, toFiniteFirst } from '@cornerstonejs/utils';
import { compareFinite, hasNoValue, looseEquals } from './values';
import { invalidAt, matchForm, matchTestShape } from './schema';
import type { SchemaSite } from './schema';

/** A compiled test of one value. */
export type ValueTest = (
  value: unknown,
  subject?: unknown,
  context?: unknown
) => boolean;

type Operator = {
  /** What the operand must be, for the error message. */
  readonly operand: string;
  readonly accepts: (operand: unknown) => boolean;
  readonly compile: (operand: unknown) => ValueTest;
};

const isScalar = (value: unknown): boolean =>
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isScalarOrScalars = (value: unknown): boolean =>
  isScalar(value) ||
  (Array.isArray(value) && value.length > 0 && value.every(isScalar));

const isTextOrTexts = (value: unknown): boolean =>
  typeof value === 'string' ||
  (Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string'));

/** The elements of a value: a single value is a one-element array. */
const elementsOf = (value: unknown): unknown[] =>
  hasNoValue(value) ? [] : asArray(value).filter((item) => !hasNoValue(item));

const textsOf = (value: unknown, ignoreCase = false): string[] =>
  elementsOf(value).map((item) =>
    ignoreCase ? String(item).toLowerCase() : String(item)
  );

const needlesOf = (operand: unknown, ignoreCase = false): string[] =>
  asArray(operand).map((item) =>
    ignoreCase ? String(item).toLowerCase() : String(item)
  );

/** The scalar test, and `null` for "no value". */
function equalsTest(operand: unknown): ValueTest {
  return operand === null
    ? (value) => hasNoValue(value)
    : (value) => looseEquals(value, operand);
}

/** A list of at most this many elements keeps the loop. */
const SET_MIN_LENGTH = 9;
const stringSets = new WeakMap<
  readonly unknown[],
  ReadonlySet<string> | null
>();

/**
 * The cached `Set` of a stable array of more than 8 non-empty strings, else
 * `null`. The array is the key, so it must not change after the compile. The
 * compile holds its own copy of each array of a rule and of the context, and
 * folds an array literal of literals into one array.
 */
function stringSetOf(list: unknown): ReadonlySet<string> | null {
  if (!Array.isArray(list) || list.length < SET_MIN_LENGTH) {
    return null;
  }
  let set = stringSets.get(list);
  if (set === undefined) {
    set = list.every((element) => typeof element === 'string' && element)
      ? new Set(list as string[])
      : null;
    stringSets.set(list, set);
  }
  return set;
}

/**
 * True when one of `items` equals an element of `list` with
 * {@link looseEquals}. `list` is the stable side of the membership test.
 *
 * With a `Set` of `list`, a string and a boolean (as `'true'` / `'false'`)
 * look up the `Set`. That gives the result of `looseEquals`, which compares two
 * non-empty texts as `String(a) === String(b)`. A number, or an item of
 * another kind, keeps the loop, so `1` still equals `'1'` and `'01'`.
 */
function someInList(items: readonly unknown[], list: unknown): boolean {
  const set = stringSetOf(list);
  const elements = set ? (list as readonly unknown[]) : elementsOf(list);
  return items.some((item) =>
    set && (typeof item === 'string' || typeof item === 'boolean')
      ? set.has(String(item))
      : elements.some((element) => looseEquals(item, element))
  );
}

function includesTest(operand: unknown): ValueTest {
  const wanted = [...asArray(operand)];
  stringSetOf(wanted);
  return (value) => someInList(elementsOf(value), wanted);
}

function textTest(
  ignoreCase: boolean,
  test: (text: string, needle: string) => boolean
): (operand: unknown) => ValueTest {
  return (operand) => {
    const needles = needlesOf(operand, ignoreCase);
    return (value) =>
      textsOf(value, ignoreCase).some((text) =>
        needles.some((needle) => test(text, needle))
      );
  };
}

const not =
  (compile: (operand: unknown) => ValueTest) =>
  (operand: unknown): ValueTest => {
    const test = compile(operand);
    return (value, subject, context) => !test(value, subject, context);
  };

function numberTest(
  test: (value: number, operand: number) => boolean
): (operand: unknown) => ValueTest {
  const compare = compareFinite(test);
  return (operand) => (value) => compare(value, operand);
}

const contains = textTest(false, (text, needle) => text.includes(needle));
const containsI = textTest(true, (text, needle) => text.includes(needle));
const startsWith = textTest(false, (text, needle) => text.startsWith(needle));
const endsWith = textTest(false, (text, needle) => text.endsWith(needle));

/**
 * The operator meanings as functions of a value and an operand, for the
 * expression helpers of the same names. So `includes(ImageType, 'LOCALIZER')`
 * and `{ "includes": "LOCALIZER" }` give the same result.
 */
export const MATCH_HELPERS = Object.freeze({
  // The value is the stable side: `X in list` calls includes(list, X).
  includes: (value: unknown, operand: unknown) =>
    someInList(elementsOf(operand), value),
  contains: (value: unknown, operand: unknown) => contains(operand)(value),
  startsWith: (value: unknown, operand: unknown) => startsWith(operand)(value),
  endsWith: (value: unknown, operand: unknown) => endsWith(operand)(value),
});

/**
 * The operators of a test, by name: the operand each one accepts, and its
 * meaning. A test on no value fails, except for `doesNotEqual`,
 * `doesNotInclude`, `doesNotContain`, `doesNotContainI` and
 * `{ "notNull": false }`, which hold.
 */
export const MATCH_OPERATORS: Readonly<Record<string, Operator>> =
  Object.freeze({
    equals: {
      operand: 'a scalar, a non-empty array of scalars, or null',
      accepts: (operand) => operand === null || isScalarOrScalars(operand),
      compile: equalsTest,
    },
    doesNotEqual: {
      operand: 'a scalar, a non-empty array of scalars, or null',
      accepts: (operand) => operand === null || isScalarOrScalars(operand),
      compile: not(equalsTest),
    },
    notNull: {
      operand: 'a boolean',
      accepts: (operand) => typeof operand === 'boolean',
      compile: (operand) =>
        operand ? (value) => !hasNoValue(value) : (value) => hasNoValue(value),
    },
    includes: {
      operand: 'a scalar, or a non-empty array of scalars',
      accepts: isScalarOrScalars,
      compile: includesTest,
    },
    doesNotInclude: {
      operand: 'a scalar, or a non-empty array of scalars',
      accepts: isScalarOrScalars,
      compile: not(includesTest),
    },
    greaterThan: {
      operand: 'a finite number',
      accepts: isFiniteNumber,
      compile: numberTest((value, operand) => value > operand),
    },
    greaterThanOrEqual: {
      operand: 'a finite number',
      accepts: isFiniteNumber,
      compile: numberTest((value, operand) => value >= operand),
    },
    lessThan: {
      operand: 'a finite number',
      accepts: isFiniteNumber,
      compile: numberTest((value, operand) => value < operand),
    },
    lessThanOrEqual: {
      operand: 'a finite number',
      accepts: isFiniteNumber,
      compile: numberTest((value, operand) => value <= operand),
    },
    range: {
      operand: 'an array of two finite numbers',
      accepts: (operand) =>
        Array.isArray(operand) &&
        operand.length === 2 &&
        operand.every(isFiniteNumber),
      compile: (operand) => {
        const [a, b] = operand as number[];
        const low = Math.min(a, b);
        const high = Math.max(a, b);
        return (value) => {
          const number = toFiniteFirst(value);
          return number !== undefined && number >= low && number <= high;
        };
      },
    },
    contains: {
      operand: 'a string, or a non-empty array of strings',
      accepts: isTextOrTexts,
      compile: contains,
    },
    containsI: {
      operand: 'a string, or a non-empty array of strings',
      accepts: isTextOrTexts,
      compile: containsI,
    },
    doesNotContain: {
      operand: 'a string, or a non-empty array of strings',
      accepts: isTextOrTexts,
      compile: not(contains),
    },
    doesNotContainI: {
      operand: 'a string, or a non-empty array of strings',
      accepts: isTextOrTexts,
      compile: not(containsI),
    },
    containsAll: {
      operand: 'a scalar, or a non-empty array of scalars',
      accepts: isScalarOrScalars,
      compile: (operand) => {
        const wanted = asArray(operand);
        return (value) => {
          const elements = elementsOf(value);
          return (
            elements.length > 0 &&
            wanted.every((element) =>
              elements.some((item) => looseEquals(item, element))
            )
          );
        };
      },
    },
    startsWith: {
      operand: 'a string, or a non-empty array of strings',
      accepts: isTextOrTexts,
      compile: startsWith,
    },
    endsWith: {
      operand: 'a string, or a non-empty array of strings',
      accepts: isTextOrTexts,
      compile: endsWith,
    },
  });

/**
 * Compiles the test of one entry of a condition map. See the table of this
 * module for the forms.
 *
 * @throws when the test is not one of the forms, or an operand is not of the
 *   kind its operator accepts.
 */
export function compileMatchTest(test: unknown, site: SchemaSite): ValueTest {
  if (typeof test === 'function') {
    return test as ValueTest;
  }
  if (test === null || isScalar(test)) {
    return equalsTest(test);
  }
  if (Array.isArray(test)) {
    if (!test.length || !test.every(isScalar)) {
      return invalidAt(
        site,
        'an array test must hold one or more scalars',
        test
      );
    }
    // Shorthand for `includes`: a single value is one of the elements, and a
    // multi-valued value has one element in common with the array.
    return includesTest(test);
  }
  if (!test || typeof test !== 'object') {
    return invalidAt(
      site,
      'expected a scalar, an array of scalars, null, an object with one operator, or a function',
      test
    );
  }
  matchForm(matchTestShape, test, site);
  const [name, operand] = Object.entries(test)[0];
  const operator = MATCH_OPERATORS[name];
  if (!operator.accepts(operand)) {
    return invalidAt(
      site,
      `the operand of ${name} must be ${operator.operand}`,
      test
    );
  }
  return operator.compile(operand);
}
