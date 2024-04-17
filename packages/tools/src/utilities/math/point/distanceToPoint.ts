import type { Types } from '@cornerstonejs/core';
import distanceToPointSquared from './distanceToPointSquared';

type Point = Types.Point2 | Types.Point3;

/**
 * Calculates the distance of a point to another point
 *
 * @param p1 - x,y or x,y,z of the point
 * @param p2 - x,y or x,y,z of the point
 * @returns distance
 */
export default function distanceToPoint(p1: Point, p2: Point): number {
  return Math.sqrt(distanceToPointSquared(p1, p2));
}
