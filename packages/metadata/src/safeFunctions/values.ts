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

import { asArrayFirst } from '@cornerstonejs/utils';

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
 * Finite numeric value of an attribute, or `undefined`.
 *
 * Deliberately not a bare `Number(...)`: that maps `null`, `''` and whitespace
 * to `0`, which would make a missing attribute compare as a real zero. A
 * numeric string is a number, and a multi-valued attribute gives its first
 * value.
 */
export function toFinite(value: unknown): number | undefined {
  if (hasNoValue(value)) {
    return undefined;
  }
  const numeric = asArrayFirst(value);
  if (
    typeof numeric === 'boolean' ||
    numeric === null ||
    (typeof numeric === 'string' && numeric.trim() === '')
  ) {
    return undefined;
  }
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * The `==` of the rule language, and the scalar test of `matches`.
 *
 * - Two values with no value are equal. A value with no value is not equal to
 *   a value that has one.
 * - A multi-valued attribute compares on its first value, so `['MR']` equals
 *   `'MR'`.
 * - A number and a numeric string are equal by value: `'1' == 1`.
 * - Other scalars compare as text, so `'true'` equals `true`.
 *
 * The literal tests `X == null` (no value) and `X == undefined` (absent only)
 * are not this function: the expression compiler gives them their own test.
 */
export function looseEquals(left: unknown, right: unknown): boolean {
  if (hasNoValue(left) || hasNoValue(right)) {
    return hasNoValue(left) && hasNoValue(right);
  }
  const a = asArrayFirst(left);
  const b = asArrayFirst(right);
  if (a === b) {
    return true;
  }
  if (hasNoValue(a) || hasNoValue(b)) {
    return false;
  }
  if (typeof a === 'object' || typeof b === 'object') {
    return false;
  }
  if (typeof a === 'number' || typeof b === 'number') {
    const x = toFinite(a);
    const y = toFinite(b);
    if (x !== undefined && y !== undefined) {
      return x === y;
    }
  }
  return String(a) === String(b);
}

/**
 * A comparison of two finite numbers: `false` unless both values are finite
 * numbers after {@link toFinite}.
 */
export function compareFinite(
  test: (a: number, b: number) => boolean
): (left: unknown, right: unknown) => boolean {
  return (left, right) => {
    const a = toFinite(left);
    const b = toFinite(right);
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
