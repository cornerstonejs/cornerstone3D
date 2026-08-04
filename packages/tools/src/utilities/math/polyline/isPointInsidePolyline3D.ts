import type { Types } from '@cornerstonejs/core';
import containsPoint from './containsPoint';
import {
  isObliqueProjection,
  projectPointTo2D,
  projectTo2D,
  type ProjectTo2DResult,
} from './projectTo2D';

/**
 * Determines whether a 3D point is inside a polyline in 3D space.
 *
 * The algorithm works by reducing the polyline and point to 2D space, and then
 * using the 2D algorithm to determine whether the point is inside the polyline.
 *
 * @param point - The 3D point to test.
 * @param polyline - The polyline represented as an array of 3D points.
 * @param options.holes - An array of polylines representing each hole, so it
 * is an array of arrays of 3D points.
 * @param options.viewPlaneNormal - Normal of the viewing plane for oblique projections.
 * @param options.viewUp - Up vector of the viewing plane for oblique projections.
 * @param options.precomputedProjection - Pre-calculated 2D projection data.
 * @returns A boolean indicating whether the point is inside the polyline.
 */
export function isPointInsidePolyline3D(
  point: Types.Point3,
  polyline: Types.Point3[],
  options: {
    holes?: Types.Point3[][];
    viewPlaneNormal?: Types.Point3;
    viewUp?: Types.Point3;
    precomputedProjection?: ProjectTo2DResult;
  } = {}
) {
  const { holes, viewPlaneNormal, viewUp, precomputedProjection } = options;

  const projection =
    precomputedProjection ?? projectTo2D(polyline, viewPlaneNormal, viewUp);

  const { sharedDimensionIndex, projectedPolyline, origin, right, up } =
    projection;

  if (isObliqueProjection(sharedDimensionIndex) && (!origin || !right || !up)) {
    throw new Error(
      'Oblique projection requires origin, right, and up vectors'
    );
  }

  // Project holes if they exist
  const projectedHoles =
    holes?.map((hole) =>
      hole.map((p) =>
        projectPointTo2D(p, sharedDimensionIndex, origin, right, up)
      )
    ) ?? [];

  // Project the main point
  const point2D = projectPointTo2D(
    point,
    sharedDimensionIndex,
    origin,
    right,
    up
  );

  return containsPoint(projectedPolyline, point2D, { holes: projectedHoles });
}
