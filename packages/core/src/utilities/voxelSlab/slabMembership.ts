import { vec3 } from 'gl-matrix';
import type { Point3 } from '../../types';

/**
 * Relative tolerance used when testing whether something lies within a slab.
 *
 * The slab tests below are deliberately strict (`<`, not `<=`), because the
 * default annotation thickness `T = T_v` places the neighbouring voxel centres
 * *exactly* on the slab boundary, and they must be excluded so that an
 * acquisition-orientation annotation covers exactly one layer of voxels.
 *
 * Signed distances are computed from world coordinates via dot products, so a
 * value that is mathematically exactly on the boundary lands either side of it.
 * Without a tolerance the most common case in the whole system would
 * non-deterministically pick up two extra layers. The tolerance is relative to
 * the voxel thickness rather than absolute because spacings in medical imaging
 * range from microns to centimetres.
 *
 * 1e-5 is chosen so that inputs carrying float32 error - which is most of them,
 * since gl-matrix vectors and the rest of the rendering geometry are float32 -
 * are comfortably inside it, float32 giving roughly 1e-7 relative precision.
 *
 * The tolerance has one visible consequence worth knowing: because the rule is
 * strict, a thickness exceeding an exact voxel multiple by less than
 * `2 * SLAB_RELATIVE_EPSILON * T_v` still selects the smaller number of layers.
 * At `T_v = 1 mm` that dead band is 20 nm wide, so it is unreachable in
 * practice, but it does mean `T = T_v + 1e-6` behaves as `T = T_v` rather than
 * pulling in both neighbours.
 */
export const SLAB_RELATIVE_EPSILON = 1e-5;

/**
 * The tolerance to use for slab tests against a grid with the given voxel
 * thickness along the normal.
 *
 * @param voxelThickness - `T_v`, see `getVoxelThicknessAlongNormal`.
 */
export function getSlabEpsilon(voxelThickness: number): number {
  return Math.abs(voxelThickness) * SLAB_RELATIVE_EPSILON;
}

/**
 * Resolves the annotation thickness `T` to use.
 *
 * `T` is a full geometric thickness in world units (mm). When an annotation
 * carries no thickness - because it was created on a stack viewport, or was
 * loaded from a source that predates the field - it defaults to one voxel along
 * the view plane normal.
 *
 * @param annotationThickness - `T`, or null/undefined when not recorded.
 * @param voxelThickness - `T_v`, the fallback.
 */
export function resolveAnnotationThickness(
  annotationThickness: number | null | undefined,
  voxelThickness: number
): number {
  return Number.isFinite(annotationThickness)
    ? (annotationThickness as number)
    : voxelThickness;
}

/**
 * The half width used to decide which *voxels* an area annotation contains
 * (Rule M): `d = (T + T_v) / 2`.
 *
 * The `T_v` term dilates the slab by half a voxel on each side, so that a voxel
 * centre qualifies exactly when the voxel itself overlaps the annotation's
 * slab. It has no effect in the default case of `T = T_v` anchored on a voxel
 * centre, which yields exactly one layer either way; it matters for planes that
 * do not pass through voxel centres, which would otherwise select nothing, and
 * for thicker slabs, where an undilated test asked for two voxels of thickness
 * would select only one.
 *
 * The dilation has one consequence worth stating, because it is visible in
 * reported statistics: an annotation plane sitting exactly midway between two
 * voxel centres selects **both** layers, not one. Both voxels genuinely overlap
 * the slab by equal amounts, so there is no principled way to pick one, and
 * picking one would make the count depend on a rounding tie. MPR at a
 * half-slice position is the common way to reach this, and a mean over two
 * layers is not the same number as a mean over one. This is a deliberate
 * departure from the older snap-to-nearest-index behaviour, which always
 * reported a single layer.
 *
 * Note the viewport slab thickness `t` does **not** appear here. Statistics are
 * a property of the annotation and the data, never of the viewport.
 *
 * @param annotationThickness - `T`, already resolved.
 * @param voxelThickness - `T_v`.
 */
export function getMembershipHalfWidth(
  annotationThickness: number,
  voxelThickness: number
): number {
  return (annotationThickness + voxelThickness) / 2;
}

/**
 * The half width used to decide whether an annotation is *displayed* in a
 * viewport (Rule D): `(t + T) / 2`.
 *
 * Unlike Rule M this uses the viewport slab thickness, because whether
 * something is shown legitimately depends on how thick a slab is being viewed.
 *
 * @param viewportSlabThickness - `t`, full geometric thickness in mm.
 * @param annotationThickness - `T`, already resolved.
 */
export function getDisplayHalfWidth(
  viewportSlabThickness: number,
  annotationThickness: number
): number {
  return (viewportSlabThickness + annotationThickness) / 2;
}

/**
 * The signed distance from `point` to the plane through `planePoint` with the
 * given normal, measured along that normal.
 */
export function signedDistanceToPlane(
  point: Point3,
  planePoint: Point3,
  normal: Point3
): number {
  return (
    (point[0] - planePoint[0]) * normal[0] +
    (point[1] - planePoint[1]) * normal[1] +
    (point[2] - planePoint[2]) * normal[2]
  );
}

/**
 * Whether a signed distance falls within a slab of the given half width.
 *
 * Strict, and tightened by `epsilon` - see {@link SLAB_RELATIVE_EPSILON} for
 * why both of those matter.
 */
export function isWithinSlab(
  signedDistance: number,
  halfWidth: number,
  epsilon: number
): boolean {
  return Math.abs(signedDistance) < halfWidth - epsilon;
}

/**
 * Rule M, depth half: whether a voxel centre is close enough to the annotation
 * plane to be included.
 *
 * This is only the depth test. A voxel is in an area annotation when this
 * passes *and* its projection along the normal onto the annotation plane falls
 * inside the annotation's 2D shape.
 *
 * @param voxelCenter - The voxel centre in world coordinates.
 * @param planePoint - `P0`, the annotation plane anchor.
 * @param normal - `n`, the annotation's view plane normal. Unit length.
 * @param annotationThickness - `T`, already resolved.
 * @param voxelThickness - `T_v`.
 */
export function isVoxelCenterInSlab(
  voxelCenter: Point3,
  planePoint: Point3,
  normal: Point3,
  annotationThickness: number,
  voxelThickness: number
): boolean {
  return isWithinSlab(
    signedDistanceToPlane(voxelCenter, planePoint, normal),
    getMembershipHalfWidth(annotationThickness, voxelThickness),
    getSlabEpsilon(voxelThickness)
  );
}

/**
 * Projects a world point onto the plane through `planePoint` with the given
 * normal, along that normal.
 *
 * @param point - The point to project.
 * @param planePoint - A point on the target plane.
 * @param normal - The plane normal. Unit length.
 * @param out - Optional destination, to avoid allocating per voxel.
 */
export function projectPointOntoPlane(
  point: Point3,
  planePoint: Point3,
  normal: Point3,
  out: Point3 = [0, 0, 0]
): Point3 {
  const distance = signedDistanceToPlane(point, planePoint, normal);
  out[0] = point[0] - distance * normal[0];
  out[1] = point[1] - distance * normal[1];
  out[2] = point[2] - distance * normal[2];
  return out;
}

/**
 * Convenience wrapper returning the normalised form of a possibly unnormalised
 * normal, without allocating when it is already unit length.
 */
export function asUnitNormal(normal: Point3): Point3 {
  const lengthSquared =
    normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2];
  if (Math.abs(lengthSquared - 1) < Number.EPSILON * 8) {
    return normal;
  }
  return vec3.normalize(vec3.create(), normal as vec3) as Point3;
}
