import { Types } from '@cornerstonejs/core';

/**
 * Calculates the distance of a point to an AABB using 2D Box SDF (Signed Distance Field)
 *
 * The SDF of a Box
 * https://www.youtube.com/watch?v=62-pRVZuS5c
 *
 * @param aabb - Axis-aligned bound box
 * @param point - 2D point
 * @returns The closest distance between the 2D point and the AABB
 */
export default function distanceToPointSquared(
  aabb: Types.AABB2,
  point: Types.Point2
): number {
  const aabbWidth = aabb.maxX - aabb.minX;
  const aabbHeight = aabb.maxY - aabb.minY;
  const aabbSize = [aabbWidth, aabbHeight];
  const aabbCenter: Types.Point2 = [
    aabb.minX + aabbWidth / 2,
    aabb.minY + aabbHeight / 2,
  ];

  // Translates the point as the center of the AABB is the new origin.
  // THe point is also mirroed to the first quadrant to simplify the math.
  const translatedPoint = [
    Math.abs(point[0] - aabbCenter[0]),
    Math.abs(point[1] - aabbCenter[1]),
  ];

  // Calculate the distance from the point to the vertical and horizontal AABB borders
  const dx = translatedPoint[0] - aabbSize[0] * 0.5;
  const dy = translatedPoint[1] - aabbSize[1] * 0.5;

  // dx >  0 && dy >  0: diagonal line connecting the point to AABB's corner
  // dx >  0 && dy <= 0: a line parallel to x-axis connecting the point to AABB's right side
  // dx <= 0 && dy >  0: a line parallel to y-axis connecting the point to AABB's top side
  // dx <= 0 && dy <= 0: the point is inside the AABB
  if (dx > 0 && dy > 0) {
    return dx * dx + dy * dy;
  }

  const dist = Math.max(dx, 0) + Math.max(dy, 0);

  return dist * dist;
}
