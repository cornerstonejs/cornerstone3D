import { vec3 } from 'gl-matrix';
import type { Point3 } from '../../types';

const ACQUISITION_PLANE_TOLERANCE = 0.99;

/**
 * Returns true when a view plane normal is parallel (or anti-parallel) to the
 * scan axis of a volume, that is, the view shows the acquisition plane.
 *
 * @param viewPlaneNormal - The view plane normal to test.
 * @param direction - The 3x3 direction matrix of the volume, row-major; the
 * scan axis is `direction[6..8]`.
 */
export default function isAcquisitionPlaneNormal(
  viewPlaneNormal: Point3 | number[],
  direction: ArrayLike<number>
): boolean {
  const scanAxis = [direction[6], direction[7], direction[8]] as Point3;

  return (
    Math.abs(vec3.dot(viewPlaneNormal as Point3, scanAxis)) >
    ACQUISITION_PLANE_TOLERANCE
  );
}
