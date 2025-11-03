/**
 * Returns true when `value` is not a finite number.
 * No coercion is performed.
 *
 * Flags:
 * - `NaN`, `Infinity`, `-Infinity`
 * - `null`, `undefined`
 * - Any non-number type (e.g., string, boolean, object)
 *
 * @example isInvalidNumber(42)            // false
 * @example isInvalidNumber(42.5)          // false
 * @example isInvalidNumber(NaN)           // true
 * @example isInvalidNumber(Infinity)      // true
 * @example isInvalidNumber('42')          // true
 * @example isInvalidNumber(null)          // true
 * @example isInvalidNumber(undefined)     // true
 * @returns boolean indicating invalidity
 */
export const isInvalidNumber = (value: unknown): boolean => {
  // Explicitly test value type before finiteness check for clarity, even though it's not necessary
  return !(typeof value === 'number' && Number.isFinite(value));
};
