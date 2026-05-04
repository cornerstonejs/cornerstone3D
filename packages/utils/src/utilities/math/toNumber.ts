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
export function toFiniteNumber(value: NumberLike): number | undefined;
export function toFiniteNumber<T extends NumberLike>(
  value: ArrayLike<T>
): Array<number | undefined>;
export function toFiniteNumber<T extends NumberLike>(
  value: T | ArrayLike<T>
): number | undefined | Array<number | undefined> {
  if (isNumberLike(value)) {
    const converted = Number(value);
    return Number.isFinite(converted) ? converted : undefined;
  }

  return Array.from(value, (entry) => {
    const converted = Number(entry);
    return Number.isFinite(converted) ? converted : undefined;
  });
}

/**
 * Coerces DICOM-friendly numeric inputs to number(s).
 *
 * @param val - The javascript object for the specified element in the metadata
 * @returns finite number(s); invalid values are coerced to NaN
 */
export function toNumber(val: NumberLike): number;
export function toNumber<T extends NumberLike>(val: ArrayLike<T>): number[];
export function toNumber<T extends NumberLike>(
  val: T | ArrayLike<T>
): number | number[] {
  if (isNumberLike(val)) {
    return Number(val);
  }

  return Array.from(val, (entry) => Number(entry));
}

export default toNumber;
