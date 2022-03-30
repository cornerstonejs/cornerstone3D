import distanceToPointSquared from './distanceToPointSquared';
import type { Types } from '@cornerstonejs/core';

/**
 * Calculates the distance of a point to a line
 *
 * @param lineStart - x,y coordinates of the start of the line
 * @param lineEnd - x,y coordinates of the end of the line
 * @param point - x,y of the point
 * @returns distance
 */
export default function distanceToPoint(
  lineStart: Types.Point2,
  lineEnd: Types.Point2,
  point: Types.Point2
): number {
  if (lineStart.length !== 2 || lineEnd.length !== 2 || point.length !== 2) {
    throw Error(
      'lineStart, lineEnd, and point should have 2 elements of [x, y]'
    );
  }

  return Math.sqrt(distanceToPointSquared(lineStart, lineEnd, point));
}
