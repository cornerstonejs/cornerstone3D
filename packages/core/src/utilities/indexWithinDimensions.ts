import { Point3 } from '../types';

/**
 * Returns true if the specified index is within the given dimensions.
 *
 * @param index - The index to check.
 * @param dimensions - The dimensions to check against.
 *
 * @returns True if the index is in-bounds.
 */
export default function indexWithinDimensions(
  index: Point3,
  dimensions: Point3
): boolean {
  if (
    index[0] < 0 ||
    index[0] >= dimensions[0] ||
    index[1] < 0 ||
    index[1] >= dimensions[1] ||
    index[2] < 0 ||
    index[2] >= dimensions[2]
  ) {
    return false;
  }

  return true;
}
