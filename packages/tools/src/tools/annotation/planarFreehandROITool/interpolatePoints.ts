import { Types } from '@cornerstonejs/core';
import { point } from '../../../utilities/math';
import interpolateSegmentPoints from './interpolation/interpolateSegmentPoints';

export function assertInterpolation(configuration: Record<any, any>): boolean {
  return configuration?.interpolation?.enabled === true;
}

/**
 * Tells whether two points are equal by proximity or not as far as interpolation goes.
 */
function isEqualByProximity(pointA, pointB) {
  return point.distanceToPoint(pointA, pointB) < 0.001;
}

/**
 * Tells whether two points are strictly equal or not as far as interpolation goes.
 */
function isEqual(pointA, pointB) {
  return point.distanceToPoint(pointA, pointB) === 0;
}

/**
 * Finds the indexes of points list and otherPoints list that points are identical.
 */
function findMatchIndexes(
  points: Types.Point2[],
  otherPoints: Types.Point2[]
): [number, number] | undefined {
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < otherPoints.length; j++) {
      if (isEqual(points[i], otherPoints[j])) {
        return [i, j];
      }
    }
  }
}
/**
 * Returns the following index value (on circular basis) of index param on the given direction.
 */
function followingIndex(
  index: number,
  size: number,
  direction: number
): number {
  return (index + size + direction) % size;
}

/**
 * Circular finding that returns the next index for two list where the criteria is met.
 */
function circularFindNextIndexBy(
  pointContent: [number, number, Types.Point2[]],
  otherPointContent: [number, number, Types.Point2[]],
  criteria: (pointA: Types.Point2, pointB: Types.Point2) => boolean,
  direction: number
): [number, number] {
  const [, indexDelimiter, points] = pointContent;
  const [, otherIndexDelimiter, otherPoints] = otherPointContent;

  const pointsLength = points.length;
  const otherPointsLength = otherPoints.length;

  let startIndex = pointContent[0];
  let otherStartIndex = otherPointContent[0];

  function validIndex(
    _index: number,
    _indexDelimiter: number,
    _points: Types.Point2[]
  ): boolean {
    return _points[_index] && _index !== _indexDelimiter;
  }

  while (
    validIndex(startIndex, indexDelimiter, points) &&
    validIndex(otherStartIndex, otherIndexDelimiter, otherPoints)
  ) {
    if (criteria(otherPoints[otherStartIndex], points[startIndex])) {
      break;
    }

    startIndex = followingIndex(startIndex, pointsLength, direction);
    otherStartIndex = followingIndex(
      otherStartIndex,
      otherPointsLength,
      direction
    );
  }

  return [startIndex, otherStartIndex];
}

/**
 * Given two list it will find the first and last index of segment from points that diverges from previousPoints
 */
function findChangedSegment(
  points: Types.Point2[],
  previousPoints: Types.Point2[]
): [number, number] {
  const [firstMatchIndex, previousFirstMatchIndex] =
    findMatchIndexes(points, previousPoints) || [];

  const toBeNotEqualCriteria = (pointA, pointB) =>
    isEqualByProximity(pointA, pointB) === false;

  const [lowDiffIndex, lowOtherDiffIndex] = circularFindNextIndexBy(
    [
      followingIndex(firstMatchIndex, points.length, 1),
      firstMatchIndex,
      points,
    ],
    [
      followingIndex(previousFirstMatchIndex, previousPoints.length, 1),
      previousFirstMatchIndex,
      previousPoints,
    ],
    toBeNotEqualCriteria,
    1
  );

  const [highIndex] = circularFindNextIndexBy(
    [followingIndex(lowDiffIndex, points.length, -1), lowDiffIndex, points],
    [
      followingIndex(lowOtherDiffIndex, previousPoints.length, -1),
      lowOtherDiffIndex,
      previousPoints,
    ],
    toBeNotEqualCriteria,
    -1
  );

  return [lowDiffIndex, highIndex];
}

/**
 * Interpolates the given list of points. In case there is a pointsOfReference the interpolation will occur only on segment disjoint of two list. I.e list of points from param points that are not on list of points from param pointsOfReference.
 */
export function getInterpolatedPoints(
  configuration: Record<any, any>,
  points: Types.Point2[],
  pointsOfReference?: Types.Point2[]
): Types.Point2[] {
  const { interpolation } = configuration;

  const result = points;

  if (interpolation) {
    const {
      knotSampleSize,
      editKnotSampleSize,
      enabled = false,
    } = interpolation;

    if (enabled) {
      // partial or total interpolation
      const [changedIniIndex, changedEndIndex] = pointsOfReference
        ? findChangedSegment(points, pointsOfReference)
        : [0, points.length - 1];

      // do not interpolate if there is no valid segment
      if (!points[changedIniIndex] || !points[changedEndIndex]) {
        return points;
      }

      return interpolateSegmentPoints(
        points,
        changedIniIndex,
        changedEndIndex,
        pointsOfReference ? editKnotSampleSize : knotSampleSize
      );
    }
  }

  return result;
}
