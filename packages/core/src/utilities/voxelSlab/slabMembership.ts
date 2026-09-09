import { vec3 } from 'gl-matrix';
import type { Point3 } from '../../types';

/**
 * Relative tolerance used when testing whether something lies within a slab.
 *
 * The slab tests below are strict (`<`, not `<=`), because the default `T = T_v`
 * places the neighbouring voxel centres *exactly* on the boundary and must
 * exclude them. Signed distances come from dot products, so a value that is
 * mathematically on the boundary lands on either side of it, and without a
 * tolerance the most common case in the system would pick up two extra layers
 * at random. The tolerance is relative to the voxel thickness because spacings
 * range from microns to centimetres, and 1e-5 sits above float32 error.
 *
 * Why strict, and the 20 nm dead band it implies:
 * `docs/docs/concepts/cornerstone-tools/annotation/voxel-statistics.md`.
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
 * `T` is a full geometric thickness in mm. Null, undefined, and 0 or less all
 * count as "not recorded" and default to one voxel along the normal, because a
 * planar shape reports 0 from `getRequiredThickness` and a caller may pass that
 * value straight through. See
 * `docs/docs/concepts/cornerstone-tools/annotation/voxel-statistics.md`.
 *
 * @param annotationThickness - `T`, or null/undefined/0 when not recorded.
 * @param voxelThickness - `T_v`, the fallback.
 */
export function resolveAnnotationThickness(
  annotationThickness: number | null | undefined,
  voxelThickness: number
): number {
  return Number.isFinite(annotationThickness) &&
    (annotationThickness as number) > 0
    ? (annotationThickness as number)
    : voxelThickness;
}

/**
 * The half width used to decide which *voxels* an area annotation contains
 * (Rule M): `d = (T + T_v) / 2`.
 *
 * The `T_v` term widens the slab by half a voxel on each side, so a voxel
 * centre qualifies exactly when the voxel itself overlaps the slab. One
 * consequence is visible in reported statistics: a plane exactly midway between
 * two voxel centres selects **both** layers.
 *
 * The viewport slab thickness `t` does **not** appear here. See
 * `docs/docs/concepts/cornerstone-tools/annotation/voxel-statistics.md`.
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
