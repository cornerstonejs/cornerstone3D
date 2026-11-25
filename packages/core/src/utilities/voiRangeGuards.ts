import type { VOIRange } from '../types/voi';

/**
 * Relative epsilon used to widen a zero-width VOI range.
 *
 * Rule for a zero-width window (`lower === upper`): a value at or below
 * `lower` renders black, and a value above `lower` renders white. The range
 * becomes `[lower, lower + ε]`, so only values strictly inside that interval
 * get a gray ramp.
 *
 * ε must be small compared with the increment between two stored values after
 * the modality LUT (`|RescaleSlope|` for integer data), so that the next value
 * above `lower` is white. A fixed width of 1 fails for a near-zero slope (PT
 * with slope ~1e-10).
 *
 * ε must also stay above the floating point resolution at `|lower|`:
 * - In double precision, `lower + 1e-15 === lower` once `|lower| > ~8`, so both
 *   transfer function points land on the same x, vtk drops the black one, and
 *   the image renders white.
 * - The GPU shader evaluates the LUT in float32 (about 1.2e-7 relative). The
 *   mapper uses a scale of `1 / (upper - lower)` and a shift of `-lower`; a
 *   tiny width makes both terms huge, and their difference loses all digits.
 *
 * `1e-6` is the smallest round factor that stays clear of float32 resolution.
 */
export const VOI_RANGE_RELATIVE_EPSILON = 1e-6;

/**
 * Lower bound for the epsilon, used when `lower` is (near) zero. At zero the
 * shift is zero, so float32 only has to hold the scale.
 */
export const VOI_RANGE_MIN_EPSILON = 1e-12;

/**
 * Returns the width to add to a zero-width VOI range whose lower bound is
 * `value`. See {@link VOI_RANGE_RELATIVE_EPSILON} for the rule and the
 * precision limits.
 */
export function getVOIRangeEpsilon(value: number): number {
  return Math.max(
    Math.abs(value) * VOI_RANGE_RELATIVE_EPSILON,
    VOI_RANGE_MIN_EPSILON
  );
}

/**
 * Guards against a zero-width (or inverted) VOI range, e.g. an empty slice
 * where min === max, which would collapse the transfer function and render
 * the image white. Returns the range unchanged when it already has a width.
 */
export function ensureNonZeroVOIRange<T extends VOIRange>(voiRange: T): T {
  if (voiRange.upper > voiRange.lower) {
    return voiRange;
  }

  return {
    ...voiRange,
    upper: voiRange.lower + getVOIRangeEpsilon(voiRange.lower),
  };
}
