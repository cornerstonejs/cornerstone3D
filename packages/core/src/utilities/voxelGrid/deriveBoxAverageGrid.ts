import type { Mat3, Point3, VoxelGrid, VoxelGridReduction } from '../../types';
import { normalizedFactors, reducedDimensions } from './reducedDimensions';

/**
 * Gives the grid that a box average of a region of the source grid produces.
 *
 * THE ORIGIN CARRIES THE SAMPLE OFFSET. A decimation reports the corner voxel
 * of a box, and a box average reports the centre of the box. The two points lie
 * apart by `(factor - 1) / 2` source voxels on each axis, which approaches half
 * a voxel of the reduced grid as the factor grows. The origin of the result
 * therefore moves by that distance along each axis of the source. Every
 * consumer that already transforms through the grid then gets the correct
 * position with no new code, and a region that later changes its kind of
 * reduction does not shift the image.
 *
 * The spacing of each axis grows by the factor of that axis, and the direction
 * does not change. A grid whose direction is oblique keeps that direction, and
 * the origin moves along the oblique axes.
 *
 * THE LAST BOX ON AN AXIS CAN BE PARTIAL, because `reducedDimensions` rounds
 * up. The value of a partial box is the average of the source voxels that the
 * box holds, and the position of that value stays on the uniform lattice of the
 * grid. The value therefore sits up to half a source voxel away from the centre
 * of the source voxels that produced it. A grid descriptor holds one spacing
 * for each axis, so the descriptor cannot express that one distance.
 *
 * A DERIVATION ALWAYS GOES FROM A HIGHER RESOLUTION TO A LOWER ONE, or the data
 * comes from a direct load. Nothing derives a grid from a lower resolution.
 *
 * @param source - the grid of the data that the reduction reads
 * @param reduction - the box size of each axis, and the region of the source
 * @returns the grid of the reduced data
 */
function deriveBoxAverageGrid(
  source: VoxelGrid,
  reduction: VoxelGridReduction
): VoxelGrid {
  const factors = normalizedFactors(reduction.factors);
  const sourceOffset = (reduction.sourceOffset ?? [0, 0, 0]) as Point3;
  const sourceDimensions = (reduction.sourceDimensions ??
    source.dimensions) as Point3;

  for (let axis = 0; axis < 3; axis++) {
    const offset = sourceOffset[axis];
    const size = sourceDimensions[axis];

    if (!Number.isInteger(offset) || offset < 0 || size < 1) {
      throw new Error(
        `deriveBoxAverageGrid: the region [${sourceOffset}] +[${sourceDimensions}] is not valid`
      );
    }

    if (offset + size > source.dimensions[axis]) {
      throw new Error(
        `deriveBoxAverageGrid: the region [${sourceOffset}] +[${sourceDimensions}] leaves the source grid [${source.dimensions}]`
      );
    }
  }

  const origin = [...source.origin] as Point3;
  const spacing = [1, 1, 1] as Point3;

  for (let axis = 0; axis < 3; axis++) {
    spacing[axis] = source.spacing[axis] * factors[axis];

    // The first sample of this axis sits at the centre of the first box of the
    // region, and the centre lies `(factor - 1) / 2` source voxels after the
    // corner of that box.
    const shift =
      source.spacing[axis] * (sourceOffset[axis] + (factors[axis] - 1) / 2);

    origin[0] += source.direction[axis * 3] * shift;
    origin[1] += source.direction[axis * 3 + 1] * shift;
    origin[2] += source.direction[axis * 3 + 2] * shift;
  }

  return {
    origin,
    direction: Array.from(source.direction) as unknown as Mat3,
    spacing,
    dimensions: reducedDimensions(sourceDimensions, factors),
  };
}

export { deriveBoxAverageGrid as default, deriveBoxAverageGrid };
