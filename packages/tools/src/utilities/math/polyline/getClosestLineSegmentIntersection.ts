import { vec2 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import lineSegmentsIntersect from './lineSegmentsIntersect';

/**
 * Checks whether the line (`p1`,`q1`) intersects any of the other lines in the
 * `points`, and returns the closest value.
 */
export default function getClosestLineSegmentIntersection(
  points: Types.Point2[],
  p1: Types.Point2,
  q1: Types.Point2,
  closed = true
): { segment: Types.Point2; distance: number } | undefined {
  let initialI;
  let j;

  if (closed) {
    j = points.length - 1;
    initialI = 0;
  } else {
    j = 0;
    initialI = 1;
  }

  const intersections = [];

  for (let i = initialI; i < points.length; i++) {
    const p2 = points[j];
    const q2 = points[i];

    if (lineSegmentsIntersect(p1, q1, p2, q2)) {
      intersections.push([j, i]);
    }

    j = i;
  }

  if (intersections.length === 0) {
    return;
  }

  // Find intersection closest to the start point
  const distances = [];

  intersections.forEach((intersection) => {
    const intersectionPoints = [
      points[intersection[0]],
      points[intersection[1]],
    ];

    const midpoint = [
      (intersectionPoints[0][0] + intersectionPoints[1][0]) / 2,
      (intersectionPoints[0][1] + intersectionPoints[1][1]) / 2,
    ];

    distances.push(vec2.distance(<vec2>midpoint, p1));
  });

  const minDistance = Math.min(...distances);
  const indexOfMinDistance = distances.indexOf(minDistance);

  return {
    segment: intersections[indexOfMinDistance],
    distance: minDistance,
  };
}
