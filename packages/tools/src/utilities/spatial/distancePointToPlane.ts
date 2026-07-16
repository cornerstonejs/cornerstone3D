import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import type { Plane } from './types';

/**
 * Returns the signed distance from a world point to a plane, in world units
 * (millimeters for patient coordinate systems). The sign is positive on the
 * side of the plane the normal points towards.
 */
export default function distancePointToPlane(
  point: Types.Point3,
  plane: Plane
): number {
  const normal = vec3.normalize(vec3.create(), plane.normal);
  const toPoint = vec3.subtract(vec3.create(), point, plane.point);

  return vec3.dot(toPoint, normal);
}
