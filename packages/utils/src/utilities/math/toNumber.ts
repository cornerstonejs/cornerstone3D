import { asArrayFirst } from '../object/asArray';

type NumberLike = string | String | number | Number;

function isNumberLike(value: unknown): value is NumberLike {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    value instanceof String ||
    value instanceof Number
  );
}

/**
 * Answers true for a value that `Array.from` converts entry by entry: an
 * iterable, or an object that carries a numeric `length`.
 */
function isEntryWise(value: unknown): value is ArrayLike<unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    Symbol.iterator in value ||
    typeof (value as ArrayLike<unknown>).length === 'number'
  );
}

/** One value as a finite number; no value, a blank string or a non-number gives `defaultValue`. */
function finiteOrDefault(value: unknown, defaultValue?: number) {
  if (!isNumberLike(value) || String(value).trim() === '') {
    return defaultValue;
  }
  const converted = Number(value);
  return Number.isFinite(converted) ? converted : defaultValue;
}

/**
 * Converts a value to a finite number, returning `defaultValue` if the value is
 * not finite. An array converts entry by entry, and each entry that is not
 * finite becomes `defaultValue`. `defaultValue` also covers a value that cannot
 * convert at all: `undefined`, `null`, a boolean, a plain object, and a blank
 * string. A blank string is the DICOM empty value, so it reads as no value,
 * and not as the `0` that a bare `Number('')` gives.
 *
 * @param value - The value to convert to a finite number
 * @param defaultValue - The number to return for a value that is absent, not
 *   finite, or not convertible. Defaults to `undefined`.
 * @returns The finite number value, or `defaultValue`
 */
export function toFiniteNumber(
  value: NumberLike | null | undefined,
  defaultValue?: undefined
): number | undefined;
export function toFiniteNumber(
  value: NumberLike | null | undefined,
  defaultValue: number
): number;
export function toFiniteNumber<T extends NumberLike>(
  value: ArrayLike<T> | null | undefined,
  defaultValue?: undefined
): number[] | undefined;
export function toFiniteNumber<T extends NumberLike>(
  value: ArrayLike<T> | null | undefined,
  defaultValue: number
): number[];
export function toFiniteNumber<T extends NumberLike>(
  value: T | ArrayLike<T> | null | undefined,
  defaultValue?: number
): number | undefined | number[] {
  if (isNumberLike(value) || !isEntryWise(value)) {
    return finiteOrDefault(value, defaultValue);
  }

  return Array.from(value, (entry) =>
    finiteOrDefault(entry, defaultValue)
  ) as number[];
}

/**
 * The finite number of the first value: `toFiniteNumber` of element 0 of an
 * array, or of the value itself when it is not an array.
 *
 * Use it to read one number from a DICOM attribute that a source can deliver
 * as a single value (`'5'`) or as a multi-valued array (`['5']`). A value with
 * no number gives `defaultValue`, as in {@link toFiniteNumber}.
 *
 * @param value - an array, or a single value
 * @param defaultValue - the number to return when there is no finite number.
 *   Defaults to `undefined`.
 * @returns the finite number of the first value, or `defaultValue`
 */
export function toFiniteFirst(
  value: unknown,
  defaultValue?: undefined
): number | undefined;
export function toFiniteFirst(value: unknown, defaultValue: number): number;
export function toFiniteFirst(
  value: unknown,
  defaultValue?: number
): number | undefined {
  return finiteOrDefault(asArrayFirst(value), defaultValue);
}

/**
 * Exactly `length` finite numbers from a multi-valued value, for example
 * `ImagePositionPatient` (3) or `ImageOrientationPatient` (6), else `undefined`.
 * Each entry converts as in {@link toFiniteNumber}, so a blank or non-numeric
 * entry makes the whole vector `undefined`.
 */
export function toFiniteVector(
  value: unknown,
  length: number
): number[] | undefined {
  if (isNumberLike(value) || !isEntryWise(value)) {
    return undefined;
  }
  const numbers = Array.from(value, (entry) => finiteOrDefault(entry));
  return numbers.length === length && numbers.every((n) => n !== undefined)
    ? (numbers as number[])
    : undefined;
}

/**
 * Coerces DICOM-friendly numeric inputs to number(s).
 *
 * @param val - The javascript object for the specified element in the metadata
 * @returns finite number(s); invalid values are coerced to NaN
 */
export function toNumber(
  val: NumberLike | null | undefined
): number | undefined;
export function toNumber<T extends NumberLike>(
  val: ArrayLike<T> | Iterable<T>
): number[];
export function toNumber(val: unknown): number | number[] | undefined {
  if (val === undefined || val === null) {
    return undefined;
  }

  if (isNumberLike(val)) {
    return Number(val);
  }

  if (Array.isArray(val)) {
    return val.map((entry) => Number(entry));
  }

  if (typeof val === 'object' && Symbol.iterator in val) {
    return Array.from(val as Iterable<unknown>, (entry) => Number(entry));
  }

  return Number(val as NumberLike);
}

export default toNumber;
