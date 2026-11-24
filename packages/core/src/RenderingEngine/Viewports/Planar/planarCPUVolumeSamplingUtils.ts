import type { Point3 } from '../../../types';

export const SOURCE_SLICE_INDEX_TOLERANCE = 1e-4;
export const NEAREST_VOXEL_TIE_EPSILON = 1e-6;

export function getSpatiallyClampedContinuousCoordinate(
  dimension: number,
  value: number
): number | undefined {
  const upperBound = dimension - 0.5;

  if (
    value < -0.5 - SOURCE_SLICE_INDEX_TOLERANCE ||
    value > upperBound + SOURCE_SLICE_INDEX_TOLERANCE
  ) {
    return;
  }

  return Math.min(dimension - 1, Math.max(0, value));
}

export function getSpatiallyClampedContinuousIndex(
  dimensions: Point3,
  continuousIndex: Point3
): Point3 | undefined {
  const clampedIndex = [0, 0, 0] as Point3;

  for (let axis = 0; axis < 3; axis++) {
    const clampedCoordinate = getSpatiallyClampedContinuousCoordinate(
      dimensions[axis],
      continuousIndex[axis]
    );

    if (clampedCoordinate === undefined) {
      return;
    }

    clampedIndex[axis] = clampedCoordinate;
  }

  return clampedIndex;
}
