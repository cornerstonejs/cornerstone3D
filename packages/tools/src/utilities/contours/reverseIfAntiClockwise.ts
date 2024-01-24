import { Types } from '@cornerstonejs/core';

/**
 * getSumReducer - A reducer function that calculates the sum of an array.
 *
 * @param total - The running total.
 * @param num - The numerical value of the array element.
 * @returns The updated running total.
 */
function getSumReducer(total: number, num: number): number {
  return total + num;
}

/**
 * _reverseIfAntiClockwise - If the contour's nodes run anti-clockwise,
 * reverse them.
 *
 * @param points - The points array.
 * @returns The contour, corrected to be clockwise if appropriate.
 */
export default function reverseIfAntiClockwise(points: Types.Point2[]) {
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

  if (checkSum > 0) {
    return points.slice().reverse();
  }
  return points;
}
