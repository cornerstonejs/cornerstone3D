import type { Point3 } from '../../types';

/**
 * Gives the box size of each axis as a number of at least 1.
 *
 * A box size can hold a fraction: a reduction of an edge of N voxels to M
 * voxels takes the box size `N / M`, and each box then averages the source over
 * `[j * N / M, (j + 1) * N / M)`. A factor below 1 and a value that is not a
 * number each become 1, so the arithmetic below never divides by 0.
 */
function normalizedFactors(factors: Point3): Point3 {
  const normalized = [1, 1, 1] as Point3;

  for (let axis = 0; axis < 3; axis++) {
    const factor = Number(factors?.[axis]);

    normalized[axis] = Number.isFinite(factor) ? Math.max(1, factor) : 1;
  }

  return normalized;
}

/**
 * Gives the dimensions of the grid that a box reduction produces.
 *
 * The count rounds up, so the reduced grid covers the whole region. A whole
 * factor that does not divide the edge therefore gives a partial last box, and
 * the value of that box is the average of the source voxels that the box holds.
 * The factor `N / M` divides the edge exactly, and gives M boxes. A decimation
 * rounds down instead, because a decimation takes a sub-set of the samples and
 * the tail holds no sample of its own. `inPlaneDecimationModifier` shows that
 * other rule at `loaders/decimatedVolumeModifiers/inPlaneDecimationModifier.ts`.
 *
 * @param sourceDimensions - the number of source voxels on each axis
 * @param factors - the size of the box on each axis
 * @returns the number of reduced voxels on each axis
 */
function reducedDimensions(sourceDimensions: Point3, factors: Point3): Point3 {
  const boxes = normalizedFactors(factors);
  const dimensions = [1, 1, 1] as Point3;

  for (let axis = 0; axis < 3; axis++) {
    // The tolerance keeps the error of `N / (N / M)` from adding one voxel.
    dimensions[axis] = Math.max(
      1,
      Math.ceil(sourceDimensions[axis] / boxes[axis] - 1e-6)
    );
  }

  return dimensions;
}

export { reducedDimensions as default, reducedDimensions, normalizedFactors };
