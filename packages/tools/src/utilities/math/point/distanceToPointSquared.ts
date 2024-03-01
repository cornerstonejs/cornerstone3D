import type { Types } from '@cornerstonejs/core';

type Point = Types.Point2 | Types.Point3;

/**
 * Calculates the distance squared of a point to another point
 *
 * @param p1 - x,y or x,y,z of the point
 * @param p2 - x,y or x,y,z of the point
 * @returns distance
 */
export default function distanceToPointSquared(p1: Point, p2: Point): number {
  if (p1.length !== p2.length) {
    throw Error('Both points should have the same dimensionality');
  }

  const [x1, y1, z1 = 0] = p1;
  const [x2, y2, z2 = 0] = p2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;

  // Time to square 10M numbers:
  //   (n * n) = 161ms | (n ** 2) = 199ms | Math.pow(n, 2) = 29529ms
  return dx * dx + dy * dy + dz * dz;
}
