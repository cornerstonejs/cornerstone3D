import type { Point3, VoxelGridReduction } from '../../types';
import { normalizedFactors, reducedDimensions } from './reducedDimensions';

/** The region and the box sizes, each one resolved to a usable value. */
export type ResolvedReduction = {
  factors: Point3;
  sourceOffset: Point3;
  sourceEnd: Point3;
  dimensions: Point3;
};

/**
 * Resolves the box sizes and the region of a reduction against its source.
 *
 * @param source - the source of the reduction
 * @param reduction - the box size of each axis, and the region of the source
 */
export default function resolveReduction(
  source: { dimensions: Point3 },
  reduction: VoxelGridReduction
): ResolvedReduction {
  const factors = normalizedFactors(reduction.factors);
  const sourceOffset = (reduction.sourceOffset ?? [0, 0, 0]) as Point3;
  const sourceDimensions = (reduction.sourceDimensions ??
    source.dimensions) as Point3;

  return {
    factors,
    sourceOffset,
    sourceEnd: [
      sourceOffset[0] + sourceDimensions[0],
      sourceOffset[1] + sourceDimensions[1],
      sourceOffset[2] + sourceDimensions[2],
    ],
    dimensions: reducedDimensions(sourceDimensions, factors),
  };
}
