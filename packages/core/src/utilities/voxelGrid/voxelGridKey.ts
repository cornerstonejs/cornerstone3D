import type { VoxelGrid, VoxelStatistic } from '../../types';

/** The number of significant figures that a key keeps of each number. */
const KEY_PRECISION = 9;

/**
 * Writes one number in a stable form. A fixed number of significant figures
 * removes the noise of a floating point computation, and the form of `-0`
 * becomes the form of `0`.
 */
function keyNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  const rounded = Number.parseFloat(value.toPrecision(KEY_PRECISION));

  return String(rounded === 0 ? 0 : rounded);
}

function keyNumbers(values: ArrayLike<number>): string {
  const parts = [];

  for (let index = 0; index < values.length; index++) {
    parts.push(keyNumber(values[index]));
  }

  return parts.join(',');
}

/**
 * Gives the key of one representation of the voxel data.
 *
 * THE KEY IS THE PAIR (GRID, STATISTIC), AND IT IS NOT THE GRID ALONE. A
 * `minimum` grid of an extension shares the geometry of the `average` grid, and
 * the two must not collide in a cache.
 *
 * THE KEY HOLDS THE DIRECTION, so an oblique grid gets a key of its own and no
 * caller needs a second cache for a second kind of grid. The key holds the
 * origin as well, so a set of the odd slices and a set of the even slices, which
 * share a spacing, get two keys.
 *
 * THERE IS NO LEVEL NUMBER IN THE KEY. A grid descriptor holds no ordinal.
 *
 * @param grid - the grid of the representation
 * @param statistic - the statistic of the representation
 * @returns a string that identifies the representation
 */
function voxelGridKey(grid: VoxelGrid, statistic: VoxelStatistic): string {
  return [
    statistic,
    keyNumbers(grid.dimensions),
    keyNumbers(grid.spacing),
    keyNumbers(grid.origin),
    keyNumbers(grid.direction),
  ].join('|');
}

/**
 * States whether two grids describe the same geometry.
 *
 * The dimensions must agree exactly, because a dimension is a count. The origin,
 * the spacing and the direction must agree inside the tolerance, because a
 * computation produces them.
 *
 * @param gridA - the first grid
 * @param gridB - the second grid
 * @param tolerance - the largest difference that still counts as equal
 * @returns true when the two grids describe the same geometry
 */
function voxelGridsEqual(
  gridA: VoxelGrid,
  gridB: VoxelGrid,
  tolerance = 1e-6
): boolean {
  if (!gridA || !gridB) {
    return gridA === gridB;
  }

  for (let axis = 0; axis < 3; axis++) {
    if (gridA.dimensions[axis] !== gridB.dimensions[axis]) {
      return false;
    }

    if (Math.abs(gridA.spacing[axis] - gridB.spacing[axis]) > tolerance) {
      return false;
    }

    if (Math.abs(gridA.origin[axis] - gridB.origin[axis]) > tolerance) {
      return false;
    }
  }

  for (let index = 0; index < 9; index++) {
    if (Math.abs(gridA.direction[index] - gridB.direction[index]) > tolerance) {
      return false;
    }
  }

  return true;
}

export { voxelGridKey as default, voxelGridKey, voxelGridsEqual };
