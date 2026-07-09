import { EPSILON } from '../constants';
import type { Point3 } from '../types';

/**
 * Returns true if the specified index is within the given dimensions.
 *
 * @param index - The index to check.
 * @param dimensions - The dimensions to check against.
 *
 * @returns True if the index is in-bounds.
 */

export default function indexAlmostWithinDimensions(
  index: Point3,
  dimensions: Point3
): boolean {
  if (
    index[0] < -EPSILON ||
    index[0] >= dimensions[0] + EPSILON ||
    index[1] < -EPSILON ||
    index[1] >= dimensions[1] + EPSILON ||
    index[2] < -EPSILON ||
    index[2] >= dimensions[2] + EPSILON
  ) {
    return false;
  }

  return true;
}
