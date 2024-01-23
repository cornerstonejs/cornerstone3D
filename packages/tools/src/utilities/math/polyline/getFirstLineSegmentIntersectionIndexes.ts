import type { Types } from '@cornerstonejs/core';
import lineSegmentsIntersect from './lineSegmentsIntersect';

/**
 * Checks whether the line (`p1`,`q1`) intersects any of the other lines in the
 * `points`, and returns the first value.
 *
 * @param points - Polyline points
 * @param p1 - First point of the line segment that is being tested
 * @param q1 - Second point of the line segment that is being tested
 * @param closed - Test the intersection with the line segment that connects
 *   the last and first points of the polyline
 * @returns Indexes of the line segment points from the polyline that intersects [p1, q1]
 */
export default function getFirstLineSegmentIntersectionIndexes(
  points: Types.Point2[],
  p1: Types.Point2,
  q1: Types.Point2,
  closed = true
): Types.Point2 | undefined {
  let initialI;
  let j;

  if (closed) {
    j = points.length - 1;
    initialI = 0;
  } else {
    j = 0;
    initialI = 1;
  }

  for (let i = initialI; i < points.length; i++) {
    const p2 = points[j];
    const q2 = points[i];

    // const intersects1 = lineSegmentsIntersect(p1, q1, p2, q2);
    // const intersects2 = math.lineSegment.intersectLine(p1, q1, p2, q2);

    // if (!!intersects1 !== !!intersects2) {
    //   console.log('>>>>> :: intersects1:', intersects1);
    //   console.log('>>>>> :: intersects2:', intersects2);
    //   debugger;
    //   math.lineSegment.intersectLine(p1, q1, p2, q2);
    //   lineSegmentsIntersect(p1, q1, p2, q2);
    // }

    if (lineSegmentsIntersect(p1, q1, p2, q2)) {
      return [j, i];
    }

    j = i;
  }
}
