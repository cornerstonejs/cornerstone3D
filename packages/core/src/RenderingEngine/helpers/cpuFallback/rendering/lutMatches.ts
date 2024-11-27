import type { CPUFallbackLUT } from '../../../../types';

/**
 * Check if two lookup tables match
 *
 * @param {LUT} a A lookup table function
 * @param {LUT} b Another lookup table function
 * @return {boolean} Whether or not they match
 * @memberof rendering
 */
export default function lutMatches(
  a: CPUFallbackLUT,
  b: CPUFallbackLUT
): boolean {
  // If undefined, they are equal
  if (!a && !b) {
    return true;
  }
  // If one is undefined, not equal
  if (!a || !b) {
    return false;
  }

  // Check the unique ids
  return a.id === b.id;
}
