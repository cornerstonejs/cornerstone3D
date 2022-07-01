import {
  interpolateBasis as d3InterpolateBasis,
  quantize as d3Quantize,
} from 'd3-interpolate';
import { zip as d3Zip } from 'd3-array';
import { Types } from '@cornerstonejs/core';

/**
 * Returns a interpolated segment (b-spline algorithm) based on knotsIndexes.
 * KnotsIndexes tells the first/last index of segment and also which index will be present on interpolation.
 */
export function interpolatePoints(
  originalPoints: Types.Point2[],
  knotsIndexes: number[]
): Types.Point2[] {
  if (
    !knotsIndexes ||
    knotsIndexes.length === 0 ||
    knotsIndexes.length === originalPoints.length
  ) {
    return originalPoints;
  }

  const n = knotsIndexes[knotsIndexes.length - 1] - knotsIndexes[0] + 1;
  const xInterpolator = d3InterpolateBasis(
    knotsIndexes.map((k) => originalPoints[k][0])
  );
  const yInterpolator = d3InterpolateBasis(
    knotsIndexes.map((k) => originalPoints[k][1])
  );
  const splinePoints: Types.Point2[] = <Types.Point2[]>(
    d3Zip(d3Quantize(xInterpolator, n), d3Quantize(yInterpolator, n))
  );

  return splinePoints;
}
