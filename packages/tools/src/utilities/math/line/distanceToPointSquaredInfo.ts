import type { Types } from '@cornerstonejs/core';
import distanceToPointSquared from '../point/distanceToPointSquared';

export default function distanceToPointSquaredInfo(
  lineStart: Types.Point2,
  lineEnd: Types.Point2,
  point: Types.Point2
): {
  point: Types.Point2;
  distanceSquared: number;
} {
  let closestPoint: Types.Point2;
  const d2 = distanceToPointSquared(lineStart, lineEnd);

  if (d2 === 0) {
    closestPoint = lineStart;
  }

  if (!closestPoint) {
    const t =
      ((point[0] - lineStart[0]) * (lineEnd[0] - lineStart[0]) +
        (point[1] - lineStart[1]) * (lineEnd[1] - lineStart[1])) /
      d2;

    if (t < 0) {
      closestPoint = lineStart;
    } else if (t > 1) {
      closestPoint = lineEnd;
    } else {
      closestPoint = [
        lineStart[0] + t * (lineEnd[0] - lineStart[0]),
        lineStart[1] + t * (lineEnd[1] - lineStart[1]),
      ];
    }
  }

  return {
    point: [...closestPoint],
    distanceSquared: distanceToPointSquared(point, closestPoint),
  };
}
