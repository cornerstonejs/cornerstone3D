import { Types } from '@cornerstonejs/core';
import { getSignedArea } from '../math/polyline';

/**
 * _reverseIfAntiClockwise - If the contour's nodes run anti-clockwise,
 * reverse them.
 *
 * @param points - The points array.
 * @param otherListsToReverse - any number of additional lists to also reverse
 *       when the primary list is anti-clockwise.
 * @returns The contour, corrected to be clockwise if appropriate.
 */
export default function reverseIfAntiClockwise(
  points: Types.Point2[],
  ...otherListsToReverse: unknown[][]
) {
  const signedArea = getSignedArea(points);

  // signedArea will be less than zero for anti-clockwise
  if (signedArea < 0) {
    if (otherListsToReverse) {
      otherListsToReverse.forEach((list) => list.reverse());
    }

    return points.slice().reverse();
  }

  return points;
}
