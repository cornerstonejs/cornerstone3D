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
 * both as full geometric thicknesses in mm. As in Rule M the comparison is
 * strict and tightened by a relative epsilon, because the common case places
 * the neighbouring slice exactly on the boundary and it must be excluded so
 * that a viewport shows the annotations created on its slice and not those
 * created on the next one.
 *
 * Here the epsilon is relative to the half width rather than to the voxel
 * thickness `T_v` used by Rule M, because `T_v` requires a volume and display
 * decisions are made without one.
 *
 * ## Backwards compatibility
 *
 * When the reference carries no thickness, this falls back to the historical
 * behaviour - an exact-to-within-`isEqual` plane match. That is deliberate:
 * every annotation created before `PlaneRestriction.thickness` existed has no
 * thickness, and widening their visibility would change what existing viewers
 * display. Only references that actually record a thickness get the window.
 *
 * See https://github.com/cornerstonejs/cornerstone3D/issues/2889
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
