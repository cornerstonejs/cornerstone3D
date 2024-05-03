import type { Types } from '@cornerstonejs/core';
import containsPoint from './containsPoint';
import { projectTo2D } from './projectTo2D';

/**
 * Determines whether a 3D point is inside a polyline in 3D space.
 *
 * The algorithm works by reducing the polyline and point to 2D space, and then
 * using the 2D algorithm to determine whether the point is inside the polyline.
 *
 * @param point - The 3D point to test.
 * @param polyline - The polyline represented as an array of 3D points.
 * @param options.holesPolyline - An array of polylines representing each hole, so it
 * is an array of arrays of 3D points.
 * @returns A boolean indicating whether the point is inside the polyline.
 * @throws An error if a shared dimension index cannot be found for the polyline points.
 */
export function isPointInsidePolyline3D(
  point: Types.Point3,
  polyline: Types.Point3[],
  options: { holes?: Types.Point3[][] } = {}
) {
  const { sharedDimensionIndex, projectedPolyline } = projectTo2D(polyline);

  const { holes } = options;
  const projectedHoles = [] as Types.Point2[][];

  if (holes) {
    for (let i = 0; i < holes.length; i++) {
      const hole = holes[i];
      const hole2D = [] as Types.Point2[];

      for (let j = 0; j < hole.length; j++) {
        hole2D.push([
          hole[j][(sharedDimensionIndex + 1) % 3],
          hole[j][(sharedDimensionIndex + 2) % 3],
        ]);
      }

      projectedHoles.push(hole2D);
    }
  }

  const point2D = [
    point[(sharedDimensionIndex + 1) % 3],
    point[(sharedDimensionIndex + 2) % 3],
  ] as Types.Point2;

  return containsPoint(projectedPolyline, point2D, { holes: projectedHoles });
}
