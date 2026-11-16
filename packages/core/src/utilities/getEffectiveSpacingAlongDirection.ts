import type { mat3 } from 'gl-matrix';
import { vec3 } from 'gl-matrix';
import type { IImageVolume, Point3 } from '../types';

/**
 * The distance you must travel along `direction` to cross one voxel-equivalent
 * of the volume's grid.
 *
 * For a unit direction `d` and voxel axes `i, j, k` with spacings `sᵢ`:
 *
 * ```
 *   s_eff = 1 / sqrt( Σᵢ (d · aᵢ / sᵢ)² )
 * ```
 *
 * This is the reciprocal of the rate at which grid boundaries are crossed, so
 * it is the right quantity for choosing a sampling step along an arbitrary
 * direction: sample at `s_eff` and you visit one voxel-equivalent per step no
 * matter how the direction is oriented relative to the grid. It reduces to `sᵢ`
 * exactly when `d` is parallel to axis `i`, since the other two dot products
 * vanish.
 *
 * This is the third of three "spacing along a direction" measures in the
 * codebase, and they answer different questions:
 *
 * - {@link getSpacingInNormalDirection} - the L2 length of the projected
 *   spacing vector, `sqrt( Σᵢ (d · aᵢ · sᵢ)² )`. "How far does the camera dolly
 *   before it sees a new set of voxels."
 * - `getVoxelThicknessAlongNormal` - the L1 length,
 *   `Σᵢ |d · aᵢ| · sᵢ`. How far a single voxel *reaches* along the direction,
 *   which is what a voxel/slab overlap test needs.
 * - this one - the harmonic form. How far to step to cross one voxel.
 *
 * All three agree when `d` is parallel to a voxel axis, and diverge for oblique
 * directions.
 *
 * @param volume - The volume, or anything carrying its `direction` and `spacing`.
 * @param direction - The direction to measure along. Assumed to be a unit vector.
 * @returns The effective spacing along `direction`, in world units (mm).
 */
export default function getEffectiveSpacingAlongDirection(
  volume: IImageVolume | { direction: mat3 | number[]; spacing: Point3 },
  direction: Point3
): number {
  const { direction: volumeDirection, spacing } = volume;

  // Rows of the direction matrix are the unit vectors of the voxel axes, which
  // matches how getSpacingInNormalDirection and the rest of the codebase read it.
  const iVector = volumeDirection.slice(0, 3) as Point3;
  const jVector = volumeDirection.slice(3, 6) as Point3;
  const kVector = volumeDirection.slice(6, 9) as Point3;

  const dotI = vec3.dot(iVector, direction as vec3) / spacing[0];
  const dotJ = vec3.dot(jVector, direction as vec3) / spacing[1];
  const dotK = vec3.dot(kVector, direction as vec3) / spacing[2];

  return 1 / Math.sqrt(dotI * dotI + dotJ * dotJ + dotK * dotK);
}
