import type { Types } from '@cornerstonejs/core';

// ATTENTION: this is an internal function and it should not be added to "polyline"
// namespace.
//
// TODO: there is a similar function in math.lineSegment.intersectLine but we
// need to investigate why it is 6x slower than this one when thousands of
// intersections are calculated. Also that one may return [NaN, NaN] for
// collinear points.

/**
 * Checks whether the line (`p1`,`q1`) intersects the line (`p2`,`q2`) via an
 * orientation algorithm.
 *
 * Credit and details: geeksforgeeks.org/check-if-two-given-line-segments-intersect/
 *
 * @param p1 - Start point of line segment 1
 * @param q1 - End point of line segment 1
 * @param p2 - Start point of line segment 2
 * @param q2 - End point of line segment 2
 * @returns True if the line segments intersect or false otherwise
 */
export default function areLineSegmentsIntersecting(
  p1: Types.Point2,
  q1: Types.Point2,
  p2: Types.Point2,
  q2: Types.Point2
): boolean {
  let result = false;

  // Line 1 AABB
  const line1MinX = p1[0] < q1[0] ? p1[0] : q1[0];
  const line1MinY = p1[1] < q1[1] ? p1[1] : q1[1];
  const line1MaxX = p1[0] > q1[0] ? p1[0] : q1[0];
  const line1MaxY = p1[1] > q1[1] ? p1[1] : q1[1];

  // Line 2 AABB
  const line2MinX = p2[0] < q2[0] ? p2[0] : q2[0];
  const line2MinY = p2[1] < q2[1] ? p2[1] : q2[1];
  const line2MaxX = p2[0] > q2[0] ? p2[0] : q2[0];
  const line2MaxY = p2[1] > q2[1] ? p2[1] : q2[1];

  // If AABBs do not intersect it is impossible for the lines to intersect.
  // Checking AABB before doing any math makes it run ~12% faster.
  if (
    line1MinX > line2MaxX ||
    line1MaxX < line2MinX ||
    line1MinY > line2MaxY ||
    line1MaxY < line2MinY
  ) {
    return false;
  }

  const orient = [
    orientation(p1, q1, p2),
    orientation(p1, q1, q2),
    orientation(p2, q2, p1),
    orientation(p2, q2, q1),
  ];

  // General Case
  if (orient[0] !== orient[1] && orient[2] !== orient[3]) {
    return true;
  }

  // Special Cases
  if (orient[0] === 0 && onSegment(p1, p2, q1)) {
    // If p1, q1 and p2 are colinear and p2 lies on segment p1q1
    result = true;
  } else if (orient[1] === 0 && onSegment(p1, q2, q1)) {
    // If p1, q1 and p2 are colinear and q2 lies on segment p1q1
    result = true;
  } else if (orient[2] === 0 && onSegment(p2, p1, q2)) {
    // If p2, q2 and p1 are colinear and p1 lies on segment p2q2
    result = true;
  } else if (orient[3] === 0 && onSegment(p2, q1, q2)) {
    // If p2, q2 and q1 are colinear and q1 lies on segment p2q2
    result = true;
  }

  return result;
}

/**
 * Checks the orientation of 3 points, returns a 0, 1 or 2 based on
 * the orientation of the points.
 */
function orientation(
  p: Types.Point2,
  q: Types.Point2,
  r: Types.Point2
): number {
  // Take the cross product between vectors PQ and QR
  const orientationValue =
    (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);

  if (orientationValue === 0) {
    return 0; // Colinear
  }

  return orientationValue > 0 ? 1 : 2;
}

/**
 * Checks if point `q` lies on the segment (`p`,`r`).
 */
function onSegment(p: Types.Point2, q: Types.Point2, r: Types.Point2): boolean {
  if (
    q[0] <= Math.max(p[0], r[0]) &&
    q[0] >= Math.min(p[0], r[0]) &&
    q[1] <= Math.max(p[1], r[1]) &&
    q[1] >= Math.min(p[1], r[1])
  ) {
    return true;
  }

  return false;
}
