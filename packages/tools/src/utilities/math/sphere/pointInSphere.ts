import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

type Sphere = {
  center: Types.Point3 | vec3;
  radius: number;
  // Square of the radius
  radius2?: number;
};

/**
 * Checks if a point is inside a sphere. Note: this is similar to the
 * `pointInEllipse` function, but since we don't need checks for the
 * ellipse's rotation in different views, we can use a simpler equation
 * which would be faster (no if statements).
 *
 * This is safe to call for point in circle as long as you don't call it with
 * anything off-plane - that is, a circle is a degenerate sphere that is
 * intersected with the primary plane.
 *
 * @param sphere - Sphere object with center and radius and radius squared
 *     as radius2 if you are calling this a huge number of times.
 * @param pointLPS - the point to check in world coordinates
 * @returns boolean
 */
export default function pointInSphere(sphere: Sphere, pointLPS: vec3): boolean {
  const { center, radius } = sphere;
  const radius2 = sphere.radius2 || radius * radius;

  return (
    (pointLPS[0] - center[0]) * (pointLPS[0] - center[0]) +
      (pointLPS[1] - center[1]) * (pointLPS[1] - center[1]) +
      (pointLPS[2] - center[2]) * (pointLPS[2] - center[2]) <=
    radius2
  );
}
