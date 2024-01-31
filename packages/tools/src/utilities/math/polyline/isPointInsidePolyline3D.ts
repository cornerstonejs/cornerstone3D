import type { Types } from '@cornerstonejs/core';
import containsPoint from './containsPoint';

/**
 * Determines whether a 3D point is inside a polyline in 3D space.
 *
 * The algorithm works by reducing the polyline and point to 2D space, and then
 * using the 2D algorithm to determine whether the point is inside the polyline.
 *
 * @param point - The 3D point to test.
 * @param polyline - The polyline represented as an array of 3D points.
 * @returns A boolean indicating whether the point is inside the polyline.
 * @throws An error if a shared dimension index cannot be found for the polyline points.
 */
export function isPointInsidePolyline3D(
  point: Types.Point3,
  polyline: Types.Point3[]
) {
  // Todo: handle oblique planes

  // We need to reduce one dimension to 2D, so basically
  // we need to find the dimension index that is shared by all points
  // Use the first three points, two is enough but three is more robust
  let sharedDimensionIndex;

  const testPoints = polyline.slice(0, 3);
  for (let i = 0; i < 3; i++) {
    if (testPoints.every((point, index, array) => point[i] === array[0][i])) {
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

  for (let i = 0; i < polyline.length; i++) {
    points2D.push([
      polyline[i][(sharedDimensionIndex + 1) % 3],
      polyline[i][(sharedDimensionIndex + 2) % 3],
    ]);
  }

  const point2D = [
    point[(sharedDimensionIndex + 1) % 3],
    point[(sharedDimensionIndex + 2) % 3],
  ] as Types.Point2;

  return containsPoint(points2D, point2D);
}
