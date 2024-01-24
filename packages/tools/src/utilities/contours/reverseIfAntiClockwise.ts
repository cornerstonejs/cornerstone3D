import { Types } from '@cornerstonejs/core';

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
  const length = points.length;
  if (!length) {
    return points;
  }
  let xSum = 0;
  for (const point of points) {
    xSum += point[0];
  }
  const xMean = xSum / length;

  let checkSum = 0;

  for (let k = 0, i = 1, j = 2; k < length; k++) {
    checkSum += (points[i][0] - xMean) * (points[j][1] - points[k][1]);
    i++;
    j++;
    if (i >= length) {
      i = 0;
    }
    if (j >= length) {
      j = 0;
    }
  }

  // Checksum will be less than zero for anti-clockwise
  if (checkSum < 0) {
    if (otherListsToReverse) {
      otherListsToReverse.forEach((list) => list.reverse());
    }
    return points.slice().reverse();
  }
  return points;
}
