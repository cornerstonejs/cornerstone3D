import { utilities } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';

const epsilon = 1e-6;

/** Sentinel value when the polyline lies on an oblique (non-axis-aligned) plane. */
export const OBLIQUE_PROJECTION_INDEX = -1;

export type ProjectTo2DResult = {
  sharedDimensionIndex: number;
  projectedPolyline: Types.Point2[];
  origin?: Types.Point3;
  right?: vec3;
  up?: vec3;
};

export function isObliqueProjection(sharedDimensionIndex: number): boolean {
  return sharedDimensionIndex === OBLIQUE_PROJECTION_INDEX;
}

/**
 * Projects a single 3D point to 2D using axis-aligned or oblique projection data.
 */
export function projectPointTo2D(
  point: Types.Point3,
  sharedDimensionIndex: number,
  origin?: Types.Point3,
  right?: vec3,
  up?: vec3
): Types.Point2 {
  if (isObliqueProjection(sharedDimensionIndex)) {
    const vec = vec3.create();
    vec3.subtract(vec, point, origin);

    return [vec3.dot(vec, right), vec3.dot(vec, up)];
  }

  return [
    point[(sharedDimensionIndex + 1) % 3],
    point[(sharedDimensionIndex + 2) % 3],
  ];
}

/**
 * Projects a polyline from 3D to 2D by reducing one dimension.
 *
 * @param polyline - The polyline to be projected.
 * @param [viewPlaneNormal] - Camera normal direction.
 * @param [viewUp] - Camera up direction.
 * @returns Axis-aligned or oblique 2D projection data. For oblique results,
 * `sharedDimensionIndex` is {@link OBLIQUE_PROJECTION_INDEX} and `origin`,
 * `right`, `up`, and `viewPlaneNormal` are populated.
 * @throws When the polyline is empty, oblique without camera vectors, or the
 * camera vectors are degenerate.
 */
export function projectTo2D(
  polyline: Types.Point3[],
  viewPlaneNormal?: Types.Point3,
  viewUp?: Types.Point3
): ProjectTo2DResult {
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

  // Non-oblique view
  if (sharedDimensionIndex !== undefined) {
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

  // Oblique view
  if (!viewPlaneNormal || !viewUp) {
    throw new Error(
      'Cannot project oblique polyline without viewPlaneNormal and viewUp'
    );
  }

  return projectObliquePolyline(polyline, viewPlaneNormal, viewUp);
}

function projectObliquePolyline(
  polyline: Types.Point3[],
  viewPlaneNormal: Types.Point3,
  viewUp: Types.Point3
): ProjectTo2DResult {
  // right = up X vpn
  const right = vec3.create();
  vec3.cross(right, viewUp, viewPlaneNormal);
  vec3.normalize(right, right);

  const up = vec3.create();
  vec3.cross(up, viewPlaneNormal, right);
  vec3.normalize(up, up);

  // Set the first point of the drawing as origin
  const origin = [...polyline[0]] as Types.Point3;

  // Change every 3D point into a flat 2D point using right and up vectors
  const points2D = polyline.map((point) =>
    projectPointTo2D(point, OBLIQUE_PROJECTION_INDEX, origin, right, up)
  );

  return {
    sharedDimensionIndex: OBLIQUE_PROJECTION_INDEX,
    projectedPolyline: points2D,
    origin,
    right,
    up,
  };
}
