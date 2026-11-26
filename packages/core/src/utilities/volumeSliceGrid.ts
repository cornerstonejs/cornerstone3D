import type { mat3 } from 'gl-matrix';
import { getConfiguration } from '../init';
import type { Point3 } from '../types';
import getSpacingInNormalDirection from './getSpacingInNormalDirection';
import getVoxelThicknessAlongNormal from './voxelSlab/getVoxelThicknessAlongNormal';

/**
 * The slices of a volume along a view plane normal. Every slice position,
 * slice index and slice count of a volume view comes from it, so that the
 * scroll, the snap, the reported index, the slice count, the default slice
 * and the cut of a surface all meet the same planes.
 *
 * Slice `k` (0 to `maxSliceIndex`) lies at the projection `start + k * step`
 * on the normal. `min` and `max` are the smallest and the largest projection
 * of the centres of the corner voxels.
 */
type VolumeSliceGrid = {
  min: number;
  max: number;
  start: number;
  step: number;
  maxSliceIndex: number;
};

/**
 * The distance between two adjacent slices of a volume along a view plane
 * normal, by `rendering.sliceStepMeasure`: `'l1'` (the default) the thickness
 * of one voxel along the normal (`getVoxelThicknessAlongNormal`), `'l2'` the
 * length of the projected spacing (`getSpacingInNormalDirection`). The two
 * are equal for a normal along a voxel axis.
 */
function getSliceStepAlongNormal(
  volume: { direction: mat3 | ArrayLike<number>; spacing: Point3 },
  viewPlaneNormal: Point3
): number {
  const geometry = volume as { direction: mat3; spacing: Point3 };

  return getConfiguration().rendering?.sliceStepMeasure === 'l2'
    ? getSpacingInNormalDirection(geometry, viewPlaneNormal)
    : getVoxelThicknessAlongNormal(geometry, viewPlaneNormal);
}

/**
 * The slice grid of a range of projections with a step: `M = round(range /
 * step)` steps, so `M + 1` slices, centred on the range: the first slice is
 * `(range - M * step) / 2` past `min`, so the first and the last slice are the
 * same distance from the ends of the range. For a normal along a voxel axis
 * the range is a whole number of steps and the slices are the centres of the
 * voxels.
 */
function getSliceGrid(min: number, max: number, step: number): VolumeSliceGrid {
  const range = max - min;
  const maxSliceIndex =
    step > 0 && range > 0 ? Math.max(0, Math.round(range / step)) : 0;

  return {
    min,
    max,
    step,
    maxSliceIndex,
    start: min + (range - maxSliceIndex * step) / 2,
  };
}

/**
 * The index of the slice of a grid nearest to a projection on the normal,
 * kept between the first and the last slice.
 */
function getGridSliceIndex(grid: VolumeSliceGrid, projection: number): number {
  const { maxSliceIndex, start, step } = grid;

  if (!(maxSliceIndex > 0) || !(step > 0)) {
    return 0;
  }

  const index = Math.round((projection - start) / step);

  return Math.min(
    Math.max(Number.isFinite(index) ? index : 0, 0),
    maxSliceIndex
  );
}

/**
 * The projection on the normal of a slice of a grid.
 */
function getGridSliceProjection(grid: VolumeSliceGrid, index: number): number {
  return grid.start + index * grid.step;
}

/**
 * The slice that a view of a grid opens on: the middle slice counted along
 * the view, `floor((M + 1) / 2)`, the same slice for either direction of the
 * normal when the count is odd, and the upper of the two middle slices in
 * view order when it is even.
 */
function getDefaultGridSliceIndex(grid: VolumeSliceGrid): number {
  return Math.floor((grid.maxSliceIndex + 1) / 2);
}

export {
  getSliceStepAlongNormal,
  getSliceGrid,
  getGridSliceIndex,
  getGridSliceProjection,
  getDefaultGridSliceIndex,
};
export type { VolumeSliceGrid };
