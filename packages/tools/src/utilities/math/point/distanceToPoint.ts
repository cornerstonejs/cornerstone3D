import type { Types } from '@cornerstonejs/core';

type Point = Types.Point2 | Types.Point3;

/**
 * Calculates the distance of a point to another point
 *
 * @param p1 - x,y or x,y,z of the point
 * @param p2 - x,y or x,y,z of the point
 * @returns distance
 */
export default function distanceToPoint(p1: Point, p2: Point): number {
  if (p1.length !== p2.length) {
    throw Error('Both points should have the same dimensionality');
  }

  const [x1, y1, z1 = 0] = p1;
  const [x2, y2, z2 = 0] = p2;

  return Math.sqrt(
    Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2) + Math.pow(z1 - z2, 2)
  );
}
