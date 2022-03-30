import type { Types } from '@cornerstonejs/core';

/**
 * Find the closest point to the target point
 *
 * @param sourcePoints - The potential source points.
 * @param targetPoint - The target point, used to find the closest source.
 * @returns The closest point in the array of point sources
 */
export default function findClosestPoint(
  sourcePoints: Array<Types.Point2>,
  targetPoint: Types.Point2
): Types.Point2 {
  let minPoint = [0, 0];
  let minDistance = Number.MAX_SAFE_INTEGER;

  sourcePoints.forEach(function (sourcePoint) {
    const distance = _distanceBetween(targetPoint, sourcePoint);

    if (distance < minDistance) {
      minDistance = distance;
      minPoint = [...sourcePoint];
    }
  });

  return minPoint as Types.Point2;
}

/**
 *
 * @private
 * @param p1
 * @param p2
 */
function _distanceBetween(p1: Types.Point2, p2: Types.Point2): number {
  const [x1, y1] = p1;
  const [x2, y2] = p2;

  return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
}
