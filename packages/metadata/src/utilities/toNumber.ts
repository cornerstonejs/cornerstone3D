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
 * @returns {*}
 */
export function toNumber(val) {
  if (Array.isArray(val)) {
    return [...val].map((v) => (v !== undefined ? Number(v) : v));
  } else {
    return val !== undefined ? Number(val) : val;
  }
}

export default toNumber;
