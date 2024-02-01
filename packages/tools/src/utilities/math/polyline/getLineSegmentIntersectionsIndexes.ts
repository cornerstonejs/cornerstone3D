import type { Types } from '@cornerstonejs/core';
import areLineSegmentsIntersecting from './areLineSegmentsIntersecting';

/**
 * Get all intersections between a polyline and a line segment.
 * @param polyline - Polyline points
 * @param p1 - Start point of line segment
 * @param q1 - End point of line segment
 * @param closed - Test the intersection against the line segment that connects
 * the last to the first point when set to true
 * @returns Start/end point indexes of all line segments that intersect (p1, q1)
 */
export default function getLineSegmentIntersectionsIndexes(
  polyline: Types.Point2[],
  p1: Types.Point2,
  q1: Types.Point2,
  closed = true
): Types.Point2[] {
  const intersections: Types.Point2[] = [];
  const numPoints = polyline.length;
  const maxI = numPoints - (closed ? 1 : 2);

  for (let i = 0; i <= maxI; i++) {
    const p2 = polyline[i];
    // Do not use % operator for better performance
    const j = i === numPoints - 1 ? 0 : i + 1;
    const q2 = polyline[j];

    if (areLineSegmentsIntersecting(p1, q1, p2, q2)) {
      intersections.push([i, j]);
    }
  }

  return intersections;
}
