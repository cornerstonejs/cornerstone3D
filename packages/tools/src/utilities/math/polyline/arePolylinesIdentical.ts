import type { Types } from '@cornerstonejs/core';
import { pointsAreEqual } from './robustSegmentIntersection';

/**
 * Checks if two polylines are identical (same points in same or reverse order)
 * This function handles various cases:
 * - Identical order (same points in same sequence)
 * - Reverse order (same shape, opposite winding direction)
 * - Cyclic shifts (same polyline starting from different vertex)
 *
 * @param poly1 - First polyline coordinates
 * @param poly2 - Second polyline coordinates
 * @returns true if polylines represent the same geometric shape
 */
export default function arePolylinesIdentical(
  poly1: Types.Point2[],
  poly2: Types.Point2[]
): boolean {
  if (poly1.length !== poly2.length) {
    return false;
  }

  const len = poly1.length;
  if (len === 0) {
    return true;
  }

  // Check for identical order
  let identicalForward = true;
  for (let i = 0; i < len; i++) {
    if (!pointsAreEqual(poly1[i], poly2[i])) {
      identicalForward = false;
      break;
    }
  }

  if (identicalForward) {
    return true;
  }

  // Check for reverse order (same shape, opposite winding)
  let identicalReverse = true;
  for (let i = 0; i < len; i++) {
    if (!pointsAreEqual(poly1[i], poly2[len - 1 - i])) {
      identicalReverse = false;
      break;
    }
  }

  if (identicalReverse) {
    return true;
  }

  // Check for cyclic shifts (same starting point at different indices)
  for (let offset = 1; offset < len; offset++) {
    // Forward direction with offset
    let cyclicForward = true;
    for (let i = 0; i < len; i++) {
      if (!pointsAreEqual(poly1[i], poly2[(i + offset) % len])) {
        cyclicForward = false;
        break;
      }
    }
    if (cyclicForward) {
      return true;
    }

    // Reverse direction with offset
    let cyclicReverse = true;
    for (let i = 0; i < len; i++) {
      if (!pointsAreEqual(poly1[i], poly2[(len - 1 - i + offset) % len])) {
        cyclicReverse = false;
        break;
      }
    }
    if (cyclicReverse) {
      return true;
    }
  }

  return false;
}
