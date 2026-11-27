import { EPSILON } from '@kitware/vtk.js/Common/Core/Math/Constants';
import type { VOIRange } from '../types/voi';

/**
 * Lower bound for the epsilon, used when `lower` is (near) zero. At zero the
 * shift is zero, so float32 only has to hold the scale.
 */
export const VOI_RANGE_MIN_EPSILON = 1e-12;

/**
 * Returns the width to add to a zero-width VOI range whose lower bound is
 * `value`: `|value| × EPSILON` (vtk, 1e-6), and at least
 * {@link VOI_RANGE_MIN_EPSILON}.
 *
 * `value + ε` must be at or below the next possible pixel value, so that this
 * value renders white. A fixed width of 1 fails for a near-zero RescaleSlope
 * (PT with slope ~1e-10). ε must also stay above the float32 resolution of the
 * GPU shader, which uses a scale of `1 / (upper - lower)` and a shift of
 * `-lower`. A relative factor of 1e-7 or less loses the range in float32.
 */
export function getVOIRangeEpsilon(value: number): number {
  return Math.max(Math.abs(value) * EPSILON, VOI_RANGE_MIN_EPSILON);
}

/**
 * Widens a zero-width VOI range (`lower === upper`) to `[lower, lower + ε]`,
 * for example for an empty slice where min === max. Two transfer function
 * points at the same x collapse, and the image renders white.
 *
 * Rule for a zero-width window: a value at or below `lower` renders black, and
 * a value above `lower` renders white. A value strictly inside the interval
 * can render gray, which is very rare. A range with a width, or an inverted
 * range, is returned unchanged.
 */
export function ensureNonZeroVOIRange<T extends VOIRange>(voiRange: T): T {
  if (voiRange.upper !== voiRange.lower) {
    return voiRange;
  }

  return {
    ...voiRange,
    upper: voiRange.lower + getVOIRangeEpsilon(voiRange.lower),
  };
}
