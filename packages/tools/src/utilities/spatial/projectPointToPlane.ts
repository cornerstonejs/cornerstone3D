import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import type { Plane } from './types';
import distancePointToPlane from './distancePointToPlane';

/**
 * Returns the closest point on the plane to the given world point
 * (the orthogonal projection of the point onto the plane).
 */
export default function projectPointToPlane(
  point: Types.Point3,
  plane: Plane
): Types.Point3 {
  const normal = vec3.normalize(vec3.create(), plane.normal);
  const distance = distancePointToPlane(point, plane);

  return [
    point[0] - distance * normal[0],
    point[1] - distance * normal[1],
    point[2] - distance * normal[2],
  ];
}
