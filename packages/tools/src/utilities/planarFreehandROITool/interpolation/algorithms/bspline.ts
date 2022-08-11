import {
  interpolateBasis as d3InterpolateBasis,
  quantize as d3Quantize,
} from 'd3-interpolate';
import { zip as d3Zip } from 'd3-array';
import { Types } from '@cornerstonejs/core';

function isPoints3D(
  points: (Types.Point2 | Types.Point3)[]
): points is Types.Point3[] {
  return (points as Types.Point3[])[0]?.length === 3;
}

/**
 * Returns an array of the originalPoints length containing the interpolated data.
 * It interpolates a set of points indexed by knotsIndexes.
 * That is, it DISCARDS all points except those in knotsIndexes. Then, a new set of points is created by using a b-spline on the remaining points, in order to re-create a new set of points.
 */
export function interpolatePoints(
  originalPoints: (Types.Point2 | Types.Point3)[],
  knotsIndexes: number[]
): (Types.Point2 | Types.Point3)[] {
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

  if (isPoints3D(originalPoints)) {
    const zInterpolator = d3InterpolateBasis(
      knotsIndexes.map((k) => originalPoints[k][2])
    );
    return <Types.Point3[]>(
      d3Zip(
        d3Quantize(xInterpolator, n),
        d3Quantize(yInterpolator, n),
        d3Quantize(zInterpolator, n)
      )
    );
  } else {
    return <Types.Point2[]>(
      d3Zip(d3Quantize(xInterpolator, n), d3Quantize(yInterpolator, n))
    );
  }
}
