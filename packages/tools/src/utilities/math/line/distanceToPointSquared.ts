import { Types } from '@cornerstonejs/core';
import distanceToPointSquaredInfo from './distanceToPointSquaredInfo';

/**
 * Calculates the distance-squared of a point to a line segment
 *
 * @param lineStart - x,y coordinates of the start of the line
 * @param lineEnd - x,y coordinates of the end of the line
 * @param point - x,y of the point
 * @returns distance-squared
 */
export default function distanceToPointSquared(
  lineStart: Types.Point2,
  lineEnd: Types.Point2,
  point: Types.Point2
): number {
  return distanceToPointSquaredInfo(lineStart, lineEnd, point).distanceSquared;
}
