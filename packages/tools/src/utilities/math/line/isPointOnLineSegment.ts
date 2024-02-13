import type { Types } from '@cornerstonejs/core';

const ORIENTATION_TOLERANCE = 1e-2;

/**
 * Test if a point is on a line segment
 * @param lineStart - Line segment start point
 * @param lineEnd - Line segment end point
 * @param point - Point to test
 * @returns True if the point lies on the line segment or false otherwise
 */
export default function isPointOnLineSegment(
  lineStart: Types.Point2,
  lineEnd: Types.Point2,
  point: Types.Point2
): boolean {
  // The code below runs ~4x faster than calling `line.distanceToPointSquared()` (155 vs 598 ms)

  // No Math.min/max call for better performance when testing thousands of points
  const minX = lineStart[0] <= lineEnd[0] ? lineStart[0] : lineEnd[0];
  const maxX = lineStart[0] >= lineEnd[0] ? lineStart[0] : lineEnd[0];
  const minY = lineStart[1] <= lineEnd[1] ? lineStart[1] : lineEnd[1];
  const maxY = lineStart[1] >= lineEnd[1] ? lineStart[1] : lineEnd[1];

  // Checks if the point lies inside the AABB
  const aabbContainsPoint =
    point[0] >= minX - ORIENTATION_TOLERANCE &&
    point[0] <= maxX + ORIENTATION_TOLERANCE &&
    point[1] >= minY - ORIENTATION_TOLERANCE &&
    point[1] <= maxY + ORIENTATION_TOLERANCE;

  if (!aabbContainsPoint) {
    return false;
  }

  // Now that we know the point is inside the AABB we check if it lies on the line segment
  const orientation =
    (lineEnd[1] - lineStart[1]) * (point[0] - lineEnd[0]) -
    (lineEnd[0] - lineStart[0]) * (point[1] - lineEnd[1]);
  const absOrientation = orientation >= 0 ? orientation : -orientation;

  // The orientation must be zero for points that lies on the same line
  return absOrientation <= ORIENTATION_TOLERANCE;
}
