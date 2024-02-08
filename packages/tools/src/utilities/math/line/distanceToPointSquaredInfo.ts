import type { Types } from '@cornerstonejs/core';
import * as math from '../';

/**
 * Calculate the closest point and the squared distance between a reference point and a line segment.
 *
 * It projects the reference point onto the line segment but it shall be bounded by the
 * start/end points since this is a line segment and not a line which could be extended.
 *
 * @param lineStart - Start point of the line segment
 * @param lineEnd - End point of the line segment
 * @param point - Reference point
 * @returns Closest point and the squared distance between a `point` and a line
 *   segment defined by `lineStart` and `lineEnd` points
 */
export default function distanceToPointSquaredInfo(
  lineStart: Types.Point2,
  lineEnd: Types.Point2,
  point: Types.Point2
): {
  point: Types.Point2;
  distanceSquared: number;
} {
  let closestPoint: Types.Point2;
  const distanceSquared = math.point.distanceToPointSquared(lineStart, lineEnd);

  // Check if lineStart equal to the lineEnd which means the closest point
  // is any of these two points
  if (lineStart[0] === lineEnd[0] && lineStart[1] === lineEnd[1]) {
    closestPoint = lineStart;
  }

  if (!closestPoint) {
    const dotProduct =
      ((point[0] - lineStart[0]) * (lineEnd[0] - lineStart[0]) +
        (point[1] - lineStart[1]) * (lineEnd[1] - lineStart[1])) /
      distanceSquared;

    if (dotProduct < 0) {
      closestPoint = lineStart;
    } else if (dotProduct > 1) {
      closestPoint = lineEnd;
    } else {
      closestPoint = [
        lineStart[0] + dotProduct * (lineEnd[0] - lineStart[0]),
        lineStart[1] + dotProduct * (lineEnd[1] - lineStart[1]),
      ];
    }
  }

  return {
    point: [...closestPoint],
    distanceSquared: math.point.distanceToPointSquared(point, closestPoint),
  };
}
