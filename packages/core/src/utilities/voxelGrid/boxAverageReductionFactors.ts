import type { Point3, VoxelGridLimits } from '../../types';

/**
 * A whole factor that divides the edge is used when the edge that it gives is at
 * least this part of the largest edge that fits. The box is then exact and
 * whole, and the reduction gives up at most 10% of the voxels of that axis.
 */
export const DIVISOR_PREFERENCE_MIN_RATIO = 0.9;

/**
 * Gives the axis that holds the most voxels. A tie takes the first axis.
 */
function largestAxis(dimensions: Point3): number {
  let axis = 0;

  for (let other = 1; other < 3; other++) {
    if (dimensions[other] > dimensions[axis]) {
      axis = other;
    }
  }

  return axis;
}

/**
 * Gives the reduced edge of one axis: an edge `N / f` of a whole factor `f`
 * that divides `N`, when that edge is at least `DIVISOR_PREFERENCE_MIN_RATIO`
 * of `fitting`, and `fitting` otherwise.
 */
function preferDivisor(sourceEdge: number, fitting: number): number {
  for (
    let factor = Math.ceil(sourceEdge / fitting);
    sourceEdge / factor >= DIVISOR_PREFERENCE_MIN_RATIO * fitting;
    factor++
  ) {
    if (sourceEdge % factor === 0) {
      return sourceEdge / factor;
    }
  }

  return fitting;
}

/**
 * Gives the box size for each axis that brings the dimensions inside the
 * limits.
 *
 * The reduction is per axis, and it is not uniform. An edge of 2049 voxels
 * exceeds a limit of 2048 on one axis and by one voxel, so this function
 * reduces that one axis and it returns a factor of 1 for the other two. A
 * uniform reduction by a factor of 2 on three axes takes 8 times fewer voxels
 * for an excess of one voxel, and that answer is wrong.
 *
 * The function chooses the reduced edge M of each axis, and the factor is
 * `N / M`. The reduced texture spans the full-resolution extent, so texel j
 * covers the source `[j * N / M, (j + 1) * N / M)`, and the factor can hold a
 * fraction. The two limits work together. `maxEdge` is the limit of the device
 * on the length of one edge of a texture, and `maxVoxelCount` is the limit of
 * the memory. The function applies `maxEdge` first, for each axis on its own.
 * The function then takes one voxel from the largest remaining axis, one step
 * at a time, until the grid holds no more voxels than `maxVoxelCount`, so the
 * shape stays as balanced as the limits permit. Last, an axis takes a whole
 * factor that divides its edge in place of M when the edge of that factor is at
 * least `DIVISOR_PREFERENCE_MIN_RATIO` of M.
 *
 * @param dimensions - the number of source voxels on each axis
 * @param limits - the maximum edge, the maximum number of voxels, or both
 * @returns the size of the box on each axis, `N / M`
 */
function boxAverageReductionFactors(
  dimensions: Point3,
  limits: VoxelGridLimits
): Point3 {
  const { maxEdge, maxVoxelCount } = limits ?? {};
  const reduced = dimensions.map((edge) =>
    Math.max(1, maxEdge > 0 ? Math.min(edge, Math.floor(maxEdge)) : edge)
  ) as Point3;

  if (maxVoxelCount > 0) {
    while (reduced[0] * reduced[1] * reduced[2] > maxVoxelCount) {
      const axis = largestAxis(reduced);

      if (reduced[axis] <= 1) {
        // Every axis holds one voxel, and no further reduction is possible.
        break;
      }

      reduced[axis] -= 1;
    }
  }

  return reduced.map((edge, axis) =>
    edge >= dimensions[axis]
      ? 1
      : dimensions[axis] / preferDivisor(dimensions[axis], edge)
  ) as Point3;
}

export {
  boxAverageReductionFactors as default,
  boxAverageReductionFactors,
  largestAxis,
};
