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
 * Converts a value to a finite number, returning undefined if the value is not finite.
 *
 * @param value - The value to convert to a finite number
 * @returns The finite number value, or undefined if the value is not finite
 */
export function toFiniteNumber(
  value: NumberLike | undefined
): number | undefined;
export function toFiniteNumber<T extends NumberLike>(
  value: ArrayLike<T> | undefined
): number[] | undefined;
export function toFiniteNumber<T extends NumberLike>(
  value: T | ArrayLike<T> | undefined
): number | undefined | number[] {
  if (value === undefined) {
    return undefined;
  }

  if (isNumberLike(value)) {
    const converted = Number(value);
    return Number.isFinite(converted) ? converted : undefined;
  }

  return Array.from(value, (entry) => {
    const converted = Number(entry);
    return Number.isFinite(converted) ? converted : undefined;
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
