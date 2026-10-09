import type { Point3, VoxelGridLimits } from '../../types';
import { reducedDimensions } from './reducedDimensions';

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
 * Gives the smallest box size for each axis that brings the dimensions inside
 * the limits.
 *
 * THE REDUCTION IS PER AXIS, AND THE REDUCTION IS NOT UNIFORM. An edge of 2049
 * voxels exceeds a limit of 2048 on one axis and by one voxel, so this function
 * reduces that one axis and it returns a factor of 1 for the other two. A
 * uniform reduction by a factor of 2 on three axes takes 8 times fewer voxels
 * for an excess of one voxel, and that answer is wrong.
 *
 * The two limits work together. `maxEdge` is the limit of the device on the
 * length of one edge of a texture, and `maxVoxelCount` is the limit of the
 * memory. The function applies `maxEdge` first, for each axis on its own. The
 * function then increases the factor of the largest remaining axis, one step at
 * a time, until the grid holds no more voxels than `maxVoxelCount`. The shape
 * of the grid therefore stays as balanced as the limits permit.
 *
 * The factors are whole numbers, and a factor is not restricted to a power of
 * 2. A box average accepts any whole box size.
 *
 * @param dimensions - the number of source voxels on each axis
 * @param limits - the maximum edge, the maximum number of voxels, or both
 * @returns the size of the box on each axis
 */
function boxAverageReductionFactors(
  dimensions: Point3,
  limits: VoxelGridLimits
): Point3 {
  const factors = [1, 1, 1] as Point3;
  const { maxEdge, maxVoxelCount } = limits ?? {};

  if (maxEdge > 0) {
    for (let axis = 0; axis < 3; axis++) {
      factors[axis] = Math.max(1, Math.ceil(dimensions[axis] / maxEdge));
    }
  }

  if (!(maxVoxelCount > 0)) {
    return factors;
  }

  let reduced = reducedDimensions(dimensions, factors);

  while (reduced[0] * reduced[1] * reduced[2] > maxVoxelCount) {
    const axis = largestAxis(reduced);

    if (reduced[axis] <= 1) {
      // Every axis holds one voxel, and no further reduction is possible.
      break;
    }

    factors[axis] += 1;
    reduced = reducedDimensions(dimensions, factors);
  }

  return factors;
}

export {
  boxAverageReductionFactors as default,
  boxAverageReductionFactors,
  largestAxis,
};
