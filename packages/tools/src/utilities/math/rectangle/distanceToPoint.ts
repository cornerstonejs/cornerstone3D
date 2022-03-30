import type { Types } from '@cornerstonejs/core';
import * as lineSegment from '../line';

type rectLineSegments = {
  top: Types.Point2[];
  right: Types.Point2[];
  bottom: Types.Point2[];
  left: Types.Point2[];
};

/**
 * Given a rectangle left, top, width and height, return an object containing the
 * line segments that make up the rectangle's four sides
 * @param left - The x-coordinate of the left edge of the rectangle.
 * @param top - The y-coordinate of the top edge of the rectangle.
 * @param width - The width of the rectangle.
 * @param height - The height of the rectangle.
 * @returns An object with four keys, each of which contains an array of two
 * points.
 */
function rectToLineSegments(
  left: number,
  top: number,
  width: number,
  height: number
): rectLineSegments {
  const topLineStart: Types.Point2 = [left, top];
  const topLineEnd: Types.Point2 = [left + width, top];

  const rightLineStart: Types.Point2 = [left + width, top];
  const rightLineEnd: Types.Point2 = [left + width, top + height];

  const bottomLineStart: Types.Point2 = [left + width, top + height];
  const bottomLineEnd: Types.Point2 = [left, top + height];

  const leftLineStart: Types.Point2 = [left, top + height];
  const leftLineEnd: Types.Point2 = [left, top];

  const lineSegments = {
    top: [topLineStart, topLineEnd],
    right: [rightLineStart, rightLineEnd],
    bottom: [bottomLineStart, bottomLineEnd],
    left: [leftLineStart, leftLineEnd],
  };

  return lineSegments;
}

/**
 * Calculates distance of the point to the rectangle. It calculates the minimum
 * distance between the point and each line segment of the rectangle.
 *
 * @param rect - coordinates of the rectangle [left, top, width, height]
 * @param point - [x,y] coordinates of a point
 * @returns
 */
export default function distanceToPoint(
  rect: number[],
  point: Types.Point2
): number {
  if (rect.length !== 4 || point.length !== 2) {
    throw Error(
      'rectangle:[left, top, width, height] or point: [x,y] not defined correctly'
    );
  }

  const [left, top, width, height] = rect;

  let minDistance = 655535;
  const lineSegments = rectToLineSegments(left, top, width, height);

  Object.keys(lineSegments).forEach((segment) => {
    const [lineStart, lineEnd] = lineSegments[segment];
    const distance = lineSegment.distanceToPoint(lineStart, lineEnd, point);

    if (distance < minDistance) {
      minDistance = distance;
    }
  });

  return minDistance;
}
