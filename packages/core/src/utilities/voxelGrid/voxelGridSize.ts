import type { VoxelGrid, VoxelGridLimits } from '../../types';

/**
 * Gives the number of voxels that the grid holds.
 *
 * @param grid - the grid
 * @returns the product of the three dimensions
 */
function voxelCountOfGrid(grid: VoxelGrid): number {
  return grid.dimensions[0] * grid.dimensions[1] * grid.dimensions[2];
}

/**
 * Gives the length of the longest edge of the grid, in voxels.
 *
 * @param grid - the grid
 * @returns the largest of the three dimensions
 */
function maxEdgeOfGrid(grid: VoxelGrid): number {
  return Math.max(...grid.dimensions);
}

/**
 * States whether the grid respects the limits.
 *
 * A caller counts the cost of a grid BEFORE it allocates a texture for that
 * grid, so the caller knows in advance whether the texture can work.
 *
 * @param grid - the grid
 * @param limits - the maximum edge, the maximum number of voxels, or both
 * @returns true when the grid respects each limit that the caller states
 */
function voxelGridWithinLimits(
  grid: VoxelGrid,
  limits: VoxelGridLimits
): boolean {
  const { maxEdge, maxVoxelCount } = limits ?? {};

  if (maxEdge > 0 && maxEdgeOfGrid(grid) > maxEdge) {
    return false;
  }

  if (maxVoxelCount > 0 && voxelCountOfGrid(grid) > maxVoxelCount) {
    return false;
  }

  return true;
}

export {
  voxelCountOfGrid as default,
  voxelCountOfGrid,
  maxEdgeOfGrid,
  voxelGridWithinLimits,
};
