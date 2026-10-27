/**
 * The value helpers of the rule language. They use the DICOM meaning of a
 * missing value, and not the JavaScript meaning:
 *
 * | Value                      | Kind   |
 * | -------------------------- | ------ |
 * | `undefined`, or no property | absent |
 * | `null`, `''` or `[]`        | empty  |
 *
 * "No value" means absent or empty. DICOM Type 2 attributes are present and
 * empty; Type 3 attributes can be absent. A naturalizer gives an empty element
 * as `null`, `''` or `[]`, so a test of "does this have a value?" must treat
 * the three in the same way.
 *
 * @module safeFunctions/values
 */

import { toFiniteFirst } from '@cornerstonejs/utils';

/** True when the value is absent: `undefined` (no element). */
export function isAbsent(value: unknown): boolean {
  return value === undefined;
}

/**
 * True when the value is empty: `null`, `''`, `[]`, or an array whose elements
 * all have no value (`['']`, `[null]`, as DICOM JSON can give an empty value).
 */
export function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.every((item) => hasNoValue(item)))
  );
}

/** True when the value is absent or empty. */
export function hasNoValue(value: unknown): boolean {
  return isAbsent(value) || isEmpty(value);
}

/**
 * The `==` of the rule language, and the `equals` operator of `matches`.
 *
 * - Two values with no value are equal only when they are of the same kind:
 *   absent and absent, `null` and `null`, `''` and `''`, or two empty arrays.
 *   So `null == undefined` is false. A value with no value is not equal to a
 *   value that has one. Only the literal tests of the expression compiler
 *   (`X == null`) treat the kinds as one.
 * - A scalar and an array: equal only when the array has one element, and
 *   that element is equal to the scalar. So `['MR'] == 'MR'`, but
 *   `['ORIGINAL', 'LOCALIZER'] == 'LOCALIZER'` is false. Use `in` or
 *   `includes` to test that a value is one of a list.
 * - Two arrays: the same length, and each element equal in order.
 * - A number and a numeric string are equal by value: `'1' == 1`.
 * - Other scalars compare as text, so `'true'` equals `true`.
 *
 * The literal tests `X == null` (no value) and `X == undefined` (absent only)
 * are not this function: the expression compiler gives them their own test.
 */
export function looseEquals(left: unknown, right: unknown): boolean {
  if (hasNoValue(left) || hasNoValue(right)) {
    return emptyKind(left) === emptyKind(right);
  }
  const leftArray = Array.isArray(left);
  const rightArray = Array.isArray(right);
  if (leftArray && rightArray) {
    return (
      left.length === right.length &&
      left.every((element, index) => scalarEquals(element, right[index]))
    );
  }
  if (leftArray) {
    return left.length === 1 && scalarEquals(left[0], right);
  }
  if (rightArray) {
    return right.length === 1 && scalarEquals(left, right[0]);
  }
  return scalarEquals(left, right);
}

/** The equality of two single values, with the no-value rule of {@link looseEquals}. */
function scalarEquals(a: unknown, b: unknown): boolean {
  if (hasNoValue(a) || hasNoValue(b)) {
    return emptyKind(a) === emptyKind(b);
  }
  if (a === b) {
    return true;
  }
  if (typeof a === 'object' || typeof b === 'object') {
    return false;
  }
  if (typeof a === 'number' || typeof b === 'number') {
    const x = toFiniteFirst(a);
    const y = toFiniteFirst(b);
    if (x !== undefined && y !== undefined) {
      return x === y;
    }
  }
  return String(a) === String(b);
}

/** The kind of a value with no value, or `undefined` for a value. */
function emptyKind(value: unknown): string | undefined {
  if (isAbsent(value)) {
    return 'absent';
  }
  if (value === null) {
    return 'null';
  }
  if (value === '') {
    return 'text';
  }
  return isEmpty(value) ? 'array' : undefined;
}

/**
 * A comparison of two finite numbers: `false` unless both values are finite
 * numbers after {@link toFiniteFirst}.
 */
export function compareFinite(
  test: (a: number, b: number) => boolean
): (left: unknown, right: unknown) => boolean {
  return (left, right) => {
    const a = toFiniteFirst(left);
    const b = toFiniteFirst(right);
    return a !== undefined && b !== undefined && test(a, b);
  };
}

/**
 * The truth of a value in the rule language: a value with no value is false,
 * and any other value has its JavaScript truth (`0` and `false` are false).
 */
export function isTrue(value: unknown): boolean {
  return !hasNoValue(value) && Boolean(value);
}
