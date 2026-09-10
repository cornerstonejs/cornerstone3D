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

/**
 * Converts a value to a finite number, returning `defaultValue` if the value is
 * not finite. An array converts entry by entry, and each entry that is not
 * finite becomes `defaultValue`.
 *
 * `defaultValue` also covers a value that this function cannot convert at all:
 * `undefined`, `null`, a boolean, and a plain object. An earlier version threw
 * on `null` and answered `[]` for the other three.
 *
 * @param value - The value to convert to a finite number
 * @param defaultValue - The number to return for a value that is absent, or not
 *   finite, or not convertible. The default is `undefined`, so a call without
 *   this argument keeps the answer of the earlier version for every value that
 *   the earlier version converted.
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
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (isNumberLike(value)) {
    const converted = Number(value);
    return Number.isFinite(converted) ? converted : defaultValue;
  }

  if (!isEntryWise(value)) {
    return defaultValue;
  }

  return Array.from(value, (entry) => {
    const converted = Number(entry);
    return Number.isFinite(converted) ? converted : defaultValue;
  }) as number[];
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
