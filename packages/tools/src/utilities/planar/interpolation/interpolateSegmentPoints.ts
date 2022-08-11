import { Types } from '@cornerstonejs/core';
import { interpolatePoints } from './algorithms/bspline';

/**
 * Returns a list of uniform distributed values. This list contains the max amount of values which has at least a minimum distance between two consecutive values.
 * minDistributionDistance means the min distance between two consecutive distributed values.
 * Closed interval contains the min/max values.
 *
 * Formula for reference
 * For given {x ∈ R | x ≥ 0} and {minDis ∈ R | minDis ≥ 0}, ∃ D(x) where D(x) ≥ a and D(x) ≤ b  =>
 *         |
 * D(x)  = |                  (b - a)
 *         |  round( ------------------------ * x  )   + a
 *         |                (b - a + 1)
 *         |        round( -----------  )
 *         |                 minDis
 */
function getContinuousUniformDistributionValues(
  minDistributionDistance: number,
  closedInterval: [number, number]
): number[] {
  const result = [];
  const [intervalIni, intervalEnd] = closedInterval;

  const intervalSize = intervalEnd - intervalIni + 1;
  const intensity = Math.floor(intervalSize / minDistributionDistance);

  let x = 0;
  let continuosDistributionValue =
    Math.round(((intervalSize - 1) / (intensity - 1)) * x) + intervalIni;

  while (continuosDistributionValue <= intervalEnd) {
    result.push(continuosDistributionValue);
    x++;
    continuosDistributionValue =
      Math.round(((intervalSize - 1) / (intensity - 1)) * x) + intervalIni;
  }

  return result;
}

/**
 * Interpolates a segment of points from iniIndex until endIndex.
 * The process of interpolation considers the param knotsRatioPercentage as being the percentage of points from Segment that are likely to be considered.
 * By default it uses b-spline algorithm.
 * The result total of points is equal to original points.
 */
export default function interpolateSegmentPoints(
  points: (Types.Point2 | Types.Point3)[],
  iniIndex: number,
  endIndex: number,
  knotsRatioPercentage: number
): (Types.Point2 | Types.Point3)[] {
  const segmentSize = endIndex - iniIndex + 1;

  const amountOfKnots =
    Math.floor((knotsRatioPercentage / 100) * segmentSize) ?? 1;
  const minKnotDistance = Math.floor(segmentSize / amountOfKnots) ?? 1;

  if (isNaN(segmentSize) || !segmentSize || !minKnotDistance) {
    return points;
  }

  // segment should be at least the double of desired minKnot distance. This will ensure at there will enough knots to interpolate.
  if (segmentSize / minKnotDistance < 2) {
    return points;
  }

  const interpolationIniIndex = Math.max(0, iniIndex);
  const interpolationEndIndex = Math.min(points.length - 1, endIndex);
  const segmentPointsUnchangedBeg = points.slice(0, interpolationIniIndex);

  const segmentPointsUnchangedEnd = points.slice(
    interpolationEndIndex + 1,
    points.length
  );

  const knotsIndexes = getContinuousUniformDistributionValues(minKnotDistance, [
    interpolationIniIndex,
    interpolationEndIndex,
  ]);

  const interpolatedPoints = interpolatePoints(points, knotsIndexes);

  return [
    ...segmentPointsUnchangedBeg,
    ...interpolatedPoints,
    ...segmentPointsUnchangedEnd,
  ];
}
