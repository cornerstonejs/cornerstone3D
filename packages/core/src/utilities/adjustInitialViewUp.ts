import { vec3 } from 'gl-matrix';
import { reflectVector } from './reflectVector';
import type { Point3 } from '../types';

/**
 * Returns the adjusted initial view up vector, incorporating vertical and horizontal flips.
 *
 * @param initialViewUp - The original viewUp vector before flip/rotation.
 * @param flipHorizontal - Whether the image is flipped horizontally.
 * @param flipVertical - Whether the image is flipped vertically.
 * @param viewPlaneNormal - The normal of the view plane (needed for screen vertical axis).
 */
export function adjustInitialViewUp(
  initialViewUp: Point3,
  flipHorizontal: boolean,
  flipVertical: boolean,
  viewPlaneNormal: Point3
): Point3 {
  let adjustedInitialViewUp = vec3.clone(initialViewUp);

  if (flipVertical) {
    vec3.negate(adjustedInitialViewUp, adjustedInitialViewUp);
  }

  if (flipHorizontal) {
    const screenVerticalAxis = vec3.cross(
      vec3.create(),
      viewPlaneNormal,
      adjustedInitialViewUp
    );
    vec3.normalize(screenVerticalAxis, screenVerticalAxis);
    adjustedInitialViewUp = reflectVector(
      adjustedInitialViewUp,
      screenVerticalAxis
    );
  }

  return adjustedInitialViewUp as Point3;
}
