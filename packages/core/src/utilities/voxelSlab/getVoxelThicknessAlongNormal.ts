import type { mat3 } from 'gl-matrix';
import { vec3 } from 'gl-matrix';
import type { IImageVolume, Point3 } from '../../types';

/**
 * Calculates `T_v`, the thickness of a single voxel measured along `normal`.
 *
 * This is the support width of the voxel box along the normal:
 *
 * ```
 *   T_v = Σᵢ |dᵢ · n| * sᵢ
 * ```
 *
 * where `dᵢ` are the unit direction vectors of the voxel axes and `sᵢ` the
 * spacing along each. A voxel overlaps a slab of half width `d` exactly when
 * its centre lies within `d + T_v / 2` of the plane, which is what makes this
 * the right quantity for a voxel/slab overlap test.
 *
 * This is the L1 length, deliberately **not** the L2 length that
 * {@link getSpacingInNormalDirection} returns. Only L1 answers "how far does
 * this voxel reach along the normal". The two agree when the normal is parallel
 * to a voxel axis, and diverge for oblique ones: 1x1x3 mm voxels at 45 degrees
 * give 2*sqrt(2) ~= 2.83 mm against sqrt(5) ~= 2.24 mm.
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
