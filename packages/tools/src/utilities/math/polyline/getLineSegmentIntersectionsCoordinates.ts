import type { Types } from '@cornerstonejs/core';
import getLineSegmentIntersectionsIndexes from './getLineSegmentIntersectionsIndexes';
import * as math from '..';

/**
 * Returns all intersections points between a line segment and a polyline
 */
export default function getLineSegmentIntersectionsCoordinates(
  points: Types.Point2[],
  p1: Types.Point2,
  q1: Types.Point2,
  closed = true
): Types.Point2[] {
  const result = [];
  const polylineIndexes = getLineSegmentIntersectionsIndexes(
    points,
    p1,
    q1,
    closed
  );

  for (let i = 0; i < polylineIndexes.length; i++) {
    const p2 = points[polylineIndexes[i][0]];
    const q2 = points[polylineIndexes[i][1]];
    const intersection = math.lineSegment.intersectLine(p1, q1, p2, q2);
    result.push(intersection);
  }

  return result;
}
