/**
 * Converts a value to a finite number, returning undefined if the value is not finite.
 *
 * @param value - The value to convert to a finite number
 * @returns The finite number value, or undefined if the value is not finite
 */
export function toFiniteNumber(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? value : undefined;
}
