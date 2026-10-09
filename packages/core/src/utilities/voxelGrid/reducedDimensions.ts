import type { Point3 } from '../../types';

/**
 * Gives the box size of each axis as a whole number of at least 1.
 *
 * A factor below 1, a fraction and a value that is not a number each become a
 * factor that a caller can use, so the arithmetic below never divides by 0.
 */
function normalizedFactors(factors: Point3): Point3 {
  const normalized = [1, 1, 1] as Point3;

  for (let axis = 0; axis < 3; axis++) {
    const factor = Math.floor(factors?.[axis]);

    normalized[axis] = Number.isFinite(factor) ? Math.max(1, factor) : 1;
  }

  return normalized;
}

/**
 * Gives the dimensions of the grid that a box reduction produces.
 *
 * The count ROUNDS UP, so the reduced grid covers the whole region. The last
 * box on an axis can therefore be partial, and the value of that box is the
 * average of the source voxels that the box holds. A decimation rounds down
 * instead, because a decimation takes a sub-set of the samples and the tail
 * holds no sample of its own. `inPlaneDecimationModifier` shows that other
 * rule at `loaders/decimatedVolumeModifiers/inPlaneDecimationModifier.ts`.
 *
 * @param sourceDimensions - the number of source voxels on each axis
 * @param factors - the size of the box on each axis
 * @returns the number of reduced voxels on each axis
 */
function reducedDimensions(sourceDimensions: Point3, factors: Point3): Point3 {
  const boxes = normalizedFactors(factors);
  const dimensions = [1, 1, 1] as Point3;

  for (let axis = 0; axis < 3; axis++) {
    dimensions[axis] = Math.max(
      1,
      Math.ceil(sourceDimensions[axis] / boxes[axis])
    );
  }

  return dimensions;
}

export { reducedDimensions as default, reducedDimensions, normalizedFactors };
