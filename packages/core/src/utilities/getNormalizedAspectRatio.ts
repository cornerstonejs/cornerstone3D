import type { Point2 } from '../types';

const EPSILON = 1e10;

/**
 * Normalizes a pair of dimensions into a standardized aspect ratio array.
 * @param aspectRatio - An array containing [width, height].
 * @returns A normalized array [w, h] where at least one value is 1.
 */
export const getNormalizedAspectRatio = (aspectRatio: Point2): Point2 => {
  const [width, height] = aspectRatio;
  if (width === height) {
    return [1, 1];
  }

  const min = Math.min(width, height);

  // Normalize by the minimum value and round to handle floating point errors
  const normalizedW = Math.round((width / min) * EPSILON) / EPSILON;
  const normalizedH = Math.round((height / min) * EPSILON) / EPSILON;

  return [normalizedW, normalizedH];
};
