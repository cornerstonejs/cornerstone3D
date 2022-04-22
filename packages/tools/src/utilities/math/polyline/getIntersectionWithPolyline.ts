import { vec2 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';

/**
 * Orientation algoritm to determine if two lines cross.
 * Credit and details: geeksforgeeks.org/check-if-two-given-line-segments-intersect/
 */

/**
 * Checks whether the line (p1,q1) intersects any of the other lines in the polygon, return the first value.
 * @private
 * @function getFirstIntersectionWithPolyline
 *
 * @param {Object[]} points Data object associated with the tool.
 * @param {Object} p1 Coordinates of the start of the line.
 * @param {Object} q1 Coordinates of the end of the line.
 * @param {boolean} [closed=true] Whether to treat the set of points as a closed contour (i.e last point joined onto first).
 * @returns {number[]} An array of the indicies that define the line in points.
 */
function getFirstIntersectionWithPolyline(
  points,
  p1,
  q1,
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

    if (doesIntersect(p1, q1, p2, q2)) {
      return [j, i];
    }

    j = i;
  }
}

/**
 * Orientation algoritm to determine if two lines cross.
 * Credit and details: geeksforgeeks.org/check-if-two-given-line-segments-intersect/
 */

/**
 * Checks whether the line (p1,q1) intersects any of the other lines in the polygon, returns the closest value.
 * @private
 * @function getClosestIntersectionWithPolyline
 *
 * @param {Object[]} points Data object associated with the tool.
 * @param {Object} p1 Coordinates of the start of the line.
 * @param {Object} q1 Coordinates of the end of the line.
 * @param {string} [closed=true] Whether to treat the set of points as a closed contour (i.e last point joined onto first).
 * @returns {number[]} An array of the indicies that define the line in points.
 */
function getClosestIntersectionWithPolyline(
  points,
  p1,
  q1,
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

  const intersections = [];

  for (let i = initialI; i < points.length; i++) {
    const p2 = points[j];
    const q2 = points[i];

    if (doesIntersect(p1, q1, p2, q2)) {
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

/**
 * Checks whether the line (p1,q1) intersects the line (p2,q2) via an orientation algorithm.
 * @private
 * @function doesIntersect
 *
 * @param {Object} p1 Coordinates of the start of the line 1.
 * @param {Object} q1 Coordinates of the end of the line 1.
 * @param {Object} p2 Coordinates of the start of the line 2.
 * @param {Object} q2 Coordinates of the end of the line 2.
 * @returns {boolean} Whether lines (p1,q1) and (p2,q2) intersect.
 */
function doesIntersect(p1, q1, p2, q2) {
  let result = false;

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
 * Checks the orientation of 3 points.
 * @private
 * @function orientation
 *
 * @param {Object} p First point.
 * @param {Object} q Second point.
 * @param {Object} r Third point.
 * @returns {number} - 0: Colinear, 1: Clockwise, 2: Anticlockwise
 */
function orientation(p, q, r) {
  const orientationValue =
    (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);

  if (orientationValue === 0) {
    return 0; // Colinear
  }

  return orientationValue > 0 ? 1 : 2;
}

/**
 * Checks if point q lines on the segment (p,r).
 * @private
 * @function onSegment
 *
 * @param {Object} p Point p.
 * @param {Object} q Point q.
 * @param {Object} r Point r.
 * @returns {boolean} - If q lies on line segment (p,r).
 */
function onSegment(p, q, r) {
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

export { getFirstIntersectionWithPolyline, getClosestIntersectionWithPolyline };
