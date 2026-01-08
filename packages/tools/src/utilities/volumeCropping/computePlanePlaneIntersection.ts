import { vec3 } from 'gl-matrix';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import type { Types } from '@cornerstonejs/core';
import type { ClippingPlane } from './types';
import { PARALLEL_PLANE_TOLERANCE } from './constants';

/**
 * Computes the intersection line between a clipping plane and a viewport's view plane.
 * Returns the direction vector and a point on the intersection line.
 *
 * @param clippingPlane - The clipping plane with origin and normal
 * @param viewPlaneNormal - The normal vector of the viewport's view plane
 * @param viewPlanePoint - A point on the viewport's view plane
 * @returns Object with direction and point of intersection, or null if planes are parallel
 */
export function computePlanePlaneIntersection(
  clippingPlane: ClippingPlane,
  viewPlaneNormal: Types.Point3,
  viewPlanePoint: Types.Point3
): { direction: Types.Point3; point: Types.Point3 } | null {
  const n1 = clippingPlane.normal;
  const p1 = clippingPlane.origin;
  const n2 = viewPlaneNormal;
  const p2 = viewPlanePoint;

  const dir = vec3.create();
  vec3.cross(dir, n1, n2);
  const dirLenSq = vec3.squaredLength(dir);

  if (dirLenSq < PARALLEL_PLANE_TOLERANCE) {
    return null; // planes effectively parallel
  }

  const d1 = vtkMath.dot(n1, p1);
  const d2 = vtkMath.dot(n2, p2);

  // point = (d1 (n2 × dir) + d2 (dir × n1)) / |dir|^2
  const term1 = vec3.create();
  const term2 = vec3.create();
  vec3.cross(term1, n2, dir);
  vec3.scale(term1, term1, d1);
  vec3.cross(term2, dir, n1);
  vec3.scale(term2, term2, d2);

  const point = vec3.create();
  vec3.add(point, term1, term2);
  vec3.scale(point, point, 1 / dirLenSq);

  if (
    !Number.isFinite(point[0]) ||
    !Number.isFinite(point[1]) ||
    !Number.isFinite(point[2])
  ) {
    return null;
  }

  const direction = vec3.create();
  vec3.scale(direction, dir, 1 / Math.sqrt(dirLenSq));

  return {
    direction: direction as Types.Point3,
    point: point as Types.Point3,
  };
}
