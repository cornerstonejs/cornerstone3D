import { Types } from '@cornerstonejs/core';

// ATTENTION: this is an internal function and it should not be added to "polyline"
// namespace because there is another one from lineSegment.intersectLine that also
// finds an intersection between two line segments. This one should be removed but
// it is faster and able to find intersections when the intersection is one of the
// two points of a line segment.
//
// Example:
//   Line 1: (0, 0), (1, 1) x Line 2 (1, 1), (1, 2)
//   Line 1: (0, 1), (2, 1) x Line 2 (1, 1), (1, 2)
//
// This function must replace `lineSegment.intersectLine` but it requires some
// tests first

/**
 * Gets the intersection between the line segments (`p1`,`q1`) and (`p2`,`q2`)
 *
 * http://jsfiddle.net/justin_c_rounds/Gd2S2/light/
 * https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection#Given_two_points_on_each_line
 */
export default function getLineSegmentsIntersection(
  p1: Types.Point2,
  q1: Types.Point2,
  p2: Types.Point2,
  q2: Types.Point2
): Types.Point2 {
  const diffQ1P1 = [q1[0] - p1[0], q1[1] - p1[1]];
  const diffQ2P2 = [q2[0] - p2[0], q2[1] - p2[1]];
  const denominator = diffQ2P2[1] * diffQ1P1[0] - diffQ2P2[0] * diffQ1P1[1];

  if (denominator == 0) {
    return;
  }

  let a = p1[1] - p2[1];
  let b = p1[0] - p2[0];
  const numerator1 = diffQ2P2[0] * a - diffQ2P2[1] * b;
  const numerator2 = diffQ1P1[0] * a - diffQ1P1[1] * b;
  a = numerator1 / denominator;
  b = numerator2 / denominator;

  const resultX = p1[0] + a * diffQ1P1[0];
  const resultY = p1[1] + a * diffQ1P1[1];

  return [resultX, resultY];
}
