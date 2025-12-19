import type { VolumeViewport, Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

/**
 * Computes the ellipse boundary points (top, bottom, left, right) based on two
 * given world-space points and the viewport's camera orientation.
 *
 * Depending on the `returnWorldCoordinates` flag, it returns either:
 * - The ellipse boundary points in world coordinates or
 * - The corresponding points in canvas coordinates (projected using the viewport).
 *
 * This function:
 * - Uses the camera's `viewUp` and `viewPlaneNormal` to derive the orientation.
 * - Computes the perpendicular `viewRight` vector via cross product.
 * - Calculates top, bottom, left, and right points relative to the ellipse center.
 *
 * @param points Array containing:
 *   - `[0]`: The center of the ellipse in world coordinates.
 *   - `[1]`: A point on the ellipse radius in world coordinates.
 * @param viewport  The viewport instance
 * @returns Returns an array of world-space coordinates representing:
 *   1. Bottom
 *   2. Top
 *   3. Left
 *   4. Right
 */
export default function getEllipseWorldCoordinates(
  points: [Types.Point3, Types.Point3],
  viewport: Types.IStackViewport | VolumeViewport
): Types.Point3[] {
  const camera = viewport.getCamera();
  const { viewUp, viewPlaneNormal } = camera;

  // Calculate view right vector
  const viewRight = vec3.create();
  vec3.cross(viewRight, viewUp, viewPlaneNormal);

  const [centerWorld, endWorld] = points;
  const centerToEndDistance = vec3.distance(centerWorld, endWorld);

  // Calculate the four boundary points in world coordinates
  const bottomWorld = vec3.create();
  const topWorld = vec3.create();
  const leftWorld = vec3.create();
  const rightWorld = vec3.create();

  for (let i = 0; i <= 2; i++) {
    bottomWorld[i] = centerWorld[i] - viewUp[i] * centerToEndDistance;
    topWorld[i] = centerWorld[i] + viewUp[i] * centerToEndDistance;
    leftWorld[i] = centerWorld[i] - viewRight[i] * centerToEndDistance;
    rightWorld[i] = centerWorld[i] + viewRight[i] * centerToEndDistance;
  }

  const ellipseWorldCoordinates = [
    bottomWorld,
    topWorld,
    leftWorld,
    rightWorld,
  ] as [Types.Point3, Types.Point3, Types.Point3, Types.Point3];
  return ellipseWorldCoordinates;
}
