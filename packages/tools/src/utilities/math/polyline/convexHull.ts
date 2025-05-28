import type { Types } from '@cornerstonejs/core';

/**
 * Compute the convex hull of a set of 2D points using
 * the Monotone‐Chain algorithm. Runs in O(n log n).
 *
 * @param {Array<Types.Point2>} pts
 * @returns {Array<Types.Point2>}  hull in CCW order, starting at leftmost
 */
export default function convexHull(
  pts: Array<Types.Point2>
): Array<Types.Point2> {
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
