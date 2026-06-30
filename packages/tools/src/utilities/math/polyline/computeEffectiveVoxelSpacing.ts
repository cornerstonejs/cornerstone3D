import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

/**
 * Computes the effective voxel spacing along an arbitrary world-space direction.
 *
 * For a unit direction vector `d` and volume axes i, j, k with spacings
 * s_i, s_j, s_k, the effective spacing is:
 *
 *   s_eff = 1 / sqrt( (d·i / s_i)² + (d·j / s_j)² + (d·k / s_k)² )
 *
 * This represents the world-space distance you must travel along `d` to cross
 * one voxel-equivalent boundary. It naturally reduces to the orthogonal case:
 * when `d` is aligned with axis i, d·j = d·k = 0, so s_eff = s_i.
 *
 * @param direction - A normalized world-space direction vector.
 * @param iVector - The volume's I direction (row).
 * @param jVector - The volume's J direction (column).
 * @param kVector - The volume's K direction (slice).
 * @param volumeSpacing - The [i, j, k] voxel spacings.
 * @returns The effective spacing along `direction`.
 */
function computeEffectiveVoxelSpacing(
  direction: Types.Point3,
  iVector: Types.Point3,
  jVector: Types.Point3,
  kVector: Types.Point3,
  volumeSpacing: number[]
): number {
  const dotI = vec3.dot(
    direction as unknown as vec3,
    iVector as unknown as vec3
  );
  const dotJ = vec3.dot(
    direction as unknown as vec3,
    jVector as unknown as vec3
  );
  const dotK = vec3.dot(
    direction as unknown as vec3,
    kVector as unknown as vec3
  );

  const sum =
    (dotI * dotI) / (volumeSpacing[0] * volumeSpacing[0]) +
    (dotJ * dotJ) / (volumeSpacing[1] * volumeSpacing[1]) +
    (dotK * dotK) / (volumeSpacing[2] * volumeSpacing[2]);

  return 1.0 / Math.sqrt(sum);
}

export default computeEffectiveVoxelSpacing;
