import { Types } from '@cornerstonejs/core';

/**
 * Get a mirrored point along the line created by two points where one of them
 * is the static ("anchor") point and the other one is the point to be mirroed.
 * @param mirrorPoint - 2D Point to be mirroed
 * @param staticPoint - Static 2D point
 * @returns Mirroed 2D point
 */
export default function mirror(
  mirrorPoint: Types.Point2,
  staticPoint: Types.Point2
): Types.Point2 {
  const [x1, y1] = mirrorPoint;
  const [x2, y2] = staticPoint;

  const newX = 2 * x2 - x1;
  const newY = 2 * y2 - y1;

  return [newX, newY];
}
