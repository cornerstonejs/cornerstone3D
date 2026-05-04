/**
 * Converts a value to a finite number, returning undefined if the value is not finite.
 *
 * @param value - The value to convert to a finite number
 * @returns The finite number value, or undefined if the value is not finite
 */
export function toFiniteNumber(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Returns the values as an array of javascript numbers
 *
 * @param val - The javascript object for the specified element in the metadata
 * @returns the value converted to number(s)
 */
export function toNumber<T>(
  val: T | T[]
): number | undefined | Array<number | undefined> {
  if (Array.isArray(val)) {
    return [...val].map((v) => (v !== undefined ? Number(v) : v));
  }

  return val !== undefined ? Number(val) : val;
}

export default toNumber;
