import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

type Sphere = {
  center: Types.Point3 | vec3;
  radius: number;
};

/**
 * Checks if a point is inside a sphere. Note: this is similar to the
 * `pointInEllipse` function, but since we don't need checks for the
 * ellipse's rotation in different views, we can use a simpler equation
 * which would be faster (no if statements).
 *
 * @param sphere - Sphere object with center and radius
 * @param pointLPS - the point to check in world coordinates
 * @returns boolean
 */
export default function pointInSphere(
  sphere: Sphere,
  pointLPS: Types.Point3
): boolean {
  const { center, radius } = sphere;

  return (
    (pointLPS[0] - center[0]) ** 2 +
      (pointLPS[1] - center[1]) ** 2 +
      (pointLPS[2] - center[2]) ** 2 <=
    radius ** 2
  );
}
