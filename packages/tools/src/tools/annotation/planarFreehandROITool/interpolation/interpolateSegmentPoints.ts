import { Types } from '@cornerstonejs/core';
import { interpolatePoints } from './algorithms/bspline';

/**
 * Interpolates a segment of points from iniIndex until endIndex.
 * It uses the knotSampleSize param to calculate which point from points will be used as knot or not.
 * Lower knotSampleSize value is more points will be used, i.e the interpolation will be harder.
 * By default it uses b-spline algorithm.
 * The result total of points is equal to original points.
 */
export default function interpolateSegmentPoints(
  points: Types.Point2[],
  iniIndex: number,
  endIndex: number,
  knotSampleSize: number
): Types.Point2[] {
  const segmentSize = endIndex - iniIndex + 1;
  if (isNaN(segmentSize) || !segmentSize || !knotSampleSize) {
    return points;
  }

  const knotsDistance = Math.floor(segmentSize / knotSampleSize);

  const interpolationIniIndex = Math.max(0, iniIndex - 4 * knotsDistance);
  const interpolationEndIndex = Math.min(
    points.length - 1,
    endIndex + 4 * knotsDistance
  );

  const segmentPointsUnchangedBeg = points.slice(0, interpolationIniIndex);

  const segmentPointsUnchangedEnd = points.slice(
    interpolationEndIndex + 1,
    points.length
  );

  const knotsIndexes = [];
  let intIt = 0;
  let nextKnotIndex = intIt * knotsDistance + interpolationIniIndex;

  while (nextKnotIndex <= interpolationEndIndex) {
    knotsIndexes[intIt] = nextKnotIndex;
    intIt++;
    nextKnotIndex = intIt * knotsDistance + interpolationIniIndex;
  }

  // ensure end index is also present
  if (knotsIndexes[knotsIndexes.length - 1] < interpolationEndIndex) {
    knotsIndexes.push(interpolationEndIndex);
  }

  const interpolatedPoints = interpolatePoints(points, knotsIndexes);

  return [
    ...segmentPointsUnchangedBeg,
    ...interpolatedPoints,
    ...segmentPointsUnchangedEnd,
  ];
}
