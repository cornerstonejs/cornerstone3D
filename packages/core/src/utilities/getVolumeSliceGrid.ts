import type { mat3 } from 'gl-matrix';
import { getConfiguration } from '../init';
import type { IImageVolume, Point3 } from '../types';
import getSpacingInNormalDirection from './getSpacingInNormalDirection';
import getVoxelThicknessAlongNormal from './voxelSlab/getVoxelThicknessAlongNormal';

/**
 * The slice grid of a volume along a view-plane normal. Slice `k` is at the
 * depth `start + k * step` along the normal, for `k = 0..maxIndex`.
 */
export interface VolumeSliceGrid {
  /** The depth of slice 0 along the normal. */
  start: number;
  /** The distance between two adjacent slices. */
  step: number;
  /** The index of the last slice. */
  maxIndex: number;
}

/**
 * The distance between two adjacent slices along `normal`, from
 * `Cornerstone3DConfig.rendering.sliceStepMeasure`: the L1 voxel thickness
 * (`getVoxelThicknessAlongNormal`, the default) or the L2 projected spacing
 * (`getSpacingInNormalDirection`).
 */
export function getSliceStep(
  volume: IImageVolume | { direction: mat3; spacing: Point3 },
  normal: Point3
): number {
  return getConfiguration().rendering?.sliceStepMeasure === 'l2'
    ? getSpacingInNormalDirection(volume, normal)
    : getVoxelThicknessAlongNormal(volume, normal);
}

/**
 * Builds the slice grid that the planar and the legacy volume viewports share
 * (volume slice navigation spec, VSN-I-2).
 *
 * `min` and `max` are the projections of the corner voxel centres onto the
 * normal. The grid has `M = round((max - min) / step)` steps and is centred on
 * the volume: `start = min + (range - M * step) / 2`. The first and the last
 * slice are then the same distance from the centre, and when `range` is a
 * multiple of `step` (an axis-aligned view) `start` is `min`.
 *
 * A zero range, or a step that is not a positive number, gives one slice at
 * the centre.
 */
export default function getVolumeSliceGrid(
  min: number,
  max: number,
  step: number
): VolumeSliceGrid {
  const range = max - min;
  const maxIndex =
    step > 0 && range > 0 ? Math.max(0, Math.round(range / step)) : 0;

  return {
    start: min + (range - maxIndex * (step > 0 ? step : 0)) / 2,
    step,
    maxIndex,
  };
}

/**
 * The index of the slice nearest to `depth`, `round((depth - start) / step)`,
 * clamped to `[0, maxIndex]`.
 */
export function getSliceGridIndex(
  { start, step, maxIndex }: VolumeSliceGrid,
  depth: number
): number {
  const index = Math.round((depth - start) / step);

  if (!(maxIndex > 0) || !Number.isFinite(index)) {
    return 0;
  }

  return Math.min(Math.max(0, index), maxIndex);
}

/**
 * The slice that a viewport opens on when no slice is requested:
 * `floor((maxIndex + 1) / 2)` in view order. For an even slice count this is
 * the upper of the two middle slices, as the OHIF `middle` preset.
 */
export function getInitialSliceGridIndex({ maxIndex }: VolumeSliceGrid) {
  return Math.floor((maxIndex + 1) / 2);
}
