import { Types } from '@cornerstonejs/core';

function dist2(p1: Types.Point2, p2: Types.Point2): number {
  return (p1[0] - p2[0]) * (p1[0] - p2[0]) + (p1[1] - p2[1]) * (p1[1] - p2[1]);
}

/**
 * Calculates the distance-squared of a point to a line
 *
 * @param lineStart - x,y coordinates of the start of the line
 * @param lineEnd - x,y coordinates of the end of the line
 * @param point - x,y of the point
 * @returns distance-squared
 */
export default function distanceToPointSquared(
  lineStart: Types.Point2,
  lineEnd: Types.Point2,
  point: Types.Point2
): number {
  const d2 = dist2(lineStart, lineEnd);

  if (d2 === 0) {
    return dist2(point, lineStart);
  }

  const t =
    ((point[0] - lineStart[0]) * (lineEnd[0] - lineStart[0]) +
      (point[1] - lineStart[1]) * (lineEnd[1] - lineStart[1])) /
    d2;

  if (t < 0) {
    return dist2(point, lineStart);
  }
  if (t > 1) {
    return dist2(point, lineEnd);
  }

  const pt: Types.Point2 = [
    lineStart[0] + t * (lineEnd[0] - lineStart[0]),
    lineStart[1] + t * (lineEnd[1] - lineStart[1]),
  ];

  return dist2(point, pt);
}
