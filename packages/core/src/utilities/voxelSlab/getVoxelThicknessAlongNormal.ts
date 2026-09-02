import type { mat3 } from 'gl-matrix';
import { vec3 } from 'gl-matrix';
import type { IImageVolume, Point3 } from '../../types';

/**
 * Calculates `T_v`, the thickness of a single voxel measured along `normal`.
 *
 * This is the *support width* of the voxel box along the normal, that is, the
 * length of the shadow the voxel casts on the normal axis:
 *
 * ```
 *   T_v = Σᵢ |dᵢ · n| * sᵢ
 * ```
 *
 * where `dᵢ` are the unit direction vectors of the voxel axes and `sᵢ` the
 * spacing along each. A voxel overlaps a slab of half width `d` centred on a
 * plane exactly when its centre lies within `d + T_v / 2` of that plane, which
 * is what makes this the correct quantity for voxel/slab overlap tests.
 *
 * Note this is deliberately **not** the same as
 * {@link getSpacingInNormalDirection}, which returns the Euclidean (L2) length
 * of the projected spacing vector. This function returns the L1 length. The two
 * agree whenever the normal is parallel to one of the voxel axes - in
 * particular for any acquisition-orientation view - and diverge for oblique
 * normals, where the L2 value understates how far a voxel actually extends
 * along the normal. For 1x1x3 mm voxels viewed at 45 degrees between an
 * in-plane axis and the slice axis, the L1 value is 2*sqrt(2) ~= 2.83 mm
 * against sqrt(5) ~= 2.24 mm for L2.
 *
 * The distinction is about semantics, not precision: only the L1 length answers
 * "how far does this voxel reach along the normal", which is what a voxel/slab
 * overlap test needs. Both are fine to compute in float32, and the slab
 * tolerance in `slabMembership` is sized to absorb float32 error.
 *
 * @param volume - The volume, or anything carrying its `direction` and `spacing`.
 * @param normal - The direction to measure along. Assumed to be a unit vector.
 * @returns The voxel thickness along the normal, in world units (mm).
 */
export default function getVoxelThicknessAlongNormal(
  volume: IImageVolume | { direction: mat3; spacing: Point3 },
  normal: Point3
): number {
  const { direction, spacing } = volume;

  // Rows of the direction matrix are the unit vectors of the voxel axes, which
  // matches how getSpacingInNormalDirection and the rest of the codebase read it.
  const iVector = direction.slice(0, 3) as Point3;
  const jVector = direction.slice(3, 6) as Point3;
  const kVector = direction.slice(6, 9) as Point3;

  return (
    Math.abs(vec3.dot(iVector, normal as vec3)) * spacing[0] +
    Math.abs(vec3.dot(jVector, normal as vec3)) * spacing[1] +
    Math.abs(vec3.dot(kVector, normal as vec3)) * spacing[2]
  );
}
