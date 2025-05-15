import type { Types } from '@cornerstonejs/core';

/**
 * Compute the perpendicular distance from point p to the line segment [a→b].
 *
 * @param {Types.Point2} p - Point to measure distance from
 * @param {Types.Point2} a - First endpoint of line segment
 * @param {Types.Point2} b - Second endpoint of line segment
 * @returns {number} Perpendicular distance from p to line segment [a→b]
 * @private
 */
function _perpDist(p: Types.Point2, a: Types.Point2, b: Types.Point2) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  if (dx === 0 && dy === 0) {
    // a and b are the same point
    return Math.hypot(p[0] - a[0], p[1] - a[1]);
  }
  // projection t of p onto ab, clamped [0,1]
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const tClamped = Math.max(0, Math.min(1, t));
  const projX = a[0] + tClamped * dx;
  const projY = a[1] + tClamped * dy;
  return Math.hypot(p[0] - projX, p[1] - projY);
}

/**
 * Ramer–Douglas–Peucker contour simplification.
 * @param {Array<Types.Point2>} points  original contour
 * @param {number} epsilon       max allowed deviation (pixels)
 * @returns {Array<Types.Point2>}       simplified contour
 */
export function simplifyContour(
  points: Array<Types.Point2>,
  epsilon: number
): Array<Types.Point2> {
  if (points.length < 3) {
    return points.slice();
  }

  let maxDist = 0,
    index = 0;
  const a = points[0],
    b = points[points.length - 1];
  // find point furthest from chord a→b
  for (let i = 1; i < points.length - 1; i++) {
    const d = _perpDist(points[i], a, b);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  // if max deviation > ε, recurse, else approximate by [a,b]
  if (maxDist > epsilon) {
    const left = simplifyContour(points.slice(0, index + 1), epsilon);
    const right = simplifyContour(points.slice(index), epsilon);
    // concatenate, dropping duplicate at join
    return left.slice(0, -1).concat(right);
  } else {
    return [a, b];
  }
}

/**
 * Moving-average smoothing of a closed or open contour
 * @param {Array<Types.Point2>} points     original contour
 * @param {number} windowSize       radius of smoothing window (integer)
 * @returns {Array<Types.Point2>}          smoothed contour
 */
export function smoothContour(
  points: Array<Types.Point2>,
  windowSize = 2
): Array<Types.Point2> {
  const n = points.length;
  if (n === 0) {
    return [];
  }
  const sm = new Array(n);
  for (let i = 0; i < n; i++) {
    let sumX = 0,
      sumY = 0,
      count = 0;
    for (let k = i - windowSize; k <= i + windowSize; k++) {
      // wrap around for closed contour
      const j = (k + n) % n;
      sumX += points[j][0];
      sumY += points[j][1];
      count++;
    }
    sm[i] = [sumX / count, sumY / count];
  }
  return sm;
}

/**
 * Compute the convex hull of a set of 2D points using
 * the Monotone‐Chain algorithm. Runs in O(n log n).
 *
 * @param {Array<Types.Point2>} pts
 * @returns {Array<Types.Point2>}  hull in CCW order, starting at leftmost
 */
export function convexHull(pts: Array<Types.Point2>): Array<Types.Point2> {
  if (pts.length < 3) {
    return pts.slice();
  }

  // 1) Sort by x, then y
  const points = pts
    .map((p) => [p[0], p[1]]) // clone
    .sort((a, b) =>
      a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]
    ) as Array<Types.Point2>;

  // 2) Cross product of OA→OB: >0 for left turn
  function cross(o: Types.Point2, a: Types.Point2, b: Types.Point2): number {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  }

  const lower = [];
  for (const p of points) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  // 3) Concatenate lower and upper, dropping duplicate endpoints
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Generate a convex hull from a contour by simplifying, smoothing, and computing the hull
 *
 * This function orchestrates the complete convex hull generation process:
 * 1. Simplifies the contour to remove unnecessary detail
 * 2. Smooths the simplified contour to reduce noise
 * 3. Computes the convex hull of the smoothed contour
 *
 * @param {Array<Types.Point2>} contour - Array of points representing the input contour
 * @returns {Array<Types.Point2>} Array of points representing the convex hull
 */
export function generateConvexHullFromContour(
  contour: Array<Types.Point2>
): Array<Types.Point2> {
  // 1) Simplify jagged bits (ε = e.g. 2px):
  const simplified = simplifyContour(contour, 2);

  // 2) Then smooth the polygon (windowSize = e.g. 3):
  const smooth = smoothContour(simplified, 3);
  // calculate convex hull
  const hull = convexHull(smooth);
  return hull;
}
