import { Types } from '@cornerstonejs/core';
import * as mathLine from '../line';

// ATTENTION: this is an internal function and it should not be added to "polyline" namespace

// Tested with +1M random overlapping line segments and any tolerance below this
// one may return invalid results.
const PARALLEL_LINES_TOLERANCE = 1e-2;

/**
 * It returns the intersection between two lines (not line segments) or a midpoint
 * when the line segments overlap. This function calculates the intersection between
 * lines because it considers that getFirstLineSegmentIntersectionIndexes,
 * getLineSegmentIntersectionsCoordinates or getLineSegmentIntersectionsIndexes
 * has already been called first which guarantees.
 *
 * @param p1 - Line segment 1 start
 * @param q1 - Line segment 1 end
 * @param p2 - Line segment 2 start
 * @param q2 - Line segment 21 end
 * @returns The intersection between two lines or a midpoint when they overlap
 */
export default function getLinesIntersection(
  p1: Types.Point2,
  q1: Types.Point2,
  p2: Types.Point2,
  q2: Types.Point2
) {
  const diffQ1P1 = [q1[0] - p1[0], q1[1] - p1[1]];
  const diffQ2P2 = [q2[0] - p2[0], q2[1] - p2[1]];
  const denominator = diffQ2P2[1] * diffQ1P1[0] - diffQ2P2[0] * diffQ1P1[1];
  const absDenominator = denominator >= 0 ? denominator : -denominator;

  if (absDenominator < PARALLEL_LINES_TOLERANCE) {
    // No Math.min/max calls for better performance.
    const line1AABB = [
      p1[0] < q1[0] ? p1[0] : q1[0], // 0: minX
      p1[0] > q1[0] ? p1[0] : q1[0], // 1: maxX
      p1[1] < q1[1] ? p1[1] : q1[1], // 2: minY
      p1[1] > q1[1] ? p1[1] : q1[1], // 3: maxY
    ];

    // No Math.min/max calls for better performance.
    const line2AABB = [
      p2[0] < q2[0] ? p2[0] : q2[0], // 0: minX
      p2[0] > q2[0] ? p2[0] : q2[0], // 1: maxX
      p2[1] < q2[1] ? p2[1] : q2[1], // 2: minY
      p2[1] > q2[1] ? p2[1] : q2[1], // 3: maxY
    ];

    const aabbIntersects =
      line1AABB[0] <= line2AABB[1] && // minX1 <= maxX2
      line1AABB[1] >= line2AABB[0] && // maxX1 >= minX2
      line1AABB[2] <= line2AABB[3] && // minY1 <= maxY2
      line1AABB[3] >= line2AABB[2]; // maxY1 >= minY2

    if (!aabbIntersects) {
      return;
    }

    // Three tests are enough to know if the lines overlap
    const overlap =
      mathLine.isPointOnLineSegment(p1, q1, p2) ||
      mathLine.isPointOnLineSegment(p1, q1, q2) ||
      mathLine.isPointOnLineSegment(p2, q2, p1);

    if (!overlap) {
      return;
    }

    // min/max seems to be inverted but that is correct because it is looking
    // for the intersection range. No Math.min/max calls for better performance.
    const minX = line1AABB[0] > line2AABB[0] ? line1AABB[0] : line2AABB[0];
    const maxX = line1AABB[1] < line2AABB[1] ? line1AABB[1] : line2AABB[1];
    const minY = line1AABB[2] > line2AABB[2] ? line1AABB[2] : line2AABB[2];
    const maxY = line1AABB[3] < line2AABB[3] ? line1AABB[3] : line2AABB[3];
    const midX = (minX + maxX) * 0.5;
    const midY = (minY + maxY) * 0.5;

    return [midX, midY];
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
