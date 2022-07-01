import type { Types } from '@cornerstonejs/core';

/**
 * Calculates the distance of a point to another point
 *
 * @param p1 - x,y of the point
 * @param p2 - x,y of the point
 * @returns distance
 */
export default function distanceToPoint(
  p1: Types.Point2,
  p2: Types.Point2
): number {
  if (p1?.length !== 2 || p2?.length !== 2) {
    throw Error('points should have 2 elements of [x, y]');
  }

  const [x1, y1] = p1;
  const [x2, y2] = p2;

  return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
}
