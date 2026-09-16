import { utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const epsilon = 1e-6;

/**
 * Projects a polyline from 3D to 2D by reducing one dimension.
 *
 * @param polyline - The polyline to be projected.
 * @returns An object containing the shared dimension index and the projected polyline in 2D.
 * @throws Error if a shared dimension index cannot be found for the polyline.
 */
export function projectTo2D(polyline: Types.Point3[]) {
  // We need to reduce one dimension to 2D, so basically
  // we need to find the dimension index that is shared by all points
  // Use the first three points, two is enough but three is more robust
  let sharedDimensionIndex;

  const testPoints = utilities.getRandomSampleFromArray(polyline, 50);

  for (let i = 0; i < 3; i++) {
    if (
      testPoints.every(
        (point, index, array) => Math.abs(point[i] - array[0][i]) < epsilon
      )
    ) {
      sharedDimensionIndex = i;
      break;
    }
  }

  if (sharedDimensionIndex === undefined) {
    throw new Error(
      'Cannot find a shared dimension index for polyline, probably oblique plane'
    );
  }

  // convert polyline list and point to 2D
  const points2D = [] as Types.Point2[];

  const firstDim = (sharedDimensionIndex + 1) % 3;
  const secondDim = (sharedDimensionIndex + 2) % 3;

  for (let i = 0; i < polyline.length; i++) {
    points2D.push([polyline[i][firstDim], polyline[i][secondDim]]);
  }

  return {
    sharedDimensionIndex,
    projectedPolyline: points2D,
  };
}
