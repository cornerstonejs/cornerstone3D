import { vec3 } from 'gl-matrix';
import type { Point3 } from '../../types';
import { isEqual } from '../isEqual';
import { getDisplayHalfWidth, SLAB_RELATIVE_EPSILON } from './slabMembership';

/**
 * The depth half of Rule D: whether a referenced plane is close enough to a
 * viewport's focal plane to be displayed.
 *
 * ```
 *   |(point - focalPoint) . n| < (t + T) / 2
 * ```
 *
 * where `t` is the viewport's slab thickness and `T` the plane's own thickness,
 * both full geometric thicknesses in mm. A reference with no thickness falls
 * back to an exact-to-within-`isEqual` plane match.
 *
 * See `docs/docs/concepts/cornerstone-tools/annotation/voxel-statistics.md`.
 *
 * @param planePoint - The point identifying the referenced plane's depth.
 * @param focalPoint - The viewport camera focal point.
 * @param viewPlaneNormal - The viewport view plane normal. Unit length.
 * @param annotationThickness - `T`, or undefined when not recorded.
 * @param viewportSlabThickness - `t`. Defaults to 0, which makes the window
 *   `T / 2` - correct for a stack viewport, which has no slab.
 */
export function isPlaneDepthViewable(
  planePoint: Point3,
  focalPoint: Point3,
  viewPlaneNormal: Point3,
  annotationThickness?: number,
  viewportSlabThickness = 0
): boolean {
  const pointVector = vec3.sub(vec3.create(), planePoint, focalPoint);
  const depth = vec3.dot(pointVector, viewPlaneNormal as vec3);

  if (!Number.isFinite(annotationThickness)) {
    return isEqual(0, depth);
  }

  const halfWidth = getDisplayHalfWidth(
    viewportSlabThickness,
    annotationThickness as number
  );

  return (
    Math.abs(depth) < halfWidth - Math.abs(halfWidth) * SLAB_RELATIVE_EPSILON
  );
}
