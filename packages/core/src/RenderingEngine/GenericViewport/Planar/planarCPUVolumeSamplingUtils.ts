import { vec3 } from 'gl-matrix';
import type { IImageVolume, Point3 } from '../../../types';

export type IndexMajorAxis = { axis: 0 | 1 | 2; sign: 1 | -1 };

export const SOURCE_SLICE_INDEX_TOLERANCE = 1e-4;
export const NEAREST_VOXEL_TIE_EPSILON = 1e-6;

function dot(a: Point3, b: Point3): number {
  return vec3.dot(a as unknown as vec3, b as unknown as vec3);
}

export function getIndexMajorAxis(
  volume: IImageVolume,
  worldVector: Point3,
  majorThreshold = 0.995
): IndexMajorAxis | undefined {
  const row = volume.direction.slice(0, 3) as Point3;
  const col = volume.direction.slice(3, 6) as Point3;
  const scan = volume.direction.slice(6, 9) as Point3;
  const components = [
    dot(worldVector, row),
    dot(worldVector, col),
    dot(worldVector, scan),
  ] as [number, number, number];
  const absComponents = components.map((value) => Math.abs(value)) as [
    number,
    number,
    number,
  ];
  const maxValue = Math.max(...absComponents);
  const axis = absComponents.indexOf(maxValue) as 0 | 1 | 2;

  if (maxValue < majorThreshold) {
    return;
  }

  const secondary = absComponents
    .filter((_value, index) => index !== axis)
    .some((value) => value > 1 - majorThreshold);

  if (secondary) {
    return;
  }

  return {
    axis,
    sign: components[axis] >= 0 ? 1 : -1,
  };
}

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

export function getNearestVoxelIndex(continuousIndex: number): number {
  return Math.floor(continuousIndex + 0.5 - NEAREST_VOXEL_TIE_EPSILON);
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
