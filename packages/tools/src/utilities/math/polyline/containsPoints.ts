import type { Types } from '@cornerstonejs/core';
import containsPoint from './containsPoint';

/**
 * Checks if a polyline contains a set of points.
 *
 * @param polyline - Polyline points (2D)
 * @param points - 2D points to verify
 * @returns True if all points are inside the polyline or false otherwise
 */
export default function containsPoints(
  polyline: Types.Point2[],
  points: Types.Point2[]
): boolean {
  for (let i = 0, numPoint = points.length; i < numPoint; i++) {
    if (!containsPoint(polyline, points[i])) {
      return false;
    }
  }

  return true;
}
