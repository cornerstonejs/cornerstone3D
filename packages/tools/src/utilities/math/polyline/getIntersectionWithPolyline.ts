import { vec2 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';

/**
 * Orientation algoritm to determine if two lines cross.
 * Credit and details: geeksforgeeks.org/check-if-two-given-line-segments-intersect/
 */

function getAllIntersectionsWithPolyline(
  points: Types.Point2[],
  p1: Types.Point2,
  q1: Types.Point2,
  closed = true
): Types.Point2[] {
  let initialI;
  let j;
  const intersections: Types.Point2[] = [];

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
      intersections.push([j, i]);
    }

    j = i;
  }

  return intersections;
}

/**
 * Returns all intersections points
 * between a line and a polyline
 */
function getIntersectionCoordinatesWithPolyline(
  points: Types.Point2[],
  p1: Types.Point2,
  q1: Types.Point2,
  closed = true
): Types.Point2[] {
  const result = [];
  const polylineIndexes = getAllIntersectionsWithPolyline(
    points,
    p1,
    q1,
    closed
  );

  for (let i = 0; i < polylineIndexes.length; i++) {
    const p2 = points[polylineIndexes[i][0]];
    const q2 = points[polylineIndexes[i][1]];
    const intersection = getIntersection(p1, q1, p2, q2);
    result.push(intersection);
  }
  return result;
}

/**
 * Checks whether the line (`p1`,`q1`) intersects any of the other lines in the
 * `points`, and returns the first value.
 */
function getFirstIntersectionWithPolyline(
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

    if (doesIntersect(p1, q1, p2, q2)) {
      return [j, i];
    }

    j = i;
  }
}

/**
 * Checks whether the line (`p1`,`q1`) intersects any of the other lines in the
 * `points`, and returns the closest value.
 */
function getClosestIntersectionWithPolyline(
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
 * Checks whether the line (`p1`,`q1`) intersects the line (`p2`,`q2`) via an orientation algorithm.
 */
function doesIntersect(
  p1: Types.Point2,
  q1: Types.Point2,
  p2: Types.Point2,
  q2: Types.Point2
): boolean {
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
 * Checks the orientation of 3 points, returns a 0, 1 or 2 based on
 * the orientation of the points.
 */
function orientation(
  p: Types.Point2,
  q: Types.Point2,
  r: Types.Point2
): number {
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

/**
 * Gets the intersection between the line (`p1`,`q1`) and the line (`p2`,`q2`)
 * http://jsfiddle.net/justin_c_rounds/Gd2S2/light/
 * https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection#Given_two_points_on_each_line
 */
function getIntersection(
  p1: Types.Point2,
  q1: Types.Point2,
  p2: Types.Point2,
  q2: Types.Point2
): Types.Point2 {
  const denominator =
    (q2[1] - p2[1]) * (q1[0] - p1[0]) - (q2[0] - p2[0]) * (q1[1] - p1[1]);
  if (denominator == 0) {
    return;
  }
  let a = p1[1] - p2[1];
  let b = p1[0] - p2[0];
  const numerator1 = (q2[0] - p2[0]) * a - (q2[1] - p2[1]) * b;
  const numerator2 = (q1[0] - p1[0]) * a - (q1[1] - p1[1]) * b;
  a = numerator1 / denominator;
  b = numerator2 / denominator;

  const resultX = p1[0] + a * (q1[0] - p1[0]);
  const resultY = p1[1] + a * (q1[1] - p1[1]);

  return [resultX, resultY];
}

export {
  getAllIntersectionsWithPolyline,
  getFirstIntersectionWithPolyline,
  getClosestIntersectionWithPolyline,
  getIntersectionCoordinatesWithPolyline,
};
