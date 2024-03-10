import { Types } from '@cornerstonejs/core';
import distanceToPointSquared from './distanceToPointSquared';

/**
 * Calculates the squared distance of a point to an AABB using
 * 2D Box SDF (Signed Distance Field)
 *
 * The SDF of a Box
 * https://www.youtube.com/watch?v=62-pRVZuS5c
 *
 * @param aabb - Axis-aligned bound box (minX, minY, maxX and maxY)
 * @param point - 2D point
 * @returns The squared distance between the 2D point and the AABB
 */
export default function distanceToPoint(
  aabb: Types.AABB2,
  point: Types.Point2
): number {
  return Math.sqrt(distanceToPointSquared(aabb, point));
}
