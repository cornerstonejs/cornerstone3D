import type { Types } from '@cornerstonejs/core';

/**
 * Determines whether a 2D point is inside a polyline.
 * The algorithm works by drawing horizontal rays from the point to the right side
 * of the polygon, counting the number of times the ray intersects a polygon edge.
 *  If the winding number is odd, the point is inside the polygon.
 *
 * @param point - The 2D point to check.
 * @param polyline - The polyline represented as an array of 2D points.
 * @returns A boolean indicating whether the point is inside the polyline.
 */
export function isPointInsidePolyline2D(
  point: Types.Point2,
  polyline: Types.Point2[]
) {
  const n = polyline.length;
  let windingNumber = 0;
  const x = point[0],
    y = point[1];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = polyline[i][0],
      yi = polyline[i][1];
    const xj = polyline[j][0],
      yj = polyline[j][1];

    if (yi === yj && y !== yi) {
      continue;
    }

    if (
      ((yi < y && yj >= y) || (yj < y && yi >= y)) &&
      xi + ((y - yi) / (yj - yi)) * (xj - xi) < x
    ) {
      windingNumber++;
    }
  }

  return windingNumber % 2 !== 0;
}

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
      'Cannot find a shared dimension index for the polyline points'
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

  return isPointInsidePolyline2D(point2D, points2D);
}
