import type { VOIRange } from '../types/voi';

/**
 * Epsilon used to widen a zero-width VOI range. It is relative to the value
 * so it stays below the data range for images with a near-zero RescaleSlope
 * (e.g. PT with slope ~1e-10).
 */
export const VOI_RANGE_RELATIVE_EPSILON = 1e-6;

/** Lower bound for the epsilon, used when the value itself is (near) zero. */
export const VOI_RANGE_MIN_EPSILON = 1e-12;

/**
 * Returns the width to add to a zero-width VOI range whose lower bound is
 * `value`.
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

/**
 * The header W/L can be meaningless for the rescaled data, e.g. WW=1/WC=1
 * with a near-zero RescaleSlope puts every pixel (max ~3e-5) far below the
 * window and renders the image black. Falls back to the image's own range
 * when the window is zero-width or doesn't overlap the pixel values.
 */
export function getVOIRangeOverlappingPixelRange(
  voiRange: VOIRange | undefined,
  minPixelValue: number,
  maxPixelValue: number
): VOIRange | undefined {
  if (
    voiRange &&
    Number.isFinite(minPixelValue) &&
    Number.isFinite(maxPixelValue) &&
    maxPixelValue > minPixelValue &&
    (voiRange.upper <= voiRange.lower ||
      voiRange.upper <= minPixelValue ||
      voiRange.lower >= maxPixelValue)
  ) {
    return { lower: minPixelValue, upper: maxPixelValue };
  }

  return voiRange;
}
